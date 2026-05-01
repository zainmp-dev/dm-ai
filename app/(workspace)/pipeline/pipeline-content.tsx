"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { Calendar, Command, FileText, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentWorkspaceView } from "@/components/content-workspace-view";
import { CommandCenterView } from "@/components/command-center-view";
import { ApprovalTab } from "@/components/pipeline/approval-tab";
import { SchedulingTab } from "@/components/pipeline/scheduling-tab";
import { PublishingTab } from "@/components/pipeline/publishing-tab";
import { useWorkflowGuideData, WorkflowEndToEndFlow } from "@/components/pipeline/workflow-guide";

const TABS = [
  { id: "command" as const, label: "Command", short: "AI", icon: Command, hint: "AI tools and drafts" },
  { id: "content" as const, label: "Content + Approval", short: "Library", icon: FileText, hint: "Library, review, and post-now" },
  { id: "scheduling" as const, label: "Scheduling", short: "Plan", icon: Calendar, hint: "Calendar slots" },
  { id: "publishing" as const, label: "Publishing", short: "Go live", icon: Rocket, hint: "Publish and logs" },
];

export function PipelineContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workflowData = useWorkflowGuideData();
  const raw = searchParams.get("tab");
  const normalizedTab = raw === "approval" ? "content" : raw;
  const activeTab = TABS.some((t) => t.id === normalizedTab) ? (normalizedTab as (typeof TABS)[number]["id"]) : "command";
  const contentViewRaw = searchParams.get("contentView");
  const activeContentView = contentViewRaw === "approval" ? "approval" : "library";

  const setTab = useCallback(
    (id: (typeof TABS)[number]["id"]) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", id);
      if (id !== "content") {
        next.delete("contentView");
      } else if (!next.get("contentView")) {
        next.set("contentView", "library");
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setContentView = useCallback(
    (view: "library" | "approval") => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", "content");
      next.set("contentView", view);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  let panel: ReactNode;
  if (activeTab === "command") {
    panel = <CommandCenterView />;
  } else if (activeTab === "content") {
    panel = (
      <div className="space-y-4">
        <section className="rounded-2xl border border-blue-100/90 bg-white p-3 shadow-sm dark:border-blue-900/50 dark:bg-zinc-900/60 sm:p-4">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5" role="tablist" aria-label="Content and approval views">
            <button
              type="button"
              role="tab"
              aria-selected={activeContentView === "library"}
              className={cn(
                "min-w-[148px] rounded-2xl px-5 py-2.5 text-base font-semibold transition-all duration-200 sm:min-w-[168px] sm:px-6 sm:py-3",
                activeContentView === "library"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:shadow-sm dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
              )}
              onClick={() => setContentView("library")}
            >
              Library
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeContentView === "approval"}
              className={cn(
                "min-w-[148px] rounded-2xl px-5 py-2.5 text-base font-semibold transition-all duration-200 sm:min-w-[168px] sm:px-6 sm:py-3",
                activeContentView === "approval"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:shadow-sm dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
              )}
              onClick={() => setContentView("approval")}
            >
              Approval Queue
            </button>
          </div>
        </section>
        <div>{activeContentView === "library" ? <ContentWorkspaceView /> : <ApprovalTab />}</div>
      </div>
    );
  } else if (activeTab === "scheduling") {
    panel = <SchedulingTab />;
  } else if (activeTab === "publishing") {
    panel = <PublishingTab />;
  } else {
    panel = <CommandCenterView />;
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <WorkflowEndToEndFlow data={workflowData} />

      <div className="min-w-0 space-y-4">
        <section
          className="rounded-2xl border border-blue-100/90 bg-white p-3.5 shadow-sm shadow-blue-900/[0.04] dark:border-blue-900/50 dark:bg-zinc-900/60 sm:p-4"
          aria-label="Pipeline steps"
        >
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Choose a step below. Content + Approval keeps drafting and review in one place.</p>
          <div className="mt-3" role="tablist" aria-label="Workflow step tabs">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
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
                      "flex min-h-0 min-w-0 flex-col items-start justify-center gap-1 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                      "sm:items-center sm:py-3 sm:text-center",
                      active
                        ? "border-blue-300 bg-gradient-to-b from-blue-50 to-white text-blue-950 shadow-sm ring-1 ring-blue-200/60 dark:border-blue-600 dark:from-blue-950/50 dark:to-zinc-900 dark:text-blue-50 dark:ring-blue-700/50"
                        : "border-blue-100/80 bg-slate-50/50 text-slate-600 hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-sm dark:border-blue-950/50 dark:bg-zinc-800/40 dark:text-slate-300 dark:hover:bg-blue-950/30",
                    )}
                    onClick={() => setTab(t.id)}
                  >
                    <span className="flex w-full items-center gap-1.5 sm:justify-center">
                      <Icon
                        className={cn("size-3.5 shrink-0", active ? "text-blue-600 dark:text-blue-300" : "text-slate-500 dark:text-slate-400")}
                        aria-hidden
                      />
                      <span className="text-sm font-semibold">{t.label}</span>
                    </span>
                    <span
                      className={cn(
                        "w-full pl-[22px] text-[10px] sm:mt-0.5 sm:pl-0 sm:text-xs",
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
