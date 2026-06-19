"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  AnalysisSummary,
  FixCelebrationToast,
  PrioritizedIssuesList,
  type FixCelebration,
} from "./blog-content-analysis-checklist";
import {
  analyzeBlogContent,
  formatCheckImpact,
  formatSuggestionImpact,
  hasAnalysisInput,
  scoreColor,
  type ContentAnalysisCheck,
  type ContentAnalysisInput,
  type ContentAnalysisResult,
} from "./blog-content-analysis";
import { prioritizeRemainingIssues } from "./blog-content-analysis-presentation";

const DEBOUNCE_MS = 750;
const CELEBRATION_MS = 3200;

type BlogContentAnalysisPanelProps = ContentAnalysisInput & {
  className?: string;
};

const SCORE_LABELS = [
  { key: "seoScore" as const, trendKey: "seo" as const, label: "SEO", hint: "Search optimization" },
  { key: "geoScore" as const, trendKey: "geo" as const, label: "GEO", hint: "Generative engine optimization" },
  { key: "llmScore" as const, trendKey: "llm" as const, label: "LLM", hint: "AI discoverability" },
  { key: "readabilityScore" as const, trendKey: "readability" as const, label: "Readability", hint: "Reading ease" },
];

function useDebouncedAnalysis(input: ContentAnalysisInput): ContentAnalysisResult {
  const [debouncedInput, setDebouncedInput] = useState(input);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedInput(input), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  return useMemo(() => analyzeBlogContent(debouncedInput), [debouncedInput]);
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const duration = 600;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };

    requestAnimationFrame(tick);
  }, [value]);

  return <span className={className}>{display}</span>;
}

function TrendBadge({ delta, inactive }: { delta: number; inactive?: boolean }) {
  if (inactive || delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <Minus className="h-3 w-3" />
        —
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        <ArrowUpRight className="h-3 w-3" />
        +{delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
      <ArrowDownRight className="h-3 w-3" />
      {delta}
    </span>
  );
}

function OverallGauge({ score, active }: { score: number; active: boolean }) {
  const [animatedScore, setAnimatedScore] = useState(score);
  const prevRef = useRef(score);

  useEffect(() => {
    const from = prevRef.current;
    const to = score;
    const start = performance.now();
    const duration = 600;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setAnimatedScore(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
      else prevRef.current = to;
    };

    requestAnimationFrame(tick);
  }, [score]);

  const display = active ? animatedScore : 0;
  const fill = active ? scoreColor(display) : "#d4d4d8";
  const data = [
    { name: "score", value: display },
    { name: "rest", value: 100 - display },
  ];

  return (
    <div className="relative h-[108px] w-[108px] shrink-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={108}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            startAngle={90}
            endAngle={-270}
            innerRadius={38}
            outerRadius={50}
            paddingAngle={0}
            dataKey="value"
            stroke="none"
            isAnimationActive
            animationDuration={600}
            animationEasing="ease-out"
          >
            <Cell fill={fill} />
            <Cell fill="#f4f4f5" className="dark:fill-zinc-800" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber
          value={display}
          className={cn("text-2xl font-semibold tabular-nums", active ? "text-foreground" : "text-zinc-400")}
        />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Overall</span>
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  score,
  trend,
  active,
}: {
  label: string;
  score: number;
  trend: number;
  active: boolean;
}) {
  const display = active ? score : 0;
  const fill = active ? scoreColor(display) : "#e4e4e7";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground">{label}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <AnimatedNumber
            value={display}
            className={cn("text-xs font-semibold tabular-nums", active ? "text-foreground" : "text-zinc-400")}
          />
          <TrendBadge delta={trend} inactive={!active} />
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full transition-[width,background-color] duration-700 ease-out"
          style={{ width: `${display}%`, backgroundColor: fill }}
        />
      </div>
    </div>
  );
}

function useScoreTrends(analysis: ContentAnalysisResult, active: boolean) {
  const previousRef = useRef<ContentAnalysisResult | null>(null);

  const trends = useMemo(() => {
    if (!active) return { seo: 0, geo: 0, llm: 0, readability: 0, overall: 0 };
    const prev = previousRef.current;
    if (!prev?.hasInput) return { seo: 0, geo: 0, llm: 0, readability: 0, overall: 0 };
    return {
      seo: analysis.seoScore - prev.seoScore,
      geo: analysis.geoScore - prev.geoScore,
      llm: analysis.llmScore - prev.llmScore,
      readability: analysis.readabilityScore - prev.readabilityScore,
      overall: analysis.overallScore - prev.overallScore,
    };
  }, [analysis, active]);

  useEffect(() => {
    if (active) previousRef.current = analysis;
    else previousRef.current = null;
  }, [analysis, active]);

  return trends;
}

function useFixCelebrations(checks: ContentAnalysisCheck[], active: boolean): FixCelebration[] {
  const prevFailedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const [celebrations, setCelebrations] = useState<FixCelebration[]>([]);

  useEffect(() => {
    if (!active) {
      prevFailedRef.current = new Set();
      seededRef.current = false;
      setCelebrations([]);
      return;
    }

    const failedNow = new Set(checks.filter((c) => !c.passed).map((c) => c.id));

    if (!seededRef.current) {
      prevFailedRef.current = failedNow;
      seededRef.current = true;
      return;
    }

    const prevFailed = prevFailedRef.current;
    const newlyFixed = checks.filter((c) => c.passed && prevFailed.has(c.id));

    if (newlyFixed.length > 0) {
      const next = newlyFixed.map((c) => ({
        id: `${c.id}-${Date.now()}`,
        label: c.label,
        impact: formatCheckImpact(c),
      }));

      setCelebrations((current) => [...next, ...current].slice(0, 3));

      for (const item of next) {
        window.setTimeout(() => {
          setCelebrations((current) => current.filter((c) => c.id !== item.id));
        }, CELEBRATION_MS);
      }
    }

    prevFailedRef.current = failedNow;
  }, [checks, active]);

  return celebrations;
}

export function BlogContentAnalysisPanel({
  title,
  keywords,
  metaDescription,
  contentHtml,
  permalink = "",
  author = "",
  featuredImageUrl = "",
  className,
}: BlogContentAnalysisPanelProps) {
  const input = useMemo<ContentAnalysisInput>(
    () => ({ title, keywords, metaDescription, contentHtml, permalink, author, featuredImageUrl }),
    [title, keywords, metaDescription, contentHtml, permalink, author, featuredImageUrl],
  );

  const hasInput = hasAnalysisInput(input);
  const analysis = useDebouncedAnalysis(input);
  const active = analysis.hasInput;
  const trends = useScoreTrends(analysis, active);

  const remainingIssues = useMemo(() => analysis.checks.filter((c) => !c.passed), [analysis.checks]);
  const prioritizedIssues = useMemo(() => prioritizeRemainingIssues(analysis.checks), [analysis.checks]);
  const celebrations = useFixCelebrations(analysis.checks, active);

  const statusMessage = !hasInput
    ? "Start writing to unlock live SEO, GEO, LLM, and readability analysis."
    : remainingIssues.length === 0
      ? "All checks passing — strong content."
      : "Improve SEO first, then article content and AI visibility.";

  return (
    <aside className={cn("space-y-3 lg:flex lg:h-full lg:min-h-full lg:flex-col", className)}>
      <Card className="overflow-hidden rounded-2xl border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div className="shrink-0 border-b border-zinc-100 bg-gradient-to-r from-[#1a56db]/5 via-transparent to-violet-500/5 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a56db]/10 text-[#1a56db] dark:bg-[#3b82f6]/15 dark:text-[#3b82f6]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Content Analysis</h2>
              <p className="text-[11px] text-muted-foreground">Live scoring · issues only</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            <OverallGauge score={analysis.overallScore} active={active} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Overall score</p>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <AnimatedNumber
                  value={active ? analysis.overallScore : 0}
                  className={cn("text-xl font-semibold tabular-nums", active ? "text-foreground" : "text-zinc-400")}
                />
                <span className="text-xs text-muted-foreground">/ 100</span>
                {active ? <TrendBadge delta={trends.overall} /> : null}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{statusMessage}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SCORE_LABELS.map(({ key, trendKey, label }) => (
              <ScoreBar
                key={key}
                label={label}
                score={analysis[key]}
                trend={trends[trendKey]}
                active={active}
              />
            ))}
          </div>

          {active ? (
            <>
              <AnalysisSummary
                seo={analysis.seoChecks}
                geo={analysis.geoChecks}
                llm={analysis.llmChecks}
                readability={analysis.readabilityChecks}
              />

              <FixCelebrationToast items={celebrations} />

              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Issues remaining ({prioritizedIssues.totalRemaining})
                </h3>
                <div className="mt-2">
                  <PrioritizedIssuesList groups={prioritizedIssues} />
                </div>
              </div>

              {analysis.suggestions.length > 0 ? (
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Top improvements
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {analysis.suggestions.map((suggestion, index) => (
                      <li
                        key={`${suggestion.label}-${index}`}
                        className="flex gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/40"
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1a56db]/10 text-[9px] font-bold text-[#1a56db]">
                          {index + 1}
                        </span>
                        <div className="min-w-0 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
                          <span className="font-medium text-foreground">{suggestion.label}</span>
                          <span className="ml-1 text-[#1a56db]">({formatSuggestionImpact(suggestion)})</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </Card>
    </aside>
  );
}
