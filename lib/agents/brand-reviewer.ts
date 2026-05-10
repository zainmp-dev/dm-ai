/**
 * Brand Reviewer Agent
 * Reviews generated content for brand consistency, quality, and anti-generic patterns.
 * Detects weak hooks, robotic language, overused phrases, and off-brand tone.
 *
 * Model routing: GPT-4o-mini (pattern detection, fast)
 * Fallback: GPT-5-mini → DeepSeek V3.2
 */
import { invokeRoleChat } from "@/lib/ai/router";
import type { AgentRunOptions, BrandReviewArtifact, ContentArtifact, StrategyArtifact, WorkspacePipelineContext } from "./types";
import { parseAssistantJson } from "./parse";

const SYSTEM = `You are a Brand Consistency Reviewer and Content Quality Officer.
Review social media content ruthlessly — mediocre content reflects poorly on the brand.

Your review covers:
1. BRAND CONSISTENCY: Does the tone match the strategy?
2. HOOK STRENGTH: Does the first line stop the scroll? Would you keep reading?
3. ANTI-GENERIC DETECTION: Find and flag overused phrases
4. PLATFORM OPTIMIZATION: Is the content optimized for each platform?
5. HUMAN-LIKE QUALITY: Does it sound like a real person, not AI?
6. REPETITION: Are patterns or structures repeated across posts?

Generic phrases to always flag (non-exhaustive):
"In today's fast-paced world", "game-changer", "synergy", "leverage", "paradigm shift",
"disruptive", "innovative solution", "thought leader", "holistic approach", "seamless experience",
"empower", "unlock potential", "take your business to the next level", "at the end of the day",
"It's no secret that", "In today's digital landscape", "Are you looking to",
"Exciting news!", "We are thrilled", "Best practices", "Key takeaways"

Return a single JSON object only:
{
  "brand_consistency_score": number,     // 0.0–1.0
  "quality_score": number,              // 0.0–1.0 overall content quality
  "detected_issues": string[],          // specific issues found
  "improved_hooks": string[],           // 3–6 improved hook rewrites
  "generic_phrases_found": string[],    // exact phrases found that should be avoided
  "approved_count": number,             // estimated captions that pass
  "rejected_count": number,             // estimated captions that need revision
  "improvement_notes": string[]         // actionable notes for the content agent
}`;

function isBrandReviewArtifact(v: unknown): v is BrandReviewArtifact {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.brand_consistency_score === "number" &&
    typeof o.quality_score === "number" &&
    Array.isArray(o.detected_issues) &&
    Array.isArray(o.improved_hooks) &&
    Array.isArray(o.generic_phrases_found)
  );
}

export async function runBrandReviewer(
  ctx: WorkspacePipelineContext,
  strategy: StrategyArtifact,
  content: ContentArtifact,
  options: AgentRunOptions,
): Promise<{ artifact: BrandReviewArtifact; modelUsed: string; latencyMs: number; attempts: number }> {
  const user = [
    `Brand: ${ctx.companyName} · ${ctx.website}`,
    `Expected tone: ${strategy.tone}`,
    `Brand voice rules:\n${strategy.brand_voice_rules.slice(0, 8).map((r) => `- ${r}`).join("\n")}`,
    `\nContent hooks to review (${content.hooks.length} total, showing first 12):`,
    content.hooks.slice(0, 12).map((h, i) => `${i + 1}. ${h}`).join("\n"),
    `\nCaptions to review (${content.captions.length} total, showing first 6):`,
    content.captions
      .slice(0, 6)
      .map((c) => `[${c.platform}]: ${c.text.slice(0, 300)}`)
      .join("\n\n"),
    `\nHashtag suggestions: ${content.hashtags_suggestions.slice(0, 15).join(", ")}`,
    `\nLook for: generic phrases, weak hooks (no curiosity/value), off-brand tone, repetitive structures, robotic language`,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await invokeRoleChat({
    role: "brand_review",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.brand_review,
    temperature: 0.3,
    maxTokens: 2048,
    minChars: 60,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const artifact = parseAssistantJson(completion.content, isBrandReviewArtifact);

  return {
    artifact,
    modelUsed: completion.modelUsed,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts.length,
  };
}
