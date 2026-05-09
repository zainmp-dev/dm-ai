from __future__ import annotations

import html
import logging

import resend

from config import settings


logger = logging.getLogger(__name__)


class EmailError(RuntimeError):
    pass


def email_configured() -> bool:
    """Treat obvious placeholder keys (e.g. `re_xxxxxxxxx`) as 'not configured' so we do not
    burn AI credits generating weekly content that can never be delivered."""
    key = (settings.resend_api_key or "").strip()
    if not key or not settings.notification_to_email:
        return False
    if key.lower().startswith("re_") and "xxxx" in key.lower():
        return False
    if len(key) < 16:
        return False
    return True


def send_email(*, subject: str, html_body: str, to_email: str | None = None) -> None:
    recipient = (to_email or settings.notification_to_email).strip()
    if not settings.resend_api_key:
        raise EmailError("RESEND_API_KEY is not configured")
    if not recipient:
        raise EmailError("NOTIFICATION_TO_EMAIL is not configured")

    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send(
            {
                "from": settings.resend_from_email,
                "to": recipient,
                "subject": subject,
                "html": html_body,
            }
        )
    except Exception as exc:
        raise EmailError(f"Resend email failed: {exc}") from exc


def safe_send_email(*, subject: str, html_body: str, to_email: str | None = None) -> bool:
    try:
        send_email(subject=subject, html_body=html_body, to_email=to_email)
        return True
    except EmailError as exc:
        logger.warning("%s", exc)
        return False


def content_action_email(action: str, platform: str, content: str, scheduled_time: str | None = None) -> str:
    escaped_action = html.escape(action)
    escaped_platform = html.escape(platform.title())
    escaped_content = html.escape(content).replace("\n", "<br>")
    schedule_html = f"<p><strong>Scheduled time:</strong> {html.escape(scheduled_time)}</p>" if scheduled_time else ""
    return f"""
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>FlowPilot content {escaped_action}</h2>
      <p><strong>Platform:</strong> {escaped_platform}</p>
      {schedule_html}
      <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb">
        {escaped_content}
      </div>
    </div>
    """


def weekly_update_email(niche: str, summary: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>Your weekly FlowPilot agent update</h2>
      <p>The agents studied <strong>{html.escape(niche)}</strong> and prepared new marketing updates.</p>
      <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;white-space:pre-wrap">
        {html.escape(summary)}
      </div>
      <p style="color:#6b7280;font-size:13px">Review the generated ideas before approving or scheduling posts.</p>
    </div>
    """
