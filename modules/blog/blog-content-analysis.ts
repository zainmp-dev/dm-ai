import { prioritizeChecksForRecommendations } from "./blog-content-analysis-presentation";
import { extractArticle, plainText as toPlainText, type ArticleFeatures } from "./content-analysis/extract";
import { scoreArticle, type CanonicalIssue, type DimensionKey, type DimensionReport, type PublishingBand, type SubScore } from "./content-analysis/engine";

export { plainText } from "./content-analysis/extract";

/** Body shorter than this is treated as empty/thin for GEO/LLM/Quality/Readability. */
export const MIN_ANALYZABLE_WORDS = 40;

export const SCORE_PRODUCT_NAME = "Officekit Content Quality Score";

export type ContentAnalysisStatus = "analyzable" | "not_analyzable";
export type IssueSeverity = "critical" | "high" | "medium" | "low";
export type CheckOutcome = "passed" | "failed" | "warning";

export type ContentAnalysisCategory = "seo" | "geo" | "llm" | "content_quality" | "readability";

export type ContentAnalysisInput = {
  title: string;
  keywords: string[];
  metaDescription: string;
  contentHtml: string;
  permalink?: string;
  author?: string;
  featuredImageUrl?: string;
  seoTitle?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  updatedAt?: string;
  categoryName?: string;
  subcategory?: string;
};

export type ContentAnalysisCheck = {
  id: string;
  label: string;
  outcome: CheckOutcome;
  passed: boolean;
  message: string;
  evidence: string;
  recommendation: string;
  severity: IssueSeverity;
  category: ContentAnalysisCategory;
  weight: number;
  suggestionLabel: string;
};

export type CategoryBreakdown = {
  score: number;
  maximum: number;
  percentage: number;
  passed: number;
  failed: number;
  warnings: number;
};

export type ContentAnalysisSuggestion = {
  label: string;
  impacts: Partial<Record<ContentAnalysisCategory, number>>;
  totalImpact: number;
};

export type SearchIntentType = "informational" | "commercial" | "transactional" | "navigational" | "unknown";

export type DimensionView = {
  score: number;
  max: number;
  reason: string;
  strengths: string[];
  weaknesses: string[];
};

export type PublishingRecommendation = {
  band: PublishingBand;
  label: string;
};

export type ContentAnalysisResult = {
  status: ContentAnalysisStatus;
  statusMessage: string;
  scoreName: string;
  seoScore: number;
  geoScore: number;
  llmScore: number;
  contentQualityScore: number;
  readabilityScore: number;
  /** @deprecated Folded into SEO/Quality; kept for compatibility. */
  searchIntentScore: number;
  /** @deprecated Folded into Quality; kept for compatibility. */
  topicalCoverageScore: number;
  /** @deprecated Folded into LLM/Quality evidence; kept for compatibility. */
  eeatScore: number;
  /** @deprecated Folded into SEO; kept for compatibility. */
  technicalScore: number;
  overallScore: number;
  primaryIntent: SearchIntentType;
  checks: ContentAnalysisCheck[];
  seoChecks: ContentAnalysisCheck[];
  geoChecks: ContentAnalysisCheck[];
  llmChecks: ContentAnalysisCheck[];
  contentQualityChecks: ContentAnalysisCheck[];
  readabilityChecks: ContentAnalysisCheck[];
  searchIntentChecks: ContentAnalysisCheck[];
  topicalCoverageChecks: ContentAnalysisCheck[];
  eeatChecks: ContentAnalysisCheck[];
  technicalChecks: ContentAnalysisCheck[];
  categories: Record<ContentAnalysisCategory, CategoryBreakdown>;
  dimensions: Record<"seo" | "geo" | "llm" | "quality" | "readability", DimensionView>;
  criticalIssues: ContentAnalysisCheck[];
  highPriorityIssues: ContentAnalysisCheck[];
  mediumIssues: ContentAnalysisCheck[];
  lowPriorityIssues: ContentAnalysisCheck[];
  passedChecks: ContentAnalysisCheck[];
  recommendedActions: string[];
  scoreExplanation: string;
  internalLinksFound: number;
  externalLinksFound: number;
  suggestions: ContentAnalysisSuggestion[];
  hasInput: boolean;
  publishing: PublishingRecommendation;
  categoryRelevance: { score: number; category: string };
  searchIntent: { score: number; intent: SearchIntentType };
  confidence: number;
  capsApplied: string[];
  severityCounts: { critical: number; high: number; medium: number; low: number };
};

function emptyBreakdown(): CategoryBreakdown {
  return { score: 0, maximum: 0, percentage: 0, passed: 0, failed: 0, warnings: 0 };
}

function emptyDimension(reason: string): DimensionView {
  return { score: 0, max: 100, reason, strengths: [], weaknesses: [] };
}

export const EMPTY_CONTENT_ANALYSIS: ContentAnalysisResult = {
  status: "not_analyzable",
  statusMessage: "Add blog content to begin analysis.",
  scoreName: SCORE_PRODUCT_NAME,
  seoScore: 0,
  geoScore: 0,
  llmScore: 0,
  contentQualityScore: 0,
  readabilityScore: 0,
  searchIntentScore: 0,
  topicalCoverageScore: 0,
  eeatScore: 0,
  technicalScore: 0,
  overallScore: 0,
  primaryIntent: "unknown",
  checks: [],
  seoChecks: [],
  geoChecks: [],
  llmChecks: [],
  contentQualityChecks: [],
  readabilityChecks: [],
  searchIntentChecks: [],
  topicalCoverageChecks: [],
  eeatChecks: [],
  technicalChecks: [],
  categories: {
    seo: emptyBreakdown(),
    geo: emptyBreakdown(),
    llm: emptyBreakdown(),
    content_quality: emptyBreakdown(),
    readability: emptyBreakdown(),
  },
  dimensions: {
    seo: emptyDimension("Add blog content to begin analysis."),
    geo: emptyDimension("Add blog content to begin analysis."),
    llm: emptyDimension("Add blog content to begin analysis."),
    quality: emptyDimension("Add blog content to begin analysis."),
    readability: emptyDimension("Add blog content to begin analysis."),
  },
  criticalIssues: [],
  highPriorityIssues: [],
  mediumIssues: [],
  lowPriorityIssues: [],
  passedChecks: [],
  recommendedActions: ["Add blog content to begin analysis."],
  scoreExplanation: "Officekit Content Quality Score is 0 because there is no article to evaluate.",
  internalLinksFound: 0,
  externalLinksFound: 0,
  suggestions: [],
  hasInput: false,
  publishing: { band: "do_not_publish", label: "DO NOT PUBLISH" },
  categoryRelevance: { score: 0, category: "" },
  searchIntent: { score: 0, intent: "unknown" },
  confidence: 0,
  capsApplied: [],
  severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
};

export function hasAnalysisInput(input: ContentAnalysisInput): boolean {
  return Boolean(
    input.title.trim() ||
      input.metaDescription.trim() ||
      input.keywords.some((k) => k.trim()) ||
      toPlainText(input.contentHtml).length > 0 ||
      input.permalink?.trim() ||
      input.author?.trim() ||
      input.featuredImageUrl?.trim(),
  );
}

function dimCategory(key: DimensionKey): ContentAnalysisCategory {
  if (key === "quality") return "content_quality";
  return key;
}

function outcomeFromRatio(ratio: number): CheckOutcome {
  if (ratio >= 0.85) return "passed";
  if (ratio >= 0.55) return "warning";
  return "failed";
}

function severityFromRatio(ratio: number): IssueSeverity {
  if (ratio < 0.28) return "high";
  if (ratio < 0.5) return "medium";
  return "low";
}

function checkFromSub(s: SubScore): ContentAnalysisCheck {
  const ratio = s.max ? s.points / s.max : 0;
  const outcome = outcomeFromRatio(ratio);
  return {
    id: s.id,
    label: s.label,
    outcome,
    passed: outcome === "passed",
    message: s.reason,
    evidence: s.reason,
    recommendation: s.suggestion,
    severity: outcome === "passed" ? "low" : severityFromRatio(ratio),
    category: dimCategory(s.dimension),
    weight: Math.round(s.max),
    suggestionLabel: s.suggestion,
  };
}

function checkFromIssue(issue: CanonicalIssue): ContentAnalysisCheck {
  return {
    id: issue.id,
    label: issue.title,
    outcome: "failed",
    passed: false,
    message: issue.evidence,
    evidence: issue.evidence,
    recommendation: issue.recommendation,
    severity: issue.severity,
    category: dimCategory(issue.dimension),
    weight: Math.round(Math.abs(issue.impact)),
    suggestionLabel: issue.recommendation,
  };
}

function breakdown(checks: ContentAnalysisCheck[]): CategoryBreakdown {
  if (!checks.length) return emptyBreakdown();
  const maximum = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => {
    if (c.outcome === "passed") return s + c.weight;
    if (c.outcome === "warning") return s + c.weight * 0.5;
    return s;
  }, 0);
  return {
    score: Math.round(earned),
    maximum,
    percentage: maximum ? Math.round((earned / maximum) * 100) : 0,
    passed: checks.filter((c) => c.outcome === "passed").length,
    failed: checks.filter((c) => c.outcome === "failed").length,
    warnings: checks.filter((c) => c.outcome === "warning").length,
  };
}

function viewOf(d: DimensionReport): DimensionView {
  return {
    score: Math.round(d.score),
    max: 100,
    reason: d.reason,
    strengths: d.strengths,
    weaknesses: d.weaknesses,
  };
}

function buildRecommendations(checks: ContentAnalysisCheck[]): ContentAnalysisSuggestion[] {
  return prioritizeChecksForRecommendations(checks)
    .slice(0, 5)
    .map((c) => ({
      label: c.suggestionLabel,
      impacts: { [c.category]: c.weight },
      totalImpact: c.weight,
    }));
}

export function formatSuggestionImpact(s: ContentAnalysisSuggestion): string {
  const labels: Record<ContentAnalysisCategory, string> = {
    seo: "SEO",
    geo: "GEO",
    llm: "LLM",
    content_quality: "Quality",
    readability: "Read",
  };
  return (Object.entries(s.impacts) as Array<[ContentAnalysisCategory, number]>)
    .filter(([, v]) => v)
    .map(([k, v]) => `+${v} ${labels[k]}`)
    .join(", ");
}

export function formatCheckImpact(check: ContentAnalysisCheck): string {
  const labels: Record<ContentAnalysisCategory, string> = {
    seo: "SEO",
    geo: "GEO",
    llm: "LLM",
    content_quality: "Quality",
    readability: "Read",
  };
  return `+${check.weight} ${labels[check.category]}`;
}

export type ChecklistSummary = {
  passed: number;
  total: number;
  remaining: number;
};

export function summarizeChecks(checks: ContentAnalysisCheck[]): ChecklistSummary {
  const passed = checks.filter((c) => c.passed).length;
  return { passed, total: checks.length, remaining: checks.length - passed };
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#059669";
  if (score >= 60) return "#1a56db";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

function scoreBandLabel(score: number): string {
  if (score <= 39) return "Poor";
  if (score <= 59) return "Needs major revision";
  if (score <= 69) return "Needs improvement";
  if (score <= 79) return "Good";
  if (score <= 89) return "Strong";
  if (score <= 94) return "Excellent";
  return "Exceptional / publication-ready";
}

export function analyzeBlogContent(input: ContentAnalysisInput): ContentAnalysisResult {
  if (!hasAnalysisInput(input)) {
    return EMPTY_CONTENT_ANALYSIS;
  }

  const features: ArticleFeatures = extractArticle(input);
  const engine = scoreArticle(features);

  const checks = [
    ...engine.seo.subs,
    ...engine.geo.subs,
    ...engine.llm.subs,
    ...engine.quality.subs,
    ...engine.readability.subs,
  ].map(checkFromSub);

  const issueChecks = engine.issues.map(checkFromIssue);
  const seoChecks = checks.filter((c) => c.category === "seo");
  const geoChecks = checks.filter((c) => c.category === "geo");
  const llmChecks = checks.filter((c) => c.category === "llm");
  const contentQualityChecks = checks.filter((c) => c.category === "content_quality");
  const readabilityChecks = checks.filter((c) => c.category === "readability");

  const criticalIssues = issueChecks.filter((c) => c.severity === "critical");
  const highPriorityIssues = issueChecks.filter((c) => c.severity === "high");
  const mediumIssues = issueChecks.filter((c) => c.severity === "medium");
  const lowPriorityIssues = issueChecks.filter((c) => c.severity === "low");
  const passedChecks = checks.filter((c) => c.passed);
  const open = checks.filter((c) => !c.passed);

  const suggestions = buildRecommendations(issueChecks.length ? [...issueChecks, ...open] : open);
  const seo = Math.round(engine.seo.score);
  const geo = Math.round(engine.geo.score);
  const llm = Math.round(engine.llm.score);
  const quality = Math.round(engine.quality.score);
  const readability = Math.round(engine.readability.score);

  const scoreExplanation = [
    `${SCORE_PRODUCT_NAME}: ${engine.overallScore}/100 (${scoreBandLabel(engine.overallScore)}).`,
    `Weighted ${SCORE_PRODUCT_NAME} = SEO×0.25 + GEO×0.20 + LLM×0.20 + Quality×0.20 + Readability×0.15, then unique issue penalties (−${engine.penaltiesApplied.toFixed(0)}) and caps.`,
    `SEO ${seo}/100: ${engine.seo.reason}`,
    `GEO ${geo}/100: ${engine.geo.reason}`,
    `LLM ${llm}/100: ${engine.llm.reason}`,
    `Quality ${quality}/100: ${engine.quality.reason}`,
    `Readability ${readability}/100: ${engine.readability.reason}`,
    engine.capsApplied.length ? `Caps: ${engine.capsApplied.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const statusMessage = engine.emptyBody
    ? features.words === 0
      ? "Add blog content to begin analysis."
      : "Body is too short for a full quality evaluation. GEO, LLM, Quality, and Readability stay at 0."
    : `${engine.publishing.label}. ${scoreBandLabel(engine.overallScore)}.`;

  return {
    status: "analyzable",
    statusMessage,
    scoreName: SCORE_PRODUCT_NAME,
    seoScore: seo,
    geoScore: geo,
    llmScore: llm,
    contentQualityScore: quality,
    readabilityScore: readability,
    searchIntentScore: Math.round((engine.seo.subs.find((s) => s.id === "seo-intent")?.points || 0) / 16 * 100),
    topicalCoverageScore: Math.round(features.coverageRatio * 100),
    eeatScore: Math.round(engine.evidence.score * 100),
    technicalScore: Math.round((engine.seo.subs.find((s) => s.id === "seo-complete")?.points || 0) / 16 * 100),
    overallScore: engine.overallScore,
    primaryIntent: engine.intent,
    checks,
    seoChecks,
    geoChecks,
    llmChecks,
    contentQualityChecks,
    readabilityChecks,
    searchIntentChecks: seoChecks.filter((c) => c.id === "seo-intent"),
    topicalCoverageChecks: contentQualityChecks.filter((c) => c.id === "quality-depth"),
    eeatChecks: llmChecks.filter((c) => c.id === "llm-evidence"),
    technicalChecks: seoChecks.filter((c) => c.id === "seo-complete" || c.id === "seo-url" || c.id === "seo-media"),
    categories: {
      seo: { ...breakdown(seoChecks), percentage: seo },
      geo: { ...breakdown(geoChecks), percentage: geo },
      llm: { ...breakdown(llmChecks), percentage: llm },
      content_quality: { ...breakdown(contentQualityChecks), percentage: quality },
      readability: { ...breakdown(readabilityChecks), percentage: readability },
    },
    dimensions: {
      seo: viewOf(engine.seo),
      geo: viewOf(engine.geo),
      llm: viewOf(engine.llm),
      quality: viewOf(engine.quality),
      readability: viewOf(engine.readability),
    },
    criticalIssues,
    highPriorityIssues,
    mediumIssues,
    lowPriorityIssues,
    passedChecks,
    recommendedActions: suggestions.map((s) => s.label),
    scoreExplanation,
    internalLinksFound: features.links.filter((l) => l.internal).length,
    externalLinksFound: features.links.filter((l) => !l.internal).length,
    suggestions,
    hasInput: true,
    publishing: engine.publishing,
    categoryRelevance: { score: Math.round(engine.categoryRelevance), category: features.categoryName || "Uncategorized" },
    searchIntent: {
      score: Math.round((engine.seo.subs.find((s) => s.id === "seo-intent")?.points || 0) / 16 * 100),
      intent: engine.intent,
    },
    confidence: engine.confidence,
    capsApplied: engine.capsApplied,
    severityCounts: {
      critical: engine.issues.filter((i) => i.severity === "critical").length,
      high: engine.issues.filter((i) => i.severity === "high").length,
      medium: engine.issues.filter((i) => i.severity === "medium").length,
      low: engine.issues.filter((i) => i.severity === "low").length,
    },
  };
}
