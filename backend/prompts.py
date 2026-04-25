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
    region: str = "global",
    goals: list[str] | None = None,
) -> BrandContext:
    clean_industry = industry.replace("-", " ").strip() or "digital business"
    return BrandContext(
        brand_name=brand_name.strip() or "the brand",
        industry=clean_industry,
        target_audience=target_audience.strip() or f"buyers and decision makers in {clean_industry}",
        tone=tone.strip() or "clear, practical, confident, and human",
        region=region.strip() or "global",
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
      "positioning": "string",
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
4. Keep tone consistent with the brand context.
5. Avoid generic phrases, hype, spammy language, and unsupported claims.
6. Align hooks and examples with the Region in brand context (GCC, India, or global as specified).

Return only a valid JSON array. Each item must have this exact shape:
{{
  "platform": "linkedin|instagram|facebook",
  "title": "string",
  "hook": "string",
  "content": "string",
  "cta": "string",
  "hashtags": ["string"],
  "media_type": "Image|Video|Carousel",
  "media_preview_prompt": "string"
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

Return only the final improved valid JSON array with the same fields as the draft content.
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

