/**
 * Analytics Feedback Loop
 * Updates persistent brand memory with learnings from each pipeline run.
 * Makes the AI system smarter over time by:
 * - Preserving high-quality hooks
 * - Expanding the avoid-patterns library
 * - Tracking strategy performance
 * - Updating hashtag and CTA libraries
 *
 * This is a pure TS operation (no LLM call) — fast and free.
 */
import {
  buildDefaultBrandMemory,
  loadBrandMemory,
  mergeBrandReviewIntoMemory,
  mergeStrategyIntoMemory,
  saveBrandMemory,
} from "./memory";
import type { BrandReviewArtifact, ContentArtifact, StrategyArtifact, StrategyValidationResult } from "./types";

export interface AnalyticsFeedbackResult {
  memoryUpdated: boolean;
  workspaceId: string;
  improvementsApplied: string[];
  timestamp: string;
}

/**
 * Run the full analytics feedback loop after a pipeline completes.
 * Updates brand memory with the best outputs from this run.
 */
export async function runAnalyticsFeedback(
  workspaceId: string,
  strategy: StrategyArtifact,
  content: ContentArtifact,
  brandReview: BrandReviewArtifact,
  validation?: StrategyValidationResult,
): Promise<AnalyticsFeedbackResult> {
  const improvements: string[] = [];

  try {
    // 1. Merge strategy data (tone, pillars, audience)
    await mergeStrategyIntoMemory(workspaceId, strategy);
    improvements.push(`Merged strategy — tone: "${strategy.tone}", pillars: ${strategy.content_pillars.map((p) => p.name).join(", ")}`);

    // 2. Merge brand review learnings (improved hooks, generic phrases to avoid)
    await mergeBrandReviewIntoMemory(workspaceId, brandReview);
    if (brandReview.improved_hooks.length > 0) {
      improvements.push(`Added ${brandReview.improved_hooks.length} high-quality hooks to memory`);
    }
    if (brandReview.generic_phrases_found.length > 0) {
      improvements.push(`Flagged ${brandReview.generic_phrases_found.length} generic phrases to avoid`);
    }

    // 3. Update hashtag library from content
    if (content.hashtags_suggestions.length > 0) {
      const existing = (await loadBrandMemory(workspaceId)) ?? buildDefaultBrandMemory(workspaceId);
      const merged = [...new Set([...existing.hashtags, ...content.hashtags_suggestions])].slice(0, 40);
      if (merged.length > existing.hashtags.length) {
        await saveBrandMemory({ ...existing, hashtags: merged, updatedAt: new Date().toISOString() });
        improvements.push(`Expanded hashtag library to ${merged.length} tags`);
      }
    }

    // 4. Track CTA library if available
    if (strategy.cta_library?.length) {
      const existing = (await loadBrandMemory(workspaceId)) ?? buildDefaultBrandMemory(workspaceId);
      if (!existing.ctaStyle && strategy.cta_library[0]) {
        await saveBrandMemory({ ...existing, ctaStyle: strategy.cta_library[0], updatedAt: new Date().toISOString() });
        improvements.push(`Updated CTA style: "${strategy.cta_library[0]}"`);
      }
    }

    // 5. Record campaign history
    if (validation) {
      const existing = (await loadBrandMemory(workspaceId)) ?? buildDefaultBrandMemory(workspaceId);
      const entry = {
        campaignId: `run_${Date.now()}`,
        timestamp: new Date().toISOString(),
        tone: strategy.tone,
        pillarNames: strategy.content_pillars.map((p) => p.name),
        topHooks: brandReview.improved_hooks.slice(0, 3),
        qualityScore: validation.overall_score,
      };
      const history = [entry, ...existing.campaignHistory].slice(0, 10);
      await saveBrandMemory({ ...existing, campaignHistory: history, updatedAt: new Date().toISOString() });
      improvements.push(`Recorded campaign history (quality score: ${validation.overall_score.toFixed(2)})`);
    }
  } catch (err) {
    // Memory failures are non-blocking — pipeline should continue
    improvements.push(`Memory update partial (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    memoryUpdated: improvements.length > 0,
    workspaceId,
    improvementsApplied: improvements,
    timestamp: new Date().toISOString(),
  };
}
