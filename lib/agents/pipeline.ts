import { runContentAgent } from "./content";
import { runDistributionAgent } from "./distribution";
import { runResearchAgent } from "./research";
import { runStrategyAgent } from "./strategy";
import type { AgentRunOptions, PipelineTelemetryRow, WorkspacePipelineContext } from "./types";

export interface FullPipelineOptions extends AgentRunOptions {
  calendarDays: number;
  /** ISO start for distribution (default: now UTC) */
  startDateIso?: string;
}

export interface FullPipelineResult {
  research: Awaited<ReturnType<typeof runResearchAgent>>["artifact"];
  strategy: Awaited<ReturnType<typeof runStrategyAgent>>["artifact"];
  content: Awaited<ReturnType<typeof runContentAgent>>["artifact"];
  distribution: Awaited<ReturnType<typeof runDistributionAgent>>["artifact"];
  telemetry: PipelineTelemetryRow[];
}

/**
 * Sequential 4-agent pipeline: Research → Strategy → Content → Distribution.
 * Multi-workspace: pass workspaceId on context and options for log correlation.
 */
export async function runFullPipeline(ctx: WorkspacePipelineContext, opt: FullPipelineOptions): Promise<FullPipelineResult> {
  const startDateIso = opt.startDateIso ?? new Date().toISOString();
  const telemetry: PipelineTelemetryRow[] = [];

  const r1 = await runResearchAgent(ctx, opt);
  telemetry.push({
    step: "research",
    modelUsed: r1.modelUsed,
    latencyMs: r1.latencyMs,
    attempts: r1.attempts,
  });

  const r2 = await runStrategyAgent(ctx, r1.artifact, opt);
  telemetry.push({
    step: "strategy",
    modelUsed: r2.modelUsed,
    latencyMs: r2.latencyMs,
    attempts: r2.attempts,
  });

  const slotsHint = Math.min(42, Math.max(5, Math.ceil(opt.calendarDays * 1.5)));
  const r3 = await runContentAgent(ctx, r1.artifact, r2.artifact, opt, slotsHint);
  telemetry.push({
    step: "content",
    modelUsed: r3.modelUsed,
    latencyMs: r3.latencyMs,
    attempts: r3.attempts,
  });

  const r4 = await runDistributionAgent(ctx, r2.artifact, r3.artifact, opt, opt.calendarDays, startDateIso);
  telemetry.push({
    step: "distribution",
    modelUsed: r4.modelUsed,
    latencyMs: r4.latencyMs,
    attempts: r4.attempts,
  });

  return {
    research: r1.artifact,
    strategy: r2.artifact,
    content: r3.artifact,
    distribution: r4.artifact,
    telemetry,
  };
}
