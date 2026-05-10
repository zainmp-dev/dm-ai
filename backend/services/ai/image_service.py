from __future__ import annotations

from services.ai.ai_service import ai_service


def generate_image_prompt(
    *,
    brief: str,
    style: str = "photorealistic",
    platform: str = "instagram",
    preferred_model: str | None = None,
) -> dict[str, str]:
    prompt = (
        "Generate one production-ready image generation prompt.\n"
        f"Brief: {brief}\n"
        f"Style: {style}\n"
        f"Target platform: {platform}\n"
        "Return prompt text only."
    )
    # Gemini-first for image (and video frame) prompt drafting; falls back to
    # the OpenRouter chain inside retry_request if Gemini is unavailable.
    out = ai_service.retry_request(
        prompt=prompt,
        preferred_model=preferred_model,
        task_type="image_generation",
        max_tokens=600,
        temperature=0.6,
        prefer_gemini=True,
    )
    return {"image_prompt": out.text, "_ai_model_used": out.model_used}
