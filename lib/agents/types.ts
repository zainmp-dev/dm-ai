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
  overrides?: Partial<Record<"research" | "strategy" | "content" | "distribution" | "short" | "validator" | "brand_review" | "trend_analyzer", string>>;
  temperature?: number;
  /** Skip optional pipeline steps (validator, brand review, analytics) for speed */
  skipOptionalSteps?: boolean;
}

/** Confidence and quality metadata returned by every agent */
export interface ConfidenceMetrics {
  confidence_score: number;
  reasoning_quality: "excellent" | "good" | "fair" | "poor";
  brand_alignment: "high" | "medium" | "low";
  engagement_prediction: "high" | "medium" | "low";
  improvement_needed: boolean;
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
  /** Extended fields (optional — populated by upgraded research agent) */
  trending_topics?: string[];
  audience_pain_points?: string[];
  content_gaps?: string[];
  confidence_score?: number;
  data_quality?: "high" | "medium" | "low";
}

export interface StrategyArtifact {
  content_pillars: {
    name: string;
    description: string;
    content_types?: string[];
    hooks_style?: string;
    example_topics?: string[];
  }[];
  tone: string;
  audience_targeting: string[] | { segment: string; pain_point: string; message_angle: string }[];
  brand_voice_rules: string[];
  /** Extended fields (optional — populated by upgraded strategy agent) */
  platform_strategies?: {
    linkedin?: string;
    instagram?: string;
    twitter?: string;
    facebook?: string;
    threads?: string;
  };
  cta_library?: string[];
  confidence_score?: number;
  reasoning_quality?: "excellent" | "good" | "fair";
}

export interface ContentArtifact {
  hooks: string[];
  captions: {
    platform: "linkedin" | "instagram" | "facebook" | "twitter";
    text: string;
    hook_style?: string;
    word_count?: number;
  }[];
  reels_scripts: { title: string; script: string; beats: string[] }[];
  hashtags_suggestions: string[];
  /** Extended fields (optional) */
  cta_variations?: string[];
  quality_notes?: string;
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

/** Trend intelligence output from TrendAnalyzer */
export interface TrendAnalyzerArtifact {
  trending_topics: string[];
  emerging_hooks: string[];
  platform_signals: {
    platform: string;
    trend: string;
    hook_format: string;
  }[];
  recommended_angles: string[];
  viral_content_patterns?: string[];
  competitor_content_gaps?: string[];
  audience_pain_points?: string[];
  seasonal_opportunities?: string[];
  confidence_score?: number;
}

/** Strategy quality validation result */
export interface StrategyValidationResult {
  virality_score: number;
  clarity_score: number;
  engagement_probability: number;
  platform_fit: number;
  cta_quality: number;
  brand_alignment: number;
  uniqueness_score?: number;
  overall_score: number;
  passed: boolean;
  critical_issues: string[];
  improvement_suggestions: string[];
  strengths?: string[];
}

/** Brand review output */
export interface BrandReviewArtifact {
  brand_consistency_score: number;
  quality_score: number;
  detected_issues: string[];
  improved_hooks: string[];
  generic_phrases_found: string[];
  approved_count: number;
  rejected_count: number;
  improvement_notes: string[];
}

export interface PipelineTelemetryRow {
  step:
    | "research"
    | "strategy"
    | "content"
    | "distribution"
    | "trend_analyzer"
    | "strategy_validator"
    | "brand_reviewer"
    | "analytics_feedback";
  modelUsed: string;
  latencyMs: number;
  attempts: number;
  /** Quality score if available */
  qualityScore?: number;
}
