"""
quality_scorer.py — AI output quality scoring for FlowPilot agents.

Scores strategy and content outputs across multiple quality dimensions
before they are persisted. Low-scoring outputs can trigger regeneration
or model escalation.

Usage:
    from services.ai.quality_scorer import score_strategy, score_content, QualityScore
    result = score_strategy(strategy_dict)
    if not result.passed:
        # regenerate or escalate
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# ── Thresholds ────────────────────────────────────────────────────────────────

STRATEGY_PASS_THRESHOLD = 0.60
CONTENT_PASS_THRESHOLD = 0.55

# Generic phrases that immediately reduce quality score
_GENERIC_PHRASES: frozenset[str] = frozenset(
    {
        "in today's fast-paced world",
        "game-changer",
        "game changer",
        "synergy",
        "leverage",
        "paradigm shift",
        "disruptive",
        "holistic approach",
        "seamless experience",
        "empower",
        "unlock potential",
        "take your business to the next level",
        "at the end of the day",
        "it's no secret that",
        "are you looking to",
        "exciting news",
        "we are thrilled",
        "we're thrilled",
        "best practices",
        "key takeaways",
        "innovative solution",
        "thought leader",
        "thought leadership",
        "brand awareness",
        "value proposition",
        "cutting-edge",
        "state-of-the-art",
    }
)

# Cliché tones that indicate low-quality strategy
_CLICHE_TONES: frozenset[str] = frozenset(
    {
        "authentic",
        "innovative",
        "professional",
        "engaging",
        "thought leader",
        "industry leader",
        "passionate",
    }
)

# Overused CTA patterns
_WEAK_CTAS: frozenset[str] = frozenset(
    {
        "learn more",
        "sign up",
        "get started",
        "contact us",
        "click here",
        "follow us",
        "share this",
        "like and share",
        "tag a friend",
    }
)


# ── Score dataclass ───────────────────────────────────────────────────────────

@dataclass
class QualityScore:
    overall_score: float
    passed: bool
    dimension_scores: dict[str, float] = field(default_factory=dict)
    issues: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _has_generic(text: str) -> list[str]:
    lower = text.lower()
    return [p for p in _GENERIC_PHRASES if p in lower]


def _count_distinct(items: list[str]) -> int:
    return len({x.lower().strip() for x in items if x.strip()})


# ── Strategy scorer ───────────────────────────────────────────────────────────

def score_strategy(strategy: dict[str, Any]) -> QualityScore:
    """
    Score a strategy JSON object on:
    - Pillar differentiation (are they non-generic and distinct?)
    - Tone specificity (not a cliché)
    - Brand voice rules (are they actionable?)
    - Audience targeting (is it specific?)
    - CTA quality (are CTAs varied and non-generic?)
    - Platform strategies (are they platform-specific?)
    """
    issues: list[str] = []
    suggestions: list[str] = []
    scores: dict[str, float] = {}

    # ── Pillar scoring ────────────────────────────────────────────────────────
    pillars = strategy.get("content_pillars") or []
    pillar_names = [
        (p.get("name") or "" if isinstance(p, dict) else str(p)).strip()
        for p in pillars
        if p
    ]
    generic_pillars = [
        n for n in pillar_names
        if any(g in n.lower() for g in ("thought leadership", "industry news", "company update", "behind the scenes", "tips and tricks"))
    ]
    if len(pillar_names) < 3:
        issues.append(f"Too few content pillars: {len(pillar_names)} (minimum 3 required)")
        scores["pillar_differentiation"] = 0.0
    elif generic_pillars:
        issues.append(f"Generic pillar names detected: {', '.join(generic_pillars)}")
        suggestions.append("Replace generic pillars with specific topics unique to this brand")
        scores["pillar_differentiation"] = max(0.2, 0.8 - (len(generic_pillars) * 0.25))
    else:
        scores["pillar_differentiation"] = min(1.0, 0.5 + len(pillar_names) * 0.1)

    # ── Tone scoring ──────────────────────────────────────────────────────────
    tone = str(strategy.get("tone") or "").strip().lower()
    if not tone:
        issues.append("Tone is missing")
        scores["tone_specificity"] = 0.0
    elif any(c in tone for c in _CLICHE_TONES):
        cliche_found = [c for c in _CLICHE_TONES if c in tone]
        issues.append(f"Cliché tone detected: {', '.join(cliche_found)}")
        suggestions.append("Use a specific, testable tone descriptor (e.g. 'direct, data-driven, occasionally irreverent')")
        scores["tone_specificity"] = 0.3
    else:
        # Reward specificity — longer tone descriptions are usually more specific
        scores["tone_specificity"] = min(1.0, 0.5 + len(tone.split(",")) * 0.15)

    # ── Brand voice rules scoring ─────────────────────────────────────────────
    voice_rules = strategy.get("brand_voice_rules") or []
    if len(voice_rules) < 3:
        issues.append("Too few brand voice rules (minimum 3 recommended)")
        scores["voice_rule_quality"] = 0.3
    else:
        vague_rules = [
            r for r in voice_rules
            if isinstance(r, str) and any(
                vague in r.lower()
                for vague in ("be professional", "be engaging", "be authentic", "be consistent")
            )
        ]
        if vague_rules:
            suggestions.append("Replace vague voice rules with testable do's and don'ts")
            scores["voice_rule_quality"] = 0.5
        else:
            scores["voice_rule_quality"] = min(1.0, 0.6 + len(voice_rules) * 0.05)

    # ── Audience targeting scoring ────────────────────────────────────────────
    audience = strategy.get("audience_targeting") or []
    if not audience:
        issues.append("Audience targeting is missing")
        scores["audience_specificity"] = 0.0
    elif len(audience) == 1 and isinstance(audience[0], str):
        vague = ["business professionals", "decision makers", "companies", "businesses"]
        if any(v in str(audience[0]).lower() for v in vague):
            issues.append("Audience targeting is too vague")
            suggestions.append("Specify audience segments with pain points and message angles")
            scores["audience_specificity"] = 0.3
        else:
            scores["audience_specificity"] = 0.7
    else:
        scores["audience_specificity"] = min(1.0, 0.5 + len(audience) * 0.15)

    # ── CTA quality scoring ───────────────────────────────────────────────────
    cta_library = strategy.get("cta_library") or []
    if not cta_library:
        suggestions.append("Add a CTA library with varied, brand-appropriate calls to action")
        scores["cta_quality"] = 0.4
    else:
        weak_ctas = [
            c for c in cta_library
            if isinstance(c, str) and any(w in c.lower() for w in _WEAK_CTAS)
        ]
        scores["cta_quality"] = max(0.3, min(1.0, 0.7 - (len(weak_ctas) * 0.1) + len(cta_library) * 0.03))

    # ── Platform strategy scoring ─────────────────────────────────────────────
    platform_strats = strategy.get("platform_strategies")
    if not platform_strats or not isinstance(platform_strats, dict):
        suggestions.append("Add platform-specific strategies (LinkedIn, Instagram, Twitter, Facebook)")
        scores["platform_specificity"] = 0.4
    else:
        non_empty = sum(1 for v in platform_strats.values() if v and str(v).strip())
        scores["platform_specificity"] = min(1.0, non_empty * 0.25)

    # ── Weighted overall score ────────────────────────────────────────────────
    weights = {
        "pillar_differentiation": 0.30,
        "tone_specificity": 0.20,
        "voice_rule_quality": 0.15,
        "audience_specificity": 0.20,
        "cta_quality": 0.08,
        "platform_specificity": 0.07,
    }
    overall = sum(scores.get(k, 0.5) * w for k, w in weights.items())
    passed = overall >= STRATEGY_PASS_THRESHOLD and len(issues) == 0

    return QualityScore(
        overall_score=round(overall, 3),
        passed=passed,
        dimension_scores={k: round(v, 3) for k, v in scores.items()},
        issues=issues,
        suggestions=suggestions,
    )


# ── Content scorer ────────────────────────────────────────────────────────────

def score_content(content: dict[str, Any]) -> QualityScore:
    """
    Score content JSON on:
    - Hook variety (do hooks use different styles?)
    - Generic phrase density (how many banned phrases appear?)
    - Caption platform optimization (is the content platform-specific?)
    - Hashtag quality (appropriate count, not spam)
    - Overall diversity
    """
    issues: list[str] = []
    suggestions: list[str] = []
    scores: dict[str, float] = {}

    hooks = [str(h) for h in (content.get("hooks") or []) if h]
    captions = content.get("captions") or []
    hashtags = [str(t) for t in (content.get("hashtags_suggestions") or []) if t]

    # ── Hook quality scoring ──────────────────────────────────────────────────
    if len(hooks) < 5:
        issues.append(f"Too few hooks: {len(hooks)} (minimum 5 recommended)")
        scores["hook_variety"] = 0.3
    else:
        all_text = " ".join(hooks).lower()
        generic_in_hooks = _has_generic(all_text)
        if generic_in_hooks:
            issues.append(f"Generic phrases in hooks: {', '.join(generic_in_hooks[:3])}")
            scores["hook_variety"] = 0.4
        else:
            # Check for structural diversity (first words should differ)
            first_words = [h.split()[0].lower() if h.split() else "" for h in hooks]
            distinct_starts = _count_distinct(first_words)
            diversity_ratio = distinct_starts / len(hooks)
            scores["hook_variety"] = min(1.0, 0.4 + diversity_ratio * 0.6)
        if scores["hook_variety"] < 0.6:
            suggestions.append("Vary hook openings — use question, data, story, contrarian, and direct styles")

    # ── Caption quality scoring ───────────────────────────────────────────────
    if len(captions) < 4:
        issues.append(f"Too few captions: {len(captions)} (minimum 4 recommended)")
        scores["caption_quality"] = 0.3
    else:
        caption_texts = " ".join(
            (c.get("text") or "" if isinstance(c, dict) else str(c))
            for c in captions
        ).lower()
        generic_in_captions = _has_generic(caption_texts)
        if len(generic_in_captions) > 3:
            issues.append(f"High density of generic phrases in captions: {len(generic_in_captions)} detected")
            suggestions.append("Rewrite captions to remove: " + ", ".join(generic_in_captions[:5]))
            scores["caption_quality"] = max(0.2, 0.7 - len(generic_in_captions) * 0.05)
        else:
            scores["caption_quality"] = min(1.0, 0.6 + len(captions) * 0.02)

    # ── Platform diversity scoring ────────────────────────────────────────────
    platforms = list({
        (c.get("platform") or "" if isinstance(c, dict) else "")
        for c in captions
        if c
    })
    scores["platform_diversity"] = min(1.0, len(platforms) * 0.25)
    if len(platforms) < 3:
        suggestions.append("Include content for at least LinkedIn, Instagram, and Twitter")

    # ── Hashtag quality scoring ───────────────────────────────────────────────
    if not hashtags:
        suggestions.append("Add relevant hashtag suggestions")
        scores["hashtag_quality"] = 0.4
    elif len(hashtags) > 30:
        suggestions.append("Reduce hashtag list to 15–20 most relevant tags")
        scores["hashtag_quality"] = 0.7
    else:
        scores["hashtag_quality"] = min(1.0, 0.5 + len(hashtags) * 0.025)

    # ── Weighted overall score ────────────────────────────────────────────────
    weights = {
        "hook_variety": 0.35,
        "caption_quality": 0.35,
        "platform_diversity": 0.20,
        "hashtag_quality": 0.10,
    }
    overall = sum(scores.get(k, 0.5) * w for k, w in weights.items())
    passed = overall >= CONTENT_PASS_THRESHOLD and not issues

    return QualityScore(
        overall_score=round(overall, 3),
        passed=passed,
        dimension_scores={k: round(v, 3) for k, v in scores.items()},
        issues=issues,
        suggestions=suggestions,
    )
