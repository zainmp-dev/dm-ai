"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { requestAiCompletionNotifyPreference } from "@/components/ai-completion-notify-bridge";
import { stashCompetitorView } from "@/lib/competitor-view-cache";
import { primaryRegionLabel } from "@/lib/primary-region";
import { useAiPipelineJobStore } from "@/lib/ai-pipeline-job-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

const COMPETITORS_PAGE_SIZE = 4;
const GAPS_PAGE_SIZE = 6;

function formatStrategyVersionLine(version: number | undefined): string {
  if (version == null) return "";
  return `v${version}`;
}

function PaginationRow({
  page,
  pageCount,
  total,
  pageSize,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f3f4f6] pt-3">
      <p className="text-[11.5px] tabular-nums text-[#9ca3af]">
        {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:bg-[#f5f7fa] disabled:opacity-40"
          disabled={page <= 0}
          onClick={onPrev}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="min-w-[3.5rem] text-center text-[11.5px] tabular-nums text-[#6b7280]">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:bg-[#f5f7fa] disabled:opacity-40"
          disabled={page >= pageCount - 1}
          onClick={onNext}
          aria-label="Next page"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function StrategyPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const generateStrategy = useWorkspaceStore((s) => s.generateStrategy);
  const loading = useAiPipelineJobStore((s) => s.strategyRunning);
  const { push } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");

  // Global filter at page top
  const [globalSearch, setGlobalSearch] = useState("");

  // Competitor pagination + search
  const [competitorPage, setCompetitorPage] = useState(0);
  const [competitorSearch, setCompetitorSearch] = useState("");

  // Gaps pagination
  const [gapsPage, setGapsPage] = useState(0);

  useEffect(() => {
    if (!workspace?.companyName) return;
    startTransition(() => {
      setCompanyName((prev) => (prev.trim() ? prev : workspace.companyName));
      setWebsite((prev) => (prev.trim() ? prev : workspace.companyWebsite));
    });
  }, [workspace?.companyName, workspace?.companyWebsite]);

  const runAnalysis = async () => {
    try {
      const notify = await requestAiCompletionNotifyPreference("strategy");
      await generateStrategy(companyName || workspace?.companyName || "", website || workspace?.companyWebsite || "", {
        completionNotify: notify,
      });
      push("Agent 1 finished: strategy and competitors updated.");
    } catch {
      push("Strategy run failed. Check AI keys and try again.");
    }
  };

  const runRegenerateFromWorkspace = async () => {
    if (!workspace?.companyName?.trim()) {
      push("Add a company name in workspace setup or the fields below first.");
      return;
    }
    try {
      const notify = await requestAiCompletionNotifyPreference("strategy");
      await generateStrategy(workspace.companyName, workspace.companyWebsite, { completionNotify: notify });
      push("Agent 1 (strategy) regenerated with latest workspace settings.");
    } catch {
      push("Strategy run failed. Check AI keys and try again.");
    }
  };

  const competitorRows = useMemo(() => workspace?.competitors ?? [], [workspace?.competitors]);

  const strategyResearchMetaLine = useMemo(
    () => formatStrategyVersionLine(workspace?.strategyVersion),
    [workspace?.strategyVersion],
  );

  // Combined filter: globalSearch OR competitorSearch
  const filteredCompetitors = useMemo(() => {
    const q = (globalSearch || competitorSearch).trim().toLowerCase();
    if (!q) return competitorRows;
    return competitorRows.filter((item) => {
      const blob = [
        item.name,
        item.domain,
        item.positioning,
        item.marketRank,
        item.marketGap,
        item.marketingPurpose,
        ...item.strengths,
        ...item.weaknesses,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [competitorRows, competitorSearch, globalSearch]);

  const competitorPageCount = Math.max(1, Math.ceil(filteredCompetitors.length / COMPETITORS_PAGE_SIZE));
  const safeCompetitorPage = Math.min(competitorPage, competitorPageCount - 1);
  const competitorSlice = useMemo(
    () => filteredCompetitors.slice(safeCompetitorPage * COMPETITORS_PAGE_SIZE, (safeCompetitorPage + 1) * COMPETITORS_PAGE_SIZE),
    [filteredCompetitors, safeCompetitorPage],
  );

  const marketGaps = useMemo(() => workspace?.strategy?.marketGaps ?? [], [workspace?.strategy?.marketGaps]);

  // Filter market gaps with global search
  const filteredGaps = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return marketGaps;
    return marketGaps.filter((g) => g.toLowerCase().includes(q));
  }, [marketGaps, globalSearch]);

  const gapsPageCount = Math.max(1, Math.ceil(filteredGaps.length / GAPS_PAGE_SIZE));
  const safeGapsPage = Math.min(gapsPage, gapsPageCount - 1);
  const gapsSlice = useMemo(
    () => filteredGaps.slice(safeGapsPage * GAPS_PAGE_SIZE, (safeGapsPage + 1) * GAPS_PAGE_SIZE),
    [filteredGaps, safeGapsPage],
  );

  // Filter strategy themes/platforms with global search
  const strategy = workspace?.strategy;
  const filteredThemes = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q || !strategy?.contentThemes) return strategy?.contentThemes ?? [];
    return strategy.contentThemes.filter((t) => t.toLowerCase().includes(q));
  }, [strategy?.contentThemes, globalSearch]);

  const filteredPlatforms = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q || !strategy?.platformFocus) return strategy?.platformFocus ?? [];
    return strategy.platformFocus.filter((p) => p.toLowerCase().includes(q));
  }, [strategy?.platformFocus, globalSearch]);

  const hasGlobalSearch = globalSearch.trim().length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* ── Top filter bar ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111827]">Strategy & Research</h2>
          {strategyResearchMetaLine && (
            <p className="mt-0.5 text-[11.5px] tabular-nums text-[#9ca3af]">{strategyResearchMetaLine}</p>
          )}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#9ca3af]" />
          <Input
            value={globalSearch}
            onChange={(e) => {
              setGlobalSearch(e.target.value);
              startTransition(() => {
                setCompetitorPage(0);
                setGapsPage(0);
              });
            }}
            placeholder="Filter all strategy output…"
            className="h-9 rounded-lg pl-8 pr-8 text-[13px] shadow-none"
          />
          {hasGlobalSearch && (
            <button
              type="button"
              onClick={() => {
                setGlobalSearch("");
                startTransition(() => {
                  setCompetitorPage(0);
                  setGapsPage(0);
                });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] transition-colors hover:text-[#374151]"
              aria-label="Clear filter"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Two-column layout ──────────────────────────────────────── */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[300px_1fr]">
        {/* Left: controls */}
        <div className="flex flex-col gap-4">
          <Card className="rounded-2xl border-violet-200 bg-violet-50/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-[13.5px]">Regenerate strategy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px] text-[#374151]">
              <p>
                Re-run <span className="font-medium">Agent 1</span> when your company, site, or market changes—or on a{" "}
                <span className="font-medium">weekly</span> cadence.
              </p>
              <p className="text-[11.5px] text-[#9ca3af]">
                Uses saved workspace: company, website, industry, and primary region (
                {workspace ? primaryRegionLabel(workspace.primaryRegion) : "—"}).
              </p>
              <Button
                type="button"
                className="w-full rounded-xl text-[13px]"
                disabled={loading || !workspace?.companyName?.trim()}
                onClick={() => void runRegenerateFromWorkspace()}
              >
                {loading ? "Running Agent 1…" : "Regenerate from workspace"}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-[#e5e7eb] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-[13.5px]">Override inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="co" className="text-[12.5px]">
                  Company name
                </Label>
                <Input
                  id="co"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="From workspace or type here"
                  className="rounded-lg text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="web" className="text-[12.5px]">
                  Website
                </Label>
                <Input
                  id="web"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="rounded-lg text-[13px]"
                />
              </div>
              <Button
                type="button"
                className="w-full rounded-xl text-[13px]"
                disabled={loading}
                onClick={() => void runAnalysis()}
              >
                {loading ? "Analyzing…" : "Run with fields above"}
              </Button>
              <p className="rounded-xl border border-[#f3f4f6] bg-[#fafafa] px-3 py-2.5 text-[11.5px] text-[#9ca3af]">
                Leave overrides empty to use current workspace values.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: output */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* ── Competitors ─────────────────────────────────────────── */}
          <Card id="strategy-competitors" className="scroll-mt-24 rounded-2xl border-[#e5e7eb] shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-[13.5px]">Competitors</CardTitle>
                {competitorRows.length > 0 && (
                  <span className="text-[11.5px] tabular-nums text-[#9ca3af]">{competitorRows.length} total</span>
                )}
              </div>
              <p className="text-[11.5px] text-[#9ca3af]">
                Regenerating strategy replaces this list with the latest research.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Competitor-level search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#9ca3af]" />
                <Input
                  id="strategy-comp-search"
                  value={competitorSearch}
                  onChange={(e) => {
                    setCompetitorSearch(e.target.value);
                    setCompetitorPage(0);
                  }}
                  placeholder="Filter by name, domain, positioning…"
                  className="h-8 rounded-lg pl-8 text-[12.5px] shadow-none"
                />
                {competitorSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setCompetitorSearch("");
                      setCompetitorPage(0);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {/* Loading skeletons */}
              {loading && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-40 rounded-xl" />
                  ))}
                </div>
              )}

              {/* Empty states */}
              {!loading && competitorRows.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-[#fafafa] py-10 text-center">
                  <p className="text-[13px] text-[#9ca3af]">Run Agent 1 to populate competitor cards.</p>
                </div>
              )}
              {!loading && competitorRows.length > 0 && filteredCompetitors.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-[#fafafa] py-10 text-center">
                  <p className="text-[13px] text-[#9ca3af]">No competitors match that search.</p>
                </div>
              )}

              {/* Competitor grid */}
              {!loading && filteredCompetitors.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {competitorSlice.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13.5px] font-semibold text-[#111827] leading-snug">{item.name}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 rounded-lg border-[#e5e7eb] px-2.5 text-[11.5px]"
                          asChild
                        >
                          <Link
                            href={`/competitors/${encodeURIComponent(item.id)}`}
                            onClick={() =>
                              stashCompetitorView({
                                id: item.id,
                                name: item.name,
                                website: item.domain
                                  ? item.domain.startsWith("http")
                                    ? item.domain
                                    : `https://${item.domain.replace(/^https?:\/\//i, "").split("/")[0]}`
                                  : "",
                                domain: item.domain,
                                positioning: item.positioning,
                                marketRank: item.marketRank,
                                marketGap: item.marketGap,
                                marketingPurpose: item.marketingPurpose,
                                strengths: item.strengths,
                                weaknesses: item.weaknesses,
                                source: "Generated",
                              })
                            }
                          >
                            Showcase
                          </Link>
                        </Button>
                      </div>
                      {item.positioning && (
                        <p className="text-[12.5px] leading-relaxed text-[#4b5563]">{item.positioning}</p>
                      )}
                      <div className="mt-auto space-y-1 border-t border-[#f3f4f6] pt-2">
                        {item.domain && (
                          <p className="text-[11.5px] text-[#6b7280]">
                            <span className="font-medium text-[#374151]">Domain:</span> {item.domain}
                          </p>
                        )}
                        {item.marketRank && (
                          <p className="text-[11.5px] text-[#6b7280]">
                            <span className="font-medium text-[#374151]">Rank:</span> {item.marketRank}
                          </p>
                        )}
                        {item.marketGap && (
                          <p className="text-[11.5px] text-[#6b7280]">
                            <span className="font-medium text-[#374151]">Gap:</span> {item.marketGap}
                          </p>
                        )}
                        {item.marketingPurpose && (
                          <p className="text-[11.5px] text-[#6b7280]">
                            <span className="font-medium text-[#374151]">Purpose:</span> {item.marketingPurpose}
                          </p>
                        )}
                        {item.strengths.length > 0 && (
                          <p className="text-[11.5px] text-[#6b7280]">
                            <span className="font-medium text-[#374151]">Strengths:</span> {item.strengths.join(", ")}
                          </p>
                        )}
                        {item.weaknesses.length > 0 && (
                          <p className="text-[11.5px] text-[#6b7280]">
                            <span className="font-medium text-[#374151]">Weaknesses:</span> {item.weaknesses.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Competitor pagination */}
              <PaginationRow
                page={safeCompetitorPage}
                pageCount={competitorPageCount}
                total={filteredCompetitors.length}
                pageSize={COMPETITORS_PAGE_SIZE}
                onPrev={() => setCompetitorPage((p) => Math.max(0, p - 1))}
                onNext={() => setCompetitorPage((p) => Math.min(competitorPageCount - 1, p + 1))}
              />
            </CardContent>
          </Card>

          {/* ── Strategy plan ────────────────────────────────────────── */}
          <Card className="rounded-2xl border-[#e5e7eb] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-[13.5px]">Strategy plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {loading && <Skeleton className="h-44 rounded-xl" />}

              {!loading && !strategy && (
                <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-[#fafafa] py-10 text-center">
                  <p className="text-[13px] text-[#9ca3af]">Regenerate strategy (Agent 1) to populate this section.</p>
                </div>
              )}

              {!loading && strategy && (
                <>
                  {/* Target audience */}
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-4">
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[#9ca3af]">Target audience</p>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#374151]">{strategy.targetAudience}</p>
                  </div>

                  {/* Content themes */}
                  <div>
                    <p className="mb-2 text-[12px] font-semibold text-[#374151]">Content themes</p>
                    {filteredThemes.length === 0 ? (
                      <p className="text-[12.5px] text-[#9ca3af]">No themes match that filter.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {filteredThemes.map((theme, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-lg bg-[#f0f4ff] px-2.5 py-1 text-[12px] font-medium text-[#1a56db]"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Platform focus */}
                  <div>
                    <p className="mb-2 text-[12px] font-semibold text-[#374151]">Platform focus</p>
                    {filteredPlatforms.length === 0 ? (
                      <p className="text-[12.5px] text-[#9ca3af]">No platforms match that filter.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {filteredPlatforms.map((plat, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-lg bg-[#f0fdf4] px-2.5 py-1 text-[12px] font-medium text-[#047857]"
                          >
                            {plat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Market gaps */}
                  <div id="strategy-market-gaps" className="scroll-mt-24">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-[#374151]">Market gaps</p>
                      {filteredGaps.length > 0 && (
                        <span className="text-[11.5px] tabular-nums text-[#9ca3af]">{filteredGaps.length} total</span>
                      )}
                    </div>

                    {filteredGaps.length === 0 ? (
                      <p className="text-[12.5px] text-[#9ca3af]">
                        {marketGaps.length === 0 ? "—" : "No gaps match that filter."}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {gapsSlice.map((gap, i) => (
                          <li
                            key={`g-${safeGapsPage}-${i}`}
                            className="flex gap-2.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-[#374151]"
                          >
                            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[#f0f4ff] text-[10px] font-semibold text-[#1a56db]">
                              {safeGapsPage * GAPS_PAGE_SIZE + i + 1}
                            </span>
                            {gap}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Market gaps pagination */}
                    <PaginationRow
                      page={safeGapsPage}
                      pageCount={gapsPageCount}
                      total={filteredGaps.length}
                      pageSize={GAPS_PAGE_SIZE}
                      onPrev={() => setGapsPage((p) => Math.max(0, p - 1))}
                      onNext={() => setGapsPage((p) => Math.min(gapsPageCount - 1, p + 1))}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
