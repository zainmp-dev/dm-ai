# FlowPilot (flow) — Project documentation

**Package name in `package.json`:** `dm`  
**Branding in UI/backend:** FlowPilot (e.g. OpenRouter `X-Title`, Resend, Cloudinary folder).

This document describes **actual** implementation: stack, setup, API surface, and **all** AI agent entry points with their **prompts** (source of truth: `backend/prompts.py` + legacy strings in `backend/agents.py`).

**Agent count (quick):** the codebase defines **9** distinct LLM prompt templates — **6** in `prompts.py` (5 used + **1** unused smart-scheduling) and **3** legacy niche prompts in `agents.py`. The main product path uses **5** roles: strategy → content → review (chained) → (separately) single-post suggest and analytics. Details in [§4](#4-ai-agents-inventory-behavior-and-full-prompts).

---

## 1. Project scope

FlowPilot is a **workspace-based marketing command center** that:

- Onboards a **company profile** (name, website, scenario, competitors, primary region).
- Runs **AI research**: strategy (competitors, gaps, 7-day plan) + **content calendar** posts with media URL hints.
- Supports **content lifecycle**: draft → approval → schedule → publish to **LinkedIn**, **Facebook**, **Instagram** (Meta Graph).
- Provides **media library** (Cloudinary and/or local disk), **scheduling**, **publishing** with retries, **notifications** (Resend email), **analytics** (AI commentary on mock/reported metrics), and a **background cron** to process scheduled posts.

**Frontend:** Next.js 16 (App Router), React 19, Tailwind 4, Radix/shadcn-style components, Zustand, Recharts, Axios.  
**Backend:** FastAPI (`backend/main.py`), SQLAlchemy + **PostgreSQL** (Supabase connection string in `DATABASE_URL`).

**Out of date in root `README.md`:** it still says “in-memory database (MVP)”. The code uses **Postgres** when `DATABASE_URL` is set.

---

## 2. Local setup

### Prerequisites

- **Node.js** (see Next 16 / package engines if added).
- **Python 3** with `pip` — from repo root: `pip install -r backend/requirements.txt` (or your venv equivalent).
- **Supabase** (or any Postgres) — copy connection string to `backend/.env` as `DATABASE_URL`.
- **OpenRouter** API key for LLM features.

### Environment

1. Copy `backend/.env.example` → `backend/.env` and fill:
   - `DATABASE_URL` (required for persistent auth, workspace, content, media).
   - `OPENROUTER_API_KEY` (required for strategy/content/suggest/analytics).
   - Optional: `OPENROUTER_MODEL`, `OPENROUTER_MODEL_FALLBACKS`, `OPENROUTER_TIMEOUT_SECONDS`.
   - Social: `LINKEDIN_*`, `META_*` for real publishing.
   - `RESEND_API_KEY` / `NOTIFICATION_TO_EMAIL` for email.
   - `CLOUDINARY_*` for cloud media uploads, or `MEDIA_STORAGE_PATH` + `FLOWPILOT_PUBLIC_ORIGIN` for local uploads.
2. From repo root, install JS deps: `npm install`.
3. Initialize DB: run whatever your project uses to apply migrations or call `init_db()` (see `backend/database.py`).

### Run

| Command | Purpose |
|--------|---------|
| `npm run dev` | Next.js only (default port 3000). |
| `npm run backend:dev` | FastAPI on `127.0.0.1:8011` with reload. |
| `npm run dev:all` | Frees port if needed, starts backend, waits for `/health`, starts Next. |
| `npm run build` / `npm start` | Production Next build. |

The Next app proxies the Python API (e.g. under `/api/backend/...`); the backend health check is `GET http://127.0.0.1:8011/health`.

---

## 3. Configuration reference (`backend/config.py`)

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Postgres (Supabase) — required for full app DB features. |
| `OPENROUTER_API_KEY` | LLM calls. |
| `OPENROUTER_MODEL` | Default model id (default `openai/gpt-5-mini`). |
| `OPENROUTER_MODEL_FALLBACKS` | Comma-separated extra models after failures (quota, etc.). |
| `OPENROUTER_TIMEOUT_SECONDS` | Request timeout (default 45). |
| `META_PAGE_ACCESS_TOKEN` (+ aliases) | Facebook/Instagram publishing. |
| `META_PAGE_ID`, `META_IG_BUSINESS_ACCOUNT_ID`, `META_GRAPH_API_VERSION` | Meta Graph. |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN`, `LINKEDIN_API_VERSION` | LinkedIn publishing. |
| `SCHEDULER_INTERVAL_SECONDS`, `MAX_PUBLISH_RETRIES`, `REQUEST_TIMEOUT_SECONDS` | Scheduler/publisher. |
| `WEEKLY_UPDATE_INTERVAL_DAYS`, `WEEKLY_STUDY_NICHE` | Scheduled niche study (if used by cron). |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NOTIFICATION_TO_EMAIL` | Email. |
| `CLOUDINARY_*` | Signed uploads; `CLOUDINARY_FOLDER` default `flowpilot`. |
| `MEDIA_STORAGE_PATH` | Local upload root; default `backend/data/user_media`. |
| `FLOWPILOT_PUBLIC_ORIGIN` | Public app URL for absolute media URLs in API responses. |

Frontend model picker: `lib/ai-models.ts` (`DEFAULT_AI_MODEL`, `AI_MODEL_GROUPS`).

---

## 4. AI agents: inventory, behavior, and full prompts

### 4.1 How many agents (prompt templates)?

| Count | What it means |
|-------|----------------|
| **9** | Total **distinct** LLM user-message templates in the repo. |
| **6** | Defined in `backend/prompts.py` (Appendix A below). |
| **5** | Of those 6, **used** in real flows: strategy, content, review, single-post suggest, analytics. |
| **1** | `smart_scheduling_prompt` is **not** called anywhere (reserved). |
| **3** | Extra templates only in `backend/agents.py` (legacy “niche” chain; Appendix B below). |

In the main UI path you get **up to three** model calls for one “research” action (strategy → content draft → review), plus separate calls for **single-post suggest** and **analytics**. Legacy adds **three** more templates for the old niche-only chain.

| # | Role | `prompts.py` function | `agents.py` runner | Used? |
|---|------|------------------------|--------------------|--------|
| 1 | **Strategy** | `strategy_agent_prompt` | `run_workspace_strategy_agent` | Yes |
| 2 | **Content calendar** | `content_agent_prompt` | `run_workspace_content_agent` (1st call) | Yes |
| 3 | **Content review** | `review_agent_prompt` | `run_workspace_content_agent` (2nd call) | Yes |
| 4 | **Single post suggest** | `single_post_suggest_prompt` | `suggest_master_content_post` (uses model **fallback** chain) | Yes |
| 5 | **Analytics** | `analytics_agent_prompt` | `run_analytics_agent` → `POST /analytics/analyze` | Yes |
| 6 | **Smart scheduling** | `smart_scheduling_prompt` | *(none — not imported)* | **No** |
| 7 | **Legacy niche strategy** | *(inline f-string)* | `run_strategy_agent` | Legacy |
| 8 | **Legacy niche content** | *(inline)* | `run_content_agent` | Legacy |
| 9 | **Legacy niche review** | *(inline)* | `run_review_agent` | Legacy |

**Shared “system” message for every OpenRouter call** (not part of the prompt file body): in `_openrouter_single_model` the messages array is `system` + `user` where system is:  
`You are a senior marketing automation AI. Return exactly what the user requests, with no filler.`

**Brand block:** most user prompts include `build_brand_context` → `BrandContext.as_prompt_block()` (name, industry, audience, tone, **region**, competitors, goals, website). Region is derived from `workspace_region_label()` in `agents.py` from `primary_region` (`uae-gcc` | `india` | `uae-india`).

---

### 4.2 How they work (execution)

1. **Provider:** [OpenRouter](https://openrouter.ai) `POST /api/v1/chat/completions`, header `X-Title: FlowPilot`, **temperature 0.7** (`backend/agents.py`).

2. **JSON extraction:** model reply is parsed in `_extract_json()` (strips \`\`\`json fences, finds first `{` or `[`).

3. **Workspace research** `generate_workspace_research()`:
   - **Step A:** `run_workspace_strategy_agent` → `strategy_agent_prompt` → one JSON object. On failure → `_fallback_workspace_research()`.
   - **Step B:** `run_workspace_content_agent` → `content_agent_prompt` → JSON **array**; then **`review_agent_prompt` on the same array**; if review throws, the **first** draft is kept. On total failure of step B → fallback `content` only.
   - **Step C:** `_normalize_workspace_research()` unifies fields and media URLs.

4. **Single post:** `suggest_master_content_post` uses **`call_openrouter_with_fallback`** (tries preferred model, then `OPENROUTER_MODEL`, then default chain / `OPENROUTER_MODEL_FALLBACKS` on *transient* errors only) → JSON → URL coercion and image/video heuristics in Python.

5. **Analytics:** one `call_openrouter` with `analytics_agent_prompt` — no second pass.

6. **Legacy chain** `generate_reviewed_content(niche)`: `run_strategy_agent` → `run_content_agent` → `run_review_agent` (three separate `call_openrouter` calls with the inline prompts in Appendix B).

7. **Credits / balance UI:** `GET /openrouter/balance` → `get_openrouter_key_info_for_ui()`.

---

### 4.3 Full prompt text

Canonical source in git: **`backend/prompts.py`** and the three f-strings inside **`run_strategy_agent` / `run_content_agent` / `run_review_agent`** in `backend/agents.py`. The blocks below match the repository (update this doc when prompts change).

#### Appendix A — full content of `backend/prompts.py`

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class BrandContext:
    brand_name: str
    industry: str
    target_audience: str
    tone: str
    region: str
    competitors: list[dict[str, str]]
    goals: list[str]
    website: str = ""

    def as_prompt_block(self) -> str:
        return "\n".join(
            [
                f"Brand Name: {self.brand_name}",
                f"Industry: {self.industry}",
                f"Target Audience: {self.target_audience}",
                f"Tone: {self.tone}",
                f"Region: {self.region}",
                f"Website: {self.website or 'Not provided'}",
                f"Competitors: {json.dumps(self.competitors, ensure_ascii=True)}",
                f"Goals: {', '.join(self.goals)}",
            ]
        )


def build_brand_context(
    *,
    brand_name: str,
    industry: str,
    competitors: list[dict[str, str]],
    website: str = "",
    target_audience: str = "",
    tone: str = "clear, practical, confident, and human",
    region: str = "United Arab Emirates and India",
    goals: list[str] | None = None,
) -> BrandContext:
    clean_industry = industry.replace("-", " ").strip() or "digital business"
    return BrandContext(
        brand_name=brand_name.strip() or "the brand",
        industry=clean_industry,
        target_audience=target_audience.strip() or f"buyers and decision makers in {clean_industry}",
        tone=tone.strip() or "clear, practical, confident, and human",
        region=region.strip() or "United Arab Emirates and India",
        competitors=competitors,
        goals=goals
        or [
            "increase qualified awareness",
            "differentiate from competitors",
            "create reusable content pillars",
            "drive approvals, scheduling, publishing, and performance learning",
        ],
        website=website.strip(),
    )


def strategy_agent_prompt(context: BrandContext) -> str:
    return f"""
You are a senior digital marketing strategist.

Your task:
Analyze the business and competitors, identify content gaps, and create a strategy.

Brand context:
{context.as_prompt_block()}

Instructions:
1. Analyze competitors' content and positioning.
2. Identify at least 5 content gaps.
3. Suggest unique positioning.
4. Create a 7-day content plan.
5. Keep the output practical and specific to the brand context.
6. The Region field is authoritative: prefer competitors, channels, and audience pain points that match that geography (e.g. GCC, India, or cross-border as given).

Return only valid JSON with this exact shape:
{{
  "company_study": {{
    "discovered_website": "string",
    "scenario_summary": "string",
    "marketing_gap_issues": ["string"]
  }},
  "competitor_insights": [
    {{
      "name": "string",
      "domain": "string (primary website host or URL root, e.g. competitor.com)",
      "positioning": "string",
      "market_rank": "string (qualitative tier in the category for the Region, e.g. category leader, #2 challenger, fast-growing niche player)",
      "market_gap": "string (main exploitable gap vs this competitor for our brand)",
      "marketing_purpose": "string (their apparent GTM / comms objective, e.g. demand gen, enterprise expansion, retention)",
      "strengths": ["string"],
      "weaknesses": ["string"]
    }}
  ],
  "content_gaps": ["string"],
  "positioning_strategy": "string",
  "strategy": {{
    "target_audience": "string",
    "content_themes": ["string"],
    "platform_focus": ["linkedin", "instagram", "facebook"],
    "market_gaps": ["string"]
  }},
  "seven_day_plan": [
    {{
      "day": 1,
      "topic": "string",
      "angle": "string",
      "recommended_platform": "linkedin|instagram|facebook"
    }}
  ]
}}
"""


def content_agent_prompt(context: BrandContext, strategy_output: dict[str, Any], calendar_days: int = 7) -> str:
    return f"""
You are an expert social media copywriter.

Your task:
Create high-converting posts from the strategy.

Brand context:
{context.as_prompt_block()}

Strategy:
{json.dumps(strategy_output, ensure_ascii=True)}

Instructions:
1. Generate a clean content calendar for {calendar_days} days.
2. Use the 7-day strategy topics as the source of ideas; create useful variations when more than 7 items are needed.
3. Each post must include hook, content, CTA, hashtags, platform, title, media_type, and media_preview_prompt.
4. media_preview_prompt MUST be a direct fetchable URL string (not a prose description):
   - Image or Carousel: an https image URL, e.g. https://picsum.photos/seed/<unique-word>/800/450 or https://images.unsplash.com/photo-...?w=800&q=80
   - Video: an https MP4/WebM URL (e.g. https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4) or switch media_type to Image and use an image URL.
5. Keep tone consistent with the brand context.
6. Avoid generic phrases, hype, spammy language, and unsupported claims.
7. Align hooks and examples with the Region in brand context (GCC, India, or UAE–India cross-border only — never generic "worldwide" framing).

Return only a valid JSON array. Each item must have this exact shape:
{{
  "platform": "linkedin|instagram|facebook",
  "title": "string",
  "hook": "string",
  "content": "string",
  "cta": "string",
  "hashtags": ["string"],
  "media_type": "Image|Video|Carousel",
  "media_preview_prompt": "https://..."
}}
"""


def single_post_suggest_prompt(context: BrandContext, strategy_snapshot: dict[str, Any] | None, hint: str) -> str:
    strat_json = json.dumps(strategy_snapshot, ensure_ascii=True) if strategy_snapshot else "{}"
    hint_line = (
        f"User topic or angle (optional): {hint.strip()}"
        if hint.strip()
        else "No specific topic was given; choose one strong, on-brand idea from the strategy."
    )
    return f"""
You are an expert social media copywriter.

Generate exactly ONE post draft for scheduling. It must match the company brand and strategy below.

Brand context:
{context.as_prompt_block()}

Strategy snapshot (JSON, may be minimal or empty):
{strat_json}

{hint_line}

Instructions:
1. Write a compelling title and full post body for LinkedIn, Instagram, or Facebook (plain text, no markdown code fences).
2. media_type must be one of: Image, Video, Carousel. Prefer Image for a single post.
3. media_preview must be a direct https URL to a royalty-free image that fits the post (e.g. picsum.photos or images.unsplash.com). It must start with https:// and be a plausible image URL.
4. Keep the copy specific to this brand; avoid generic filler. Include 2–4 relevant hashtags at the end of the body.
5. Do not use placeholders like [Company] — use the brand name from context.
6. Reflect the Region from brand context in language, cultural references, and local relevance.

Return only valid JSON with this exact shape:
{{
  "title": "string",
  "content_text": "string",
  "media_type": "Image|Video|Carousel",
  "media_preview": "string"
}}
"""


def review_agent_prompt(context: BrandContext, posts: list[dict[str, Any]]) -> str:
    return f"""
You are a strict content reviewer.

Your task:
Improve and refine content.

Brand context:
{context.as_prompt_block()}

Draft content:
{json.dumps(posts, ensure_ascii=True)}

Instructions:
1. Fix grammar.
2. Improve clarity.
3. Match brand tone.
4. Remove spammy language.
5. Do not change meaning.
6. Keep human tone.
7. Preserve every item's media_type and media_preview_prompt. The latter must remain a direct https URL (or add media_preview with the same URL if the draft only had media_preview_prompt). Do not replace URLs with text descriptions.

Return only the final improved valid JSON array with the same fields as the draft content (platform, title, hook, content, cta, hashtags, media_type, media_preview_prompt).
"""


def smart_scheduling_prompt(platform: str, target_audience: str, region: str) -> str:
    return f"""
You are a social media growth expert.

Your task:
Suggest best posting time.

Input:
- Platform: {platform}
- Audience: {target_audience}
- Region: {region}

Return only valid JSON with this exact shape:
{{
  "best_day": "string",
  "best_time": "string",
  "reason": "string"
}}
"""


def analytics_agent_prompt(content: str, likes: int, comments: int, reach: int) -> str:
    return f"""
You are a marketing analyst.

Your task:
Analyze performance.

Input:
- Content: {content}
- Likes: {likes}
- Comments: {comments}
- Reach: {reach}

Return only valid JSON with this exact shape:
{{
  "performance_summary": "string",
  "what_worked": ["string"],
  "what_failed": ["string"],
  "improvements": ["string", "string", "string"]
}}
"""
```

In production, each **user** message to OpenRouter is the string produced by the functions above. The **system** line is still prepended in code (`_openrouter_single_model`), as described in §4.1.

#### Appendix B — legacy niche prompts in `backend/agents.py`

Used by `run_strategy_agent`, `run_content_agent`, and `run_review_agent` (not the `prompts.py` workspace flow):

```python
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


def run_review_agent(posts: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
    prompt = f"""
Review and improve this generated marketing content:
{json.dumps(posts, ensure_ascii=True)}

Improve clarity, engagement, and human tone. Remove robotic or AI-like phrasing.
Keep platform, hook, body, CTA, and media_url fields.

Return only the improved valid JSON array.
"""
```

---

## 5. End-to-end workspace research

`generate_workspace_research(...)`:

1. Calls `run_workspace_strategy_agent` → on `AgentError`, falls back to `_fallback_workspace_research()`.
2. Calls `run_workspace_content_agent` → on error, uses fallback `content` from the same helper.
3. Normalizes with `_normalize_workspace_research()`.

So the system **always** returns a structured object even if the LLM fails (deterministic placeholder copy).

---

## 6. Main backend HTTP API (FastAPI)

Base path in development is the uvicorn app root (`8011`). The Next app may prefix routes when proxying; check `app/api` for the exact proxy path.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/` | Service info |
| GET | `/health` | Liveness |
| GET | `/openrouter/balance` | OpenRouter credits/usage |
| POST | `/signup`, `/login` | Auth |
| GET | `/workspace` | Current workspace |
| POST | `/workspace` | Create/update workspace |
| DELETE | `/workspace` | Delete workspace |
| POST | `/strategy` | Triggers research/strategy generation |
| POST | `/content` | Content operations (bulk flows) |
| GET | `/content` | List content |
| POST | `/approve`, `/reject`, `/schedule`, `/publish` | Lifecycle |
| GET | `/schedule` | Scheduled items |
| POST | `/publish/{content_id}` | Per-item publish |
| POST | `/approve/{content_id}`, `/reject/{content_id}` | Per-item |
| POST | `/cron/run` | Trigger scheduler/publisher tick |
| POST | `/connect/linkedin`, `/connect/meta` | OAuth/connect helpers |
| GET/POST | `/profile`, POST `/preferences` | User profile & prefs |
| POST | `/media/upload/cloudinary`, `/media/upload/local` | Uploads |
| POST | `/media/library/add-url`, `/media/library/remove` | Library |
| POST | `/analytics/analyze` | AI analytics |
| POST | `/generate` | Legacy generate endpoint (see `GenerateResponse`) |
| GET | `/{MEDIA_PATH_SEG}/{workspace_id}/{file_name}` | Serves local media files |

(Exact list may vary slightly — grep `backend/main.py` for `@app.` and `_bind_media_routes_if_missing`.)

---

## 7. Frontend app routes (App Router)

Under `app/(workspace)/`: **dashboard**, **command-center**, **workspace-setup**, **strategy**, **content**, **approval**, **scheduling**, **publishing**, **media**, **analytics**, **settings**, **notifications**, **profile**, **competitors/[id]**.  
Auth: `app/login`, `app/signup`, OAuth callbacks under `app/auth/meta/callback`, `app/linkedin/callback`.

---

## 8. Data model (summary)

- SQLAlchemy models in `database.py` include **`content`** (UUID, platform, text, `media_url`, status, `scheduled_time`, retries, timestamps).  
- Raw SQL migrations/DDL in `init_db` / `_init_workspace_tables` create among others: `flowpilot_users`, `flowpilot_workspace` (incl. `primary_region`), `flowpilot_profile`, `flowpilot_preferences`, `flowpilot_strategy`, media library, CRM-related fields, etc.

**Content statuses:** `draft`, `approved`, `scheduled`, `published`, `failed`, `rejected` (see `CONTENT_STATUSES` in `database.py`).

---

## 9. Related files

| File | Role |
|------|------|
| `backend/prompts.py` | BrandContext + **primary** marketing prompts (strategy, content, review, single suggest, analytics, smart scheduling stub). |
| `backend/agents.py` | OpenRouter client, fallbacks, JSON extraction, all agent runners, workspace normalization, fallbacks. |
| `backend/config.py` | Settings from env. |
| `backend/main.py` | HTTP API, wiring to agents, publishing, media. |
| `backend/database.py` | Engine, models, init. |
| `lib/ai-models.ts` | OpenRouter model IDs for the UI. |
| `README.md` | High-level product/architecture (partially legacy vs code). |

---

*Generated from repository analysis. Update this file when adding agents, routes, or changing prompts.*
