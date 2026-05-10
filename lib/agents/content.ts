/**
 * Content Agent
 * Generates creative, platform-optimized, non-repetitive social media content.
 *
 * Model routing: GPT-4o-mini (reliable creative, cost-effective)
 * Fallback: GPT-5-mini → DeepSeek V3.2
 *
 * Improvements over v1:
 * - Platform intelligence (LinkedIn ≠ Instagram ≠ Twitter)
 * - Anti-generic phrase enforcement
 * - Hook variety engine (5 distinct hook styles, enforced rotation)
 * - Memory-driven personalization (top hooks, avoid patterns)
 * - Human-like language optimization
 * - CTA variation from strategy CTA library
 */
import { invokeRoleChat } from "@/lib/ai/router";
import type { AgentRunOptions, ContentArtifact, ResearchArtifact, StrategyArtifact, TrendAnalyzerArtifact, WorkspacePipelineContext } from "./types";
import type { BrandMemory } from "./memory";
import { parseAssistantJson } from "./parse";

const SYSTEM = `You are the Content Agent — a seasoned social media copywriter who creates scroll-stopping, human-like content for B2B brands.

PLATFORM INTELLIGENCE (apply strictly):
- LinkedIn: 3–5 key insight paragraphs, data-driven, no emojis in body text, professional but direct, 150–300 words
- Instagram: Visual storytelling, emotional resonance, short punchy lines with line breaks, 80–150 words, 5–8 hashtags
- Twitter/X: One punchy idea per tweet, max 280 chars, conversational, max 2 hashtags, end with a hook question
- Facebook: Conversational, community-focused, ask questions, 100–200 words, 3–4 hashtags, story-driven

HOOK VARIETY ENGINE (rotate these, NEVER use the same style twice in a row):
1. QUESTION: "Why do 73% of [audience] still [common mistake]?"
2. DATA: "[Specific number or percentage] — [surprising implication]"
3. STORY: "Last [time period], a [role] told me [insight]..."
4. CONTRARIAN: "Hot take: [counter-intuitive truth about the niche]"
5. DIRECT: "[Bold claim]. Here's the proof."

STRICT ANTI-GENERIC RULES (violations = rewrite required):
- NEVER: "In today's fast-paced world", "game-changer", "synergy", "leverage", "paradigm shift"
- NEVER: "disruptive", "holistic", "seamless", "empower", "unlock potential"  
- NEVER: "It's no secret that", "Are you looking to", "Exciting news!", "We are thrilled"
- NEVER: "Best practices", "Key takeaways", "At the end of the day"
- NEVER start multiple posts with the same word or structure
- NEVER use identical CTA formats across different posts

HUMAN-LIKE REQUIREMENTS:
- Write like a smart colleague sharing an insight, not a marketing AI
- Use contractions naturally (it's, we're, don't)
- Include specific numbers and examples where possible
- Vary sentence length — mix short punchy lines with longer explanatory ones
- Use storytelling: problem → insight → implication

Output JSON only. No markdown outside JSON.

Required schema:
{
  "hooks": string[],                     // 8–15 varied hooks (rotate through all 5 styles)
  "captions": [
    {
      "platform": "linkedin" | "instagram" | "facebook" | "twitter",
      "text": string,                    // Full caption, platform-optimized
      "hook_style": string,              // Which hook style was used
      "word_count": number               // Approximate word count
    }
  ],
  "reels_scripts": [
    {
      "title": string,
      "script": string,
      "beats": string[]                  // ["Hook (0–3s)", "Problem (3–8s)", "Solution (8–20s)", "CTA"]
    }
  ],
  "hashtags_suggestions": string[],      // 12–20 platform-appropriate hashtags
  "cta_variations": string[],            // 6–10 varied CTAs from the strategy CTA library
  "quality_notes": string               // Brief self-assessment of content quality
}`;

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
  trends?: TrendAnalyzerArtifact,
  brandMemory?: BrandMemory | null,
): Promise<{ artifact: ContentArtifact; modelUsed: string; latencyMs: number; attempts: number }> {
  const anti = (ctx.antiRepeatSamples ?? []).slice(0, 30);

  const user = [
    `Workspace: ${ctx.workspaceId ?? "—"}`,
    `Brand: ${ctx.companyName} · ${ctx.website}`,
    `Industry: ${ctx.scenario ?? "B2B technology"}`,
    `Region: ${ctx.region ?? "UAE / India"}`,
    `\nProduce content for approximately ${slotsHint} distribution slots.`,
    `\nContent strategy:`,
    `- Pillars: ${strategy.content_pillars.map((p) => p.name).join(", ")}`,
    `- Tone: ${strategy.tone}`,
    strategy.platform_strategies
      ? `- LinkedIn approach: ${strategy.platform_strategies.linkedin ?? "professional insights"}` +
        `\n- Instagram approach: ${strategy.platform_strategies.instagram ?? "visual storytelling"}` +
        `\n- Twitter approach: ${strategy.platform_strategies.twitter ?? "punchy insights"}`
      : "",
    strategy.cta_library?.length
      ? `\nApproved CTAs to use (vary these):\n${strategy.cta_library.slice(0, 8).map((c) => `- ${c}`).join("\n")}`
      : "",
    `\nBrand voice rules:\n${strategy.brand_voice_rules.slice(0, 8).map((r) => `- ${r}`).join("\n")}`,
    trends?.emerging_hooks?.length
      ? `\nTrending hook patterns for this niche (use as inspiration):\n${trends.emerging_hooks.slice(0, 6).map((h) => `- ${h}`).join("\n")}`
      : "",
    trends?.viral_content_patterns?.length
      ? `Viral content patterns in this niche:\n${trends.viral_content_patterns.slice(0, 4).map((p) => `- ${p}`).join("\n")}`
      : "",
    brandMemory?.topPerformingHooks?.length
      ? `\nTop-performing hooks from previous campaigns (match this quality level):\n${brandMemory.topPerformingHooks.slice(0, 5).map((h) => `- ${h}`).join("\n")}`
      : "",
    brandMemory?.avoidPatterns?.length
      ? `\nPattern ban list (brand memory — strictly avoid):\n${brandMemory.avoidPatterns.slice(0, 12).map((p) => `- ${p}`).join("\n")}`
      : "",
    anti.length
      ? `\nDo NOT echo or paraphrase these existing hooks/lines:\n${anti.map((x) => `- ${x}`).join("\n")}`
      : "",
    research.audience_pain_points?.length
      ? `\nAudience pain points to address:\n${research.audience_pain_points.slice(0, 6).map((p) => `- ${p}`).join("\n")}`
      : "",
    `\nResearch snapshot: ${research.summary.slice(0, 1500)}`,
    `\nFull strategy JSON:\n${JSON.stringify(strategy).slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await invokeRoleChat({
    role: "content",
    workspaceId: options.workspaceId ?? ctx.workspaceId,
    plan: options.plan,
    manualModel: options.overrides?.content,
    temperature: 0.78,
    maxTokens: 7168,
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
