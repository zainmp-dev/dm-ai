from __future__ import annotations

import hashlib
import json
import logging
import re
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


class AgentError(RuntimeError):
    pass


logger = logging.getLogger(__name__)

# Default batch size for workspace strategy + Agent 2 calendar posts (override via API `calendar_days`, max 90).
DEFAULT_WORKSPACE_CALENDAR_DAYS = 10

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
    "openai/gpt-oss-20b:free",
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
    if not settings.openrouter_api_key:
        raise AgentError("OPENROUTER_API_KEY is not configured")

    # Do not force a 128 floor: low OPENROUTER_MAX_TOKENS must be honored so tiny balances can succeed.
    max_tokens = max(1, min(settings.openrouter_max_tokens, 32768))
    last_detail = ""
    # 402 when balance is low: OpenRouter reserves budget from max_tokens; retry with their stated cap or half.
    for attempt in range(16):
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT,
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": max_tokens,
        }

        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "X-Title": "FlowPilot",
                },
                json=payload,
                timeout=settings.openrouter_timeout_seconds,
            )
        except requests.Timeout as exc:
            raise AgentError("OpenRouter request timed out") from exc
        except requests.RequestException as exc:
            detail = exc.response.text[:500] if exc.response is not None else str(exc)
            raise AgentError(f"OpenRouter request failed: {detail}") from exc

        if response.status_code == 200:
            try:
                data = response.json()
                return str(data["choices"][0]["message"]["content"]).strip()
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise AgentError("OpenRouter returned an unexpected response shape") from exc

        detail = (response.text or "")[:1200]
        last_detail = detail
        if response.status_code == 402:
            affordable = _parse_openrouter_affordable_max_tokens(detail)
            if affordable is not None:
                capped = max(1, min(max_tokens, affordable))
                if capped < max_tokens:
                    logger.warning(
                        "OpenRouter 402: reducing max_tokens for model %s from %s to %s (account credit limit)",
                        model,
                        max_tokens,
                        capped,
                    )
                    max_tokens = capped
                    continue
            if max_tokens > 1:
                halved = max(1, max_tokens // 2)
                if halved < max_tokens:
                    logger.warning(
                        "OpenRouter 402: halving max_tokens for model %s %s -> %s",
                        model,
                        max_tokens,
                        halved,
                    )
                    max_tokens = halved
                    continue
        raise AgentError(f"OpenRouter request failed: {detail[:500]}")

    raise AgentError(f"OpenRouter request failed after credit retries: {last_detail[:500]}")


def call_openrouter_with_fallback(
    prompt: str,
    preferred_model: str | None = None,
) -> tuple[str, str]:
    last: AgentError | None = None
    for model in _openrouter_model_chain(preferred_model):
        try:
            return _openrouter_single_model(model, prompt), model
        except AgentError as e:
            last = e
            if not _is_transient_openrouter_error(e):
                raise
            logger.warning("OpenRouter model %s failed; trying next model. %s", model, e)
    if last is not None:
        raise last
    raise AgentError("No OpenRouter models in fallback chain")


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
    strategy_model: str | None = None
    try:
        strategy_result, strategy_model = run_workspace_strategy_agent(
            company_name=company_name,
            website=website,
            scenario=scenario,
            competitors=competitors,
            ai_model=ai_model,
            primary_region=primary_region,
        )
    except AgentError:
        return _fallback_workspace_research(company_name, website, scenario, competitors)

    content_model: str | None = None
    content_extras: dict[str, Any] = {}
    try:
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
    except AgentError:
        content_result = _fallback_workspace_research(company_name, website, scenario, competitors)["content"]
        content_model = None
        content_extras = {}

    result = {**strategy_result, "content": content_result, **content_extras}
    normalized = _normalize_workspace_research(result, company_name, website, scenario, competitors)
    normalized["_ai_model_used"] = content_model or strategy_model
    normalized["_ai_model_requested"] = ai_model
    normalized["_ai_models_by_step"] = {"strategy": strategy_model or "", "content": content_model or ""}
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
    raw, used_model = call_openrouter_with_fallback(prompt, ai_model)
    result = _extract_json(raw, preferred_model=ai_model)
    if not isinstance(result, dict):
        raise AgentError("Workspace strategy agent did not return a JSON object")
    _hydrate_workspace_strategy_from_agent1(result, website=context.website)
    _ensure_competitors_researched(
        result,
        company_name=company_name,
        website=website,
        scenario=scenario,
        user_seeds=competitors,
        primary_region=primary_region,
        ai_model=ai_model,
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
    prompt = content_agent_prompt(context, strategy_output, calendar_days)
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
            calendar_days=calendar_days,
        )
    elif isinstance(parsed, list):
        post_items = parsed
    else:
        raise AgentError("Workspace content agent did not return a JSON object or array")

    if not post_items:
        post_items = _synthetic_calendar_posts_from_strategy(
            strategy_output, company_name=company_name, scenario=scenario, calendar_days=calendar_days
        )

    if not post_items:
        raise AgentError("Workspace content agent returned no calendar posts")

    try:
        rraw, review_used = call_openrouter_with_fallback(
            review_agent_prompt(context, post_items),
            ai_model,
        )
        reviewed = _extract_json(rraw, preferred_model=ai_model)
        if isinstance(reviewed, list) and len(reviewed) > 0:
            post_items = reviewed
            model_used = review_used
    except AgentError:
        pass

    result = post_items
    content: list[dict[str, str]] = []
    for item in result:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        content_text = str(item.get("content_text") or item.get("content") or "").strip()
        hook = str(item.get("hook", "")).strip()
        cta = str(item.get("cta", "")).strip()
        platform_raw = str(item.get("platform", "linkedin")).strip().lower()
        platform = platform_raw if platform_raw in {"linkedin", "instagram", "facebook"} else "linkedin"
        if not content_text and hook:
            content_text = hook
        if hook and not content_text.startswith(hook):
            content_text = f"{hook}\n\n{content_text}"
        if cta and cta not in content_text:
            content_text = f"{content_text}\n\n{cta}"
        tag_list = _string_list(item.get("hashtags"), [])
        if not _dedupe_hashtag_list(tag_list):
            tag_list = fallback_social_hashtags_from_setup(
                platform=platform,
                industry=scenario,
                brand_name=company_name,
                strategy_bundle=strategy_output,
                primary_region=primary_region,
            )
        content_text = merge_social_hashtags_into_body(content_text, tag_list, platform=platform)
        if not title or not content_text:
            continue
        media_type = str(item.get("media_type", "Image")).strip()
        if media_type not in {"Image", "Video", "Carousel"}:
            media_type = "Image"
        content.append(
            {
                "title": title[:220],
                "content_text": content_text,
                "media_type": media_type,
                "media_preview": str(item.get("media_preview") or item.get("media_preview_prompt") or "").strip(),
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


# Short public sample used when the model asks for Video but returns an image URL.
DEFAULT_SUGGEST_VIDEO_URL = "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"


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
    """Return (media_type, media_preview) safe for browsers (<img>/<video>)."""
    mt = media_type if media_type in {"Image", "Video", "Carousel"} else "Image"
    url = _coerce_llm_media_url(raw_preview)
    digest = hashlib.md5(f"{seed_key}:{index}".encode(), usedforsecurity=False).hexdigest()[:12]
    if mt == "Video":
        if not url:
            url = DEFAULT_SUGGEST_VIDEO_URL
        elif _suggest_looks_image_only_url(url) and not _data_url_video_hint(url):
            mt = "Image"
        elif not _suggest_looks_video_url(url) and not _data_url_video_hint(url):
            url = DEFAULT_SUGGEST_VIDEO_URL
    else:
        if not url.startswith("https://") and not url.startswith("data:image/"):
            url = f"https://picsum.photos/seed/{digest}/800/450"
    return mt, url


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
    out_platform = str(result.get("platform") or default_platform or "linkedin").strip().lower()
    if out_platform not in {"linkedin", "instagram", "facebook"}:
        out_platform = "linkedin"
    media_type = _suggest_json_str(result.get("media_type", "Image")) or "Image"
    if media_type not in {"Image", "Video", "Carousel"}:
        media_type = "Image"
    if media_type == "Carousel":
        media_type = "Image"
    media_preview = _suggest_json_str(
        result.get("media_preview") or result.get("media_preview_prompt") or "",
    )
    if media_preview.startswith("http://"):
        media_preview = "https://" + media_preview[7:]
    seed = hashlib.md5(f"{workspace_id}:{title}".encode(), usedforsecurity=False).hexdigest()[:12]
    if not media_preview.startswith("https://") and not (
        media_preview.startswith("data:image/") or _data_url_video_hint(media_preview)
    ):
        media_preview = f"https://picsum.photos/seed/{seed}/800/450"
        media_type = "Image"
    if media_type == "Video":
        if _suggest_looks_image_only_url(media_preview) and not _data_url_video_hint(media_preview):
            # Prefer showing the model's image in the UI instead of swapping to a stock video.
            media_type = "Image"
        elif not _suggest_looks_video_url(media_preview):
            media_preview = DEFAULT_SUGGEST_VIDEO_URL
    if not (media_preview or "").strip() or (media_preview or "").strip().lower() in ("null", "none"):
        media_preview = f"https://picsum.photos/seed/{seed}/800/450"
        media_type = "Image"
    if not (str(media_preview).strip().startswith("https://") or str(media_preview).strip().startswith("data:")):
        media_preview = f"https://picsum.photos/seed/{seed}/800/450"
        media_type = "Image"
    tag_list = _string_list(result.get("hashtags"), [])
    if not _dedupe_hashtag_list(tag_list):
        tag_list = fallback_social_hashtags_from_setup(
            platform=out_platform,
            industry=scenario,
            brand_name=company_name,
            strategy_bundle=strategy_snapshot,
            primary_region=primary_region,
        )
    content_text = merge_social_hashtags_into_body(content_text, tag_list, platform=out_platform)
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
    result["competitors"] = cur[:10]


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
        result["competitors"] = cur[:10]
        _coerce_workspace_competitors_in_place(result)
    if _count_named_competitors(result) >= 3:
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
            positioning = " · ".join(bits) if bits else f"{name} — category benchmark."
        d_raw = str(item.get("domain", "") or item.get("website", "") or "").strip()
        if d_raw and "://" in d_raw:
            d_raw = _host_from_user_website(d_raw) or d_raw
        coerced.append(
            {
                "name": name[:180],
                "domain": d_raw[:300],
                "positioning": positioning[:1500],
                "market_rank": str(item.get("market_rank", "")).strip() or "Category benchmark",
                "market_gap": str(item.get("market_gap", "")).strip()
                or (weaknesses[0] if weaknesses else f"Positioning headroom for our brand vs {name}"),
                "marketing_purpose": str(item.get("marketing_purpose", "")).strip() or "Defend and grow category demand",
                "strengths": strengths or ["Recognized category presence"],
                "weaknesses": weaknesses or ["Typical in-category tradeoffs from public reviews"],
            }
        )
    if coerced:
        result["competitors"] = coerced[:10]


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


def _hydrate_workspace_strategy_from_agent1(result: dict[str, Any], *, website: str) -> None:
    """Map Agent 1 research lock JSON into legacy company_study / strategy / competitors rows."""
    if not isinstance(result, dict):
        return

    if "product_summary" not in result:
        _coerce_workspace_competitors_in_place(result)
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
        scenario_summary = " ".join(parts).strip() or "Positioning study derived from product_summary."

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
            "discovered_website": str(website or ps.get("website") or "").strip() or "Not provided",
            "scenario_summary": scenario_summary[:2000],
            "marketing_gap_issues": gap_list
            or [
                "Sharpen proof vs named category benchmarks",
                "Surface scenario-specific buyer pain more explicitly",
            ],
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
            ta_str = str(pos.get("target_niche") or pos.get("target niche") or "").strip()
        if not ta_str:
            ta_str = str(ps.get("target_audience", "")).strip()
        if not ta_str:
            ta_str = "B2B decision makers shortlisting and evaluating products in this category for their organization."
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
            themes = _string_list(result.get("market_gaps"), [])[:5] or [
                "Clarity on outcomes and proof",
                "Implementation and adoption workflows",
                "Differentiation vs named category leaders",
            ]
        strat["content_themes"] = themes[:12]

    if not strat.get("platform_focus"):
        strat["platform_focus"] = _string_list(
            cs.get("platform_focus"),
            ["linkedin", "instagram", "facebook"],
        )

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
) -> list[dict[str, Any]]:
    """Deterministic posts when the model omits or nulls calendar arrays (unblocks /content)."""
    days = max(1, min(int(calendar_days) if calendar_days else 1, 31))
    st = strategy_output.get("strategy") if isinstance(strategy_output.get("strategy"), dict) else {}
    themes = _string_list(st.get("content_themes"), [])
    if not themes:
        themes = ["Proof-led education", "Customer pain breakdowns", "Competitive clarity"]
    gaps = _string_list(st.get("market_gaps"), [])
    if not gaps:
        gaps = ["Trust and proof", "Clear differentiation", "Simpler next steps"]
    label = (company_name or "Your brand").strip() or "Your brand"
    scen = (scenario or "b2b").replace("-", " ")
    platforms = ["linkedin", "instagram", "facebook"]
    out: list[dict[str, Any]] = []
    for i in range(days):
        theme = themes[i % len(themes)]
        gap = gaps[i % len(gaps)]
        plat = platforms[i % 3]
        seed = hashlib.md5(f"{label}:{scenario}:{i}".encode(), usedforsecurity=False).hexdigest()[:12]
        hook = f"Still seeing {gap.lower()}? Here's a {scen} angle worth testing this week."
        body = (
            f"Start with one proof point: how you reduce risk for buyers before they commit. "
            f"Theme: {theme}. Tie it to: {gap}."
        )
        out.append(
            {
                "platform": plat,
                "title": f"Day {i + 1} — {theme}"[:200],
                "hook": hook,
                "content": body,
                "cta": "Reply with the objection you hear most— we'll tailor the next post.",
                "hashtags": [label.split()[0][:24] or "brand", "growth", "b2b"][:3],
                "media_type": "Image",
                "media_preview_prompt": f"https://picsum.photos/seed/{seed}/800/450",
            }
        )
    return out


def _calendar_posts_from_content_payload(
    payload: dict[str, Any],
    *,
    company_name: str,
    scenario: str,
    calendar_days: int,
) -> list[dict[str, Any]]:
    """Turn Agent 2 JSON (calendar_posts + optional social_posts) into reviewable post dicts."""
    days = max(1, min(int(calendar_days) if calendar_days else 1, 31))
    short_brand = ((company_name or "Your brand").strip() or "Your brand")[:40]
    scen = (scenario or "b2b").replace("-", " ")

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
                    platform = str(item.get("platform", platforms[i % 3])).strip().lower()
                else:
                    text = str(item).strip()
                    hook = text[:200]
                    body = text
                    platform = platforms[i % 3]
                if platform not in {"linkedin", "instagram", "facebook"}:
                    platform = platforms[i % 3]
                seed = hashlib.md5(f"{hook}-{i}".encode()).hexdigest()[:12]
                brand = (company_name or "brand").split()[0][:20] or "content"
                extra.append(
                    {
                        "platform": platform,
                        "title": f"Day {len(posts) + len(extra) + 1} — {brand}",
                        "hook": hook or (body[:180] if body else f"Content beat — {short_brand}"),
                        "content": body or hook,
                        "cta": f"Comment with the biggest {scen} challenge on your plate this week.",
                        "hashtags": [brand, scen.split()[0] if scen else "growth", "marketing"],
                        "media_type": "Image",
                        "media_preview_prompt": f"https://picsum.photos/seed/{seed}/800/450",
                    }
                )
        posts = (posts + extra)[:days]

    out: list[dict[str, Any]] = []
    platforms_cycle = ["linkedin", "instagram", "facebook"]
    for i, item in enumerate(posts[:days]):
        if not isinstance(item, dict):
            continue
        platform_raw = str(item.get("platform", platforms_cycle[i % 3])).strip().lower()
        if platform_raw not in {"linkedin", "instagram", "facebook"}:
            platform_raw = platforms_cycle[i % 3]
        title = str(item.get("title", f"Day {i + 1}")).strip()
        hook = str(item.get("hook", "")).strip()
        content = str(item.get("content", item.get("body", ""))).strip()
        cta = str(item.get("cta", "")).strip()
        if not content and hook:
            content = hook
        if not hook and content:
            hook = content.split("\n")[0][:240]
        hashtags = _string_list(item.get("hashtags"), [])
        if not hashtags:
            scen_token = re.sub(r"[^a-zA-Z0-9]+", "", scen.split()[0] if scen else "growth")[:16] or "brand"
            hashtags = [scen_token, "workforce", "growth"]
        mt = str(item.get("media_type", "Image")).strip()
        if mt not in {"Image", "Video", "Carousel"}:
            mt = "Image"
        url = str(item.get("media_preview_prompt") or item.get("media_preview") or "").strip()
        if not url.startswith("http"):
            seed_s = re.sub(r"[^a-zA-Z0-9-]+", "-", f"{company_name}-{scenario}-{i}")[:48].strip("-") or f"post-{i}"
            url = f"https://picsum.photos/seed/{seed_s}/800/450"
        out.append(
            {
                "platform": platform_raw,
                "title": title,
                "hook": hook,
                "content": content,
                "cta": cta or "Reply with how you handle this today.",
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
    fallback = _fallback_workspace_research(company_name, website, scenario, competitors)
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
        weaknesses = _string_list(item.get("weaknesses"), ["Content differentiation opportunity"])
        domain = str(item.get("domain") or item.get("website") or "").strip()
        market_gap = str(item.get("market_gap") or item.get("competitive_gap") or "").strip()
        if not market_gap and weaknesses:
            market_gap = weaknesses[0]
        normalized_competitors.append(
            {
                "name": name[:180],
                "domain": domain[:300],
                "positioning": str(item.get("positioning", "")).strip() or "Market alternative to benchmark against.",
                "market_rank": str(item.get("market_rank") or item.get("market_rank_estimate") or "").strip()
                or "Qualitative estimate — validate in market",
                "market_gap": market_gap or "Differentiation opportunity vs. this player",
                "marketing_purpose": str(item.get("marketing_purpose") or item.get("marketing_objective") or "").strip()
                or "Grow category presence and win qualified demand",
                "strengths": _string_list(item.get("strengths"), ["Recognized market presence"]),
                "weaknesses": weaknesses,
            }
        )

    normalized_competitors = normalized_competitors[:10]

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
        normalized_content.append(
            {
                "title": title[:220],
                "content_text": content_text,
                "media_type": mt,
                "media_preview": url,
            }
        )

    base: dict[str, Any] = {
        "company_study": {
            "discovered_website": str(company_study.get("discovered_website", "")).strip()
            or fallback["company_study"]["discovered_website"],
            "scenario_summary": str(company_study.get("scenario_summary", "")).strip()
            or fallback["company_study"]["scenario_summary"],
            "marketing_gap_issues": _string_list(
                company_study.get("marketing_gap_issues"),
                fallback["company_study"]["marketing_gap_issues"],
            ),
        },
        "strategy": {
            "target_audience": str(strategy.get("target_audience", "")).strip() or fallback["strategy"]["target_audience"],
            "content_themes": _string_list(strategy.get("content_themes"), fallback["strategy"]["content_themes"]),
            "platform_focus": _string_list(strategy.get("platform_focus"), fallback["strategy"]["platform_focus"]),
            "market_gaps": _string_list(
                strategy.get("market_gaps"),
                _string_list(company_study.get("marketing_gap_issues"), fallback["strategy"]["market_gaps"]),
            ),
        },
        "competitors": normalized_competitors or fallback["competitors"],
        "content": normalized_content or fallback["content"],
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
    scenario_label = (scenario or "growth").replace("-", " ")
    target = company_name or "this company"
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
            "scenario_summary": f"{target} is being set up for the {scenario_label} scenario, so the AI should compare the website, offer, audience, and competitor messages before creating content.",
            "marketing_gap_issues": [
                "Website messaging needs sharper proof against competitor alternatives",
                "Scenario-specific buyer pain points are not explained clearly enough",
                "Competitor comparison content is missing from the marketing plan",
            ],
        },
        "strategy": {
            "target_audience": f"Decision makers evaluating {scenario_label} solutions for {target}.",
            "content_themes": [
                "Proof-led education",
                "Customer pain point breakdowns",
                "Competitor gap comparisons",
                "Website and offer clarity",
            ],
            "platform_focus": ["linkedin", "instagram", "facebook"],
            "market_gaps": [
                "Show clearer proof than competitors",
                "Explain the scenario-specific buying problem",
                "Use comparison content to reduce buyer uncertainty",
            ],
        },
        "competitors": comp_rows,
        "content": [
            {
                "title": f"{target}: market gap snapshot",
                "content_text": (
                    f"We studied {target}{f' ({website})' if website else ''} in the {scenario_label} market and found one clear "
                    "content opportunity: buyers need faster proof, simpler comparisons, and clearer next steps."
                ),
                "media_type": "Image",
                "media_preview": "",
            },
            {
                "title": "Competitor comparison angle",
                "content_text": (
                    f"Most alternatives in this space compete on features. {target} can stand out by showing outcomes, "
                    "use cases, and practical buying criteria."
                ),
                "media_type": "Carousel",
                "media_preview": "",
            },
            {
                "title": "Scenario study post",
                "content_text": (
                    f"For {scenario_label} teams, the best marketing message connects the customer problem, the market gap, "
                    "and a simple action path."
                ),
                "media_type": "Image",
                "media_preview": "",
            },
        ],
    }
