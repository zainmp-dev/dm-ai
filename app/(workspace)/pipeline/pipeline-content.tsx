"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { Calendar, CheckCircle2, Command, FileText, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentWorkspaceView } from "@/components/content-workspace-view";
import { CommandCenterView } from "@/components/command-center-view";
import { ApprovalTab } from "@/components/pipeline/approval-tab";
import { SchedulingTab } from "@/components/pipeline/scheduling-tab";
import { PublishingTab } from "@/components/pipeline/publishing-tab";
import { useWorkflowGuideData, WorkflowEndToEndFlow } from "@/components/pipeline/workflow-guide";

const TABS = [
  { id: "command" as const, label: "Command", short: "AI", icon: Command, hint: "AI tools and drafts" },
  { id: "content" as const, label: "Content", short: "Library", icon: FileText, hint: "All posts in one place" },
  { id: "approval" as const, label: "Approval", short: "Review", icon: CheckCircle2, hint: "Review and platforms" },
  { id: "scheduling" as const, label: "Scheduling", short: "Plan", icon: Calendar, hint: "Calendar slots" },
  { id: "publishing" as const, label: "Publishing", short: "Go live", icon: Rocket, hint: "Publish and logs" },
];

export function PipelineContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workflowData = useWorkflowGuideData();
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const [commandSyncing, setCommandSyncing] = useState(false);
  const raw = searchParams.get("tab");
  const activeTab = TABS.some((t) => t.id === raw) ? (raw as (typeof TABS)[number]["id"]) : "command";

  useEffect(() => {
    if (activeTab !== "command") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setCommandSyncing(true);
    });
    void refreshWorkspace({ soft: true }).finally(() => {
      if (!cancelled) setCommandSyncing(false);
    });
    return () => {
      cancelled = true;
      queueMicrotask(() => setCommandSyncing(false));
    };
  }, [activeTab, refreshWorkspace]);

  const setTab = useCallback(
    (id: (typeof TABS)[number]["id"]) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  let panel: ReactNode;
  switch (activeTab) {
    case "command":
      panel = <CommandCenterView serverSyncing={commandSyncing} />;
      break;
    case "content":
      panel = <ContentWorkspaceView />;
      break;
    case "scheduling":
      panel = <SchedulingTab />;
      break;
    case "publishing":
      panel = <PublishingTab />;
      break;
    case "approval":
      panel = <ApprovalTab />;
      break;
    default:
      panel = <CommandCenterView serverSyncing={commandSyncing} />;
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <WorkflowEndToEndFlow data={workflowData} />

      <div className="min-w-0 space-y-4">
        <section
          className="rounded-2xl border border-blue-100/90 bg-white p-3.5 shadow-sm shadow-blue-900/[0.04] dark:border-blue-900/50 dark:bg-zinc-900/60 sm:p-4"
          aria-label="Pipeline steps"
        >
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Choose a step below. Use the Content tab for the full library.</p>
          <div className="mt-3" role="tablist" aria-label="Workflow step tabs">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
              {TABS.map((t) => {
                const active = activeTab === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    id={`tab-${t.id}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`panel-${t.id}`}
                    className={cn(
                      "flex min-h-0 min-w-0 flex-col items-start justify-center gap-0.5 rounded-xl border px-2.5 py-2 text-left transition-all",
                      "sm:items-center sm:py-2.5 sm:text-center",
                      active
                        ? "border-blue-300 bg-gradient-to-b from-blue-50 to-white text-blue-950 shadow-sm ring-1 ring-blue-200/60 dark:border-blue-600 dark:from-blue-950/50 dark:to-zinc-900 dark:text-blue-50 dark:ring-blue-700/50"
                        : "border-blue-100/80 bg-slate-50/50 text-slate-600 hover:border-blue-200 hover:bg-blue-50/40 dark:border-blue-950/50 dark:bg-zinc-800/40 dark:text-slate-300 dark:hover:bg-blue-950/30",
                    )}
                    onClick={() => setTab(t.id)}
                  >
                    <span className="flex w-full items-center gap-1.5 sm:justify-center">
                      <Icon
                        className={cn("size-3.5 shrink-0", active ? "text-blue-600 dark:text-blue-300" : "text-slate-500 dark:text-slate-400")}
                        aria-hidden
                      />
                      <span className="text-xs font-semibold">{t.label}</span>
                    </span>
                    <span
                      className={cn(
                        "w-full pl-[22px] text-[9px] sm:mt-0.5 sm:pl-0 sm:text-[10px]",
                        active ? "text-blue-700/80 dark:text-blue-200/80" : "text-slate-500 dark:text-slate-500",
                      )}
                    >
                      {t.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div
          className={cn(
            "rounded-2xl border border-blue-100/70 bg-white/80 shadow-sm shadow-blue-900/[0.03] dark:border-blue-950/50 dark:bg-zinc-900/40",
            activeTab !== "command" && activeTab !== "content" && "min-h-[10rem]",
            activeTab === "content" && "border-0 bg-transparent shadow-none dark:bg-transparent",
          )}
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          <div
            className={cn("rounded-xl p-2.5 sm:p-4", activeTab === "content" && "p-0")}
          >
            {panel}
          </div>
        </div>
      </div>
    </div>
  );
}
