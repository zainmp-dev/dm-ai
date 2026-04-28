import type { PlanTier } from "@/lib/ai/types";

/** Multi-workspace-ready context — pass through API */
export interface WorkspacePipelineContext {
  workspaceId?: string | null;
  companyName: string;
  website: string;
  scenario?: string;
  region?: string;
  competitors?: { name: string; website?: string; focus?: string }[];
  /** Existing hooks/captions to discourage repetition for Content Agent */
  antiRepeatSamples?: string[];
}

export interface AgentRunOptions {
  workspaceId?: string | null;
  plan: PlanTier;
  /** Override model per logical role (manual control) */
  overrides?: Partial<Record<"research" | "strategy" | "content" | "distribution" | "short", string>>;
  temperature?: number;
}

export interface ResearchArtifact {
  competitors: {
    name: string;
    positioning: string;
    strengths: string[];
    weaknesses: string[];
    differentiation_angle: string;
    sources_hint: string;
  }[];
  market_positioning: string;
  opportunities: string[];
  risks: string[];
  summary: string;
}

export interface StrategyArtifact {
  content_pillars: { name: string; description: string }[];
  tone: string;
  audience_targeting: string[];
  brand_voice_rules: string[];
}

export interface ContentArtifact {
  hooks: string[];
  captions: { platform: "linkedin" | "instagram" | "facebook" | "twitter"; text: string }[];
  reels_scripts: { title: string; script: string; beats: string[] }[];
  hashtags_suggestions: string[];
}

export interface DistributionArtifact {
  slots: {
    scheduled_at_iso: string;
    channel: "linkedin" | "instagram" | "facebook";
    format: "feed" | "story" | "carousel" | "reel";
    hook_index: number;
    notes: string;
  }[];
}

export interface PipelineTelemetryRow {
  step: "research" | "strategy" | "content" | "distribution";
  modelUsed: string;
  latencyMs: number;
  attempts: number;
}
