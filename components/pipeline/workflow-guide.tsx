"use client";

import Link from "next/link";
import { useMemo } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/workspace-store";
import type { ContentItem } from "@/lib/types";

const STEPS = [
  {
    n: 1,
    id: "workspace" as const,
    title: "Workspace",
    detail: "Company profile, scenario, and media library.",
    href: "/settings?section=workspace",
    linkLabel: "Open",
  },
  {
    n: 2,
    id: "connect" as const,
    title: "Connect",
    detail: "Link LinkedIn and Meta in Settings → Integrations.",
    href: "/settings?section=integrations",
    linkLabel: "Social",
  },
  {
    n: 3,
    id: "command" as const,
    title: "Command",
    detail: "AI drafts, competitors, and ideas.",
    href: "/pipeline?tab=command",
    linkLabel: "AI",
  },
  {
    n: 4,
    id: "content" as const,
    title: "Content · Approval",
    detail: "Library, review, platforms, and post-now.",
    href: "/pipeline?tab=content",
    linkLabel: "Create + Review",
  },
  {
    n: 5,
    id: "ship" as const,
    title: "Schedule · Publish",
    detail: "Calendar, then go live and read the log.",
    href: "/pipeline?tab=publishing",
    linkLabel: "Go live",
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export type WorkflowGuideData = {
  steps: {
    [K in StepId]: { status: string; when: string; detailIso: string };
  } | null;
};

function pickLatestIso(
  items: ContentItem[],
  key: (c: ContentItem) => string | null | undefined,
): string | null {
  let best: string | null = null;
  for (const c of items) {
    const v = key(c);
    if (!v) continue;
    if (!best) {
      best = v;
      continue;
    }
    try {
      if (new Date(v) > new Date(best)) best = v;
    } catch {
      /* ignore */
    }
  }
  return best;
}

function shortWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    return format(d, "MMM d, yyyy · h:mm a");
  } catch {
    return "—";
  }
}

function relWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

export function useWorkflowGuideData(): WorkflowGuideData {
  const workspace = useWorkspaceStore((s) => s.workspace);

  return useMemo(() => {
    if (!workspace) {
      return { steps: null };
    }
    const content = workspace.content;
    const media = workspace.mediaLibrary;
    const configured = workspace.workspaceConfigured;
    const { linkedin, meta } = workspace.integrations;

    const pending = content.filter((c) => c.status === "PENDING");
    const approved = content.filter((c) => c.status === "APPROVED");
    const scheduled = content.filter((c) => c.status === "SCHEDULED");
    const published = content.filter((c) => c.status === "PUBLISHED");

    const latestContentTouch = pickLatestIso(content, (c) => c.updatedAt || c.createdAt);
    const latestPending = pickLatestIso(pending, (c) => c.updatedAt || c.createdAt);
    const fromMedia = media.length
      ? media.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a))
      : null;

    const nextSlot = scheduled
      .map((c) => c.scheduledAt)
      .filter(Boolean) as string[];
    const nextTime =
      nextSlot.length > 0
        ? nextSlot.reduce((a, b) => (new Date(a) < new Date(b) ? a : b))
        : null;

    const logs = workspace.publishingLog ?? [];
    const lastLog =
      logs.length > 0
        ? logs.reduce((a, b) => (new Date(b.timestamp) > new Date(a.timestamp) ? b : a))
        : null;

    const logHint = lastLog
      ? `Last run ${relWhen(lastLog.timestamp)} · ${lastLog.status}`
      : null;

    const socialConnected = [linkedin.connected, meta.connected].filter(Boolean).length;

    const stepMeta = {
      workspace: {
        status: configured ? "Ready" : "Finish setup",
        when: fromMedia
          ? `${media.length} media`
          : media.length
            ? `${media.length} files`
            : "No media yet",
        detailIso: fromMedia ? shortWhen(fromMedia.createdAt) : "—",
      },
      connect: {
        status: socialConnected === 2 ? "2 accounts" : socialConnected === 1 ? "1 account" : "Add accounts",
        when: [linkedin.accountName, meta.accountName].filter(Boolean).join(" · ") || "—",
        detailIso: "—",
      },
      command: {
        status: content.length ? `${content.length} in flow` : "No drafts",
        when: relWhen(latestContentTouch) !== "—" ? `Updated ${relWhen(latestContentTouch)}` : "—",
        detailIso: shortWhen(latestContentTouch),
      },
      content: {
        status: `${content.length} post${content.length === 1 ? "" : "s"} · ${pending.length} to review`,
        when: relWhen(latestPending) !== "—" ? `Review ${relWhen(latestPending)}` : "Library + review",
        detailIso: shortWhen(latestContentTouch),
      },
      ship: {
        status: `${scheduled.length} scheduled · ${published.length} live`,
        when: nextTime
          ? `Next slot ${shortWhen(nextTime)}`
          : logHint ?? (approved.length > 0 ? `${approved.length} ready` : "—"),
        detailIso: lastLog ? shortWhen(lastLog.timestamp) : "—",
      },
    } as const;

    return { steps: stepMeta };
  }, [workspace]);
}

const boxClass =
  "w-full max-w-none rounded-2xl border border-blue-100/90 bg-gradient-to-b from-white via-blue-50/25 to-slate-50/40 p-4 shadow-sm shadow-blue-900/[0.04] dark:border-blue-950/50 dark:from-zinc-900 dark:via-blue-950/20 dark:to-zinc-950 sm:p-5";

function FlowArrow() {
  return (
    <div
      className="flex shrink-0 items-center justify-center px-0.5 text-blue-400 dark:text-blue-500 sm:px-1"
      aria-hidden
    >
      <ArrowRight className="size-4 sm:size-[1.15rem]" strokeWidth={2.5} />
    </div>
  );
}

export function WorkflowEndToEndFlow({ data }: { data: WorkflowGuideData }) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceName =
    workspace?.companyName?.trim() ||
    workspace?.profile?.company?.trim() ||
    workspace?.profile?.name?.trim() ||
    "Workspace";
  const connectedCount = workspace
    ? [workspace.integrations.linkedin.connected, workspace.integrations.meta.connected].filter(Boolean).length
    : 0;
  const hasConnectionWarning = Boolean(workspace) && connectedCount < 2;

  return (
    <div className={cn("w-full", boxClass)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-blue-100/80 pb-3 dark:border-blue-900/40">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-zinc-50 sm:text-base">
            End-to-end flow
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
            {workspaceName}
          </p>
        </div>
        <Link
          href="/settings"
          className="text-xs font-medium text-blue-600 transition hover:text-blue-800 hover:underline dark:text-blue-400 sm:text-sm"
        >
          Settings
        </Link>
      </div>
      {hasConnectionWarning ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>
            Publish to both channels: connect <span className="font-medium">LinkedIn</span> and{" "}
            <span className="font-medium">Meta</span> in Settings. AI workspace setup and drafting still run without both;
            this only affects scheduling and publishing to every platform.
          </p>
        </div>
      ) : null}

      <nav className="min-w-0 w-full" aria-label="Workflow steps from workspace to publish">
        <ol className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-stretch sm:gap-0 sm:py-0.5">
          {STEPS.map((step, index) => {
            const meta = data.steps?.[step.id];
            const connectStepNeedsAttention = step.id === "connect" && hasConnectionWarning;
            const blurb = meta
              ? [meta.status, meta.when !== "—" ? meta.when : null, meta.detailIso !== "—" ? meta.detailIso : null]
                  .filter(Boolean)
                  .join(" · ")
              : "";

            return (
              <li
                key={step.id}
                className="flex list-none flex-col gap-2 sm:contents sm:gap-0"
              >
                {index > 0 && (
                  <div className="flex w-full items-center justify-center py-0.5 sm:w-auto sm:shrink-0 sm:self-stretch sm:py-0">
                    <div className="h-px w-8 bg-gradient-to-r from-transparent via-blue-200/80 to-blue-300/80 sm:hidden dark:via-blue-800" />
                    <div className="hidden h-full min-h-[4.5rem] items-center sm:flex">
                      <FlowArrow />
                    </div>
                  </div>
                )}
                <div className="relative min-w-0 flex-1 sm:min-w-[5.5rem]">
                  <Link
                    href={step.href}
                    className="group block h-full min-h-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    aria-label={`${step.title}: ${step.detail} — go to ${step.linkLabel}`}
                  >
                    <div
                      className={cn(
                        "flex h-full min-h-[5.25rem] flex-col rounded-2xl border p-3 transition-all sm:min-h-[6.5rem] sm:p-3.5",
                        connectStepNeedsAttention
                          ? "border-amber-300 bg-amber-50/60 shadow-sm ring-1 ring-amber-200/70 dark:border-amber-800 dark:bg-amber-950/25 dark:ring-amber-900/30"
                          : "border-blue-100/90 bg-white shadow-sm ring-1 ring-blue-50/50 dark:border-blue-900/50 dark:bg-zinc-900/80 dark:ring-blue-950/30",
                        "group-hover:border-blue-300 group-hover:shadow-md dark:group-hover:border-blue-800",
                        "group-active:scale-[0.99]",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white shadow-sm shadow-blue-600/20 group-hover:bg-blue-700 dark:bg-blue-500 sm:size-7 sm:text-xs">
                          {step.n}
                        </span>
                        <p className="min-w-0 pt-0.5 text-xs font-semibold leading-snug text-slate-900 dark:text-zinc-50 sm:text-sm">
                          {step.title}
                        </p>
                      </div>
                      {blurb && (
                        <p className="mt-2 line-clamp-3 text-[10px] leading-snug text-slate-600 dark:text-slate-400 sm:text-xs">
                          {blurb}
                        </p>
                      )}
                      <span className="mt-auto inline-flex items-center gap-0.5 pt-2 text-[10px] font-semibold text-blue-600 group-hover:underline dark:text-blue-400 sm:text-xs">
                        {step.linkLabel}
                        <ChevronRight className="size-3 shrink-0 transition group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </div>
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

export function WorkflowGuide() {
  const data = useWorkflowGuideData();
  return (
    <div className="w-full">
      <WorkflowEndToEndFlow data={data} />
    </div>
  );
}
