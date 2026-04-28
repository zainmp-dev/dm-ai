import { invokeRoleChat } from "@/lib/ai/router";
import type { AgentRunOptions, ContentArtifact, DistributionArtifact, StrategyArtifact, WorkspacePipelineContext } from "./types";
import { parseAssistantJson } from "./parse";

const SYSTEM = `You are the Distribution Agent. Build a structured posting schedule in JSON only.
Field: slots — array of { scheduled_at_iso (ISO-8601 UTC), channel, format, hook_index (0-based into provided hooks), notes }.
Spread posts across business days; respect channel appropriateness.
hook_index must reference the hooks array order provided in the user message.`;

function isDistributionArtifact(v: unknown): v is DistributionArtifact {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.slots)) return false;
  return true;
}

export async function runDistributionAgent(
  ctx: WorkspacePipelineContext,
  strategy: StrategyArtifact,
  content: ContentArtifact,
  options: AgentRunOptions,
  calendarDays: number,
  startDateIso: string,
): Promise<{ artifact: DistributionArtifact; modelUsed: string; latencyMs: number; attempts: number }> {
  const hooks = content.hooks;
  const user = [
    `Workspace: ${ctx.workspaceId ?? "—"}`,
    `Brand: ${ctx.companyName}`,
    `Schedule window: ${calendarDays} days starting ${startDateIso} (UTC).`,
    `Hooks (use hook_index to refer to these in order):\n${hooks.map((h, i) => `${i}. ${h}`).join("\n")}`,
    `Strategy tone: ${strategy.tone}`,
    `Captions count by platform (for density): ${content.captions.length}`,
    `Return JSON with slots array only as specified in system instructions.`,
  ].join("\n\n");

  const completion = await invokeRoleChat({
    role: "distribution",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.distribution,
    temperature: options.temperature ?? 0.4,
    maxTokens: 4096,
    minChars: 80,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const artifact = parseAssistantJson(completion.content, isDistributionArtifact);

  return {
    artifact,
    modelUsed: completion.modelUsed,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts.length,
  };
}
