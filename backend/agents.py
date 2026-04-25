from __future__ import annotations

import hashlib
import json
import re
from typing import Any

import requests

from config import settings
from prompts import (
    analytics_agent_prompt,
    build_brand_context,
    content_agent_prompt,
    review_agent_prompt,
    single_post_suggest_prompt,
    strategy_agent_prompt,
)


class AgentError(RuntimeError):
    pass


def workspace_region_label(primary_region: str) -> str:
    code = (primary_region or "global").strip().lower()
    return {
        "global": "Global (worldwide)",
        "uae-gcc": "United Arab Emirates and Gulf Cooperation Council (GCC) — local regulations, business culture, and buyers in this region",
        "india": "India — audience, pricing sensitivity, language mix (English + regional), and local digital channels",
        "uae-india": "United Arab Emirates and India — address both GCC and Indian audiences where relevant (cross-border, remittance, talent, B2B trade)",
    }.get(code, "Global (worldwide)")


def _extract_json(raw_text: str) -> Any:
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
        raise AgentError("AI response did not contain JSON")

    start = min(starts)
    end = text.rfind("}") if text[start] == "{" else text.rfind("]")
    if end <= start:
        raise AgentError("AI response JSON was incomplete")

    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise AgentError("AI response JSON could not be parsed") from exc


def call_openrouter(prompt: str, model: str | None = None) -> str:
    if not settings.openrouter_api_key:
        raise AgentError("OPENROUTER_API_KEY is not configured")

    payload = {
        "model": model or settings.openrouter_model,
        "messages": [
            {
                "role": "system",
                "content": "You are a senior marketing automation AI. Return exactly what the user requests, with no filler.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
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
        response.raise_for_status()
    except requests.Timeout as exc:
        raise AgentError("OpenRouter request timed out") from exc
    except requests.RequestException as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        raise AgentError(f"OpenRouter request failed: {detail}") from exc

    try:
        data = response.json()
        return str(data["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise AgentError("OpenRouter returned an unexpected response shape") from exc


def run_strategy_agent(niche: str) -> dict[str, Any]:
    prompt = f"""
Create a marketing strategy for this business niche: {niche}

Return only valid JSON with this exact shape:
{{
  "competitor_analysis": [
    {{"competitor_type": "string", "strengths": ["string"], "weaknesses": ["string"]}}
  ],
  "content_gaps": ["string"],
  "growth_strategy": {{
    "positioning": "string",
    "audience": "string",
    "channels": ["instagram", "linkedin", "facebook"],
    "weekly_plan": ["string"],
    "success_metrics": ["string"]
  }}
}}
"""
    result = _extract_json(call_openrouter(prompt))
    if not isinstance(result, dict):
        raise AgentError("Strategy agent did not return a JSON object")
    return result


def run_content_agent(strategy: dict[str, Any]) -> list[dict[str, str | None]]:
    prompt = f"""
Using this strategy JSON, create platform-specific content:
{json.dumps(strategy, ensure_ascii=True)}

Return only a valid JSON array with exactly:
- 5 Instagram posts
- 3 LinkedIn posts
- 3 Facebook posts

Each item must have:
{{
  "platform": "instagram|linkedin|facebook",
  "hook": "string",
  "body": "string",
  "cta": "string",
  "media_url": null
}}
"""
    result = _extract_json(call_openrouter(prompt))
    if not isinstance(result, list):
        raise AgentError("Content agent did not return a JSON array")
    return _normalize_posts(result)


def run_review_agent(posts: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
    prompt = f"""
Review and improve this generated marketing content:
{json.dumps(posts, ensure_ascii=True)}

Improve clarity, engagement, and human tone. Remove robotic or AI-like phrasing.
Keep platform, hook, body, CTA, and media_url fields.

Return only the improved valid JSON array.
"""
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
    calendar_days: int = 7,
    primary_region: str = "global",
) -> dict[str, Any]:
    try:
        strategy_result = run_workspace_strategy_agent(
            company_name=company_name,
            website=website,
            scenario=scenario,
            competitors=competitors,
            ai_model=ai_model,
            primary_region=primary_region,
        )
    except AgentError:
        return _fallback_workspace_research(company_name, website, scenario, competitors)

    try:
        content_result = run_workspace_content_agent(
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

    result = {**strategy_result, "content": content_result}
    return _normalize_workspace_research(result, company_name, website, scenario, competitors)


def run_workspace_strategy_agent(
    *,
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
    ai_model: str | None = None,
    primary_region: str = "global",
) -> dict[str, Any]:
    context = build_brand_context(
        brand_name=company_name,
        website=website,
        industry=scenario,
        competitors=competitors,
        region=workspace_region_label(primary_region),
    )
    prompt = strategy_agent_prompt(context)
    result = _extract_json(call_openrouter(prompt, ai_model))
    if not isinstance(result, dict):
        raise AgentError("Workspace strategy agent did not return a JSON object")
    if "competitors" not in result and isinstance(result.get("competitor_insights"), list):
        result["competitors"] = result["competitor_insights"]
    if "company_study" in result and isinstance(result["company_study"], dict):
        gaps = _string_list(result.get("content_gaps"), [])
        if gaps:
            result["company_study"]["marketing_gap_issues"] = _string_list(
                result["company_study"].get("marketing_gap_issues"),
                gaps,
            )
    return result


def run_workspace_content_agent(
    *,
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
    strategy_output: dict[str, Any],
    ai_model: str | None = None,
    calendar_days: int = 7,
    primary_region: str = "global",
) -> list[dict[str, str]]:
    target_audience = ""
    if isinstance(strategy_output.get("strategy"), dict):
        target_audience = str(strategy_output["strategy"].get("target_audience", ""))
    context = build_brand_context(
        brand_name=company_name,
        website=website,
        industry=scenario,
        competitors=competitors,
        target_audience=target_audience,
        region=workspace_region_label(primary_region),
    )
    prompt = content_agent_prompt(context, strategy_output, calendar_days)
    result = _extract_json(call_openrouter(prompt, ai_model))
    if not isinstance(result, list):
        raise AgentError("Workspace content agent did not return a JSON array")
    try:
        reviewed = _extract_json(call_openrouter(review_agent_prompt(context, result), ai_model))
        if isinstance(reviewed, list):
            result = reviewed
    except AgentError:
        pass
    content: list[dict[str, str]] = []
    for item in result:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        content_text = str(item.get("content_text") or item.get("content") or "").strip()
        hook = str(item.get("hook", "")).strip()
        cta = str(item.get("cta", "")).strip()
        hashtags = _string_list(item.get("hashtags"), [])
        if not content_text and hook:
            content_text = hook
        if hook and not content_text.startswith(hook):
            content_text = f"{hook}\n\n{content_text}"
        if cta and cta not in content_text:
            content_text = f"{content_text}\n\n{cta}"
        if hashtags:
            tag_line = " ".join(tag if tag.startswith("#") else f"#{tag.lstrip('#')}" for tag in hashtags)
            if tag_line not in content_text:
                content_text = f"{content_text}\n\n{tag_line}"
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
    return content


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
    primary_region: str = "global",
) -> dict[str, str]:
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
    prompt = single_post_suggest_prompt(context, strategy_snapshot, hint)
    result = _extract_json(call_openrouter(prompt, ai_model))
    if not isinstance(result, dict):
        raise AgentError("AI did not return a JSON object for the post draft")
    title = _suggest_json_str(result.get("title"))
    content_text = _suggest_json_str(result.get("content_text") or result.get("content"))
    if not title or not content_text:
        raise AgentError("AI returned an empty title or body")
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
    return {
        "title": title[:220],
        "content_text": content_text,
        "media_type": media_type,
        "media_preview": str(media_preview).strip(),
    }


def generate_reviewed_content(niche: str) -> tuple[dict[str, Any], list[dict[str, str | None]]]:
    strategy = run_strategy_agent(niche)
    drafted_posts = run_content_agent(strategy)
    reviewed_posts = run_review_agent(drafted_posts)
    return strategy, reviewed_posts


def run_analytics_agent(content: str, likes: int, comments: int, reach: int, ai_model: str | None = None) -> dict[str, Any]:
    result = _extract_json(call_openrouter(analytics_agent_prompt(content, likes, comments, reach), ai_model))
    if not isinstance(result, dict):
        raise AgentError("Analytics agent did not return a JSON object")
    return result


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
        normalized_competitors.append(
            {
                "name": name[:180],
                "positioning": str(item.get("positioning", "")).strip() or "Market alternative to benchmark against.",
                "strengths": _string_list(item.get("strengths"), ["Recognized market presence"]),
                "weaknesses": _string_list(item.get("weaknesses"), ["Content differentiation opportunity"]),
            }
        )

    normalized_content: list[dict[str, str]] = []
    for item in content_rows:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        content_text = str(item.get("content_text", "")).strip()
        if not title or not content_text:
            continue
        media_type = str(item.get("media_type", "Image")).strip()
        if media_type not in {"Image", "Video", "Carousel"}:
            media_type = "Image"
        normalized_content.append(
            {
                "title": title[:220],
                "content_text": content_text,
                "media_type": media_type,
                "media_preview": str(item.get("media_preview", "")).strip(),
            }
        )

    return {
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


def _fallback_workspace_research(
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
) -> dict[str, Any]:
    scenario_label = (scenario or "growth").replace("-", " ")
    target = company_name or "this company"
    competitor_names = [
        (item.get("name") or item.get("website") or "").strip()
        for item in competitors
        if (item.get("name") or item.get("website") or "").strip()
    ]
    if not competitor_names:
        competitor_names = [
            f"Established {scenario_label} leader",
            f"Low-cost {scenario_label} alternative",
            f"Niche {scenario_label} specialist",
        ]

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
        "competitors": [
            {
                "name": name,
                "positioning": f"Benchmark target for {target} in the {scenario_label} market.",
                "strengths": ["Clear category presence", "Visible offer positioning"],
                "weaknesses": ["Limited differentiation proof", "Opportunity for sharper comparison content"],
            }
            for name in competitor_names[:6]
        ],
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
