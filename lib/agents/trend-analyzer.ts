/**
 * Trend Analyzer Agent
 * Analyzes research data to surface actionable content trends, viral patterns,
 * and platform-specific signals for the Strategy Agent to consume.
 *
 * Model routing: Gemini Flash (large context, good at pattern recognition)
 * Fallback: DeepSeek V3.2 → GPT-4o-mini
 */
import { invokeRoleChat } from "@/lib/ai/router";
import type { AgentRunOptions, ResearchArtifact, TrendAnalyzerArtifact, WorkspacePipelineContext } from "./types";
import { parseAssistantJson } from "./parse";

const SYSTEM = `You are a Trend Intelligence Agent specializing in social media content strategy.
Your job is to analyze competitive research data and identify actionable content trends.

REASONING PROCESS:
1. Scan competitor strengths/weaknesses for content gaps
2. Identify what topics are conspicuously absent (opportunity)
3. Map emotional triggers in the audience pain points
4. Detect emerging content formats on each platform
5. Generate hook styles that haven't been overused in this niche

Return a single JSON object only — no markdown outside JSON.

Required schema:
{
  "trending_topics": string[],           // 5-8 specific trending topics in this niche
  "emerging_hooks": string[],            // 6-10 hook templates NOT yet overused
  "platform_signals": [                  // per-platform trend signals
    { "platform": "linkedin|instagram|twitter|facebook", "trend": string, "hook_format": string }
  ],
  "recommended_angles": string[],        // 5-8 unique content angles (specific, not generic)
  "viral_content_patterns": string[],    // patterns that drive shares in this niche
  "competitor_content_gaps": string[],   // topics competitors are NOT covering
  "audience_pain_points": string[],      // specific audience frustrations
  "seasonal_opportunities": string[],    // seasonal/timely content opportunities
  "confidence_score": number             // 0.0–1.0 confidence in trend analysis
}

Rules:
- Be specific to the brand's niche — no generic "social media tips" patterns
- Hook templates should vary in style (question, data, story, contrarian, direct)
- Competitor gaps are the highest-value opportunities
- Do NOT repeat what competitors are already doing well`;

function isTrendAnalyzerArtifact(v: unknown): v is TrendAnalyzerArtifact {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.trending_topics) &&
    Array.isArray(o.emerging_hooks) &&
    Array.isArray(o.platform_signals) &&
    Array.isArray(o.recommended_angles)
  );
}

export async function runTrendAnalyzer(
  ctx: WorkspacePipelineContext,
  research: ResearchArtifact,
  options: AgentRunOptions,
): Promise<{ artifact: TrendAnalyzerArtifact; modelUsed: string; latencyMs: number; attempts: number }> {
  const user = [
    `Company: ${ctx.companyName} · Website: ${ctx.website}`,
    `Industry/Scenario: ${ctx.scenario ?? "B2B technology"}`,
    `Region: ${ctx.region ?? "UAE / India"}`,
    `Market Summary: ${research.summary}`,
    `Market Positioning: ${research.market_positioning}`,
    `Opportunities identified:\n${research.opportunities.slice(0, 8).map((o) => `- ${o}`).join("\n")}`,
    `Risks identified:\n${research.risks.slice(0, 6).map((r) => `- ${r}`).join("\n")}`,
    `Competitors (${research.competitors.length}): ${research.competitors.map((c) => c.name).join(", ")}`,
    `Competitor differentiation angles:\n${research.competitors.slice(0, 6).map((c) => `- ${c.name}: ${c.differentiation_angle}`).join("\n")}`,
    research.audience_pain_points?.length
      ? `Known audience pain points:\n${research.audience_pain_points.map((p) => `- ${p}`).join("\n")}`
      : "",
    research.content_gaps?.length
      ? `Known content gaps:\n${research.content_gaps.map((g) => `- ${g}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await invokeRoleChat({
    role: "trend_analyzer",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.trend_analyzer,
    temperature: 0.5,
    maxTokens: 3072,
    minChars: 80,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const artifact = parseAssistantJson(completion.content, isTrendAnalyzerArtifact);

  return {
    artifact,
    modelUsed: completion.modelUsed,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts.length,
  };
}
