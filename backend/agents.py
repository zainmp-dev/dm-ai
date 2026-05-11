from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from typing import Any
from urllib.parse import urlparse

import requests

from config import settings
from prompts import (
    SYSTEM_PROMPT,
    analytics_agent_prompt,
    build_brand_context,
    competitor_discovery_prompt,
    content_agent_prompt,
    json_repair_prompt,
    legacy_content_prompt,
    legacy_review_prompt,
    legacy_strategy_prompt,
    review_agent_prompt,
    setup_master_prompt,
    single_post_suggest_prompt,
    strategy_agent_prompt,
    workspace_search_prompt,
)
from services.ai import AIServiceError, ai_service
from services.ai.ai_service import _is_free_model


class AgentError(RuntimeError):
    pass


logger = logging.getLogger(__name__)

# Default batch size for workspace strategy + Agent 2 calendar posts (override via API `calendar_days`, max 90).
DEFAULT_WORKSPACE_CALENDAR_DAYS = 14
# Target named-competitor count for Agent 1 + discovery sub-agent (real vendors only, no placeholders).
TARGET_COMPETITOR_COUNT = 12
MIN_COMPETITOR_COUNT = 10

_MAX_HASHTAGS_BY_PLATFORM: dict[str, int] = {
    "instagram": 8,
    "facebook": 6,
    "linkedin": 5,
}


def _max_hashtags_for_platform(platform: str) -> int:
    p = (platform or "linkedin").strip().lower()
    return _MAX_HASHTAGS_BY_PLATFORM.get(p, 5)


def _normalize_hashtag_token(raw: str) -> str:
    s = (raw or "").strip().lstrip("#")
    if not s:
        return ""
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"^[^\w]+|[^\w]+$", "", s, flags=re.UNICODE)
    if len(s) < 2:
        return ""
    return s


def _dedupe_hashtag_list(tags: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for t in tags:
        norm = _normalize_hashtag_token(t)
        if not norm:
            continue
        key = norm.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(norm)
    return out


def _format_hashtag_line(tags: list[str]) -> str:
    parts: list[str] = []
    for t in tags:
        if not t:
            continue
        c = t if t.startswith("#") else f"#{t.lstrip('#')}"
        parts.append(c)
    return " ".join(parts)


def _strip_trailing_hashtag_only_lines(text: str) -> str:
    s = (text or "").rstrip()
    if not s:
        return s
    lines = s.split("\n")
    i = len(lines) - 1
    while i >= 0:
        part = lines[i].strip()
        if not part:
            i -= 1
            continue
        words = part.split()
        if words and all(w.startswith("#") and len(w) > 1 for w in words):
            i -= 1
            continue
        break
    return "\n".join(lines[: i + 1]).rstrip()


def _strip_hashtag_tokens_from_text(text: str) -> str:
    """Remove #word tokens the model may have placed in the body; keeps plain prose."""
    if "#" not in text:
        return text
    s = re.sub(r"#[^#\s]+", "", text)
    s = re.sub(r" +\n", "\n", s)
    s = re.sub(r" {2,}", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def merge_social_hashtags_into_body(
    content_text: str,
    raw_tags: list[str],
    *,
    platform: str = "linkedin",
) -> str:
    """Build one clean trailing hashtag line from the tag list; align limits to platform."""
    body_in = (content_text or "").strip()
    tags = _dedupe_hashtag_list(raw_tags)
    if not tags and "#" in body_in:
        recovered = re.findall(r"#([^#\s]+)", body_in)
        tags = _dedupe_hashtag_list(recovered)
    tags = tags[: _max_hashtags_for_platform(platform)]
    line = _format_hashtag_line(tags)
    body = body_in
    body = _strip_trailing_hashtag_only_lines(body)
    if "#" in body:
        body = _strip_hashtag_tokens_from_text(body)
    if not line:
        return body
    if not body:
        return line
    return f"{body}\n\n{line}"


def _str_list_flexible(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _strategy_themes_and_audience(strategy_bundle: dict[str, Any] | None) -> tuple[list[str], str]:
    """Read content_themes and target_audience from flat DB snapshot or nested `strategy` object."""
    if not strategy_bundle or not isinstance(strategy_bundle, dict):
        return [], ""
    inner = strategy_bundle.get("strategy")
    if isinstance(inner, dict):
        return (
            _str_list_flexible(inner.get("content_themes")),
            str(inner.get("target_audience") or "").strip(),
        )
    return (
        _str_list_flexible(strategy_bundle.get("content_themes")),
        str(strategy_bundle.get("target_audience") or "").strip(),
    )


_STOP_THEME = frozenset(
    "the a an and or for in on to of at is are was were be been being with from by as it".split(),
)


def _theme_phrase_to_tag(theme: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", theme)
    picked = [w for w in words if w.lower() not in _STOP_THEME and len(w) > 1][:2]
    if not picked:
        return ""
    if len(picked) == 1:
        w = picked[0]
        return w[0].upper() + w[1:].lower() if len(w) > 1 else w.upper()
    a, b = picked[0], picked[1]
    a2 = a[0].upper() + a[1:].lower()
    b2 = b[0].upper() + b[1:].lower()
    return f"{a2}{b2}"[:22]


def _industry_to_hashtag_tokens(industry: str) -> list[str]:
    s = re.sub(r"[^a-z0-9]+", " ", (industry or "").lower()).strip()
    if not s:
        return []
    out: list[str] = []
    for part in s.split()[:4]:
        if part in _STOP_THEME or len(part) < 2:
            continue
        pl = part.lower()
        if pl == "saas":
            out.append("SaaS")
        elif pl in ("b2b", "b2c"):
            out.append(pl.upper())
        elif pl in ("fintech", "edtech", "hrtech", "proptech", "insurtech", "ecommerce", "d2c"):
            out.append(pl[0].upper() + pl[1:].lower())
        else:
            out.append(part[0].upper() + part[1:].lower() if len(part) > 1 else part.upper())
    return out


def _region_to_hashtag_tokens(primary_region: str) -> list[str]:
    code = (primary_region or "uae-india").strip().lower()
    if code == "india":
        return ["India", "B2B"]
    if code == "uae-gcc" or "gcc" in code:
        return ["GCC", "UAE"]
    if "uae" in code and "india" in code:
        return ["UAE", "India", "B2B"]
    return ["UAE", "B2B"]


def fallback_social_hashtags_from_setup(
    *,
    platform: str,
    industry: str,
    brand_name: str,
    strategy_bundle: dict[str, Any] | None,
    primary_region: str = "uae-india",
) -> list[str]:
    """
    When the model returns no tags, build a small set from workspace setup
    (content themes, industry, region, brand) for a single trailing # line.
    """
    raw: list[str] = []
    themes, audience = _strategy_themes_and_audience(strategy_bundle)
    for t in themes[:3]:
        tag = _theme_phrase_to_tag(t)
        if tag:
            raw.append(tag)
    raw.extend(_industry_to_hashtag_tokens(industry))
    if (brand_name or "").strip():
        b = re.sub(r"[^a-zA-Z0-9]+", "", (brand_name or "").strip())[:20]
        if len(b) >= 3:
            raw.append(b[0].upper() + b[1:].lower() if len(b) > 1 else b)
    raw.extend(_region_to_hashtag_tokens(primary_region))
    if audience:
        m = re.search(r"[A-Za-z]{4,}", audience)
        if m and len(m.group(0)) <= 18:
            w = m.group(0)
            raw.append(w[0].upper() + w[1:].lower() if len(w) > 1 else w)
    if not raw:
        raw = _region_to_hashtag_tokens(primary_region) or ["B2B", "Marketing", "SocialMedia"]
    return _dedupe_hashtag_list(raw)[:_max_hashtags_for_platform(platform)]


# Cross-provider chain when the requested model fails (quota, routing). Matches lib/ai-models.ts curation.
_DEFAULT_OPENROUTER_FALLBACKS: tuple[str, ...] = (
    "google/gemini-2.5-flash",
    "anthropic/claude-sonnet-4.6",
    "deepseek/deepseek-v4-flash",
    "openai/gpt-4o-mini",
    "openai/gpt-5-nano",
    "google/gemini-2.5-pro",
    "deepseek/deepseek-chat-v3.1",
)


def _openrouter_model_chain(preferred: str | None) -> list[str]:
    if settings.openrouter_model_fallbacks.strip():
        extra = [m.strip() for m in settings.openrouter_model_fallbacks.split(",") if m.strip()]
    else:
        extra = list(_DEFAULT_OPENROUTER_FALLBACKS)
    order: list[str] = [preferred, settings.openrouter_model, *extra]
    seen: set[str] = set()
    out: list[str] = []
    for m in order:
        m = (m or "").strip()
        if not m or m in seen:
            continue
        seen.add(m)
        out.append(m)
    return out


def _is_transient_openrouter_error(exc: AgentError) -> bool:
    """True when another model may succeed (quota, routing, model access)."""
    msg = str(exc)
    if "OpenRouter request timed out" in msg:
        return True
    if "OPENROUTER_API_KEY is not configured" in msg or "OpenRouter returned an unexpected response shape" in msg:
        return False
    if not msg.startswith("OpenRouter request failed:"):
        return False
    lower = msg.lower()
    for token in (
        " 402",
        " 403",
        " 404",
        " 429",
        " 502",
        " 503",
        ":402",
        ":403",
        ":404",
        ":429",
        '"code":402',
        '"code":403',
        '"code":404',
        '"code":429',
        "insufficient",
        "credits",
        "balance",
        "rate limit",
        "too many requests",
        "no endpoints found",
        "model not found",
        "not a valid model",
        "invalid model",
        "not available",
        "exceeded",
    ):
        if token in lower:
            return True
    if " 401" in lower or "invalid api key" in lower or "incorrect api key" in lower:
        return False
    return False


def _parse_openrouter_affordable_max_tokens(error_body: str) -> int | None:
    """OpenRouter 402 often includes 'can only afford N' — use N as max_tokens cap."""
    m = re.search(r"can only afford (\d+)", error_body, flags=re.IGNORECASE)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _openrouter_single_model(model: str, prompt: str) -> str:
    """Same LLM stack as workspace agents: Groq → Gemini → OpenRouter (preferred_model)."""
    try:
        result = ai_service.retry_request(
            prompt=prompt,
            preferred_model=model,
            max_tokens=settings.openrouter_max_tokens,
            temperature=0.7,
            prefer_groq_first=True,
            prefer_gemini=True,
        )
        return result.text
    except AIServiceError as exc:
        raise AgentError(str(exc)) from exc


def call_openrouter_with_fallback(
    prompt: str,
    preferred_model: str | None = None,
) -> tuple[str, str]:
    """Groq first (when configured), then Gemini, then OpenRouter with model routing."""
    try:
        result = ai_service.retry_request(
            prompt=prompt,
            preferred_model=preferred_model,
            max_tokens=settings.openrouter_max_tokens,
            temperature=0.7,
            prefer_groq_first=True,
            prefer_gemini=True,
        )
        return result.text, result.model_used
    except AIServiceError as exc:
        raise AgentError(str(exc)) from exc


def call_gemini_with_openrouter_fallback(
    prompt: str,
    preferred_openrouter_model: str | None = None,
) -> tuple[str, str]:
    """Strategy-agent multi-tier chain: Groq → Gemini → OpenRouter.

    Priority:
    1. Groq (GROQ_API_KEY) — low-latency inference; skips ahead on quota/rate errors
    2. Gemini (GOOGLE_AI_API_KEY)
    3. anthropic/claude-sonnet-4 — via OpenRouter
    4. openai/gpt-4o-mini / openai/gpt-5-mini — reliable structured fallbacks

    If ``preferred_openrouter_model`` is set it is tried first in the OpenRouter
    chain (before Claude Sonnet), giving callers a manual override path.
    """
    groq_try = ai_service.groq_only_request(
        prompt=prompt,
        max_tokens=settings.openrouter_max_tokens,
        temperature=0.7,
    )
    if groq_try is not None:
        return groq_try.text, groq_try.model_used

    gemini_key = (getattr(settings, "google_ai_api_key", "") or "").strip()
    if gemini_key:
        try:
            result = ai_service.gemini_request(
                prompt=prompt,
                max_tokens=settings.openrouter_max_tokens,
                temperature=0.7,
            )
            return result.text, result.model_used
        except AIServiceError as exc:
            logger.warning(
                "agents.strategy gemini_failed status=%s err=%s — cascading to Claude Sonnet",
                exc.status_code,
                str(exc)[:300],
            )

    # ── 2–4. OpenRouter priority chain ────────────────────────────────────
    strategy_chain: list[str] = []
    if preferred_openrouter_model and preferred_openrouter_model.strip():
        strategy_chain.append(preferred_openrouter_model.strip())
    strategy_chain.extend([
        "anthropic/claude-sonnet-4",
        "openai/gpt-4o-mini",
        "openai/gpt-5-mini",
    ])
    # Deduplicate while preserving order
    seen: set[str] = set()
    deduped_chain: list[str] = []
    for m in strategy_chain:
        if m not in seen:
            seen.add(m)
            deduped_chain.append(m)

    last_exc: AIServiceError | None = None
    for model in deduped_chain:
        try:
            result = ai_service.retry_request(
                prompt=prompt,
                preferred_model=model,
                max_tokens=settings.openrouter_max_tokens,
                temperature=0.7,
                prefer_groq_first=False,
                prefer_gemini=False,
            )
            logger.info("agents.strategy openrouter_success model=%s", model)
            return result.text, result.model_used
        except AIServiceError as exc:
            last_exc = exc
            logger.warning(
                "agents.strategy model=%s failed status=%s — trying next in chain",
                model,
                exc.status_code,
                str(exc)[:200],
            )
            continue

    raise AgentError(str(last_exc)) from last_exc


def get_openrouter_key_info_for_ui() -> dict[str, Any]:
    """
    GET https://openrouter.ai/api/v1/key — credits and spend for the configured server API key.
    This is account-wide (shared across all models in the app), not a separate per-model budget.
    """
    if not settings.openrouter_api_key:
        return {
            "configured": False,
            "message": "OpenRouter is not configured on the server (OPENROUTER_API_KEY).",
        }
    try:
        response = requests.get(
            "https://openrouter.ai/api/v1/key",
            headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            timeout=12,
        )
        response.raise_for_status()
        body: Any = response.json()
    except requests.RequestException as exc:
        detail = (exc.response.text[:220] if exc.response is not None else str(exc)) or str(exc)
        logger.warning("OpenRouter GET /key failed: %s", detail)
        return {
            "configured": True,
            "error": detail,
        }

    d = body.get("data")
    if not isinstance(d, dict):
        return {"configured": True, "error": "OpenRouter /key returned an unexpected shape."}

    def _f(x: object) -> float:
        if x is None:
            return 0.0
        try:
            return float(x)
        except (TypeError, ValueError):
            return 0.0

    return {
        "configured": True,
        "label": str(d.get("label") or ""),
        "limit": d.get("limit"),
        "limit_remaining": d.get("limit_remaining"),
        "usage": _f(d.get("usage")),
        "usage_daily": _f(d.get("usage_daily")),
        "usage_weekly": _f(d.get("usage_weekly")),
        "usage_monthly": _f(d.get("usage_monthly")),
        "is_free_tier": bool(d.get("is_free_tier")),
    }


def workspace_region_label(primary_region: str) -> str:
    code = (primary_region or "uae-india").strip().lower()
    return {
        "uae-gcc": "United Arab Emirates and Gulf Cooperation Council (GCC) — local regulations, business culture, and buyers in this region",
        "india": "India — audience, pricing sensitivity, language mix (English + regional), and local digital channels",
        "uae-india": "United Arab Emirates and India — address both GCC and Indian audiences where relevant (cross-border, remittance, talent, B2B trade)",
    }.get(
        code,
        "United Arab Emirates and India — address both GCC and Indian audiences where relevant (cross-border, remittance, talent, B2B trade)",
    )


def research_region_focus_label(primary_region: str) -> str:
    code = (primary_region or "uae-india").strip().lower()
    if code == "india":
        return "India"
    if code == "uae-gcc":
        return "UAE and GCC"
    return "India and UAE"


_MASTER_SETUP_REQUIRED_TOP = (
    "workspace",
    "brand_context",
    "strategy_engine",
    "research_config",
    "content_engine",
    "memory_system",
    "rules",
)


def build_fallback_master_setup(
    *,
    workspace_id: str,
    company_name: str,
    website: str,
    industry_scenario: str,
    competitors: list[dict[str, str]],
    primary_region_code: str,
    region_display: str,
    region_focus_research: str,
) -> dict[str, Any]:
    ctx = build_brand_context(
        brand_name=company_name,
        industry=industry_scenario,
        competitors=competitors,
        website=website,
        region=region_display,
    )
    norm_ind = ctx.industry
    return {
        "workspace": {
            "workspace_id": workspace_id,
            "company_name": company_name or ctx.brand_name,
            "normalized_industry": norm_ind,
            "region": region_focus_research,
        },
        "brand_context": {
            "brand_name": ctx.brand_name,
            "industry": norm_ind,
            "target_audience": ctx.target_audience,
            "tone": "clear, practical, confident, human",
            "region": region_display,
            "website": ctx.website or website or "",
            "competitors": list(competitors),
            "goals": list(ctx.goals),
        },
        "strategy_engine": {
            "generate_once": True,
            "locked": True,
            "versioning": True,
            "regeneration_allowed": False,
            "max_versions": 3,
        },
        "research_config": {
            "region_focus": region_focus_research,
            "competitor_limit": 10,
            "include_real_competitors": True,
            "include_pricing_analysis": True,
            "include_user_pain_points": True,
            "pain_point_structure": {
                "problem": "",
                "frequency": "medium",
                "severity": "medium",
            },
            "include_marketing_analysis": True,
        },
        "content_engine": {
            "depends_on_strategy": True,
            "no_strategy_no_content": True,
            "avoid_duplicate_topics": True,
            "use_pain_point_priority": True,
            "content_types": ["blog", "social", "video"],
            "platform_priority": {"linkedin": 0.7, "instagram": 0.2, "facebook": 0.1},
        },
        "memory_system": {
            "store_strategy": True,
            "store_content_history": True,
            "store_performance": True,
            "learning_enabled": True,
            "update_pain_point_weights": True,
        },
        "rules": {
            "no_generic_output": True,
            "no_regeneration_without_flag": True,
            "respect_workspace_isolation": True,
            "use_only_saved_strategy_for_content": True,
        },
        "_meta": {"primary_region_code": primary_region_code, "source": "fallback"},
    }


def _canonicalize_master_setup(
    data: dict[str, Any],
    *,
    workspace_id: str,
    company_name: str,
    website: str,
    industry_scenario: str,
    competitors: list[dict[str, str]],
    region_display: str,
    region_focus_research: str,
) -> None:
    ind_clean = industry_scenario.replace("-", " ").strip() or "digital business"
    ws = data.get("workspace")
    if not isinstance(ws, dict):
        data["workspace"] = {}
        ws = data["workspace"]
    ws["workspace_id"] = workspace_id
    ws.setdefault("company_name", company_name)
    ws.setdefault("normalized_industry", ind_clean)
    ws.setdefault("region", region_focus_research)

    bc = data.get("brand_context")
    if not isinstance(bc, dict):
        data["brand_context"] = {}
        bc = data["brand_context"]
    bc.setdefault("brand_name", company_name or "the brand")
    bc.setdefault("industry", ind_clean)
    bc.setdefault(
        "target_audience",
        f"buyers and decision makers in {ind_clean}",
    )
    bc.setdefault("tone", "clear, practical, confident, human")
    bc.setdefault("region", region_display)
    bc.setdefault("website", website or "")
    if not bc.get("competitors"):
        bc["competitors"] = list(competitors)
    if not bc.get("goals"):
        bc["goals"] = [
            "increase qualified brand awareness",
            "differentiate clearly from competitors",
            "create reusable and scalable content pillars",
            "generate leads and drive measurable conversions",
        ]

    rc = data.get("research_config")
    if isinstance(rc, dict):
        rc.setdefault("region_focus", region_focus_research)
        rc.setdefault("competitor_limit", 10)


def _master_setup_has_required_keys(data: dict[str, Any]) -> bool:
    return isinstance(data, dict) and all(k in data for k in _MASTER_SETUP_REQUIRED_TOP)


def run_workspace_setup_master(
    *,
    workspace_id: str,
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
    primary_region: str = "uae-india",
    ai_model: str | None = None,
) -> tuple[dict[str, Any], str | None]:
    """
    LLM-backed master setup JSON, or deterministic fallback on failure.
    """
    region_display = workspace_region_label(primary_region)
    region_focus = research_region_focus_label(primary_region)
    prompt = setup_master_prompt(
        workspace_id=workspace_id,
        company_name=company_name,
        website=website,
        industry_scenario=scenario,
        competitors=competitors,
        primary_region_code=primary_region,
        region_display=region_display,
        region_focus_research=region_focus,
    )
    try:
        raw, used = call_openrouter_with_fallback(prompt, ai_model)
        parsed = _extract_json(raw, preferred_model=ai_model)
        if isinstance(parsed, dict) and _master_setup_has_required_keys(parsed):
            _canonicalize_master_setup(
                parsed,
                workspace_id=workspace_id,
                company_name=company_name,
                website=website,
                industry_scenario=scenario,
                competitors=competitors,
                region_display=region_display,
                region_focus_research=region_focus,
            )
            parsed.setdefault("_meta", {})
            if isinstance(parsed["_meta"], dict):
                parsed["_meta"]["source"] = "llm"
            return parsed, used
    except Exception:
        logger.exception("Workspace master setup (LLM) failed; using fallback configuration")

    fb = build_fallback_master_setup(
        workspace_id=workspace_id,
        company_name=company_name,
        website=website,
        industry_scenario=scenario,
        competitors=competitors,
        primary_region_code=primary_region,
        region_display=region_display,
        region_focus_research=region_focus,
    )
    return fb, None


def _extract_json(
    raw_text: str,
    *,
    expected_shape: str | None = None,
    _allow_repair: bool = True,
    preferred_model: str | None = None,
) -> Any:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    first_object = text.find("{")
    first_array = text.find("[")
    starts = [index for index in (first_object, first_array) if index >= 0]
    if not starts:
        if _allow_repair:
            shape = expected_shape or "Valid JSON object or array as requested."
            try:
                repaired, _ = call_openrouter_with_fallback(json_repair_prompt(raw_text, shape), preferred_model)
            except AgentError as exc:
                raise AgentError("AI response did not contain JSON") from exc
            return _extract_json(repaired, expected_shape=expected_shape, _allow_repair=False, preferred_model=preferred_model)
        raise AgentError("AI response did not contain JSON")

    start = min(starts)
    end = text.rfind("}") if text[start] == "{" else text.rfind("]")
    if end <= start:
        raise AgentError("AI response JSON was incomplete")

    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        if not _allow_repair:
            raise AgentError("AI response JSON could not be parsed") from exc
        shape = expected_shape or "Valid JSON object or array as requested."
        try:
            repaired, _ = call_openrouter_with_fallback(json_repair_prompt(raw_text, shape), preferred_model)
        except AgentError as repair_exc:
            raise AgentError("AI response JSON could not be parsed") from repair_exc
        return _extract_json(repaired, expected_shape=expected_shape, _allow_repair=False, preferred_model=preferred_model)


def call_openrouter(prompt: str, model: str | None = None) -> str:
    return _openrouter_single_model(model or settings.openrouter_model, prompt)


def run_strategy_agent(niche: str) -> dict[str, Any]:
    prompt = legacy_strategy_prompt(niche)
    result = _extract_json(call_openrouter(prompt))
    if not isinstance(result, dict):
        raise AgentError("Strategy agent did not return a JSON object")
    return result


def run_content_agent(strategy: dict[str, Any]) -> list[dict[str, str | None]]:
    prompt = legacy_content_prompt(strategy)
    result = _extract_json(call_openrouter(prompt))
    if not isinstance(result, list):
        raise AgentError("Content agent did not return a JSON array")
    return _normalize_posts(result)


def run_review_agent(posts: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
    raw_posts: list[dict[str, Any]] = [dict(p) for p in posts]
    prompt = legacy_review_prompt(raw_posts)
    result = _extract_json(call_openrouter(prompt))
    if not isinstance(result, list):
        raise AgentError("Review agent did not return a JSON array")
    return _normalize_posts(result)


def generate_workspace_research(
    *,
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
    ai_model: str | None = None,
    calendar_days: int = DEFAULT_WORKSPACE_CALENDAR_DAYS,
    primary_region: str = "uae-india",
) -> dict[str, Any]:
    flow_started = time.time()
    logger.info(
        "agents.flow start company=%s scenario=%s region=%s days=%s requested_model=%s",
        (company_name or "")[:60],
        scenario,
        primary_region,
        calendar_days,
        ai_model or "(auto)",
    )

    strategy_model: str | None = None
    try:
        agent_started = time.time()
        logger.info("agents.flow agent=strategy step=start")
        strategy_result, strategy_model = run_workspace_strategy_agent(
            company_name=company_name,
            website=website,
            scenario=scenario,
            competitors=competitors,
            ai_model=ai_model,
            primary_region=primary_region,
        )
        logger.info(
            "agents.flow agent=strategy step=ok elapsed_ms=%s model=%s competitors=%s",
            int((time.time() - agent_started) * 1000),
            strategy_model,
            _count_named_competitors(strategy_result),
        )
    except AgentError as exc:
        logger.warning("agents.flow agent=strategy step=fail err=%s", str(exc)[:200])
        # Do not silently return synthetic strategy data; callers should surface a clear
        # failure so users can retry with a working model/key and get real Agent outputs.
        raise AgentError(f"Workspace strategy generation failed: {exc}") from exc

    content_model: str | None = None
    content_extras: dict[str, Any] = {}
    try:
        agent_started = time.time()
        logger.info("agents.flow agent=content step=start days=%s", calendar_days)
        content_result, content_model, content_extras = run_workspace_content_agent(
            company_name=company_name,
            website=website,
            scenario=scenario,
            competitors=competitors,
            strategy_output=strategy_result,
            ai_model=ai_model,
            calendar_days=calendar_days,
            primary_region=primary_region,
        )
        logger.info(
            "agents.flow agent=content step=ok elapsed_ms=%s model=%s posts=%s",
            int((time.time() - agent_started) * 1000),
            content_model,
            len(content_result),
        )
    except AgentError as exc:
        logger.warning("agents.flow agent=content step=fail err=%s — running recovery", str(exc)[:200])
        recovery_started = time.time()
        content_result = _recover_calendar_posts_from_strategy_llm(
            strategy_result,
            company_name=company_name,
            scenario=scenario,
            calendar_days=calendar_days,
            ai_model=ai_model,
        )
        logger.info(
            "agents.flow agent=content_recovery step=%s elapsed_ms=%s posts=%s",
            "ok" if content_result else "empty",
            int((time.time() - recovery_started) * 1000),
            len(content_result),
        )
        content_model = None
        content_extras = {}

    result = {**strategy_result, "content": content_result, **content_extras}
    normalized = _normalize_workspace_research(result, company_name, website, scenario, competitors)
    normalized["_ai_model_used"] = content_model or strategy_model
    normalized["_ai_model_requested"] = ai_model
    normalized["_ai_models_by_step"] = {"strategy": strategy_model or "", "content": content_model or ""}
    logger.info(
        "agents.flow done elapsed_ms=%s strategy_model=%s content_model=%s posts=%s competitors=%s",
        int((time.time() - flow_started) * 1000),
        strategy_model,
        content_model,
        len(content_result) if isinstance(content_result, list) else 0,
        len(normalized.get("competitors", [])),
    )
    return normalized


def run_workspace_strategy_agent(
    *,
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
    ai_model: str | None = None,
    primary_region: str = "uae-india",
) -> tuple[dict[str, Any], str]:
    context = build_brand_context(
        brand_name=company_name,
        website=website,
        industry=scenario,
        competitors=competitors,
        region=workspace_region_label(primary_region),
    )
    prompt = strategy_agent_prompt(context, primary_region_code=primary_region)
    logger.info("agents.strategy llm=start prompt_chars=%s provider=gemini_first", len(prompt))
    raw, used_model = call_gemini_with_openrouter_fallback(prompt, preferred_openrouter_model=ai_model)
    result = _extract_json(raw, preferred_model=ai_model)
    if not isinstance(result, dict):
        raise AgentError("Workspace strategy agent did not return a JSON object")
    _hydrate_workspace_strategy_from_agent1(result, website=context.website)
    competitors_before = _count_named_competitors(result)
    _ensure_competitors_researched(
        result,
        company_name=company_name,
        website=website,
        scenario=scenario,
        user_seeds=competitors,
        primary_region=primary_region,
        ai_model=ai_model,
    )
    competitors_after = _count_named_competitors(result)
    if competitors_after > competitors_before:
        logger.info(
            "agents.strategy sub=competitor_discovery added=%s total=%s",
            competitors_after - competitors_before,
            competitors_after,
        )
    if "competitors" not in result and isinstance(result.get("competitor_insights"), list):
        result["competitors"] = result["competitor_insights"]
    if "company_study" in result and isinstance(result["company_study"], dict):
        gaps = _string_list(result.get("content_gaps"), [])
        if gaps:
            result["company_study"]["marketing_gap_issues"] = _string_list(
                result["company_study"].get("marketing_gap_issues"),
                gaps,
            )
    return result, used_model


def _trim_strategy_for_content_prompt(strategy_output: dict[str, Any]) -> dict[str, Any]:
    """Compact Agent-1 JSON for Agent-2: keeps only what the content/calendar generation needs.

    Full Agent-1 output is often 15-20k chars (company_study, marketing_trends, full competitor
    rows, etc). Free OpenRouter models (gpt-oss / gemma) take 60-120 s to read that much
    context. This helper trims to ~3-5k chars while preserving every field the prompt cites.
    """
    if not isinstance(strategy_output, dict):
        return {}

    strategy = strategy_output.get("strategy") if isinstance(strategy_output.get("strategy"), dict) else {}
    company_study = strategy_output.get("company_study") if isinstance(strategy_output.get("company_study"), dict) else {}
    positioning = strategy_output.get("positioning") if isinstance(strategy_output.get("positioning"), dict) else {}
    core_strategy = strategy_output.get("core_strategy") if isinstance(strategy_output.get("core_strategy"), dict) else {}
    product_summary = strategy_output.get("product_summary") if isinstance(strategy_output.get("product_summary"), dict) else {}

    pain_raw = strategy_output.get("user_pain_points")
    pain_points: list[str] = []
    if isinstance(pain_raw, list):
        for item in pain_raw[:8]:
            if isinstance(item, dict):
                problem = str(item.get("problem") or item.get("pain") or "").strip()
                if problem:
                    pain_points.append(problem[:240])
            elif str(item).strip():
                pain_points.append(str(item).strip()[:240])

    competitors_full = strategy_output.get("competitors") if isinstance(strategy_output.get("competitors"), list) else []
    competitors_lite: list[dict[str, str]] = []
    for item in competitors_full[:5]:
        if not isinstance(item, dict):
            continue
        competitors_lite.append(
            {
                "name": str(item.get("name") or "").strip()[:120],
                "positioning": str(item.get("positioning") or "").strip()[:240],
                "market_gap": str(item.get("market_gap") or "").strip()[:240],
            }
        )

    return {
        "target_audience": _workspace_strategy_target_audience_line(strategy_output)[:1200],
        "content_themes": _string_list(strategy.get("content_themes"), [])[:8],
        "platform_focus": _string_list(strategy.get("platform_focus"), [])[:5],
        "market_gaps": _string_list(strategy.get("market_gaps") or company_study.get("marketing_gap_issues"), [])[:8],
        "user_pain_points": pain_points,
        "positioning": {
            "value_prop": str(positioning.get("messaging_angle") or product_summary.get("value_proposition") or "").strip()[:600],
            "differentiator": str(positioning.get("unique_positioning") or core_strategy.get("differentiator") or "").strip()[:600],
        },
        "company_study": {
            "scenario_summary": str(company_study.get("scenario_summary") or "").strip()[:800],
        },
        "competitors": competitors_lite,
    }


def run_workspace_content_agent(
    *,
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
    strategy_output: dict[str, Any],
    ai_model: str | None = None,
    calendar_days: int = DEFAULT_WORKSPACE_CALENDAR_DAYS,
    primary_region: str = "uae-india",
) -> tuple[list[dict[str, str]], str, dict[str, Any]]:
    target_audience = _workspace_strategy_target_audience_line(strategy_output)
    context = build_brand_context(
        brand_name=company_name,
        website=website,
        industry=scenario,
        competitors=competitors,
        target_audience=target_audience,
        region=workspace_region_label(primary_region),
    )
    # Floor the calendar so content library is always > 12 even when the UI sends a smaller number.
    effective_days = max(int(calendar_days or 0), DEFAULT_WORKSPACE_CALENDAR_DAYS)
    trimmed_strategy = _trim_strategy_for_content_prompt(strategy_output)
    prompt = content_agent_prompt(context, trimmed_strategy, effective_days)
    logger.info("agents.content llm=start prompt_chars=%s", len(prompt))
    raw, model_used = call_openrouter_with_fallback(prompt, ai_model)
    parsed = _extract_json(raw, preferred_model=ai_model)
    extras: dict[str, Any] = {}
    post_items: list[Any]
    if isinstance(parsed, dict):
        lock_keys = (
            "content_pillars",
            "seo_topics",
            "social_posts",
            "video_ideas",
            "landing_content",
            "funnel_strategy",
        )
        agent2_lock = {k: parsed[k] for k in lock_keys if k in parsed}
        if agent2_lock:
            extras["agent2_locked"] = agent2_lock
        post_items = _calendar_posts_from_content_payload(
            parsed,
            company_name=company_name,
            scenario=scenario,
            calendar_days=effective_days,
        )
    elif isinstance(parsed, list):
        post_items = parsed
    else:
        raise AgentError("Workspace content agent did not return a JSON object or array")

    if not post_items:
        logger.info("agents.content sub=recovery reason=empty_calendar_posts")
        post_items = _recover_calendar_posts_from_strategy_llm(
            strategy_output,
            company_name=company_name,
            scenario=scenario,
            calendar_days=effective_days,
            ai_model=ai_model,
        )
    if not post_items:
        raise AgentError("Workspace content agent returned no calendar posts")

    # Optional review pass: skip when running on a free model (rate-limited, slow) or when
    # we only have a tiny calendar — saves an extra 5-30s without hurting quality much.
    skip_review_reason: str | None = None
    if _is_free_model(model_used):
        skip_review_reason = "free_model_rate_limit"
    elif len(post_items) < 4:
        skip_review_reason = "small_calendar"

    if skip_review_reason:
        logger.info("agents.review step=skip reason=%s posts=%s", skip_review_reason, len(post_items))
    else:
        review_started = time.time()
        logger.info("agents.review step=start posts=%s", len(post_items))
        try:
            rraw, review_used = call_openrouter_with_fallback(
                review_agent_prompt(context, post_items),
                ai_model,
            )
            reviewed = _extract_json(rraw, preferred_model=ai_model)
            if isinstance(reviewed, list) and len(reviewed) > 0:
                post_items = reviewed
                model_used = review_used
                logger.info(
                    "agents.review step=ok elapsed_ms=%s model=%s posts=%s",
                    int((time.time() - review_started) * 1000),
                    review_used,
                    len(reviewed),
                )
            else:
                logger.info(
                    "agents.review step=skip reason=invalid_response elapsed_ms=%s",
                    int((time.time() - review_started) * 1000),
                )
        except AgentError as exc:
            logger.info(
                "agents.review step=skip reason=error elapsed_ms=%s err=%s",
                int((time.time() - review_started) * 1000),
                str(exc)[:120],
            )

    result = post_items
    content: list[dict[str, str]] = []
    seed_key = (company_name or "workspace").strip() or "workspace"
    for item in result:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        content_text = str(item.get("content_text") or item.get("content") or "").strip()
        hook = str(item.get("hook", "")).strip()
        cta = str(item.get("cta", "")).strip()
        platform_raw = str(item.get("platform", "")).strip().lower()
        platform = platform_raw if platform_raw in {"linkedin", "instagram", "facebook"} else ""
        if not content_text and hook:
            content_text = hook
        if hook and not content_text.startswith(hook):
            content_text = f"{hook}\n\n{content_text}"
        if cta and cta not in content_text:
            content_text = f"{content_text}\n\n{cta}"
        tag_list = _string_list(item.get("hashtags"), [])
        content_text = merge_social_hashtags_into_body(content_text, tag_list, platform=platform or "linkedin")
        if not title or not content_text:
            continue
        media_type = str(item.get("media_type", "")).strip()
        if media_type not in {"Image", "Video", "Carousel"}:
            media_type = "Image"
        raw_preview = (
            str(item.get("media_preview", "")).strip()
            or str(item.get("media_preview_prompt", "")).strip()
            or str(item.get("media_url", "")).strip()
            or str(item.get("image_url", "")).strip()
            or str(item.get("thumbnail", "")).strip()
        )
        mt, url = _finalize_workspace_content_media(
            raw_preview=raw_preview,
            media_type=media_type,
            index=len(content),
            seed_key=seed_key,
        )
        if not url:
            url = _pexels_stock_fallback_url(
                company_name=company_name,
                scenario=scenario,
                title=title,
                hook=hook,
                media_type=mt,
            )
        if not url:
            h = hashlib.sha256(f"{seed_key}:{len(content)}:{title}".encode()).hexdigest()[:16]
            url = f"https://picsum.photos/seed/{h}/800/450"
        content.append(
            {
                "title": title[:220],
                "content_text": content_text,
                "media_type": mt,
                "media_preview": url,
            }
        )
    if not content:
        raise AgentError("Workspace content agent returned no valid content")
    return content, model_used, extras


def _suggest_json_str(value: object) -> str:
    if value is None:
        return ""
    s = str(value).strip()
    if s.lower() in ("", "null", "none", "undefined", "[object object]"):
        return ""
    return s


def _data_url_video_hint(s: str) -> bool:
    return s.strip().lower().startswith("data:video/")


def _suggest_looks_video_url(url: str) -> bool:
    l = url.lower()
    if "/video/upload/" in l:
        return True
    for ext in (".mp4", ".webm", ".mov", ".m3u8", ".m4v"):
        if l.split("?", 1)[0].endswith(ext):
            return True
    if "gtv-videos-bucket" in l or "sample/ForBigger" in l:
        return True
    return _data_url_video_hint(l)


def _suggest_looks_image_only_url(url: str) -> bool:
    l = url.lower()
    if "picsum.photos" in l:
        return True
    if "images.unsplash.com" in l or ("photo-" in l and "unsplash" in l):
        return True
    for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"):
        if l.split("?", 1)[0].endswith(ext):
            return True
    if "/image/upload/" in l and "video" not in l:
        return True
    return False


def _coerce_llm_media_url(raw: str) -> str:
    """Extract a fetchable URL from model output; drop prose-only 'prompt' text."""
    s = (raw or "").strip().strip('"`').strip("'")
    if not s or s.lower() in {"null", "none", "n/a", "undefined", "todo", "placeholder", "tbd"}:
        return ""
    if s.startswith(("https://", "http://", "data:image/", "data:video/")):
        s = s.split()[0].rstrip(").,;]`\"'")
    else:
        m = re.search(r"(https?://[^\s\"'<>\]]+)", s)
        if not m:
            return ""
        s = m.group(1).rstrip(").,;]`\"'")
    if s.startswith("http://"):
        s = "https://" + s[7:]
    return s


def _finalize_workspace_content_media(
    *,
    raw_preview: str,
    media_type: str,
    index: int,
    seed_key: str,
) -> tuple[str, str]:
    """Return (media_type, media_preview) normalized from model output only.

    Preserves the AI-assigned media_type (Video/Carousel/Image). For Video and
    Carousel the LLM typically returns an image URL as a thumbnail/poster — that
    is intentional and we keep it. We only clear the URL if it is completely
    unparseable; we never downgrade the media_type just because the URL looks
    like a static image.
    """
    mt = media_type if media_type in {"Image", "Video", "Carousel"} else "Image"
    url = _coerce_llm_media_url(raw_preview)
    # Keep any valid https URL regardless of media_type — image URLs double as
    # poster frames for Video and cover slides for Carousel.
    if not url.startswith("https://") and not url.startswith("data:"):
        url = ""
    return mt, url


def _pexels_stock_fallback_url(
    *,
    company_name: str,
    scenario: str,
    title: str,
    hook: str,
    media_type: str,
) -> str:
    """When calendar media is blank, search Pexels using company + scenario + topic text."""
    from services.media.pexels_stock import search_pexels_for_post

    if not getattr(settings, "pexels_api_key", "").strip():
        return ""
    parts = [
        (company_name or "").strip(),
        (scenario or "").replace("-", " ").strip(),
        (title or "").strip(),
        (hook or "").strip()[:220],
    ]
    query = " ".join(p for p in parts if p).strip()
    if not query:
        return ""
    return search_pexels_for_post(query=query[:400], media_type=media_type)


def suggest_master_content_post(
    *,
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
    strategy_snapshot: dict[str, Any] | None,
    hint: str,
    ai_model: str | None = None,
    workspace_id: str = "",
    primary_region: str = "uae-india",
    default_platform: str = "",
) -> tuple[dict[str, str], str]:
    target_audience = ""
    if strategy_snapshot and isinstance(strategy_snapshot.get("target_audience"), str):
        target_audience = str(strategy_snapshot["target_audience"] or "")
    context = build_brand_context(
        brand_name=company_name,
        website=website,
        industry=scenario,
        competitors=competitors,
        target_audience=target_audience,
        region=workspace_region_label(primary_region),
    )
    platform_hint = (default_platform or "").strip()
    if platform_hint.lower() in {"linkedin", "instagram", "facebook"}:
        pass
    else:
        platform_hint = ""
    prompt = single_post_suggest_prompt(context, strategy_snapshot, hint, platform=platform_hint)
    raw, used_model = call_openrouter_with_fallback(prompt, ai_model)
    result = _extract_json(raw)
    if not isinstance(result, dict):
        raise AgentError("AI did not return a JSON object for the post draft")
    title = _suggest_json_str(result.get("title"))
    content_text = _suggest_json_str(result.get("content_text") or result.get("content"))
    if not title or not content_text:
        raise AgentError("AI returned an empty title or body")
    out_platform = str(result.get("platform") or default_platform or "").strip().lower()
    if out_platform not in {"linkedin", "instagram", "facebook"}:
        out_platform = ""
    media_type = _suggest_json_str(result.get("media_type", "Image")) or "Image"
    if media_type not in {"Image", "Video", "Carousel"}:
        media_type = "Image"
    media_preview = _suggest_json_str(
        result.get("media_preview") or result.get("media_preview_prompt") or "",
    )
    if media_preview.startswith("http://"):
        media_preview = "https://" + media_preview[7:]
    # Accept any https/data URL as a preview — for Video and Carousel the image
    # serves as poster/thumbnail; do not downgrade the format just because the
    # LLM returned a static image URL.
    if not media_preview.startswith("https://") and not media_preview.startswith("data:"):
        media_preview = ""
    if not media_preview:
        media_preview = _pexels_stock_fallback_url(
            company_name=company_name,
            scenario=scenario,
            title=title,
            hook=(content_text or "").strip().split("\n", 1)[0][:240],
            media_type=media_type,
        )
    tag_list = _string_list(result.get("hashtags"), [])
    content_text = merge_social_hashtags_into_body(content_text, _dedupe_hashtag_list(tag_list), platform=out_platform or "linkedin")
    return (
        {
            "title": title[:220],
            "content_text": content_text,
            "media_type": media_type,
            "media_preview": str(media_preview).strip(),
            "suggested_platform": out_platform,
        },
        used_model,
    )


def generate_reviewed_content(niche: str) -> tuple[dict[str, Any], list[dict[str, str | None]]]:
    strategy = run_strategy_agent(niche)
    drafted_posts = run_content_agent(strategy)
    reviewed_posts = run_review_agent(drafted_posts)
    return strategy, reviewed_posts


def run_analytics_agent(content: str, likes: int, comments: int, reach: int, ai_model: str | None = None) -> dict[str, Any]:
    context = build_brand_context(brand_name="the brand", industry="digital business", competitors=[])
    result = _extract_json(
        call_openrouter(analytics_agent_prompt(context, content, likes, comments, reach), ai_model),
    )
    if not isinstance(result, dict):
        raise AgentError("Analytics agent did not return a JSON object")
    return result


def run_workspace_search_agent(
    *,
    workspace_context_json: str,
    query: str,
    primary_region: str,
    ai_model: str | None = None,
) -> tuple[str, str]:
    region_description = workspace_region_label(primary_region)
    prompt = workspace_search_prompt(workspace_context_json, query, region_description)
    text, used_model = call_openrouter_with_fallback(prompt, ai_model)
    cleaned = (text or "").strip()
    if not cleaned:
        raise AgentError("Workspace search returned an empty answer")
    return cleaned, used_model


def _normalize_posts(items: list[Any]) -> list[dict[str, str | None]]:
    posts: list[dict[str, str | None]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        platform = str(item.get("platform", "")).strip().lower()
        if platform not in {"instagram", "linkedin", "facebook"}:
            continue
        hook = str(item.get("hook", "")).strip()
        body = str(item.get("body", "")).strip()
        cta = str(item.get("cta", "")).strip()
        if not hook or not body or not cta:
            continue
        posts.append(
            {
                "platform": platform,
                "content": f"{hook}\n\n{body}\n\n{cta}",
                "media_url": str(item["media_url"]).strip() if item.get("media_url") else None,
            }
        )

    if not posts:
        raise AgentError("AI agents returned no valid posts")
    return posts


def _string_list(value: Any, fallback: list[str]) -> list[str]:
    if isinstance(value, list):
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return cleaned or fallback
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return fallback


def _host_from_user_website(website: str) -> str:
    w = (website or "").strip()
    if not w:
        return ""
    if not w.lower().startswith(("http://", "https://")):
        w = f"https://{w}"
    try:
        return (urlparse(w).netloc or "").lower().split("@")[-1]
    except Exception:
        return ""


def _merge_discovered_competitors(
    result: dict[str, Any],
    discovered: list[dict[str, Any]],
) -> None:
    """Append discovery rows; dedupe by normalized name (case-insensitive)."""
    cur = result.get("competitors")
    if not isinstance(cur, list):
        cur = []
    seen = {str(x.get("name", "")).strip().lower() for x in cur if isinstance(x, dict)}
    for item in discovered:
        if not isinstance(item, dict):
            continue
        n = str(item.get("name", "")).strip()
        if not n:
            continue
        k = n.lower()
        if k in seen:
            continue
        seen.add(k)
        cur.append(item)
    result["competitors"] = cur[:TARGET_COMPETITOR_COUNT]


def _run_competitor_discovery_llm(
    result: dict[str, Any],
    *,
    company_name: str,
    website: str,
    scenario: str,
    primary_region: str,
    user_seeds: list[dict[str, str]],
    ai_model: str | None,
) -> None:
    region_label = workspace_region_label(primary_region)
    partial = json.dumps(result.get("competitors") or [], ensure_ascii=True)
    seeds = json.dumps(user_seeds, ensure_ascii=True)
    prompt = competitor_discovery_prompt(
        company_name=company_name,
        website=website,
        scenario=scenario,
        region_label=region_label,
        primary_region_code=primary_region,
        user_seeds_json=seeds,
        partial_competitors_json=partial,
    )
    raw, _used = call_openrouter_with_fallback(prompt, ai_model)
    parsed = _extract_json(raw, preferred_model=ai_model)
    rows: list[dict[str, Any]] = []
    if isinstance(parsed, list):
        rows = [x for x in parsed if isinstance(x, dict) and str(x.get("name", "")).strip()]
    elif isinstance(parsed, dict) and isinstance(parsed.get("competitors"), list):
        rows = [
            x
            for x in parsed["competitors"]
            if isinstance(x, dict) and str(x.get("name", "")).strip()
        ]
    if not rows:
        return
    _merge_discovered_competitors(result, rows)
    _coerce_workspace_competitors_in_place(result)


def _ensure_competitors_researched(
    result: dict[str, Any],
    *,
    company_name: str,
    website: str,
    scenario: str,
    user_seeds: list[dict[str, str]],
    primary_region: str,
    ai_model: str | None,
) -> None:
    """Coerce, merge user seeds, then a follow-up model pass if the set is still too small — no hardcoded vendor list."""
    _coerce_workspace_competitors_in_place(result)
    cur: list[dict[str, Any]] = []
    raw = result.get("competitors")
    if isinstance(raw, list):
        for x in raw:
            if isinstance(x, dict) and str(x.get("name", "")).strip():
                cur.append(x)
    seen = {str(x.get("name", "")).strip().lower() for x in cur}
    for s in user_seeds:
        row = _row_from_user_competitor_seed(
            s, company_name=company_name, website=website, scenario=scenario, primary_region=primary_region
        )
        if not row:
            continue
        k = row["name"].lower()
        if k not in seen:
            seen.add(k)
            cur.append(row)
    if cur:
        result["competitors"] = cur[:TARGET_COMPETITOR_COUNT]
        _coerce_workspace_competitors_in_place(result)
    # Trigger discovery whenever we are below the target so users always get 10-12 real vendors —
    # not just when the strategy agent returned (almost) nothing.
    if _count_named_competitors(result) >= MIN_COMPETITOR_COUNT:
        return
    try:
        _run_competitor_discovery_llm(
            result,
            company_name=company_name,
            website=website,
            scenario=scenario,
            primary_region=primary_region,
            user_seeds=user_seeds,
            ai_model=ai_model,
        )
    except Exception:
        logger.exception("Competitor discovery follow-up failed; leaving primary output and seeds only")


def _row_from_user_competitor_seed(
    s: dict[str, str], *, company_name: str, website: str, scenario: str, primary_region: str
) -> dict[str, Any] | None:
    name = (s.get("name") or "").strip()
    if not name:
        return None
    w = (s.get("website") or "").strip()
    focus = (s.get("focus") or "").strip()
    host = _host_from_user_website(w)
    scen = (scenario or "b2b-saas").replace("-", " ")
    return {
        "name": name[:180],
        "strengths": [f"Peer that buyers in {primary_region} compare against {company_name} ({scen}) on shortlists."],
        "weaknesses": [focus or f"Competitive headroom for {company_name} on differentiation and proof."],
        "pricing_perception": "Varies; validate on vendor pricing pages in-region",
        "target_audience": f"Shared buyer pool with {company_name} in {scen}.",
        "ux_issues": "Category review themes: onboarding, support, and product fit",
        "domain": host,
    }


def _coerce_workspace_competitors_in_place(result: dict[str, Any]) -> None:
    """Normalize Agent 1 competitor objects to legacy DB field shape. Safe to call even without product_summary."""
    raw_comp = result.get("competitors")
    if not isinstance(raw_comp, list) or not raw_comp:
        return
    coerced: list[dict[str, Any]] = []
    for item in raw_comp:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        weaknesses = _string_list(item.get("weaknesses"), [])
        ux = item.get("ux_issues")
        if ux:
            uxs = str(ux).strip()
            if uxs and uxs not in weaknesses:
                weaknesses.append(f"UX: {uxs}")
        strengths = _string_list(item.get("strengths"), [])
        pricing = str(item.get("pricing_perception", "")).strip()
        ctaud = str(item.get("target_audience", "")).strip()
        positioning = str(item.get("positioning", "")).strip()
        if not positioning:
            bits = [b for b in (pricing, ctaud) if b]
            positioning = " · ".join(bits)
        d_raw = str(item.get("domain", "") or item.get("website", "") or "").strip()
        if d_raw and "://" in d_raw:
            d_raw = _host_from_user_website(d_raw) or d_raw
        coerced.append(
            {
                "name": name[:180],
                "domain": d_raw[:300],
                "positioning": positioning[:1500],
                "market_rank": str(item.get("market_rank", "")).strip(),
                "market_gap": str(item.get("market_gap", "")).strip() or (weaknesses[0] if weaknesses else ""),
                "marketing_purpose": str(item.get("marketing_purpose", "")).strip(),
                "strengths": strengths,
                "weaknesses": weaknesses,
            }
        )
    if coerced:
        result["competitors"] = coerced[:TARGET_COMPETITOR_COUNT]


def _count_named_competitors(result: dict[str, Any]) -> int:
    raw = result.get("competitors")
    if not isinstance(raw, list):
        return 0
    return len(
        [
            1
            for x in raw
            if isinstance(x, dict) and str((x or {}).get("name", "")).strip()
        ],
    )


def _is_generic_competitor_text(value: str) -> bool:
    s = (value or "").strip().lower()
    if not s:
        return False
    markers = (
        "market alternative",
        "qualitative estimate",
        "validate in market",
        "differentiation opportunity",
        "recognized market presence",
        "typical in-category",
        "category benchmark",
        "positioning headroom",
    )
    return any(m in s for m in markers)


def _default_target_audience_line(*, company_name: str, scenario: str) -> str:
    scenario_label = (scenario or "b2b-saas").replace("-", " ").strip() or "b2b saas"
    brand = (company_name or "").strip() or "your category"
    return (
        f"Primary buyers and decision makers evaluating {scenario_label} solutions — "
        f"focused on teams comparing options relevant to {brand}."
    )


def _hydrate_workspace_strategy_from_agent1(result: dict[str, Any], *, website: str) -> None:
    """Map Agent 1 research lock JSON into legacy company_study / strategy / competitors rows."""
    if not isinstance(result, dict):
        return

    ps = result.get("product_summary")
    if not isinstance(ps, dict):
        ps = {}

    existing_cs = result.get("company_study")
    if not (isinstance(existing_cs, dict) and str(existing_cs.get("scenario_summary", "")).strip()):
        parts: list[str] = []
        vp = str(ps.get("value_proposition", "")).strip()
        if vp:
            parts.append(vp)
        aud = ps.get("target_audience")
        if aud:
            parts.append(str(aud).strip())
        cf = ps.get("core_features")
        if isinstance(cf, list) and cf:
            parts.append("Core features: " + ", ".join(str(x) for x in cf[:12]))
        elif isinstance(cf, str) and cf.strip():
            parts.append(f"Core features: {cf.strip()}")
        pp = str(ps.get("pricing_positioning", "")).strip()
        if pp:
            parts.append(f"Pricing band: {pp}")
        scenario_summary = " ".join(parts).strip()

        gap_list: list[str] = []
        gap_list.extend(_string_list(result.get("market_gaps"), []))
        upp = result.get("user_pain_points")
        if isinstance(upp, list):
            for item in upp[:15]:
                if isinstance(item, dict):
                    cat = str(item.get("category", "")).strip()
                    prob = str(item.get("problem", "")).strip()
                    if prob:
                        gap_list.append(f"[{cat}] {prob}" if cat else prob)
                elif str(item).strip():
                    gap_list.append(str(item).strip())

        seen: set[str] = set()
        deduped: list[str] = []
        for g in gap_list:
            if g not in seen:
                seen.add(g)
                deduped.append(g)
        gap_list = deduped[:25]

        result["company_study"] = {
            "discovered_website": str(website or ps.get("website") or "").strip(),
            "scenario_summary": scenario_summary[:2000],
            "marketing_gap_issues": gap_list,
        }

    strat = result.get("strategy")
    if not isinstance(strat, dict):
        result["strategy"] = {}
        strat = result["strategy"]

    pos = result.get("positioning") if isinstance(result.get("positioning"), dict) else {}
    cs = result.get("core_strategy") if isinstance(result.get("core_strategy"), dict) else {}

    if not str(strat.get("target_audience", "")).strip():
        ta_raw = result.get("target_audience")
        if isinstance(ta_raw, list):
            ta_str = "; ".join(str(x).strip() for x in ta_raw if str(x).strip())
        else:
            ta_str = str(ta_raw or "").strip()
        if not ta_str:
            ta_str = str(
                pos.get("target_niche")
                or pos.get("target niche")
                or pos.get("ideal_customer")
                or pos.get("primary_audience")
                or pos.get("audience")
                or ""
            ).strip()
        if not ta_str:
            ta_str = str(
                cs.get("target_audience")
                or cs.get("icp")
                or cs.get("audience")
                or cs.get("ideal_customer_profile")
                or ""
            ).strip()
        if not ta_str:
            ta_str = str(ps.get("target_audience", "")).strip()
        if not ta_str:
            icp = result.get("ideal_customer_profile") or result.get("icp") or result.get("primary_audience")
            if isinstance(icp, dict):
                ta_str = "; ".join(str(v).strip() for v in icp.values() if str(v).strip())[:2000]
            elif icp:
                ta_str = str(icp).strip()
        if not ta_str:
            bp = result.get("buyer_personas") or result.get("buyer_personas_detail")
            if isinstance(bp, list):
                parts: list[str] = []
                for item in bp[:12]:
                    if isinstance(item, dict):
                        seg = " ".join(
                            str(item.get(k, "")).strip()
                            for k in ("segment", "role", "title", "pain", "goal", "notes")
                            if str(item.get(k, "")).strip()
                        ).strip()
                        if seg:
                            parts.append(seg)
                    elif str(item).strip():
                        parts.append(str(item).strip())
                ta_str = "; ".join(parts)[:2000]
        strat["target_audience"] = ta_str[:2000]

    if not strat.get("content_themes"):
        themes: list[str] = []
        pillars = cs.get("content_pillars")
        if isinstance(pillars, list):
            themes.extend(str(x).strip() for x in pillars if str(x).strip())
        if not themes:
            themes = _string_list(cs.get("themes"), [])
        if not themes:
            ma = str(pos.get("messaging_angle") or pos.get("unique_positioning") or "").strip()
            if ma:
                themes = [ma]
        if not themes:
            themes = _string_list(result.get("market_gaps"), [])[:5]
        strat["content_themes"] = themes[:12]

    if not strat.get("platform_focus"):
        strat["platform_focus"] = _string_list(cs.get("platform_focus"), [])

    if not strat.get("market_gaps"):
        cs_cur = result.get("company_study")
        gap_fallback = (
            _string_list(cs_cur.get("marketing_gap_issues"), []) if isinstance(cs_cur, dict) else []
        )
        strat["market_gaps"] = _string_list(result.get("market_gaps"), [])[:20] or gap_fallback[:20]

    _coerce_workspace_competitors_in_place(result)


def _workspace_strategy_target_audience_line(strategy_output: dict[str, Any]) -> str:
    st = strategy_output.get("strategy")
    if isinstance(st, dict):
        ta = st.get("target_audience")
        if isinstance(ta, str) and ta.strip():
            return ta.strip()
    raw = strategy_output.get("target_audience")
    if isinstance(raw, list):
        return "; ".join(str(x).strip() for x in raw if str(x).strip())
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    ps = strategy_output.get("product_summary")
    if isinstance(ps, dict):
        v = ps.get("target_audience")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _synthetic_calendar_posts_from_strategy(
    strategy_output: dict[str, Any],
    *,
    company_name: str,
    scenario: str,
    calendar_days: int,
    ai_model: str | None = None,
) -> list[dict[str, Any]]:
    """Backward-compatible alias to model-driven calendar recovery."""
    return _recover_calendar_posts_from_strategy_llm(
        strategy_output,
        company_name=company_name,
        scenario=scenario,
        calendar_days=calendar_days,
        ai_model=ai_model,
    )


def _recover_calendar_posts_from_strategy_llm(
    strategy_output: dict[str, Any],
    *,
    company_name: str,
    scenario: str,
    calendar_days: int,
    ai_model: str | None,
) -> list[dict[str, Any]]:
    """Model-driven fallback when Agent 2 output lacks usable calendar posts."""
    days = max(1, min(int(calendar_days) if calendar_days else 1, 60))
    strategy_json = json.dumps(strategy_output, ensure_ascii=True)
    scen = (scenario or "business").replace("-", " ").strip() or "business"
    prompt = f"""
You are a senior social content strategist.

Generate exactly {days} publish-ready social posts from the provided strategy JSON.
Do not use placeholders and do not return empty arrays.

INPUT STRATEGY JSON:
{strategy_json}

BRAND:
- Company: {company_name}
- Scenario: {scen}

RETURN FORMAT (JSON ONLY, no markdown):
[
  {{
    "platform": "linkedin|instagram|facebook",
    "title": "string",
    "hook": "string",
    "content": "string",
    "cta": "string",
    "hashtags": ["string", "string", "string"],
    "media_type": "Image|Video|Carousel",
    "media_preview_prompt": ""
  }}
]

RULES:
- Return exactly {days} items.
- Rotate platforms across the list.
- Every item must be grounded in strategy fields (audience, gaps, positioning, pain points).
- Avoid generic business advice.
"""
    try:
        raw, _used = call_openrouter_with_fallback(prompt, ai_model)
        parsed = _extract_json(raw, preferred_model=ai_model)
        if isinstance(parsed, list):
            return [x for x in parsed if isinstance(x, dict)]
        if isinstance(parsed, dict):
            posts = parsed.get("calendar_posts")
            if isinstance(posts, list):
                return [x for x in posts if isinstance(x, dict)]
    except AgentError:
        pass
    return []


def _calendar_posts_from_content_payload(
    payload: dict[str, Any],
    *,
    company_name: str,
    scenario: str,
    calendar_days: int,
) -> list[dict[str, Any]]:
    """Turn Agent 2 JSON (calendar_posts + optional social_posts) into reviewable post dicts."""
    days = max(1, min(int(calendar_days) if calendar_days else 1, 60))
    short_brand = (company_name or "").strip()[:40]
    scen = (scenario or "").replace("-", " ")

    def _as_list(key: str) -> list[Any] | None:
        v = payload.get(key)
        return list(v) if isinstance(v, list) else None

    posts: list[Any] = []
    for key in ("calendar_posts", "content_calendar", "scheduled_posts", "week_calendar", "content_schedule"):
        al = _as_list(key)
        if al is not None and len(al) > 0:
            posts = al
            break

    if not posts:
        pl = _as_list("posts")
        if pl and all(isinstance(x, dict) for x in pl):
            posts = pl

    if len(posts) < days:
        social = payload.get("social_posts")
        platforms = ["linkedin", "instagram", "facebook"]
        extra: list[dict[str, Any]] = []
        if isinstance(social, list):
            for i, item in enumerate(social):
                if len(posts) + len(extra) >= days:
                    break
                if isinstance(item, dict):
                    hook = str(item.get("hook", item.get("text", ""))).strip()
                    body = str(item.get("body", item.get("content", ""))).strip()
                    platform = str(item.get("platform", "")).strip().lower()
                else:
                    text = str(item).strip()
                    hook = text[:200]
                    body = text
                    platform = ""
                if platform not in {"linkedin", "instagram", "facebook"}:
                    platform = ""
                seed = hashlib.md5(f"{hook}-{i}".encode()).hexdigest()[:12]
                brand = (company_name or "").split()[0][:20]
                extra.append(
                    {
                        "platform": platform,
                        "title": (hook[:80] if hook else body[:80]),
                        "hook": hook or (body[:180] if body else short_brand),
                        "content": body or hook,
                        "cta": "",
                        "hashtags": [x for x in [brand, scen.split()[0] if scen else ""] if x],
                        "media_type": "Image",
                        "media_preview_prompt": "",
                    }
                )
        posts = (posts + extra)[:days]

    out: list[dict[str, Any]] = []
    for i, item in enumerate(posts[:days]):
        if not isinstance(item, dict):
            continue
        platform_raw = str(item.get("platform", "")).strip().lower()
        if platform_raw not in {"linkedin", "instagram", "facebook"}:
            platform_raw = ""
        title = str(item.get("title", "")).strip()
        hook = str(item.get("hook", "")).strip()
        content = str(item.get("content", item.get("body", ""))).strip()
        cta = str(item.get("cta", "")).strip()
        if not content and hook:
            content = hook
        if not hook and content:
            hook = content.split("\n")[0][:240]
        hashtags = _string_list(item.get("hashtags"), [])
        mt = str(item.get("media_type", "Image")).strip()
        if mt not in {"Image", "Video", "Carousel"}:
            mt = "Image"
        url = str(item.get("media_preview_prompt") or item.get("media_preview") or "").strip()
        if not url.startswith("http"):
            url = ""
        out.append(
            {
                "platform": platform_raw,
                "title": title,
                "hook": hook,
                "content": content,
                "cta": cta,
                "hashtags": hashtags,
                "media_type": mt,
                "media_preview_prompt": url,
            }
        )
    return out


def _normalize_workspace_research(
    result: dict[str, Any],
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
) -> dict[str, Any]:
    company_study = result.get("company_study") if isinstance(result.get("company_study"), dict) else {}
    strategy = result.get("strategy") if isinstance(result.get("strategy"), dict) else {}
    competitor_rows = result.get("competitors") if isinstance(result.get("competitors"), list) else []
    content_rows = result.get("content") if isinstance(result.get("content"), list) else []

    normalized_competitors: list[dict[str, Any]] = []
    for item in competitor_rows:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        weaknesses = _string_list(item.get("weaknesses"), [])
        strengths = _string_list(item.get("strengths"), [])
        positioning = str(item.get("positioning", "")).strip()
        market_rank = str(item.get("market_rank") or item.get("market_rank_estimate") or "").strip()
        domain = str(item.get("domain") or item.get("website") or "").strip()
        market_gap = str(item.get("market_gap") or item.get("competitive_gap") or "").strip()
        if not market_gap and weaknesses:
            market_gap = weaknesses[0]
        marketing_purpose = str(item.get("marketing_purpose") or item.get("marketing_objective") or "").strip()
        generic_score = sum(
            1
            for part in (positioning, market_rank, market_gap, marketing_purpose, " ".join(strengths), " ".join(weaknesses))
            if _is_generic_competitor_text(part)
        )
        if generic_score >= 2:
            continue
        normalized_competitors.append(
            {
                "name": name[:180],
                "domain": domain[:300],
                "positioning": positioning,
                "market_rank": market_rank,
                "market_gap": market_gap,
                "marketing_purpose": marketing_purpose,
                "strengths": strengths,
                "weaknesses": weaknesses,
            }
        )

    normalized_competitors = normalized_competitors[:TARGET_COMPETITOR_COUNT]
    if not normalized_competitors and isinstance(competitor_rows, list):
        for item in competitor_rows[:TARGET_COMPETITOR_COUNT]:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            normalized_competitors.append(
                {
                    "name": name[:180],
                    "domain": str(item.get("domain") or item.get("website") or "").strip()[:300],
                    "positioning": str(item.get("positioning") or item.get("pricing_perception") or "").strip(),
                    "market_rank": str(item.get("market_rank") or "").strip(),
                    "market_gap": str(item.get("market_gap") or "").strip(),
                    "marketing_purpose": str(item.get("marketing_purpose") or "").strip(),
                    "strengths": _string_list(item.get("strengths"), []),
                    "weaknesses": _string_list(item.get("weaknesses"), []),
                }
            )
            if len(normalized_competitors) >= TARGET_COMPETITOR_COUNT:
                break

    normalized_content: list[dict[str, str]] = []
    seed_key = (company_name or "workspace").strip() or "workspace"
    for item in content_rows:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        content_text = str(item.get("content_text", "")).strip()
        if not title or not content_text:
            continue
        media_type_in = str(item.get("media_type", "Image")).strip()
        if media_type_in not in {"Image", "Video", "Carousel"}:
            media_type_in = "Image"
        raw_preview = (
            str(item.get("media_preview", "")).strip()
            or str(item.get("media_preview_prompt", "")).strip()
            or str(item.get("media_url", "")).strip()
            or str(item.get("image_url", "")).strip()
            or str(item.get("thumbnail", "")).strip()
        )
        mt, url = _finalize_workspace_content_media(
            raw_preview=raw_preview,
            media_type=media_type_in,
            index=len(normalized_content),
            seed_key=seed_key,
        )
        if not url:
            h = hashlib.sha256(f"{seed_key}:{len(normalized_content)}:{title}".encode()).hexdigest()[:16]
            url = f"https://picsum.photos/seed/{h}/800/450"
        normalized_content.append(
            {
                "title": title[:220],
                "content_text": content_text,
                "media_type": mt,
                "media_preview": url,
            }
        )

    ta_line = str(strategy.get("target_audience", "")).strip()
    if not ta_line:
        ta_line = _workspace_strategy_target_audience_line(result)
    if not ta_line:
        ta_line = str(company_study.get("scenario_summary", "")).strip()[:2000]
    if not ta_line:
        ta_line = _default_target_audience_line(company_name=company_name, scenario=scenario)

    base: dict[str, Any] = {
        "company_study": {
            "discovered_website": str(company_study.get("discovered_website", "")).strip(),
            "scenario_summary": str(company_study.get("scenario_summary", "")).strip(),
            "marketing_gap_issues": _string_list(company_study.get("marketing_gap_issues"), []),
        },
        "strategy": {
            "target_audience": ta_line,
            "content_themes": _string_list(strategy.get("content_themes"), []),
            "platform_focus": _string_list(strategy.get("platform_focus"), []),
            "market_gaps": _string_list(
                strategy.get("market_gaps"),
                _string_list(company_study.get("marketing_gap_issues"), []),
            ),
        },
        "competitors": normalized_competitors,
        "content": normalized_content,
    }

    agent1_keys = (
        "product_summary",
        "target_audience",
        "user_pain_points",
        "marketing_trends",
        "positioning",
        "core_strategy",
    )
    lock1 = {k: result[k] for k in agent1_keys if k in result}
    mg_top = result.get("market_gaps")
    if isinstance(mg_top, list) and mg_top:
        lock1["market_gaps"] = mg_top
    if lock1:
        base["agent1_locked"] = lock1

    lock2 = result.get("agent2_locked")
    if isinstance(lock2, dict) and lock2:
        base["agent2_locked"] = lock2

    return base


def _fallback_workspace_research(
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
) -> dict[str, Any]:
    target = (company_name or "").strip()
    scenario_label = (scenario or "b2b-saas").replace("-", " ").strip() or "b2b saas"
    merged_raw: list[dict[str, Any]] = []
    for item in competitors:
        r = _row_from_user_competitor_seed(
            item,
            company_name=target,
            website=website,
            scenario=scenario,
            primary_region="uae-india",
        )
        if r:
            merged_raw.append(r)
    tmp_fb: dict[str, Any] = {"competitors": merged_raw}
    _coerce_workspace_competitors_in_place(tmp_fb)
    comp_rows = tmp_fb.get("competitors") or []

    return {
        "company_study": {
            "discovered_website": website,
            "scenario_summary": "",
            "marketing_gap_issues": [
                f"Decision makers in {scenario_label} struggle to compare tools on implementation effort, not just feature checklists.",
                f"Current {scenario_label} messaging often under-explains measurable ROI for finance and operations stakeholders.",
            ],
        },
        "strategy": {
            "target_audience": f"Primary buyers and decision makers evaluating {scenario_label} solutions for operational efficiency and measurable ROI.",
            "content_themes": [
                "Practical implementation playbooks",
                "ROI and business impact storytelling",
                "Comparison-led decision support content",
            ],
            "platform_focus": ["linkedin", "instagram", "facebook"],
            "market_gaps": [
                f"Most competitors explain features but not rollout complexity, timelines, and ownership requirements for {scenario_label} teams.",
                f"Buyer-facing content rarely addresses cross-functional objections from finance, operations, and IT during {scenario_label} evaluations.",
            ],
        },
        "competitors": comp_rows,
        "content": [],
    }
