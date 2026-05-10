"""
memory_service.py — Brand/Campaign/Audience memory for FlowPilot AI agents.

Lightweight file-based JSON storage with workspace isolation.
Compatible with DB-backed storage by swapping the read/write functions.

Memory allows agents to:
- Preserve brand tone and voice across campaigns
- Avoid repeated phrases and generic language
- Build a hashtag and CTA library over time
- Track audience intelligence across runs
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

# ── Storage path ──────────────────────────────────────────────────────────────

def _memory_dir() -> Path:
    env_val = os.getenv("MEMORY_STORAGE_PATH", "").strip()
    if env_val:
        return Path(env_val).resolve()
    return (Path(__file__).resolve().parent.parent.parent / "data" / "memory").resolve()


_WRITE_LOCK = Lock()


def _brand_memory_path(workspace_id: str) -> Path:
    return _memory_dir() / f"brand_{workspace_id}.json"


def _audience_memory_path(workspace_id: str) -> Path:
    return _memory_dir() / f"audience_{workspace_id}.json"


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class CampaignEntry:
    campaign_id: str
    timestamp: str
    tone: str
    pillar_names: list[str] = field(default_factory=list)
    top_hooks: list[str] = field(default_factory=list)
    quality_score: float = 0.0


@dataclass
class BrandMemory:
    workspace_id: str
    tone: str = ""
    cta_style: str = ""
    hashtags: list[str] = field(default_factory=list)
    target_audience: str = ""
    banned_words: list[str] = field(default_factory=list)
    avoid_patterns: list[str] = field(default_factory=list)
    formatting_preferences: list[str] = field(default_factory=list)
    platform_preferences: dict[str, float] = field(
        default_factory=lambda: {"linkedin": 0.6, "instagram": 0.25, "facebook": 0.15}
    )
    content_pillars: list[str] = field(default_factory=list)
    top_performing_hooks: list[str] = field(default_factory=list)
    cta_library: list[str] = field(default_factory=list)
    campaign_history: list[dict[str, Any]] = field(default_factory=list)
    updated_at: str = field(default_factory=lambda: _now_iso())


@dataclass
class AudienceMemory:
    workspace_id: str
    segments: list[dict[str, Any]] = field(default_factory=list)
    top_performing_content: list[str] = field(default_factory=list)
    peak_engagement_times: list[str] = field(default_factory=list)
    updated_at: str = field(default_factory=lambda: _now_iso())


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _safe_read(path: Path) -> dict[str, Any] | None:
    try:
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _safe_write(path: Path, data: dict[str, Any]) -> None:
    _ensure_dir(path)
    with _WRITE_LOCK:
        # Atomic write via temp file
        tmp = path.with_suffix(".tmp")
        try:
            tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
            tmp.replace(path)
        except OSError as exc:
            logger.warning("memory_service write_failed path=%s err=%s", path, exc)
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass


# ── Brand memory ──────────────────────────────────────────────────────────────

def load_brand_memory(workspace_id: str) -> BrandMemory | None:
    data = _safe_read(_brand_memory_path(workspace_id))
    if not data:
        return None
    try:
        m = BrandMemory(workspace_id=workspace_id)
        m.tone = str(data.get("tone") or "")
        m.cta_style = str(data.get("cta_style") or "")
        m.hashtags = [str(t) for t in (data.get("hashtags") or []) if t]
        m.target_audience = str(data.get("target_audience") or "")
        m.banned_words = [str(w) for w in (data.get("banned_words") or []) if w]
        m.avoid_patterns = [str(p) for p in (data.get("avoid_patterns") or []) if p]
        m.formatting_preferences = [str(p) for p in (data.get("formatting_preferences") or []) if p]
        pp = data.get("platform_preferences")
        if isinstance(pp, dict):
            m.platform_preferences = {str(k): float(v) for k, v in pp.items() if isinstance(v, (int, float))}
        m.content_pillars = [str(p) for p in (data.get("content_pillars") or []) if p]
        m.top_performing_hooks = [str(h) for h in (data.get("top_performing_hooks") or []) if h]
        m.cta_library = [str(c) for c in (data.get("cta_library") or []) if c]
        m.campaign_history = [e for e in (data.get("campaign_history") or []) if isinstance(e, dict)]
        m.updated_at = str(data.get("updated_at") or _now_iso())
        return m
    except Exception as exc:
        logger.warning("memory_service load_brand_memory parse_error workspace=%s err=%s", workspace_id, exc)
        return None


def save_brand_memory(memory: BrandMemory) -> None:
    _safe_write(_brand_memory_path(memory.workspace_id), asdict(memory))


def build_default_brand_memory(workspace_id: str) -> BrandMemory:
    return BrandMemory(workspace_id=workspace_id)


def merge_strategy_into_memory(
    workspace_id: str,
    *,
    tone: str,
    content_pillars: list[str],
    brand_voice_rules: list[str],
    target_audience: str = "",
    cta_library: list[str] | None = None,
) -> BrandMemory:
    """Merge a new strategy run into persistent brand memory."""
    existing = load_brand_memory(workspace_id) or build_default_brand_memory(workspace_id)

    new_avoid = [
        r for r in brand_voice_rules
        if any(kw in r.lower() for kw in ("avoid", "never", "do not", "don't"))
    ]

    existing.tone = tone or existing.tone
    existing.content_pillars = content_pillars or existing.content_pillars
    existing.avoid_patterns = list(dict.fromkeys(existing.avoid_patterns + new_avoid))[:60]
    if target_audience:
        existing.target_audience = target_audience
    if cta_library:
        existing.cta_library = list(dict.fromkeys(existing.cta_library + cta_library))[:20]
        if cta_library[0]:
            existing.cta_style = cta_library[0]
    existing.updated_at = _now_iso()
    save_brand_memory(existing)
    return existing


def update_memory_from_content(
    workspace_id: str,
    *,
    hashtags: list[str],
    improved_hooks: list[str] | None = None,
    generic_phrases: list[str] | None = None,
    quality_score: float | None = None,
    tone: str = "",
    pillar_names: list[str] | None = None,
) -> BrandMemory:
    """Update memory after content generation — hashtags, hooks, avoid-patterns."""
    existing = load_brand_memory(workspace_id) or build_default_brand_memory(workspace_id)

    if hashtags:
        existing.hashtags = list(dict.fromkeys(existing.hashtags + hashtags))[:40]
    if improved_hooks:
        existing.top_performing_hooks = list(
            dict.fromkeys(existing.top_performing_hooks + improved_hooks)
        )[:25]
    if generic_phrases:
        existing.avoid_patterns = list(
            dict.fromkeys(existing.avoid_patterns + generic_phrases)
        )[:60]
    if quality_score is not None and tone and pillar_names:
        entry: dict[str, Any] = {
            "campaign_id": f"run_{int(time.time())}",
            "timestamp": _now_iso(),
            "tone": tone,
            "pillar_names": pillar_names[:5],
            "quality_score": round(quality_score, 3),
        }
        existing.campaign_history = [entry, *existing.campaign_history][:10]

    existing.updated_at = _now_iso()
    save_brand_memory(existing)
    return existing


# ── Audience memory ───────────────────────────────────────────────────────────

def load_audience_memory(workspace_id: str) -> AudienceMemory | None:
    data = _safe_read(_audience_memory_path(workspace_id))
    if not data:
        return None
    m = AudienceMemory(workspace_id=workspace_id)
    m.segments = [e for e in (data.get("segments") or []) if isinstance(e, dict)]
    m.top_performing_content = [str(c) for c in (data.get("top_performing_content") or []) if c]
    m.peak_engagement_times = [str(t) for t in (data.get("peak_engagement_times") or []) if t]
    m.updated_at = str(data.get("updated_at") or _now_iso())
    return m


def save_audience_memory(memory: AudienceMemory) -> None:
    _safe_write(_audience_memory_path(memory.workspace_id), asdict(memory))


def build_default_audience_memory(workspace_id: str) -> AudienceMemory:
    return AudienceMemory(workspace_id=workspace_id)
