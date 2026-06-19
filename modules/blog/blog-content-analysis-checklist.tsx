"use client";

import { AlertTriangle, Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { summarizeChecks, type ChecklistSummary, type ContentAnalysisCheck } from "./blog-content-analysis";
import { ISSUE_SECTION_LABELS, type PrioritizedIssueGroups } from "./blog-content-analysis-presentation";

type AnalysisSummaryProps = {
  seo: ContentAnalysisCheck[];
  geo: ContentAnalysisCheck[];
  llm: ContentAnalysisCheck[];
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

export function AnalysisSummary({ seo, geo, llm, readability, className }: AnalysisSummaryProps) {
  const all = [...seo, ...geo, ...llm, ...readability];
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
          Completed: <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{overall.passed}</span>
        </span>
        <span className="font-medium text-foreground">
          Remaining:{" "}
          <span className="tabular-nums text-amber-700 dark:text-amber-300">{overall.remaining}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <CategoryPill label="SEO" summary={summarizeChecks(seo)} />
        <CategoryPill label="GEO" summary={summarizeChecks(geo)} />
        <CategoryPill label="LLM" summary={summarizeChecks(llm)} />
        <CategoryPill label="Read" summary={summarizeChecks(readability)} />
      </div>
    </div>
  );
}

type AnalysisIssuesListProps = {
  groups: PrioritizedIssueGroups;
  className?: string;
};

function IssueRow({ check }: { check: ContentAnalysisCheck }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-amber-100/80 bg-amber-50/40 px-2.5 py-2 text-[11px] dark:border-amber-900/30 dark:bg-amber-950/15">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
      <div className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{check.label}</span>
        <p className="mt-0.5 leading-snug text-muted-foreground">{check.message}</p>
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
      <IssueSection title={ISSUE_SECTION_LABELS.content} checks={groups.content} />
      <IssueSection title={ISSUE_SECTION_LABELS.ai_visibility} checks={groups.aiVisibility} />
      <IssueSection title={ISSUE_SECTION_LABELS.seo} checks={groups.seo} />
      {groups.totalRemaining > visibleCount ? (
        <p className="text-[10px] text-muted-foreground">
          +{groups.totalRemaining - visibleCount} more lower-priority items not shown
        </p>
      ) : null}
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
