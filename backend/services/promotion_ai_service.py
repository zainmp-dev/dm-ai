"""Heuristic AI-style optimization hints (no mandatory LLM)."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any


def _hash_inputs(post_text: str, metrics: dict[str, Any]) -> str:
    raw = json.dumps({"t": post_text[:2000], "m": metrics}, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def build_optimization_bundle(*, post_text: str, metrics: dict[str, Any]) -> dict[str, Any]:
    text = (post_text or "").strip()
    word_count = len(text.split())
    has_question = "?" in text
    has_cta = bool(re.search(r"\b(learn more|sign up|book|download|shop|try|get)\b", text, re.I))
    hashtags = len(re.findall(r"#[A-Za-z0-9_]+", text))

    engagement_signal = float(metrics.get("engagement_rate_hint") or 0)  # 0..1 optional
    impressions = int(metrics.get("impressions") or 0)

    captions: list[str] = []
    if word_count < 20:
        captions.append(f"{text}\n\nWhat would you try first—A/B this hook in Stories/Reels or double down on the comment prompt below?".strip())
    else:
        captions.append(text[:280] + ("\n\nWant the checklist? Drop a 🔥 in the comments." if not has_question else ""))

    ctas = ["Read the full breakdown →", "Save this for your next launch", "Tag someone who needs this playbook"]
    if not has_cta:
        ctas.insert(0, "Start free today — link in bio")

    audiences = [
        {
            "label": "Lookalike / engagement retargeting",
            "detail": "Retarget people who engaged in the last 14d; expand 1–2% lookalike if seed > 500.",
        },
        {
            "label": "Interest stack",
            "detail": "Layer 3–5 narrow interests aligned with the post topic; exclude low-intent broad categories.",
        },
    ]

    budget_hint = 15.0
    if impressions > 10_000:
        budget_hint = 35.0
    if engagement_signal > 0.03:
        budget_hint *= 1.25

    predictions = {
        "engagement_lift_range_pct": [8, 22],
        "confidence": "low" if impressions < 500 else "medium",
        "drivers": [
            f"Hashtags count: {hashtags} (recommended 3–8 for discovery)",
            "Strong CTA" if has_cta else "Add a single clear CTA",
        ],
    }

    return {
        "captions": captions[:3],
        "ctas": ctas[:5],
        "audience_recommendations": audiences,
        "budget_daily_usd_suggested": round(budget_hint, 2),
        "engagement_prediction": predictions,
        "inputs_hash": _hash_inputs(text, metrics),
        "model_version": "heuristic-v1",
    }
