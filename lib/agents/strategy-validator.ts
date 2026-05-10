/**
 * Strategy Validator Agent
 * Scores a generated strategy on multiple quality dimensions before content generation.
 * If quality is below threshold, the pipeline can regenerate or escalate to a smarter model.
 *
 * Model routing: GPT-4o-mini (fast, structured JSON scoring)
 * Fallback: GPT-5-mini → DeepSeek V3.2
 */
import { invokeRoleChat } from "@/lib/ai/router";
import { STRATEGY_QUALITY_THRESHOLD } from "@/lib/ai/constants";
import type { AgentRunOptions, StrategyArtifact, StrategyValidationResult, TrendAnalyzerArtifact, WorkspacePipelineContext } from "./types";
import { parseAssistantJson } from "./parse";

export { STRATEGY_QUALITY_THRESHOLD };

const SYSTEM = `You are a Strategy Quality Validator for marketing content strategies.
Score the provided strategy rigorously across multiple dimensions.
Be critical — detect weak, generic, or low-quality strategies that would produce forgettable content.

Return a single JSON object only.

Scoring schema (all numeric fields are 0.0–1.0):
{
  "virality_score": number,              // Does the strategy produce shareable, viral-worthy content?
  "clarity_score": number,               // Is the strategy clear and actionable?
  "engagement_probability": number,      // Probability of above-average engagement
  "platform_fit": number,               // How well does strategy fit the target platforms?
  "cta_quality": number,                // Quality and diversity of call-to-action approaches
  "brand_alignment": number,             // How well does it differentiate the brand?
  "uniqueness_score": number,            // Is it distinct from generic "thought leadership" content?
  "overall_score": number,              // Weighted aggregate 0.0–1.0
  "passed": boolean,                    // true if overall_score >= 0.65 and no critical structural flaws
  "critical_issues": string[],          // Blocking issues (empty = none)
  "improvement_suggestions": string[],  // Actionable improvements
  "strengths": string[]                 // What the strategy does well
}

CRITICAL ISSUE triggers (auto-fail regardless of score):
- All content pillars are generic (e.g. "thought leadership", "industry news", "company updates")
- Tone is a cliché ("authentic", "innovative", "disruptive")
- Audience targeting is vague ("business professionals", "decision makers")
- Brand voice rules are not actionable (e.g. "be professional", "be engaging")
- Less than 3 content pillars

PASS requires:
- overall_score >= 0.65
- Zero critical issues
- At least 3 differentiated content pillars`;

function isValidationResult(v: unknown): v is StrategyValidationResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.overall_score === "number" &&
    typeof o.passed === "boolean" &&
    Array.isArray(o.critical_issues) &&
    Array.isArray(o.improvement_suggestions)
  );
}

export async function runStrategyValidator(
  ctx: WorkspacePipelineContext,
  strategy: StrategyArtifact,
  options: AgentRunOptions,
  trends?: TrendAnalyzerArtifact,
): Promise<{ artifact: StrategyValidationResult; modelUsed: string; latencyMs: number; attempts: number }> {
  const user = [
    `Company: ${ctx.companyName} · ${ctx.website}`,
    `Target Scenario: ${ctx.scenario ?? "B2B technology"}`,
    `Region: ${ctx.region ?? "UAE / India"}`,
    trends?.recommended_angles?.length
      ? `Available trend angles for comparison:\n${trends.recommended_angles.slice(0, 5).map((a) => `- ${a}`).join("\n")}`
      : "",
    `\nStrategy to validate:\n${JSON.stringify(strategy, null, 2).slice(0, 10000)}`,
    `\nValidation threshold: ${STRATEGY_QUALITY_THRESHOLD}`,
    `Focus: Are the content pillars truly differentiated? Is the tone specific? Are brand voice rules actionable?`,
    `Does this strategy avoid generic B2B marketing patterns?`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await invokeRoleChat({
    role: "validator",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.validator,
    temperature: 0.3,
    maxTokens: 2048,
    minChars: 60,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const artifact = parseAssistantJson(completion.content, isValidationResult);

  return {
    artifact,
    modelUsed: completion.modelUsed,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts.length,
  };
}
