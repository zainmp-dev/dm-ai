import type { ContentAnalysisCheck, IssueSeverity } from "./blog-content-analysis";

export type IssuePresentationGroup = "content" | "ai_visibility" | "seo";

export type PrioritizedIssueGroups = {
  content: ContentAnalysisCheck[];
  aiVisibility: ContentAnalysisCheck[];
  seo: ContentAnalysisCheck[];
  totalRemaining: number;
};

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function presentationGroup(check: ContentAnalysisCheck): IssuePresentationGroup {
  if (check.category === "seo") return "seo";
  if (check.category === "geo" || check.category === "llm") return "ai_visibility";
  return "content";
}

function sortIssues(checks: ContentAnalysisCheck[]): ContentAnalysisCheck[] {
  return [...checks].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return b.weight - a.weight;
  });
}

const GROUP_LIMITS = { content: 5, ai_visibility: 4, seo: 3 } as const;

export function prioritizeRemainingIssues(checks: ContentAnalysisCheck[]): PrioritizedIssueGroups {
  const failed = checks.filter((c) => !c.passed && !c.id.startsWith("SUB_"));
  const content: ContentAnalysisCheck[] = [];
  const aiVisibility: ContentAnalysisCheck[] = [];
  const seo: ContentAnalysisCheck[] = [];

  for (const check of failed) {
    const group = presentationGroup(check);
    if (group === "content") content.push(check);
    else if (group === "ai_visibility") aiVisibility.push(check);
    else seo.push(check);
  }

  return {
    content: sortIssues(content).slice(0, GROUP_LIMITS.content),
    aiVisibility: sortIssues(aiVisibility).slice(0, GROUP_LIMITS.ai_visibility),
    seo: sortIssues(seo).slice(0, GROUP_LIMITS.seo),
    totalRemaining: failed.length,
  };
}

const GROUP_RANK: Record<IssuePresentationGroup, number> = {
  seo: 0,
  content: 1,
  ai_visibility: 2,
};

export function prioritizeChecksForRecommendations(checks: ContentAnalysisCheck[]): ContentAnalysisCheck[] {
  const failed = checks.filter((c) => !c.passed);
  return failed.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    const rankA = GROUP_RANK[presentationGroup(a)];
    const rankB = GROUP_RANK[presentationGroup(b)];
    if (rankA !== rankB) return rankA - rankB;
    return b.weight - a.weight;
  });
}

export const ISSUE_SECTION_LABELS: Record<IssuePresentationGroup, string> = {
  content: "Content improvements",
  ai_visibility: "AI visibility improvements",
  seo: "SEO improvements",
};

export const SEVERITY_LABELS: Record<IssueSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export type FailedChecksGrouped = {
  content: ContentAnalysisCheck[];
  aiVisibility: ContentAnalysisCheck[];
  seo: ContentAnalysisCheck[];
  total: number;
};

export function getAllFailedChecksGrouped(checks: ContentAnalysisCheck[]): FailedChecksGrouped {
  const failed = checks.filter((c) => !c.passed);
  const content: ContentAnalysisCheck[] = [];
  const aiVisibility: ContentAnalysisCheck[] = [];
  const seo: ContentAnalysisCheck[] = [];
  for (const check of failed) {
    const group = presentationGroup(check);
    if (group === "content") content.push(check);
    else if (group === "ai_visibility") aiVisibility.push(check);
    else seo.push(check);
  }
  return {
    content: sortIssues(content),
    aiVisibility: sortIssues(aiVisibility),
    seo: sortIssues(seo),
    total: failed.length,
  };
}

export function pickOptimizationBatch(grouped: FailedChecksGrouped, limit = 25): ContentAnalysisCheck[] {
  return [...grouped.seo, ...grouped.content, ...grouped.aiVisibility].slice(0, limit);
}

export function pickOptimizationBatchFromChecks(checks: ContentAnalysisCheck[], limit = 25): ContentAnalysisCheck[] {
  return prioritizeChecksForRecommendations(checks).slice(0, limit);
}
