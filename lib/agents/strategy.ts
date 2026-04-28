import { invokeRoleChat } from "@/lib/ai/router";
import type { AgentRunOptions, ResearchArtifact, StrategyArtifact, WorkspacePipelineContext } from "./types";
import { parseAssistantJson } from "./parse";

const SYSTEM = `You are the Strategy Agent. Turn research into an actionable social content strategy.
Output JSON only. Include: content_pillars (name+description), tone (string), audience_targeting (string[]), brand_voice_rules (string[]).
Pillars must be non-overlapping. Tone must avoid clichés (“authentic”, “thought leader”).`;

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
): Promise<{ artifact: StrategyArtifact; modelUsed: string; latencyMs: number; attempts: number }> {
  const user = [
    `Workspace: ${ctx.workspaceId ?? "—"}`,
    `Brand: ${ctx.companyName} · ${ctx.website}`,
    `Research summary: ${research.summary}`,
    `Market positioning: ${research.market_positioning}`,
    `Research JSON:\n${JSON.stringify(research).slice(0, 12000)}`,
  ].join("\n\n");

  const completion = await invokeRoleChat({
    role: "strategy",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.strategy,
    temperature: options.temperature ?? 0.55,
    maxTokens: 4096,
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
