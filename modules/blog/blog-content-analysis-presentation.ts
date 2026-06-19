import type { ContentAnalysisCheck } from "./blog-content-analysis";

export type IssuePresentationGroup = "content" | "ai_visibility" | "seo";

export type PrioritizedIssueGroups = {
  content: ContentAnalysisCheck[];
  aiVisibility: ContentAnalysisCheck[];
  seo: ContentAnalysisCheck[];
  totalRemaining: number;
};

const CONTENT_ORDER: string[] = [
  "geo-faq",
  "geo-summary",
  "geo-takeaways",
  "llm-examples",
  "geo-statistics",
  "geo-sources",
  "geo-table",
  "llm-case-study",
  "geo-numbered",
  "llm-definitions",
  "geo-direct-answer",
  "geo-bullets",
  "read-flow",
  "read-paragraphs",
  "read-sentence-length",
  "read-word-complexity",
];

const AI_VISIBILITY_ORDER: string[] = [
  "llm-entities",
  "geo-coverage",
  "llm-semantic",
  "llm-trust",
  "llm-citations",
  "llm-headings",
  "llm-author",
  "llm-terminology",
];

const SEO_ORDER: string[] = [
  "seo-keyword-permalink",
  "seo-internal-links",
  "seo-external-links",
  "seo-meta-length",
  "seo-meta-exists",
  "seo-alt-text",
  "seo-keyword-title",
  "seo-keyword-content",
  "seo-headings",
  "seo-h1",
  "seo-featured-image",
];

const CONTENT_IDS = new Set([...CONTENT_ORDER, "seo-faq"]);
const AI_IDS = new Set(AI_VISIBILITY_ORDER);
const SEO_IDS = new Set(SEO_ORDER);

const GROUP_LIMITS = {
  content: 5,
  ai_visibility: 4,
  seo: 3,
} as const;

function presentationGroup(checkId: string): IssuePresentationGroup | null {
  if (CONTENT_IDS.has(checkId)) return "content";
  if (AI_IDS.has(checkId)) return "ai_visibility";
  if (SEO_IDS.has(checkId)) return "seo";
  return null;
}

function sortByImpactAndOrder(checks: ContentAnalysisCheck[], order: string[]): ContentAnalysisCheck[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...checks].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    const rankA = rank.get(a.id) ?? 999;
    const rankB = rank.get(b.id) ?? 999;
    return rankA - rankB;
  });
}

function dedupeFaqIssues(failed: ContentAnalysisCheck[]): ContentAnalysisCheck[] {
  const hasGeoFaq = failed.some((c) => c.id === "geo-faq");
  if (!hasGeoFaq) return failed;
  return failed.filter((c) => c.id !== "seo-faq");
}

/** Presentation-only grouping: technical SEO first, then content quality, then AI visibility. */
export function prioritizeRemainingIssues(checks: ContentAnalysisCheck[]): PrioritizedIssueGroups {
  const failed = dedupeFaqIssues(checks.filter((c) => !c.passed));

  const content: ContentAnalysisCheck[] = [];
  const aiVisibility: ContentAnalysisCheck[] = [];
  const seo: ContentAnalysisCheck[] = [];

  for (const check of failed) {
    const group = presentationGroup(check.id);
    if (group === "content") content.push(check);
    else if (group === "ai_visibility") aiVisibility.push(check);
    else if (group === "seo") seo.push(check);
  }

  return {
    content: sortByImpactAndOrder(content, CONTENT_ORDER).slice(0, GROUP_LIMITS.content),
    aiVisibility: sortByImpactAndOrder(aiVisibility, AI_VISIBILITY_ORDER).slice(0, GROUP_LIMITS.ai_visibility),
    seo: sortByImpactAndOrder(seo, SEO_ORDER).slice(0, GROUP_LIMITS.seo),
    totalRemaining: failed.length,
  };
}

const GROUP_RANK: Record<IssuePresentationGroup, number> = {
  seo: 0,
  content: 1,
  ai_visibility: 2,
};

/** Flat list of failed checks sorted for recommendations (SEO → content → AI, then impact). */
export function prioritizeChecksForRecommendations(checks: ContentAnalysisCheck[]): ContentAnalysisCheck[] {
  const failed = dedupeFaqIssues(checks.filter((c) => !c.passed));

  return failed.sort((a, b) => {
    const groupA = presentationGroup(a.id);
    const groupB = presentationGroup(b.id);
    const rankA = groupA ? GROUP_RANK[groupA] : 99;
    const rankB = groupB ? GROUP_RANK[groupB] : 99;
    if (rankA !== rankB) return rankA - rankB;

    if (b.weight !== a.weight) return b.weight - a.weight;

    const orderList =
      groupA === "content" ? CONTENT_ORDER : groupA === "ai_visibility" ? AI_VISIBILITY_ORDER : SEO_ORDER;
    const orderA = orderList.indexOf(a.id);
    const orderB = orderList.indexOf(b.id);
    const rankOrderA = orderA === -1 ? 999 : orderA;
    const rankOrderB = orderB === -1 ? 999 : orderB;
    return rankOrderA - rankOrderB;
  });
}

export const ISSUE_SECTION_LABELS: Record<IssuePresentationGroup, string> = {
  content: "Content improvements",
  ai_visibility: "AI visibility improvements",
  seo: "SEO improvements",
};

export type FailedChecksGrouped = {
  content: ContentAnalysisCheck[];
  aiVisibility: ContentAnalysisCheck[];
  seo: ContentAnalysisCheck[];
  total: number;
};

/** All failed checks grouped for optimization (no display limits). */
export function getAllFailedChecksGrouped(checks: ContentAnalysisCheck[]): FailedChecksGrouped {
  const failed = dedupeFaqIssues(checks.filter((c) => !c.passed));

  const content: ContentAnalysisCheck[] = [];
  const aiVisibility: ContentAnalysisCheck[] = [];
  const seo: ContentAnalysisCheck[] = [];

  for (const check of failed) {
    const group = presentationGroup(check.id);
    if (group === "content") content.push(check);
    else if (group === "ai_visibility") aiVisibility.push(check);
    else if (group === "seo") seo.push(check);
  }

  return {
    content: sortByImpactAndOrder(content, CONTENT_ORDER),
    aiVisibility: sortByImpactAndOrder(aiVisibility, AI_VISIBILITY_ORDER),
    seo: sortByImpactAndOrder(seo, SEO_ORDER),
    total: failed.length,
  };
}

/** All failed checks in fix priority order (SEO → content → AI). */
export function pickOptimizationBatch(grouped: FailedChecksGrouped, limit = 25): ContentAnalysisCheck[] {
  const ordered = [
    ...grouped.seo,
    ...grouped.content,
    ...grouped.aiVisibility,
  ];
  return ordered.slice(0, limit);
}

export function pickOptimizationBatchFromChecks(checks: ContentAnalysisCheck[], limit = 25): ContentAnalysisCheck[] {
  return prioritizeChecksForRecommendations(checks).slice(0, limit);
}
