from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from agents import AgentError, generate_reviewed_content
from config import settings
from database import SessionLocal, get_due_posts, get_notification_state, increment_retry, update_notification_state, update_status
from emailer import email_configured, safe_send_email, weekly_update_email
from publisher import publish_post
from services.posting_service import run_scheduled_posts
from services.token_service import run_token_maintenance


logger = logging.getLogger(__name__)
WEEKLY_UPDATE_KEY = "weekly_agent_update"

# Process-local backoff so a failing weekly agent does not retry every scheduler tick.
# Without this, a 402 from OpenRouter spams logs and burns credits on every loop (60s).
_WEEKLY_FAILURE_BACKOFF = timedelta(hours=1)
_last_weekly_failure_at: datetime | None = None


def publish_due_posts_once() -> None:
    if SessionLocal is None:
        logger.error("Scheduler cannot run without DATABASE_URL")
        return

    db = SessionLocal()
    try:
        due_posts = get_due_posts(db, datetime.now(timezone.utc))
        for post in due_posts:
            result = publish_post(post)
            if result.success:
                update_status(db, post.id, "published")
                continue

            retried = increment_retry(db, post.id)
            if retried is None:
                continue
            if retried.retry_count >= settings.max_publish_retries:
                update_status(db, retried.id, "failed")
                logger.warning("Post %s failed permanently: %s", retried.id, result.message)
            else:
                logger.warning("Post %s publish retry %s/%s: %s", retried.id, retried.retry_count, settings.max_publish_retries, result.message)
    finally:
        db.close()


def publish_due_social_posts_once() -> None:
    if SessionLocal is None:
        logger.error("Scheduler cannot run social posts without DATABASE_URL")
        return
    db = SessionLocal()
    try:
        run_scheduled_posts(db)
    except Exception:
        logger.exception("Scheduled social post run failed")
    finally:
        db.close()


def refresh_expiring_social_tokens_once() -> None:
    if SessionLocal is None:
        logger.error("Scheduler cannot run token refresh without DATABASE_URL")
        return
    db = SessionLocal()
    try:
        run_token_maintenance(db)
    except Exception:
        logger.exception("Token maintenance cycle failed")
    finally:
        db.close()


def send_weekly_agent_update_once() -> None:
    global _last_weekly_failure_at
    if SessionLocal is None:
        logger.error("Weekly update cannot run without DATABASE_URL")
        return
    if not email_configured():
        # Skip silently — email-less local dev should not poll OpenRouter on every tick.
        return

    now = datetime.now(timezone.utc)
    if _last_weekly_failure_at is not None and now - _last_weekly_failure_at < _WEEKLY_FAILURE_BACKOFF:
        return

    db = SessionLocal()
    try:
        state = get_notification_state(db, WEEKLY_UPDATE_KEY)
        if state and state.last_sent_at and state.last_sent_at > now - timedelta(days=settings.weekly_update_interval_days):
            return

        strategy, posts = generate_reviewed_content(settings.weekly_study_niche)
        post_preview = "\n\n".join(f"- {post['platform'].title()}: {post['content'][:300]}" for post in posts[:5])
        summary = (
            f"Strategy summary:\n{strategy}\n\n"
            f"New content ideas:\n{post_preview}"
        )
        sent = safe_send_email(
            subject="Your weekly FlowPilot marketing update",
            html_body=weekly_update_email(settings.weekly_study_niche, summary),
        )
        if sent:
            update_notification_state(db, WEEKLY_UPDATE_KEY, now)
            _last_weekly_failure_at = None
    except AgentError as exc:
        # Record the failure timestamp so we do not retry the AI call for an hour.
        _last_weekly_failure_at = now
        logger.warning("Weekly agent update skipped (will retry in 1h): %s", str(exc)[:200])
    except Exception:
        _last_weekly_failure_at = now
        logger.exception("Weekly agent update crashed; backing off for 1h")
    finally:
        db.close()


async def scheduler_loop(stop_event: asyncio.Event) -> None:
    logger.info("Publishing scheduler started")
    while not stop_event.is_set():
        try:
            await asyncio.to_thread(publish_due_posts_once)
            await asyncio.to_thread(publish_due_social_posts_once)
            await asyncio.to_thread(refresh_expiring_social_tokens_once)
            await asyncio.to_thread(send_weekly_agent_update_once)
        except Exception:
            logger.exception("Publishing scheduler cycle failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=settings.scheduler_interval_seconds)
        except asyncio.TimeoutError:
            continue
    logger.info("Publishing scheduler stopped")
