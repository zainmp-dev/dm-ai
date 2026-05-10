/**
 * Research Agent
 * Deep competitive intelligence and market positioning analysis.
 *
 * Model routing: Gemini Flash (large context, cost-effective, web-aware prompting)
 * Fallback: DeepSeek V3.2 → DeepSeek Chat → GPT-4o-mini
 *
 * Improvements over v1:
 * - Multi-stage reasoning (analyze → identify → evaluate → score)
 * - Confidence scoring for research quality awareness
 * - Trending topics and audience pain points
 * - Content gap identification from competitor analysis
 */
import { invokeRoleChat } from "@/lib/ai/router";
import type { AgentRunOptions, ResearchArtifact, WorkspacePipelineContext } from "./types";
import { parseAssistantJson } from "./parse";

const SYSTEM = `You are the Research Agent for a B2B social media marketing platform. Your role is deep competitive intelligence and strategic positioning analysis.

REASONING PROCESS (follow internally before outputting):
1. ANALYZE the company name, website, and industry to infer the specific product category
2. IDENTIFY real named competitors — never use placeholders like "Competitor A" or generic names
3. EVALUATE market positioning gaps — what is this brand NOT doing that competitors are?
4. DISCOVER what the target audience is frustrated about in this space
5. DETECT trending topics and content formats in this niche right now
6. SCORE your confidence based on information density available

Respond with a single JSON object only (no markdown outside JSON). Be specific — no generic fluff.

Required schema:
{
  "competitors": [
    {
      "name": string,                    // Real company name
      "positioning": string,             // Their market positioning
      "strengths": string[],             // 2–4 specific strengths
      "weaknesses": string[],            // 2–4 specific weaknesses
      "differentiation_angle": string,   // Their main differentiator
      "sources_hint": string             // Where this info would be found
    }
  ],
  "market_positioning": string,          // Clear positioning statement for this brand
  "opportunities": string[],             // 4–8 specific, actionable opportunities
  "risks": string[],                     // 3–5 real market risks
  "summary": string,                     // Executive summary (3–5 sentences)
  "trending_topics": string[],           // 4–8 trending topics in this niche
  "audience_pain_points": string[],      // 4–8 specific pain points of the ICP
  "content_gaps": string[],              // 4–6 topics competitors are NOT covering
  "confidence_score": number,            // 0.0–1.0 confidence in research quality
  "data_quality": "high" | "medium" | "low"
}

Rules:
- Return 4–8 real, named competitors minimum (infer from industry if website is unclear)
- If data is sparse, be transparent in sources_hint
- Opportunities must be specific to this brand, not generic
- Pain points should reflect what buyers in this space complain about online
- Content gaps are the highest-value output — be specific`;

function isResearchArtifact(v: unknown): v is ResearchArtifact {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.competitors)) return false;
  if (typeof o.market_positioning !== "string") return false;
  if (!Array.isArray(o.opportunities) || !Array.isArray(o.risks)) return false;
  if (typeof o.summary !== "string") return false;
  return true;
}

export async function runResearchAgent(
  ctx: WorkspacePipelineContext,
  options: AgentRunOptions,
): Promise<{ artifact: ResearchArtifact; modelUsed: string; latencyMs: number; attempts: number }> {
  const user = [
    `Workspace: ${ctx.workspaceId ?? "—"}`,
    `Company: ${ctx.companyName}`,
    `Website: ${ctx.website}`,
    ctx.scenario ? `Industry/Scenario: ${ctx.scenario}` : "",
    ctx.region ? `Target region: ${ctx.region}` : "",
    ctx.competitors?.length
      ? `Known competitor seeds (expand from these):\n${ctx.competitors.map((c) => `- ${c.name} ${c.website ?? ""} ${c.focus ?? ""}`).join("\n")}`
      : "",
    ctx.antiRepeatSamples?.length
      ? `Previously used hooks (avoid repeating these patterns):\n${ctx.antiRepeatSamples.slice(0, 10).map((s) => `- ${s}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await invokeRoleChat({
    role: "research",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.research,
    temperature: 0.4,
    maxTokens: 6144,
    minChars: 80,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const artifact = parseAssistantJson(completion.content, isResearchArtifact);

  return {
    artifact,
    modelUsed: completion.modelUsed,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts.length,
  };
}
