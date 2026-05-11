from __future__ import annotations

import json
from typing import Any

from services.ai.ai_service import AIServiceError, ai_service
from services.ai.prompt_builder import with_json_contract


def _validate_slide(slide: Any) -> dict[str, str] | None:
    if not isinstance(slide, dict):
        return None
    heading = str(slide.get("heading") or "").strip()
    description = str(slide.get("description") or "").strip()
    image_prompt = str(slide.get("imagePrompt") or "").strip()
    if not heading or not description or not image_prompt:
        return None
    return {
        "heading": heading[:120],
        "description": description[:600],
        "imagePrompt": image_prompt[:500],
    }


def generate_carousel(*, topic: str, brand_context: str = "", preferred_model: str | None = None) -> dict[str, Any]:
    schema = {
        "type": "object",
        "required": ["title", "slides"],
        "properties": {
            "title": {"type": "string"},
            "slides": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["heading", "description", "imagePrompt"],
                },
            },
        },
    }
    prompt = with_json_contract(
        (
            f"Create a social carousel for topic: {topic}\n"
            f"Brand context: {brand_context}\n"
            "Return 5-8 slides and optimize for clear storytelling."
        ),
        schema_hint=schema,
    )
    # Gemini-first (free quota, fast, large context). On failure the underlying
    # retry_request automatically cascades to the OpenRouter chain so the
    # carousel still renders even if Gemini is down or unauthorised.
    result = ai_service.retry_request(
        prompt=prompt,
        preferred_model=preferred_model,
        task_type="carousel",
        response_format={"type": "json_object"},
        prefer_groq_first=True,
        prefer_gemini=True,
    )
    try:
        payload = json.loads(result.text)
    except json.JSONDecodeError as exc:
        raise AIServiceError("Carousel response was not valid JSON") from exc

    title = str(payload.get("title") or "").strip()
    slides_raw = payload.get("slides")
    if not isinstance(slides_raw, list):
        raise AIServiceError("Carousel response missing slides array")
    slides = [s for s in (_validate_slide(x) for x in slides_raw) if s]
    if not title or not slides:
        raise AIServiceError("Carousel response failed schema validation")
    return {"title": title[:140], "slides": slides, "_ai_model_used": result.model_used}
