import { invokeRoleChat } from "@/lib/ai/router";
import type { AgentRunOptions, ResearchArtifact, WorkspacePipelineContext } from "./types";
import { parseAssistantJson } from "./parse";

const SYSTEM = `You are the Research Agent for a B2B social media SaaS. Your job is deep competitive intelligence and positioning.
Respond with a single JSON object only (no markdown outside JSON). Be specific — no generic fluff.
Schema must include: competitors (array), market_positioning (string), opportunities (string[]), risks (string[]), summary (string).
Each competitor object: name, positioning, strengths, weaknesses (string arrays), differentiation_angle, sources_hint.
Return 3–8 competitors when possible from the web context implied; if sparse, infer carefully and mark sources_hint honestly.`;

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
    ctx.scenario ? `Scenario/industry: ${ctx.scenario}` : "",
    ctx.region ? `Region: ${ctx.region}` : "",
    ctx.competitors?.length
      ? `User-provided competitor seeds:\n${ctx.competitors.map((c) => `- ${c.name} ${c.website ?? ""} ${c.focus ?? ""}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await invokeRoleChat({
    role: "research",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.research,
    temperature: options.temperature ?? 0.45,
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
