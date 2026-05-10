/**
 * Strategy Agent
 * Converts research + trend intelligence into an actionable, differentiated content strategy.
 *
 * Model routing: Claude Sonnet 4 (best structured reasoning, high-quality JSON)
 * Fallback: GPT-4o-mini → Gemini Flash → GPT-5-mini
 *
 * Improvements over v1:
 * - Multi-stage reasoning with explicit internal process
 * - Platform-specific strategy objects (not one-size-fits-all)
 * - Diverse CTA library generation
 * - Self-critique embedded in prompting
 * - Confidence scoring
 * - Memory-enriched context (if brand memory provided)
 */
import { invokeRoleChat } from "@/lib/ai/router";
import type { AgentRunOptions, ResearchArtifact, StrategyArtifact, TrendAnalyzerArtifact, WorkspacePipelineContext } from "./types";
import type { BrandMemory } from "./memory";
import { parseAssistantJson } from "./parse";

const SYSTEM = `You are the Strategy Agent — a senior marketing strategist with deep expertise in B2B content, audience psychology, and platform-specific engagement.

MULTI-STAGE REASONING PROCESS (follow this before outputting):
1. ANALYZE: Study the research deeply. What makes this brand unique?
2. PSYCHOLOGICAL MAPPING: Identify the core emotional triggers for the target audience
3. PILLAR GENERATION: Create 4–6 non-overlapping, highly specific content pillars
4. SELF-CRITIQUE: Would these pillars produce unique content? Or are they generic?
5. PLATFORM MAPPING: How should each platform get a different strategic angle?
6. CTA LIBRARY: Generate 6–10 varied, brand-appropriate CTAs (not "Learn more" or "Sign up")
7. FINALIZE: A competitor reading this strategy would feel competitive pressure

Output JSON only. No markdown outside JSON.

Required schema:
{
  "content_pillars": [
    {
      "name": string,                    // Specific name (NOT "Thought Leadership" or "Industry News")
      "description": string,             // What this pillar covers and why it matters
      "content_types": string[],         // ["carousel", "story", "thread", "video"]
      "hooks_style": string,             // The hook style that works best for this pillar
      "example_topics": string[]         // 3–4 specific example post topics
    }
  ],
  "tone": string,                        // SPECIFIC tone — NOT "authentic" or "professional"
  "audience_targeting": [
    {
      "segment": string,                 // Specific segment name
      "pain_point": string,              // Their core frustration
      "message_angle": string            // How to speak to this pain point
    }
  ],
  "brand_voice_rules": string[],         // Specific do's and don'ts (not vague platitudes)
  "platform_strategies": {
    "linkedin": string,                  // LinkedIn-specific approach
    "instagram": string,                 // Instagram-specific approach
    "twitter": string,                   // Twitter/X-specific approach
    "facebook": string                   // Facebook-specific approach
  },
  "cta_library": string[],              // 6–10 varied CTAs (questions, commands, invitations)
  "confidence_score": number,            // 0.0–1.0 self-assessed strategy quality
  "reasoning_quality": "excellent" | "good" | "fair"
}

CRITICAL RULES:
- Content pillars MUST be non-overlapping and specific to this brand/industry
- Tone must be a specific descriptor (e.g. "direct, data-driven, occasionally irreverent")
- NEVER use: "authentic", "innovative", "thought leader", "game-changer", "disruptive"
- Brand voice rules must be actionable (testable: "yes/no this post follows the rule")
- Platform strategies must genuinely differ — not the same content copy-pasted
- CTAs must be varied: mix questions, imperatives, invitations, challenges
- If research shows low confidence, still produce your best strategy and reflect in confidence_score`;

function isStrategyArtifact(v: unknown): v is StrategyArtifact {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.content_pillars) || typeof o.tone !== "string") return false;
  if (!Array.isArray(o.audience_targeting) || !Array.isArray(o.brand_voice_rules)) return false;
  return true;
}

export async function runStrategyAgent(
  ctx: WorkspacePipelineContext,
  research: ResearchArtifact,
  options: AgentRunOptions,
  trends?: TrendAnalyzerArtifact,
  brandMemory?: BrandMemory | null,
): Promise<{ artifact: StrategyArtifact; modelUsed: string; latencyMs: number; attempts: number }> {
  const user = [
    `Workspace: ${ctx.workspaceId ?? "—"}`,
    `Brand: ${ctx.companyName} · ${ctx.website}`,
    `Industry/Scenario: ${ctx.scenario ?? "B2B technology"}`,
    `Region: ${ctx.region ?? "UAE / India"}`,
    `\nResearch summary: ${research.summary}`,
    `Market positioning: ${research.market_positioning}`,
    `Top opportunities:\n${research.opportunities.slice(0, 6).map((o) => `- ${o}`).join("\n")}`,
    research.audience_pain_points?.length
      ? `Audience pain points:\n${research.audience_pain_points.slice(0, 6).map((p) => `- ${p}`).join("\n")}`
      : "",
    research.content_gaps?.length
      ? `Content gaps to exploit:\n${research.content_gaps.slice(0, 5).map((g) => `- ${g}`).join("\n")}`
      : "",
    trends?.recommended_angles?.length
      ? `\nTrend intelligence:\n- Trending topics: ${trends.trending_topics.slice(0, 5).join(", ")}\n- Recommended angles:\n${trends.recommended_angles.slice(0, 5).map((a) => `  - ${a}`).join("\n")}`
      : "",
    trends?.competitor_content_gaps?.length
      ? `- Competitor content gaps:\n${trends.competitor_content_gaps.slice(0, 4).map((g) => `  - ${g}`).join("\n")}`
      : "",
    brandMemory?.tone
      ? `\nBrand memory (previous campaigns): Established tone = "${brandMemory.tone}", Top pillars: ${brandMemory.contentPillars.slice(0, 3).join(", ")}`
      : "",
    brandMemory?.avoidPatterns?.length
      ? `Avoid repeating these patterns: ${brandMemory.avoidPatterns.slice(0, 8).join("; ")}`
      : "",
    `\nFull research data:\n${JSON.stringify(research).slice(0, 14000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await invokeRoleChat({
    role: "strategy",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.strategy,
    temperature: 0.55,
    maxTokens: 5120,
    minChars: 120,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const artifact = parseAssistantJson(completion.content, isStrategyArtifact);

  return {
    artifact,
    modelUsed: completion.modelUsed,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts.length,
  };
}
