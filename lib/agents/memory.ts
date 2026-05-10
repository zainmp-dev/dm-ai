/**
 * Brand/campaign/audience memory system.
 * Lightweight file-based storage (JSON) — async-safe, workspace-isolated.
 * Compatible with DB-backed storage by swapping the read/write functions.
 *
 * Memory is used by agents to:
 * - Preserve brand tone and voice across campaigns
 * - Avoid repeated phrases and generic language
 * - Build a hashtag and CTA library over time
 * - Track audience intelligence
 */

import { promises as fs } from "fs";
import path from "path";
import type { StrategyArtifact, BrandReviewArtifact } from "./types";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface BrandMemory {
  workspaceId: string;
  tone: string;
  ctaStyle: string;
  hashtags: string[];
  targetAudience: string;
  bannedWords: string[];
  avoidPatterns: string[];
  formattingPreferences: string[];
  platformPreferences: Record<string, number>;
  contentPillars: string[];
  topPerformingHooks: string[];
  campaignHistory: CampaignEntry[];
  updatedAt: string;
}

export interface CampaignEntry {
  campaignId: string;
  timestamp: string;
  tone: string;
  pillarNames: string[];
  topHooks: string[];
  qualityScore?: number;
}

export interface AudienceMemory {
  workspaceId: string;
  segments: AudienceSegment[];
  topPerformingContent: string[];
  peakEngagementTimes: string[];
  updatedAt: string;
}

export interface AudienceSegment {
  name: string;
  interests: string[];
  painPoints: string[];
  preferredPlatforms: string[];
  bestContentFormats: string[];
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const MEMORY_DIR = process.env.MEMORY_STORAGE_PATH ?? path.join(process.cwd(), "data", "memory");

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // already exists — ignore
  }
}

function brandMemoryPath(workspaceId: string): string {
  return path.join(MEMORY_DIR, `brand_${workspaceId}.json`);
}

function audienceMemoryPath(workspaceId: string): string {
  return path.join(MEMORY_DIR, `audience_${workspaceId}.json`);
}

// ─── Brand memory ─────────────────────────────────────────────────────────────

export async function loadBrandMemory(workspaceId: string): Promise<BrandMemory | null> {
  try {
    const raw = await fs.readFile(brandMemoryPath(workspaceId), "utf-8");
    return JSON.parse(raw) as BrandMemory;
  } catch {
    return null;
  }
}

export async function saveBrandMemory(memory: BrandMemory): Promise<void> {
  await ensureDir(MEMORY_DIR);
  await fs.writeFile(brandMemoryPath(memory.workspaceId), JSON.stringify(memory, null, 2), "utf-8");
}

export function buildDefaultBrandMemory(workspaceId: string): BrandMemory {
  return {
    workspaceId,
    tone: "",
    ctaStyle: "",
    hashtags: [],
    targetAudience: "",
    bannedWords: [],
    avoidPatterns: [],
    formattingPreferences: [],
    platformPreferences: { linkedin: 0.6, instagram: 0.25, facebook: 0.15 },
    contentPillars: [],
    topPerformingHooks: [],
    campaignHistory: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Merge a new strategy run into persistent brand memory.
 * Preserves history; does NOT overwrite existing working patterns.
 */
export async function mergeStrategyIntoMemory(
  workspaceId: string,
  strategy: StrategyArtifact,
): Promise<BrandMemory> {
  const existing = (await loadBrandMemory(workspaceId)) ?? buildDefaultBrandMemory(workspaceId);

  const newAvoidPatterns = strategy.brand_voice_rules.filter(
    (r) =>
      r.toLowerCase().includes("avoid") ||
      r.toLowerCase().includes("never") ||
      r.toLowerCase().includes("do not"),
  );

  const updated: BrandMemory = {
    ...existing,
    tone: strategy.tone || existing.tone,
    contentPillars: strategy.content_pillars.map((p) => p.name),
    avoidPatterns: [...new Set([...existing.avoidPatterns, ...newAvoidPatterns])].slice(0, 60),
    targetAudience: Array.isArray(strategy.audience_targeting)
      ? typeof strategy.audience_targeting[0] === "string"
        ? (strategy.audience_targeting[0] as string)
        : JSON.stringify(strategy.audience_targeting[0])
      : existing.targetAudience,
    ctaStyle: strategy.cta_library?.[0] ?? existing.ctaStyle,
    updatedAt: new Date().toISOString(),
  };

  await saveBrandMemory(updated);
  return updated;
}

/**
 * Merge brand review feedback into memory to improve future runs.
 * Records high-quality hooks and expands the avoid-patterns list.
 */
export async function mergeBrandReviewIntoMemory(
  workspaceId: string,
  review: BrandReviewArtifact,
): Promise<BrandMemory> {
  const existing = (await loadBrandMemory(workspaceId)) ?? buildDefaultBrandMemory(workspaceId);

  const topHooks = review.improved_hooks.slice(0, 5);
  const newAvoid = review.generic_phrases_found ?? [];

  const updated: BrandMemory = {
    ...existing,
    topPerformingHooks: [...new Set([...existing.topPerformingHooks, ...topHooks])].slice(0, 25),
    avoidPatterns: [...new Set([...existing.avoidPatterns, ...newAvoid])].slice(0, 60),
    updatedAt: new Date().toISOString(),
  };

  await saveBrandMemory(updated);
  return updated;
}

// ─── Audience memory ──────────────────────────────────────────────────────────

export async function loadAudienceMemory(workspaceId: string): Promise<AudienceMemory | null> {
  try {
    const raw = await fs.readFile(audienceMemoryPath(workspaceId), "utf-8");
    return JSON.parse(raw) as AudienceMemory;
  } catch {
    return null;
  }
}

export async function saveAudienceMemory(memory: AudienceMemory): Promise<void> {
  await ensureDir(MEMORY_DIR);
  await fs.writeFile(audienceMemoryPath(memory.workspaceId), JSON.stringify(memory, null, 2), "utf-8");
}

export function buildDefaultAudienceMemory(workspaceId: string): AudienceMemory {
  return {
    workspaceId,
    segments: [],
    topPerformingContent: [],
    peakEngagementTimes: [],
    updatedAt: new Date().toISOString(),
  };
}
