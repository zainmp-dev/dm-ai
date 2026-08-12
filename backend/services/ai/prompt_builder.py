from __future__ import annotations

import json
from typing import Any


def build_system_prompt(task_type: str) -> str:
    t = (task_type or "").strip().lower()
    if t == "coding":
        return "You are a senior software engineer. Be precise, include root cause and deterministic fixes."
    if t == "long_reasoning":
        return "You are an analytical expert. Reason deeply, but respond with concise, actionable output."
    if t == "image_understanding":
        return "You are a vision-capable assistant. Describe observable facts only, avoid assumptions."
    if t == "image_generation":
        return "You create production image prompts. Return only detailed prompt text."
    if t == "social_caption":
        return "You are a social media strategist. Write concise, platform-aware captions with high clarity."
    if t == "carousel":
        return "You create social carousel content. Return strict JSON only."
    if t == "blog":
        from services.blog_prompts import blog_system_prompt

        return blog_system_prompt()
    return "You are a helpful assistant. Return clear, accurate responses without filler."


def with_json_contract(prompt: str, schema_hint: dict[str, Any] | None = None) -> str:
    schema_text = json.dumps(schema_hint or {"type": "object"}, ensure_ascii=True)
    return (
        f"{prompt.strip()}\n\n"
        "Output requirements:\n"
        "- Return valid JSON only.\n"
        "- Do not include markdown fences.\n"
        f"- JSON schema hint: {schema_text}\n"
    )
