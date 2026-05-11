"""
prompts.py — FlowPilot AI Agent Prompts (v2, advanced)

All LLM prompt templates live here.
Task-specific system wording is composed in `services.ai.prompt_builder.build_system_prompt`
and sent on every Groq / Gemini / OpenRouter completion.

Canonical BrandContext is the single source of truth for brand data passed
into every agent. Build it with build_brand_context() before calling any prompt.

Workspace flow: `setup_master_prompt` defines per-workspace engine rules (structure only, no strategy/content).
Agent 1 (`strategy_agent_prompt`) returns locked research JSON (category inferred from website + scenario);
Agent 2 (`content_agent_prompt`) expands it into pillars, SEO, social, funnel, and calendar_posts.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

# ---------------------------------------------------------------------------
# Minimal default system line — extended per task in prompt_builder
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are a senior marketing automation AI. "
    "Return exactly what the user requests, with no filler."
)

# ---------------------------------------------------------------------------
# Brand context
# ---------------------------------------------------------------------------


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
                f"Website: {self.website}",
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
        target_audience=(
            target_audience.strip()
            or f"buyers and decision makers in {clean_industry}"
        ),
        tone=tone.strip() or "clear, practical, confident, and human",
        region=region.strip() or "United Arab Emirates and India",
        competitors=competitors,
        goals=goals
        or [
            "increase qualified brand awareness",
            "differentiate clearly from competitors",
            "create reusable and scalable content pillars",
            "generate leads and drive measurable conversions",
        ],
        website=website.strip(),
    )


# ---------------------------------------------------------------------------
# Master workspace setup (structure only — production V2)
# ---------------------------------------------------------------------------


def setup_master_prompt(
    *,
    workspace_id: str,
    company_name: str,
    website: str,
    industry_scenario: str,
    competitors: list[dict[str, str]],
    primary_region_code: str,
    region_display: str,
    region_focus_research: str,
) -> str:
    """
    One-shot workspace bootstrap: identity, brand context, engine configs, rules.
    Returns instructions for a single JSON object (no strategy or creative content).
    """
    seed = json.dumps(competitors, ensure_ascii=True)
    return f"""
🔥 MASTER SETUP PROMPT (V2 — PRODUCTION)

You are the FlowPilot AI system architect.

Your task is to initialize a NEW WORKSPACE for a marketing automation system.

Each workspace represents a DIFFERENT business.
Each workspace MUST remain completely isolated.

IMPORTANT:
- This runs ONCE per workspace
- Output will be stored and reused
- Do NOT generate strategy or content here
- Only define system structure and rules

━━━━━━━━ INPUT ━━━━━━━━
Company Name: {company_name}
Website: {website}
Industry / Scenario: {industry_scenario}
Primary region code: {primary_region_code}
Region (human-readable): {region_display}
Research region focus (default for research_config): {region_focus_research}
Optional Competitors (JSON): {seed}

CANONICAL workspace_id — you MUST set output "workspace"."workspace_id" to this exact string:
{workspace_id}

━━━━━━━━ YOUR TASK ━━━━━━━━

STEP 1: WORKSPACE IDENTITY
Generate:

{{
  "workspace_id": "unique_id",
  "company_name": "",
  "normalized_industry": "",
  "region": "India + UAE (default if not provided)"
}}

Rules:
- Industry must be normalized (e.g. HRMS, SaaS, E-commerce)
- Region must be explicit (no global ambiguity)
- workspace_id must equal the canonical id given above

---

STEP 2: BRAND CONTEXT (SOURCE OF TRUTH)

{{
  "brand_context": {{
    "brand_name": "",
    "industry": "",
    "target_audience": "",
    "tone": "clear, practical, confident, human",
    "region": "",
    "website": "",
    "competitors": [],
    "goals": []
  }}
}}

Rules:
- This will be reused across ALL agents
- Must be clean and stable
- Populate from INPUT; competitors must reflect the Optional Competitors JSON when provided

---

STEP 3: STRATEGY ENGINE CONFIG (CRITICAL)

{{
  "strategy_engine": {{
    "generate_once": true,
    "locked": true,
    "versioning": true,
    "regeneration_allowed": false,
    "max_versions": 3
  }}
}}

Rules:
- Strategy MUST NOT regenerate automatically
- Only manual override can create v2, v3

---

STEP 4: RESEARCH CONFIG (AGENT 1 CONTROL)

{{
  "research_config": {{
    "region_focus": "India and UAE",
    "competitor_limit": 10,
    "include_real_competitors": true,
    "include_pricing_analysis": true,
    "include_user_pain_points": true,
    "pain_point_structure": {{
      "problem": "",
      "frequency": "low|medium|high",
      "severity": "low|medium|high"
    }},
    "include_marketing_analysis": true
  }}
}}

Rules:
- Set region_focus to match INPUT when possible (use "{region_focus_research}" if consistent)

---

STEP 5: CONTENT ENGINE CONFIG (AGENT 2 CONTROL)

{{
  "content_engine": {{
    "depends_on_strategy": true,
    "no_strategy_no_content": true,
    "avoid_duplicate_topics": true,
    "use_pain_point_priority": true,
    "content_types": ["blog", "social", "video"],
    "platform_priority": {{
      "linkedin": 0.7,
      "instagram": 0.2,
      "facebook": 0.1
    }}
  }}
}}

---

STEP 6: MEMORY + LEARNING SYSTEM

{{
  "memory_system": {{
    "store_strategy": true,
    "store_content_history": true,
    "store_performance": true,
    "learning_enabled": true,
    "update_pain_point_weights": true
  }}
}}

---

STEP 7: SAFETY RULES (VERY IMPORTANT)

{{
  "rules": {{
    "no_generic_output": true,
    "no_regeneration_without_flag": true,
    "respect_workspace_isolation": true,
    "use_only_saved_strategy_for_content": true
  }}
}}

---

STEP 8: FINAL OUTPUT

Return ONE structured JSON:

{{
  "workspace": {{}},
  "brand_context": {{}},
  "strategy_engine": {{}},
  "research_config": {{}},
  "content_engine": {{}},
  "memory_system": {{}},
  "rules": {{}}
}}

IMPORTANT:
- This will control ALL agents
- Must be clean and production-ready
- No explanation
- Return ONLY valid JSON — no markdown fences
"""


# ---------------------------------------------------------------------------
# Agent 1 — Research (category from website + scenario; no hardcoded vendor list)
# ---------------------------------------------------------------------------


def strategy_agent_prompt(context: BrandContext, *, primary_region_code: str = "uae-india") -> str:
    """
    Market research for the product implied by website + scenario + region.
    Returns a single JSON object (locked strategy shape for Agent 2 + persistence).
    """
    seed = context.competitors
    seed_line = ""
    if seed:
        seed_line = (
            "\nUSER-PROVIDED COMPETITOR SEEDS (include these in your competitor set when they are real vendors; add more as needed to reach the minimum):\n"
            + json.dumps(seed, ensure_ascii=True)
        )
    region = primary_region_code.strip().lower() or "uae-india"
    return f"""
🧠 AGENT 1 — RESEARCH PROMPT (MASTER PROMPT)

You are an expert SaaS market research analyst.

Infer the product category and buyer context from the company website, scenario, and region — then perform deep research for that product (e.g. HRMS / workforce tech if the site and scenario indicate it; otherwise the relevant B2B category).

INPUT:
Company Name: {context.brand_name}
Website: {context.website}
Scenario: {context.industry}
Primary region code (ground regional buyer reality in your analysis): {region}
{seed_line}

IMPORTANT RULES:
- This output will be generated ONLY ONCE and stored permanently
- Do NOT regenerate generic answers
- Use real-world patterns for the inferred category in the stated region
- Focus on practical insights, not theory

---

STEP 1: PRODUCT UNDERSTANDING
- From the website and scenario, define:
  - Target audience
  - Core features
  - Value proposition
  - Pricing positioning (low / mid / premium)

---

STEP 2: COMPETITOR ANALYSIS
- Identify 10–12 REAL named vendors/platforms that buyers in this region actually shortlist for the same use case (no invented archetypes, no placeholders).
- For EACH competitor, name a specific product or company (publicly known), not "Established leader" or "Alternative 2".
- For EACH competitor return:
  - name (real brand)
  - domain (root marketing URL)
  - positioning (one sentence on how they sell themselves)
  - strengths (≥ 2 concrete bullets)
  - weaknesses (≥ 2 concrete bullets)
  - pricing_perception
  - target_audience
  - ux_issues
  - market_rank (rough sense, e.g. "category leader", "fast-growing challenger", "regional incumbent")
  - market_gap (what THIS competitor specifically does NOT solve well — must be different from the strengths)
  - marketing_purpose (the dominant marketing wedge they push, e.g. "compliance-first messaging")

---

STEP 3: MARKET GAP ANALYSIS (WEBSITE-VS-COMPETITOR REFERRAL COMPARE)
Compare the COMPANY's own website ({{website echo}}) against the competitor set from STEP 2 and surface gaps that map back to THIS company's marketing — do not produce generic category gaps.
For each gap explain:
- The gap (what is missing or weak in the market / on this company's site)
- Which competitors already cover it (name them) and which do not
- Why this matters for buyers in the stated region
Find REAL gaps:
- What users complain about in this product class
- What competitors are NOT solving
- What is overpriced / overcomplicated
- Missing capabilities for target customer segments (e.g. SMEs when relevant)
- Messaging or proof gaps on THIS company's website vs. how the leaders frame the same value

---

STEP 4: USER PAIN POINTS (DATA-DRIVEN)
Simulate insights from:
- Google search intent
- SaaS reviews (G2, Capterra)
- Reddit / forums
- LinkedIn discussions

Output:
- Top 15 real user problems
- Grouped by category (choose category labels that match the product and scenario — e.g. security, integration, pricing, UX, support, or domain-specific areas)

---

STEP 5: CURRENT MARKETING TRENDS
Analyze how competitors market:
- SEO keywords they target
- Content strategy
- Ad messaging
- Funnel approach

---

STEP 6: STRATEGIC POSITIONING (FINAL)
Define:
- Unique positioning for this product
- Messaging angle
- Target niche
- Competitive advantage

---

STEP 7: LOCKED STRATEGY OUTPUT
Generate structured JSON:

{{
  "product_summary": {{}},
  "target_audience": [],
  "competitors": [],
  "market_gaps": [],
  "user_pain_points": [],
  "marketing_trends": [],
  "positioning": {{}},
  "core_strategy": {{}}
}}

IMPORTANT:
- This output will be reused by another AI agent
- Make it structured, clear, and actionable
- Do NOT include fluff

━━━ OUTPUT RULES ━━━
Return ONLY a valid JSON object matching STEP 7 exactly (plus rich nested content inside those keys). No markdown fences. No prose outside the JSON.

Depth and specificity (research-grade, not one-liners):
- "product_summary": object with at minimum: target_audience (minimum 3 full sentences naming buyer roles and pains), core_features (at least 5 distinct strings), value_proposition (minimum 4 sentences tying differentiation to ROI or outcomes), pricing_positioning (low|mid|premium AND a one-sentence justification), website (marketing URL echo if inferable).
- Include "scenario_fit" optional string explaining how scenario + region shape GTM here.
Each item in "competitors": name, domain, positioning, strengths (array of AT LEAST TWO concrete bullets each referencing real differentiation), weaknesses (same), pricing_perception, target_audience, ux_issues, market_rank, market_gap, marketing_purpose — no generic labels; each field must carry specific detail (not "... TBD").
The "competitors" array MUST contain BETWEEN 10 AND 12 distinct real vendor/product names appropriate to the website, scenario, and region. Fewer than 10 is unacceptable. Never return "competitors": [] and never use placeholder names.
"market_gaps": AT LEAST 8 distinct insight strings grounded in STEP 3 — each gap MUST reference at least one competitor by name and explain how THIS company's website currently treats (or misses) that angle.
"marketing_trends": AT LEAST 4 strings naming concrete channels or tactics peers use.
"user_pain_points" must contain EXACTLY 15 objects — each category (string), problem (minimum 140 characters of detail), notes (when useful).
"""


def competitor_discovery_prompt(
    *,
    company_name: str,
    website: str,
    scenario: str,
    region_label: str,
    primary_region_code: str,
    user_seeds_json: str,
    partial_competitors_json: str,
) -> str:
    """
    Second-pass research when Agent 1 returns too few competitors — still fully dynamic, no hardcoded vendor names in code.
    """
    return f"""
You are a B2B market analyst. The primary research run returned a sparse or empty competitor set.

Your job: list REAL products or companies that buyers in the target region actually compare when evaluating solutions like this company's offering.

INPUT (use all of it):
- Company: {company_name}
- Website: {website}
- Scenario / industry: {scenario}
- Region label: {region_label}
- Region code: {primary_region_code}
- User seeds (may be empty) — prefer these if they are real vendors: {user_seeds_json}
- Partial competitor rows already found (may be empty): {partial_competitors_json}

RULES:
- Return 10 to 12 competitors as a JSON array of objects (fewer than 10 is unacceptable)
- Each object: name, domain (marketing site host, e.g. example.com, or "" if unknown), positioning (one sentence), strengths (array of strings), weaknesses (array), pricing_perception (string), target_audience (string), ux_issues (string), market_rank (string e.g. "category leader" / "fast-growing challenger" / "regional incumbent"), market_gap (what this competitor specifically does NOT solve well), marketing_purpose (their dominant marketing wedge)
- Use specific vendor/product names; do NOT use labels like "Market leader", "Low-cost option", "Competitor A"
- Base choices on the category implied by the website and scenario and what is commonly evaluated in the stated region
- If user seeds name real vendors, include them with full detail (do not drop them)
- Append the partial rows already found AS-IS, then add additional real vendors until the array has at least 10 items.

OUTPUT:
Return ONLY a valid JSON array. No markdown, no surrounding object, no explanation.
"""


# ---------------------------------------------------------------------------
# Agent 2 — Content generation (from locked research)
# ---------------------------------------------------------------------------


def content_agent_prompt(
    context: BrandContext,
    strategy_output: dict[str, Any],
    calendar_days: int = 10,
) -> str:
    """
    Content plan + calendar from Agent 1 JSON. Returns a JSON object
    (pillars, SEO, social, video, landing, funnel, calendar_posts).
    """
    agent1_json = json.dumps(strategy_output, ensure_ascii=True)
    return f"""
✍️ AGENT 2 — CONTENT GENERATION PROMPT
You are a SaaS content strategist and conversion-focused copywriter.

You will receive a LOCKED research output from another AI agent.

IMPORTANT RULES:
- DO NOT re-analyze competitors
- DO NOT create new strategy
- ONLY use given data
- Content must be practical and high-conversion

INPUT (Agent 1 locked JSON):
{agent1_json}

BRAND CONTEXT (voice / region only — do not override facts from the JSON above):
{context.as_prompt_block()}

---

STEP 1: CONTENT PILLARS
Create 5 content pillars based on:
- Market gaps
- User pain points

---

STEP 2: SEO CONTENT PLAN
Generate:
- 20 blog topics
- Based on real search intent
- Include:
  - Problem-focused titles
  - Comparison content
  - Solution-driven content

---

STEP 3: SOCIAL MEDIA CONTENT
Generate:
- 15 short-form posts
- Hooks based on pain points
- Clear, bold, engaging

---

STEP 4: VIDEO CONTENT IDEAS
Generate:
- 10 video ideas
- Focus on:
  - Product demo
  - Problem-solution
  - Before/after

---

STEP 5: CONVERSION CONTENT
Generate:
- Landing page messaging:
  - Headline
  - Subheadline
  - CTA ideas

---

STEP 6: FUNNEL STRATEGY
Create:
- TOFU (awareness)
- MOFU (consideration)
- BOFU (conversion)

---

STEP 7: CALENDAR POSTS (scheduling)
Generate exactly {calendar_days} publish-ready social posts in "calendar_posts".
Rotate platforms across days (linkedin | instagram | facebook). One post per array item.
Every post MUST be grounded in the locked JSON inputs (pain points, audience, market gaps, and positioning).
Do not write generic advice that could apply to any company.
Use concrete use-case language tied to the product/context from the locked JSON.
Each calendar post object MUST have:
- platform: linkedin|instagram|facebook
- title: internal label (not the hook)
- hook: scroll-stopping opener (1–2 lines; must not repeat across posts)
- content: full body (short paragraphs; platform-appropriate length)
- cta: one specific action
- hashtags: 3–6 plain tags (no # prefix in strings)
- media_type: Image|Video|Carousel — pick the best format for the post (Image for single shots, Carousel for multi-step stories, Video for motion-native ideas).
- media_preview_prompt: Use a real https URL from a stock library (e.g. images.pexels.com, images.unsplash.com) that matches the post topic and {context.brand_name}'s industry, OR set to "" — the server can fill from Pexels when PEXELS_API_KEY is configured and the query is blank.
  Do not invent fake domains. Do not use unrelated or placeholder stock. When you return a URL it must clearly match this post's subject and audience.

---

OUTPUT FORMAT:

Return ONLY a valid JSON object. No markdown fences.

{{
  "content_pillars": [],
  "seo_topics": [],
  "social_posts": [],
  "video_ideas": [],
  "landing_content": {{}},
  "funnel_strategy": {{}},
  "calendar_posts": []
}}

IMPORTANT:
- Content must directly solve user problems from the locked JSON
- Avoid generic content
- Reject irrelevant ideas: if a post does not map to a real pain point or audience need from input, replace it.
- Make it actionable and realistic
- "calendar_posts" length must be exactly {calendar_days} — use non-null arrays; never leave "calendar_posts" or "social_posts" empty, truncated, or null (the app requires these posts to save content).
"""


# ---------------------------------------------------------------------------
# Agent 3 — Content review
# ---------------------------------------------------------------------------


def review_agent_prompt(
    context: BrandContext,
    posts: list[dict[str, Any]],
) -> str:
    """
    Reviews and elevates content calendar draft.
    Returns the same JSON array structure, improved.
    """
    return f"""
You are a senior content editor and brand voice specialist.
You are reviewing a batch of social media posts before they go live.

━━━ YOUR TASK ━━━
Review every post in the draft below against the brand standards.
Return the improved array. Do not shrink the array or merge posts.

━━━ BRAND CONTEXT ━━━
{context.as_prompt_block()}

━━━ DRAFT CONTENT ━━━
{json.dumps(posts, ensure_ascii=True)}

━━━ REVIEW CHECKLIST (apply to every post) ━━━

LANGUAGE & GRAMMAR
□ Fix all grammar, punctuation, and spelling errors.
□ Eliminate passive voice where it weakens the message.
□ Vary sentence length — a mix of short punchy lines and fuller sentences.

BRAND ALIGNMENT
□ Tone must match exactly: {context.tone}
□ Remove any phrase that contradicts the brand's stated goals.
□ Ensure brand name ({context.brand_name}) is used naturally where appropriate —
  not stuffed, not absent when it matters.

ENGAGEMENT QUALITY
□ Hook must be strong enough to stop a scroll — if it starts with "In today's
  world", "As a business", or any cliché opener, rewrite it.
□ CTA must be specific and varied across the batch — not every post should say
  "click the link in bio".
□ Content body must deliver real value (insight, data point, story, or
  actionable tip) — remove or replace filler paragraphs.
□ Hashtags: must align with Brand Context and the post; never return an
  empty hashtags array. Deduplicate; remove spammy or off-topic tags; keep
  counts appropriate to the platform
  (conservative for LinkedIn, slightly broader for Instagram). Do not put #
  inside hook, content, or cta.

REGIONAL ACCURACY
□ All examples, references, and pain points must match the region:
  {context.region}. Remove any reference that implies a different geography.

SPAM & HYPE REMOVAL
□ Remove: "game-changer", "revolutionary", "unlock your potential",
  "best-in-class", "leverage", "synergies", excessive exclamation marks.
□ No ALL CAPS for emphasis. Use sentence case throughout.

PLATFORM VOICE
□ LinkedIn: professional, longer form acceptable.
□ Instagram: punchy, visual, emoji allowed sparingly.
□ Facebook: conversational, community-friendly.

MEDIA PRESERVATION (CRITICAL)
□ Preserve media_type exactly as in the draft.
□ Preserve media_preview_prompt when it holds a usable https/data URL OR an empty "" (do not substitute prose).
□ If the draft had media_preview instead of media_preview_prompt, copy the value into media_preview_prompt.
□ Do NOT replace URLs with vague text descriptions unless the draft URL was obviously broken.

━━━ OUTPUT FORMAT ━━━
Return ONLY the improved valid JSON array. No explanation. No markdown fences.
Same fields as draft: platform, title, hook, content, cta, hashtags,
media_type, media_preview_prompt.
"""


# ---------------------------------------------------------------------------
# Agent 4 — Single post suggest
# ---------------------------------------------------------------------------


def single_post_suggest_prompt(
    context: BrandContext,
    strategy_snapshot: dict[str, Any] | None,
    hint: str,
    platform: str = "",
) -> str:
    """
    Generates one publish-ready post on demand.
    `hint` is the user-provided topic or angle (may be empty).
    `platform` is the preferred platform (may be empty — AI chooses).
    Returns a single JSON object.
    """
    strat_json = (
        json.dumps(strategy_snapshot, ensure_ascii=True) if strategy_snapshot else "{}"
    )

    hint_line = (
        f"User topic or angle: {hint.strip()}"
        if hint.strip()
        else "No specific topic provided — choose the single strongest on-brand idea from the strategy snapshot."
    )

    platform_line = (
        f"Target platform: {platform.strip()}"
        if platform.strip()
        else "Choose the most appropriate platform for this content (linkedin | instagram | facebook)."
    )

    return f"""
You are an expert social media copywriter. A user has requested one publish-ready
post draft for immediate scheduling.

━━━ BRAND CONTEXT ━━━
{context.as_prompt_block()}

━━━ STRATEGY SNAPSHOT ━━━
{strat_json}

━━━ REQUEST ━━━
{hint_line}
{platform_line}

━━━ EXECUTION RULES ━━━
1. TITLE: An internal working title (not published). Concise and descriptive.

2. CONTENT BODY (content_text):
   - Platform: {platform.strip() or 'best-fit platform for this content'}.
   - Open with a hook that stops the scroll — question, bold claim, or
     counterintuitive insight. No "In today's world…" openers.
   - Deliver a clear, specific insight or story in 2–4 short paragraphs.
   - Close with exactly one CTA — vary from "click link" (try: save this,
     drop a comment, DM us, tag a colleague).
   - Do NOT put any hashtag characters (#) or tag lists in content_text. The
     hashtag line is output only in the "hashtags" array (see below).
   - Plain text only — no markdown, no code fences.
   - Do NOT use placeholders like [Company] or [Year]. Use the real brand
     name: {context.brand_name}.

2b. HASHTAGS (separate field — required, never empty):
   - Return a "hashtags" array: at least 3 short strings, without the # prefix.
   - Derive tags from: Brand Context (industry, audience, region, goals),
     Strategy SNAPSHOT (target_audience, content_themes, platform_focus,
     market_gaps when present), and this post’s topic. Prefer region-relevant
     and niche terms over generic viral tags.
   - Deduplicate; no near-duplicates; 3–6 for LinkedIn/Facebook, 4–8 for
     Instagram. One word or CamelCase per tag; no punctuation spam.
   - Include a branded tag only if the brand already uses one in the snapshot
     or it is natural for {context.brand_name}.
   - The final stored post will show these tags on a separate line under the
     main copy; keep content_text free of any # so the body stays clean.

3. REGION: {context.region}
   - All references, examples, pain points, and language must reflect this
     exact region. No generic "worldwide" framing.

4. TONE: {context.tone}
   - Every line must match this tone. Read the full post back before returning
     and adjust any line that drifts.

5. MEDIA:
   - media_type: Choose the best fit — Image, Carousel (step-by-step tips or
     listicles), or Video (demos, testimonials, reels, tutorials).
     Vary the format across posts; do not default to Image every time.
   - media_preview_prompt: A real https URL from a reputable stock host (e.g. Pexels, Unsplash)
     that visually matches this post for {context.brand_name}. If unsure, use "" and the server
     may resolve a Pexels asset when PEXELS_API_KEY is set. Never fabricate URLs on unknown domains.

6. QUALITY GATE — before returning, verify:
   □ Hook does not start with a cliché opener.
   □ Brand name is used naturally (not stuffed).
   □ No hype language ("game-changer", "revolutionary", "unlock your potential").
   □ content_text has no # characters; hashtags are only in the array.
   □ media_preview_prompt is either "" or a valid https URL you would trust as a marketer.
   □ All JSON fields are present.

━━━ OUTPUT FORMAT ━━━
Return ONLY a valid JSON object. No explanation. No markdown fences.
Exact shape:
{{
  "title": "string",
  "platform": "linkedin|instagram|facebook",
  "content_text": "string",
  "hashtags": ["string", "string"],
  "media_type": "Image|Video|Carousel",
  "media_preview_prompt": "https://..."
}}
Set "platform" to the actual target for this post: prefer
{platform.strip() or "the best fit for the copy"} when it matches; otherwise
choose the best channel for this post.
"""


# ---------------------------------------------------------------------------
# Workspace Q&A (Command Center / header search) — same OpenRouter stack as other agents
# ---------------------------------------------------------------------------


def workspace_search_prompt(workspace_json: str, user_query: str, region_description: str) -> str:
    """Answer questions using only the supplied workspace snapshot JSON as ground truth."""
    return f"""
You are the FlowPilot workspace assistant. The user is asking about THEIR saved marketing workspace.

━━━ GROUND TRUTH (JSON snapshot; may be partial) ━━━
{workspace_json}

━━━ REGIONAL SCOPE ━━━
{region_description}

━━━ USER QUESTION ━━━
{user_query.strip()}

━━━ RULES ━━━
1. Base answers ONLY on fields present in the JSON. If something is missing, say what is missing and suggest running "Agent 1" (strategy) or refreshing content — do not invent company facts, competitors, or metrics.
2. Be concise: short paragraphs or tight bullets. No JSON output. No markdown code fences.
3. When citing competitors or posts, use names/titles from the snapshot.
4. If the question is unrelated to this workspace, answer briefly and tie it back to how it could apply to their strategy or content if relevant; otherwise decline politely.
"""


# ---------------------------------------------------------------------------
# Agent 5 — Analytics
# ---------------------------------------------------------------------------


def analytics_agent_prompt(
    context: BrandContext,
    content: str,
    likes: int,
    comments: int,
    reach: int,
) -> str:
    """
    Analyses post performance with brand context.
    Returns a JSON object with actionable recommendations.
    """
    engagement_rate = round((likes + comments) / max(reach, 1) * 100, 2)

    return f"""
You are a data-driven marketing analyst specialising in social media performance
for brands in {context.region}.

━━━ YOUR TASK ━━━
Analyse the performance of the post below. Provide honest, specific, and
actionable insights. Do not inflate positive findings or soften negatives.

━━━ BRAND CONTEXT ━━━
{context.as_prompt_block()}

━━━ POST PERFORMANCE DATA ━━━
Content:
{content}

Metrics:
- Likes:          {likes}
- Comments:       {comments}
- Reach:          {reach}
- Engagement rate: {engagement_rate}% (calculated: (likes + comments) / reach)

━━━ ANALYSIS RULES ━━━
1. PERFORMANCE SUMMARY (2–3 sentences).
   - Characterise the result honestly: strong, average, or below benchmark.
   - Reference engagement rate in context for the platform and region.
   - Mention one specific element of the post that most likely drove (or
     hurt) performance.

2. WHAT WORKED.
   - Specific elements: hook phrasing, CTA type, topic relevance, media type,
     posting time if inferable, language choices.
   - Each item must reference something concrete in the post content.
   - If metrics are very low and nothing worked, say so directly.

3. WHAT FAILED.
   - Specific, honest critique — no sugarcoating.
   - If engagement rate is below 1%, flag it explicitly.
   - Reference specific lines, phrases, or structural choices that likely hurt.

4. IMPROVEMENTS (exactly 3).
   - Each must be a concrete, implementable change for the NEXT post on this
     topic (not generic advice like "post more consistently").
   - Frame as: "Change X to Y because Z."
   - At least one improvement must reference the region: {context.region}.

━━━ OUTPUT FORMAT ━━━
Return ONLY a valid JSON object. No explanation. No markdown fences.
Exact shape:
{{
  "performance_summary": "string",
  "what_worked": ["string"],
  "what_failed": ["string"],
  "improvements": ["string", "string", "string"]
}}
"""


# ---------------------------------------------------------------------------
# Agent 6 — Smart scheduling (now wired — use in POST /schedule flow)
# ---------------------------------------------------------------------------


def smart_scheduling_prompt(
    context: BrandContext,
    platform: str,
    content_type: str = "general",
) -> str:
    """
    Suggests optimal posting day/time for a given platform and brand.
    Returns a JSON object.

    Wire to POST /schedule in main.py — previously unused.
    """
    return f"""
You are a social media growth expert with deep knowledge of platform algorithms
and audience behaviour in {context.region}.

━━━ YOUR TASK ━━━
Recommend the single best day and time to publish a post for maximum organic
reach and engagement.

━━━ INPUT ━━━
Platform:     {platform}
Content type: {content_type}
Audience:     {context.target_audience}
Region:       {context.region}
Brand tone:   {context.tone}

━━━ REASONING RULES ━━━
1. Base your recommendation on platform-specific algorithm behaviour AND the
   audience's working patterns in {context.region} (time zones, weekend
   conventions, prayer times for GCC etc.).
2. For LinkedIn: consider business hours and mid-week peaks.
3. For Instagram: consider early morning, lunch, and evening engagement windows.
4. For Facebook: consider community-active windows in the region.
5. Content type matters: educational content peaks mid-week; promotional and
   inspirational content can work on weekends.
6. Provide a specific time range (e.g. "Tuesday 8:00–9:00 AM GST") — not
   "morning" or "evening".
7. Justify the recommendation in one concrete sentence referencing audience
   behaviour.

━━━ OUTPUT FORMAT ━━━
Return ONLY a valid JSON object. No explanation. No markdown fences.
Exact shape:
{{
  "best_day": "string — e.g. Tuesday",
  "best_time": "string — e.g. 8:00–9:00 AM GST",
  "timezone": "string — e.g. GST (UTC+4) or IST (UTC+5:30)",
  "reason": "string — one concrete sentence referencing audience behaviour"
}}
"""


# ---------------------------------------------------------------------------
# Agent 7 — JSON repair (new — use in _extract_json on parse failure)
# ---------------------------------------------------------------------------


def json_repair_prompt(broken_output: str, expected_shape: str) -> str:
    """
    Second-pass prompt: fixes broken/partial JSON from a previous agent call.
    Pass the raw broken output and the expected JSON shape as a string.
    Use this in agents.py _extract_json as a fallback before raising AgentError.
    """
    return f"""
The following text was produced by an AI agent but contains invalid or
incomplete JSON. Your task is to repair it.

━━━ BROKEN OUTPUT ━━━
{broken_output}

━━━ EXPECTED JSON SHAPE ━━━
{expected_shape}

━━━ REPAIR RULES ━━━
1. Extract all valid data from the broken output.
2. Reconstruct a valid JSON object or array matching the expected shape exactly.
3. If a field's value is missing or unrecoverable, use a sensible empty default:
   "" for strings, [] for arrays, {{}} for objects.
4. Do NOT invent or hallucinate values — only use what is recoverable from the
   broken output.
5. Do NOT include any explanation, commentary, or markdown fences.

Return ONLY the repaired valid JSON.
"""


# ---------------------------------------------------------------------------
# Legacy agents (moved from agents.py inline f-strings)
# These are used by run_strategy_agent / run_content_agent / run_review_agent
# in the legacy /generate endpoint. Delete if that endpoint is removed.
# ---------------------------------------------------------------------------


def legacy_strategy_prompt(niche: str) -> str:
    return f"""
You are a senior marketing strategist.

Create a marketing strategy for this business niche: {niche}

Rules:
- Competitor analysis must include at least 3 distinct competitor types.
- Growth strategy must name specific, actionable channels (not just "social media").
- Weekly plan must have 7 concrete daily actions, not generic advice.

Return ONLY a valid JSON object. No explanation. No markdown fences.
Exact shape:
{{
  "competitor_analysis": [
    {{
      "competitor_type": "string",
      "strengths": ["string"],
      "weaknesses": ["string"]
    }}
  ],
  "content_gaps": ["string"],
  "growth_strategy": {{
    "positioning": "string",
    "audience": "string",
    "channels": ["string"],
    "weekly_plan": ["string"],
    "success_metrics": ["string"]
  }}
}}
"""


def legacy_content_prompt(strategy: dict[str, Any]) -> str:
    return f"""
You are an expert social media copywriter.

Using this strategy, create platform-specific content:
{json.dumps(strategy, ensure_ascii=True)}

Rules:
- Each post must have a strong hook (no cliché openers).
- CTAs must be specific and varied — not all "click the link in bio".
- Remove all hype language.

Return ONLY a valid JSON array. No explanation. No markdown fences.
Exactly 5 Instagram posts, 3 LinkedIn posts, 3 Facebook posts.
Each item exact shape:
{{
  "platform": "instagram|linkedin|facebook",
  "hook": "string",
  "body": "string",
  "cta": "string",
  "media_url": null
}}
"""


def legacy_review_prompt(posts: list[dict[str, Any]]) -> str:
    return f"""
You are a senior content editor.

Review and improve this marketing content:
{json.dumps(posts, ensure_ascii=True)}

Rules:
- Fix grammar and spelling.
- Strengthen any weak hooks.
- Remove robotic or AI-like phrasing.
- Vary CTAs if they are all the same.
- Preserve all fields: platform, hook, body, cta, media_url.

Return ONLY the improved valid JSON array. No explanation. No markdown fences.
"""
