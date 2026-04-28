import { invokeRoleChat } from "@/lib/ai/router";
import type { AgentRunOptions, ContentArtifact, ResearchArtifact, StrategyArtifact, WorkspacePipelineContext } from "./types";
import { parseAssistantJson } from "./parse";

const SYSTEM = `You are the Content Agent. Generate creative, non-repetitive social copy.
Output JSON only. Fields: hooks (short strings), captions (array of {platform, text}), reels_scripts (array of {title, script, beats}),
hashtags_suggestions (string[]).
Rules:
- Vary sentence openings; do not reuse the same hook structure twice.
- No generic placeholder company names — use the real brand.
- Platforms: linkedin | instagram | facebook | twitter only in captions[].platform`;

function isContentArtifact(v: unknown): v is ContentArtifact {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.hooks) || !Array.isArray(o.captions) || !Array.isArray(o.reels_scripts)) return false;
  if (!Array.isArray(o.hashtags_suggestions)) return false;
  return true;
}

export async function runContentAgent(
  ctx: WorkspacePipelineContext,
  research: ResearchArtifact,
  strategy: StrategyArtifact,
  options: AgentRunOptions,
  slotsHint: number,
): Promise<{ artifact: ContentArtifact; modelUsed: string; latencyMs: number; attempts: number }> {
  const anti = (ctx.antiRepeatSamples ?? []).slice(0, 30);
  const user = [
    `Workspace: ${ctx.workspaceId ?? "—"}`,
    `Brand: ${ctx.companyName} · ${ctx.website}`,
    `Produce enough variety for roughly ${slotsHint} distribution slots.`,
    `Strategy pillars: ${strategy.content_pillars.map((p) => p.name).join(", ")}`,
    `Tone: ${strategy.tone}`,
    anti.length ? `Anti-repeat — do NOT echo these lines:\n${anti.map((x) => `- ${x}`).join("\n")}` : "",
    `Research snapshot: ${research.summary.slice(0, 2000)}`,
    `Full strategy JSON:\n${JSON.stringify(strategy).slice(0, 8000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await invokeRoleChat({
    role: "content",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.content,
    temperature: options.temperature ?? 0.75,
    maxTokens: 6144,
    minChars: 120,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const artifact = parseAssistantJson(completion.content, isContentArtifact);

  return {
    artifact,
    modelUsed: completion.modelUsed,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts.length,
  };
}
