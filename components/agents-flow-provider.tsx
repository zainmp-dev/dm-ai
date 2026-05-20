"use client";

import { GitBranch, Layers, MessageSquare, Search, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AgentsFlowContextValue = {
  openAgentsFlow: () => void;
};

const AgentsFlowContext = createContext<AgentsFlowContextValue | null>(null);

export function useAgentsFlow(): AgentsFlowContextValue {
  const ctx = useContext(AgentsFlowContext);
  if (!ctx) {
    throw new Error("useAgentsFlow must be used within AgentsFlowProvider");
  }
  return ctx;
}

const USER_STEPS = [
  {
    n: "1",
    title: "Workspace",
    body: "Company, website, scenario, and region so AI research matches your market.",
  },
  {
    n: "2",
    title: "Connect",
    body: "Link LinkedIn or Meta so approved posts can go live from FlowPilot.",
  },
  {
    n: "3",
    title: "Command & content",
    body: "Use AI in Workflow → Command, then refine posts under Content + Approval.",
  },
  {
    n: "4",
    title: "Schedule · publish",
    body: "Pick times, then publish and track status in the publishing log.",
  },
] as const;

/** Agents that power the live app (Python FastAPI → Groq / Gemini / OpenRouter). */
const ACTIVE_AGENTS = [
  {
    icon: Sparkles,
    title: "Agent 1 — Strategy",
    trigger: "Strategy page · Command “Run strategy” · first-time setup (strategy step only)",
    body: "Company study, positioning, themes, market gaps, and competitor cards. Saved to your workspace; does not replace existing content posts.",
  },
  {
    icon: GitBranch,
    title: "Competitor discovery (inside Agent 1)",
    trigger: "Runs automatically when Agent 1 needs more named competitors",
    body: "Second LLM pass to reach real vendor names for your category and region—not hardcoded lists.",
  },
  {
    icon: Layers,
    title: "Agent 2 — Content calendar",
    trigger: "Content “Regenerate” · Command “Run content” · setup flow (content step)",
    body: "Builds calendar posts from saved strategy. Uses trimmed strategy JSON so generation stays fast on free models.",
  },
  {
    icon: ShieldCheck,
    title: "Review pass (optional, inside Agent 2)",
    trigger: "After calendar JSON is produced (skipped on free models or very small calendars)",
    body: "Light polish pass on post copy before rows are saved to your library.",
  },
  {
    icon: Wand2,
    title: "Content recovery",
    trigger: "Only if Agent 2 returns an empty or broken calendar",
    body: "Fallback LLM pass rebuilds posts from strategy so you are not blocked.",
  },
  {
    icon: MessageSquare,
    title: "Master content suggest",
    trigger: "Content library → suggest / voice “suggest a post”",
    body: "Single draft (title, body, media hint) from your saved strategy—not a full calendar.",
  },
  {
    icon: Search,
    title: "Workspace search",
    trigger: "Header AI search on workspace pages",
    body: "Answers questions using your stored strategy, competitors, and content—no new generation unless you ask to run agents.",
  },
] as const;

const NOT_IN_APP_UI = [
  "9-step TypeScript pipeline (research → trends → validator → brand review → …) — only via POST /api/ai/pipeline with FLOW_AI_PIPELINE_SECRET; not used by the main UI.",
  "Legacy niche demo chain (strategy → content → review for a single niche string) — scheduler / admin demo only.",
  "Analytics agent — POST /analytics/analyze when you analyze a post’s performance.",
] as const;

function AgentsFlowBody() {
  return (
    <div className="max-h-[min(72vh,640px)] space-y-8 overflow-y-auto pr-1">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Your journey in the app
        </h3>
        <ol className="mt-3 space-y-3">
          {USER_STEPS.map((step) => (
            <li
              key={step.n}
              className="flex gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3 py-3 dark:border-zinc-700/80 dark:bg-zinc-800/40"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                {step.n}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Active AI agents (what the app runs today)
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          All of these run on the FastAPI backend. Human approval always happens in Workflow—nothing auto-publishes.
        </p>
        <ul className="mt-4 space-y-3">
          {ACTIVE_AGENTS.map((step) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="flex gap-3 rounded-xl border border-zinc-200/90 bg-white px-3 py-3 dark:border-zinc-700/80 dark:bg-zinc-900/60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f0f4ff] text-[#1a56db] dark:bg-blue-950/50 dark:text-blue-300">
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.title}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-blue-700/90 dark:text-blue-300/90">{step.trigger}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Present in code but not the main workflow UI
        </h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {NOT_IN_APP_UI.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function AgentsFlowProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openAgentsFlow = useCallback(() => setOpen(true), []);

  const value = useMemo(() => ({ openAgentsFlow }), [openAgentsFlow]);

  return (
    <AgentsFlowContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
          <div className="border-b border-zinc-200 bg-gradient-to-r from-slate-50 to-white px-6 py-5 dark:border-zinc-800 dark:from-zinc-900/80 dark:to-zinc-950">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                AI agents & workflow
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                What FlowPilot runs for you in the product, and where each agent is triggered.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-5">
            <AgentsFlowBody />
          </div>
        </DialogContent>
      </Dialog>
    </AgentsFlowContext.Provider>
  );
}
