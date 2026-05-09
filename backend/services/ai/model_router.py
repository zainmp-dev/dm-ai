from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RouterModels:
    fast_model: str
    smart_model: str
    vision_model: str
    image_model: str
    default_model: str


def detect_task_type(*, prompt: str, explicit: str | None = None) -> str:
    forced = (explicit or "").strip().lower()
    if forced:
        return forced

    text = prompt.lower()
    if any(k in text for k in ("image generation", "generate image", "image prompt", "thumbnail prompt")):
        return "image_generation"
    if any(k in text for k in ("analyze image", "understand image", "vision", "screenshot")):
        return "image_understanding"
    if any(k in text for k in ("carousel", "slide", "slides", "multi-slide")):
        return "carousel"
    if any(k in text for k in ("caption", "hashtags", "social post")):
        return "social_caption"
    if any(k in text for k in ("debug", "bug", "code", "stack trace", "refactor")):
        return "coding"
    if any(k in text for k in ("reason step-by-step", "long reasoning", "analyze deeply")):
        return "long_reasoning"
    return "simple_chat"


def select_best_model(task_type: str, models: RouterModels) -> str:
    t = (task_type or "").strip().lower()
    if t in {"coding", "long_reasoning", "carousel"}:
        return models.smart_model
    if t == "image_understanding":
        return models.vision_model
    if t == "image_generation":
        return models.image_model
    if t in {"social_caption", "simple_chat"}:
        return models.fast_model
    return models.default_model


def fallback_model(task_type: str, models: RouterModels, failed_model: str) -> str:
    chain = [
        select_best_model(task_type, models),
        models.smart_model,
        models.fast_model,
        models.vision_model,
        models.default_model,
    ]
    seen: set[str] = set()
    ordered = []
    for model in chain:
        if not model or model in seen:
            continue
        seen.add(model)
        ordered.append(model)
    for candidate in ordered:
        if candidate != failed_model:
            return candidate
    return models.default_model
