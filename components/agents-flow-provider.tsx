"use client";

import { GitBranch, Layers, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
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

const BACKEND_STEPS = [
  {
    icon: Sparkles,
    title: "Strategy agent",
    body: "Reads your brand context and produces structured strategy: audience, pillars, gaps, and positioning.",
  },
  {
    icon: GitBranch,
    title: "Competitor discovery",
    body: "Runs inside the strategy step when needed to enrich real named competitors—not placeholders.",
  },
  {
    icon: Layers,
    title: "Content agent",
    body: "Turns strategy into a calendar of posts (copy, platform, timing hints) for your review.",
  },
  {
    icon: Wand2,
    title: "Recovery pass (only if needed)",
    body: "If calendar generation fails, a lighter recovery pass rebuilds posts from strategy so you are not blocked.",
  },
  {
    icon: ShieldCheck,
    title: "Normalize & save",
    body: "Results are merged, validated, and stored with your workspace—along with which AI models ran each step.",
  },
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
          What runs on the server when you generate research
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          One workspace “research” run chains specialized AI steps. Human approval always happens in your Workflow—nothing
          auto-publishes without your rules.
        </p>
        <ul className="mt-4 space-y-3">
          {BACKEND_STEPS.map((step) => {
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
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{step.body}</p>
                </div>
              </li>
            );
          })}
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
                How your team moves work through FlowPilot, and how the backend AI pipeline supports a full research run.
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
