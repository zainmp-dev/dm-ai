"use client";

import { AlertTriangle, Check } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  summarizeChecks,
  type ChecklistSummary,
  type ContentAnalysisCheck,
  type IssueSeverity,
} from "./blog-content-analysis";
import {
  ISSUE_SECTION_LABELS,
  SEVERITY_LABELS,
  type PrioritizedIssueGroups,
} from "./blog-content-analysis-presentation";

type AnalysisSummaryProps = {
  seo: ContentAnalysisCheck[];
  geo: ContentAnalysisCheck[];
  llm: ContentAnalysisCheck[];
  contentQuality: ContentAnalysisCheck[];
  readability: ContentAnalysisCheck[];
  className?: string;
};

function CategoryPill({ label, summary }: { label: string; summary: ChecklistSummary }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      <span className="text-muted-foreground">{label}:</span>
      <span className="tabular-nums">
        {summary.passed}/{summary.total}
      </span>
    </span>
  );
}

export function AnalysisSummary({
  seo,
  geo,
  llm,
  contentQuality,
  readability,
  className,
}: AnalysisSummaryProps) {
  const all = [...seo, ...geo, ...llm, ...contentQuality, ...readability];
  const overall = summarizeChecks(all);

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-100 bg-white/80 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/30",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="font-medium text-foreground">
          Criteria met: <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{overall.passed}</span>
        </span>
        <span className="font-medium text-foreground">
          Gaps: <span className="tabular-nums text-amber-700 dark:text-amber-300">{overall.remaining}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <CategoryPill label="SEO" summary={summarizeChecks(seo)} />
        <CategoryPill label="GEO" summary={summarizeChecks(geo)} />
        <CategoryPill label="LLM" summary={summarizeChecks(llm)} />
        <CategoryPill label="Quality" summary={summarizeChecks(contentQuality)} />
        <CategoryPill label="Read" summary={summarizeChecks(readability)} />
      </div>
    </div>
  );
}

const COUNT_STYLE: Record<IssueSeverity, string> = {
  critical: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  high: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  medium: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  low: "bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
};

export function SeverityCounts({
  critical,
  high,
  medium,
  low,
}: {
  critical: number;
  high: number;
  medium: number;
  low: number;
}) {
  const items: Array<{ key: IssueSeverity; count: number }> = [
    { key: "critical", count: critical },
    { key: "high", count: high },
    { key: "medium", count: medium },
    { key: "low", count: low },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.key}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            COUNT_STYLE[item.key],
          )}
        >
          {SEVERITY_LABELS[item.key]}: <span className="tabular-nums">{item.count}</span>
        </span>
      ))}
    </div>
  );
}

type AnalysisIssuesListProps = {
  groups: PrioritizedIssueGroups;
  className?: string;
};

const SEVERITY_STYLE: Record<IssueSeverity, string> = {
  critical: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  medium: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  low: "bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
};

function IssueRow({ check }: { check: ContentAnalysisCheck }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-amber-100/80 bg-amber-50/40 px-2.5 py-2 text-[11px] dark:border-amber-900/30 dark:bg-amber-950/15">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{check.label}</span>
          <span className={cn("rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide", SEVERITY_STYLE[check.severity])}>
            {SEVERITY_LABELS[check.severity]}
          </span>
        </div>
        <p className="mt-0.5 leading-snug text-muted-foreground">{check.evidence || check.message}</p>
        {check.recommendation ? (
          <p className="mt-1 leading-snug text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-foreground">Fix:</span> {check.recommendation}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function IssueSection({ title, checks }: { title: string; checks: ContentAnalysisCheck[] }) {
  if (checks.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      <ul className="space-y-1.5">
        {checks.map((check) => (
          <IssueRow key={check.id} check={check} />
        ))}
      </ul>
    </div>
  );
}

export function PrioritizedIssuesList({ groups, className }: AnalysisIssuesListProps) {
  const visibleCount = groups.content.length + groups.aiVisibility.length + groups.seo.length;

  if (groups.totalRemaining === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200",
          className,
        )}
      >
        <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <span>All checks passing — your content is in great shape.</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <IssueSection title={ISSUE_SECTION_LABELS.seo} checks={groups.seo} />
      <IssueSection title={ISSUE_SECTION_LABELS.content} checks={groups.content} />
      <IssueSection title={ISSUE_SECTION_LABELS.ai_visibility} checks={groups.aiVisibility} />
      {groups.totalRemaining > visibleCount ? (
        <p className="text-[10px] text-muted-foreground">
          +{groups.totalRemaining - visibleCount} more lower-priority items not shown
        </p>
      ) : null}
    </div>
  );
}

export function SeverityIssuesList({
  critical,
  high,
  medium,
  low,
  className,
}: {
  critical: ContentAnalysisCheck[];
  high: ContentAnalysisCheck[];
  medium: ContentAnalysisCheck[];
  low: ContentAnalysisCheck[];
  className?: string;
}) {
  const total = critical.length + high.length + medium.length + low.length;
  if (total === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-200",
          className,
        )}
      >
        <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <span>No open issues — strong publish candidate on scored criteria.</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <IssueSection title="Critical issues" checks={critical.slice(0, 4)} />
      <IssueSection title="High priority" checks={high.slice(0, 5)} />
      <IssueSection title="Medium priority" checks={medium.slice(0, 4)} />
      <IssueSection title="Low priority" checks={low.slice(0, 3)} />
    </div>
  );
}

export type { PrioritizedIssueGroups };

export type FixCelebration = {
  id: string;
  label: string;
  impact: string;
};

type FixCelebrationToastProps = {
  items: FixCelebration[];
  className?: string;
};

export function FixCelebrationToast({ items, className }: FixCelebrationToastProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-900 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
          <span className="font-medium">{item.label} detected</span>
          <span className="ml-auto shrink-0 font-semibold text-emerald-700 dark:text-emerald-300">{item.impact}</span>
        </div>
      ))}
    </div>
  );
}
