/**
 * Full AI Marketing Pipeline — expanded 9-step flow.
 *
 * NEW FLOW:
 * 1. Research Agent         → market intelligence, competitor analysis, pain points
 * 2. Trend Analyzer         → trending topics, viral patterns, platform signals
 * 3. Strategy Agent         → content strategy enriched by research + trends + memory
 * 4. Strategy Validator     → quality scoring (skip if plan=free or skipOptionalSteps=true)
 * 5. Content Generator      → platform-optimized content enriched by trends + memory
 * 6. Brand Reviewer         → consistency check, anti-generic, improved hooks
 * 7. Distribution Agent     → posting schedule
 * 8. Analytics Feedback     → update brand memory (non-blocking, always runs in background)
 *
 * Backward compatibility:
 * - FullPipelineResult retains research/strategy/content/distribution keys
 * - New fields (trends, strategyValidation, brandReview, analyticsFeedback) are additive and optional
 * - Existing callers that destructure only the 4 original keys continue to work
 */
import { runContentAgent } from "./content";
import { runDistributionAgent } from "./distribution";
import { runResearchAgent } from "./research";
import { runStrategyAgent } from "./strategy";
import { runTrendAnalyzer } from "./trend-analyzer";
import { runStrategyValidator, STRATEGY_QUALITY_THRESHOLD } from "./strategy-validator";
import { runBrandReviewer } from "./brand-reviewer";
import { runAnalyticsFeedback, type AnalyticsFeedbackResult } from "./analytics-feedback";
import { loadBrandMemory } from "./memory";
import type {
  AgentRunOptions,
  BrandReviewArtifact,
  PipelineTelemetryRow,
  StrategyValidationResult,
  TrendAnalyzerArtifact,
  WorkspacePipelineContext,
} from "./types";

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
  /** New additive fields — safe to ignore for backward-compatible callers */
  trends?: TrendAnalyzerArtifact;
  strategyValidation?: StrategyValidationResult;
  brandReview?: BrandReviewArtifact;
  analyticsFeedback?: AnalyticsFeedbackResult;
}

/**
 * Sequential multi-agent pipeline: Research → Trends → Strategy → Validation →
 * Content → Brand Review → Distribution → Analytics Feedback.
 *
 * Optional steps (trend analyzer, strategy validator, brand reviewer, analytics feedback)
 * are skipped when `opt.skipOptionalSteps = true` or `opt.plan = "free"` to reduce latency/cost.
 */
export async function runFullPipeline(ctx: WorkspacePipelineContext, opt: FullPipelineOptions): Promise<FullPipelineResult> {
  const startDateIso = opt.startDateIso ?? new Date().toISOString();
  const telemetry: PipelineTelemetryRow[] = [];
  const runOptional = !opt.skipOptionalSteps && opt.plan !== "free";
  const workspaceId = opt.workspaceId ?? ctx.workspaceId ?? null;

  // ── Step 1: Research ──────────────────────────────────────────────────────
  const r1 = await runResearchAgent(ctx, opt);
  telemetry.push({ step: "research", modelUsed: r1.modelUsed, latencyMs: r1.latencyMs, attempts: r1.attempts });

  // ── Step 2: Trend Analysis (optional — pro plan) ──────────────────────────
  let trends: TrendAnalyzerArtifact | undefined;
  if (runOptional) {
    try {
      const r2 = await runTrendAnalyzer(ctx, r1.artifact, opt);
      trends = r2.artifact;
      telemetry.push({
        step: "trend_analyzer",
        modelUsed: r2.modelUsed,
        latencyMs: r2.latencyMs,
        attempts: r2.attempts,
        qualityScore: r2.artifact.confidence_score,
      });
    } catch {
      // Non-critical — pipeline continues without trend data
    }
  }

  // ── Step 3: Load brand memory (non-blocking) ──────────────────────────────
  const brandMemory = workspaceId ? await loadBrandMemory(workspaceId).catch(() => null) : null;

  // ── Step 4: Strategy ──────────────────────────────────────────────────────
  const r3 = await runStrategyAgent(ctx, r1.artifact, opt, trends, brandMemory);
  telemetry.push({
    step: "strategy",
    modelUsed: r3.modelUsed,
    latencyMs: r3.latencyMs,
    attempts: r3.attempts,
    qualityScore: r3.artifact.confidence_score,
  });

  // ── Step 5: Strategy Validation (optional — pro plan) ─────────────────────
  let strategyValidation: StrategyValidationResult | undefined;
  let strategy = r3.artifact;
  if (runOptional) {
    try {
      const rv = await runStrategyValidator(ctx, strategy, opt, trends);
      strategyValidation = rv.artifact;
      telemetry.push({
        step: "strategy_validator",
        modelUsed: rv.modelUsed,
        latencyMs: rv.latencyMs,
        attempts: rv.attempts,
        qualityScore: rv.artifact.overall_score,
      });

      // If strategy fails validation and we're on pro, attempt one regeneration with improvements
      if (!rv.artifact.passed && rv.artifact.overall_score < STRATEGY_QUALITY_THRESHOLD && rv.artifact.improvement_suggestions.length > 0) {
        const improvementHint = rv.artifact.improvement_suggestions.slice(0, 3).join("; ");
        const enrichedCtx: WorkspacePipelineContext = {
          ...ctx,
          scenario: ctx.scenario ? `${ctx.scenario} — apply these improvements: ${improvementHint}` : improvementHint,
        };
        try {
          const r3b = await runStrategyAgent(enrichedCtx, r1.artifact, opt, trends, brandMemory);
          strategy = r3b.artifact;
          telemetry.push({ step: "strategy", modelUsed: r3b.modelUsed, latencyMs: r3b.latencyMs, attempts: r3b.attempts });
        } catch {
          // Keep original strategy if regen fails
        }
      }
    } catch {
      // Non-critical — pipeline continues with unvalidated strategy
    }
  }

  // ── Step 6: Content Generation ────────────────────────────────────────────
  const slotsHint = Math.min(42, Math.max(5, Math.ceil(opt.calendarDays * 1.5)));
  const r4 = await runContentAgent(ctx, r1.artifact, strategy, opt, slotsHint, trends, brandMemory);
  telemetry.push({ step: "content", modelUsed: r4.modelUsed, latencyMs: r4.latencyMs, attempts: r4.attempts });

  // ── Step 7: Brand Review (optional — pro plan) ────────────────────────────
  let brandReview: BrandReviewArtifact | undefined;
  if (runOptional) {
    try {
      const rb = await runBrandReviewer(ctx, strategy, r4.artifact, opt);
      brandReview = rb.artifact;
      telemetry.push({
        step: "brand_reviewer",
        modelUsed: rb.modelUsed,
        latencyMs: rb.latencyMs,
        attempts: rb.attempts,
        qualityScore: rb.artifact.quality_score,
      });
    } catch {
      // Non-critical
    }
  }

  // ── Step 8: Distribution ──────────────────────────────────────────────────
  const r5 = await runDistributionAgent(ctx, strategy, r4.artifact, opt, opt.calendarDays, startDateIso);
  telemetry.push({ step: "distribution", modelUsed: r5.modelUsed, latencyMs: r5.latencyMs, attempts: r5.attempts });

  // ── Step 9: Analytics Feedback (non-blocking background memory update) ────
  let analyticsFeedback: AnalyticsFeedbackResult | undefined;
  if (workspaceId && brandReview) {
    try {
      analyticsFeedback = await runAnalyticsFeedback(
        workspaceId,
        strategy,
        r4.artifact,
        brandReview,
        strategyValidation,
      );
      telemetry.push({
        step: "analytics_feedback",
        modelUsed: "memory",
        latencyMs: 0,
        attempts: 1,
      });
    } catch {
      // Non-blocking — memory failures never fail the pipeline
    }
  }

  return {
    research: r1.artifact,
    strategy,
    content: r4.artifact,
    distribution: r5.artifact,
    telemetry,
    trends,
    strategyValidation,
    brandReview,
    analyticsFeedback,
  };
}
