"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { stashCompetitorView } from "@/lib/competitor-view-cache";
import { primaryRegionLabel } from "@/lib/primary-region";
import { useWorkspaceStore } from "@/lib/workspace-store";

const COMPETITORS_PAGE_SIZE = 4;
const GAPS_PAGE_SIZE = 5;

function formatStrategySaved(iso: string | undefined, version: number | undefined): string {
  let t = "";
  if (iso?.trim()) {
    try {
      const d = parseISO(String(iso));
      if (!Number.isNaN(d.getTime())) t = format(d, "MMM d, yyyy · h:mm a");
    } catch {
      // ignore
    }
  }
  if (!t && version == null) return "";
  const parts: string[] = [];
  if (t) parts.push(`Research saved · ${t}`);
  if (version != null) parts.push(`v${version}`);
  return parts.join(" · ");
}

export default function StrategyPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const generateStrategy = useWorkspaceStore((s) => s.generateStrategy);
  const { push } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [competitorPage, setCompetitorPage] = useState(0);
  const [competitorSearch, setCompetitorSearch] = useState("");
  const [gapsPage, setGapsPage] = useState(0);

  useEffect(() => {
    if (!workspace?.companyName) return;
    setCompanyName((prev) => (prev.trim() ? prev : workspace.companyName));
    setWebsite((prev) => (prev.trim() ? prev : workspace.companyWebsite));
  }, [workspace?.companyName, workspace?.companyWebsite]);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      await generateStrategy(companyName || workspace?.companyName || "", website || workspace?.companyWebsite || "");
      push("Agent 1 finished: strategy and competitors updated for your latest company and region.");
    } catch {
      push("Strategy run failed. Check AI keys and try again.");
    } finally {
      setLoading(false);
    }
  };

  const runRegenerateFromWorkspace = async () => {
    if (!workspace?.companyName?.trim()) {
      push("Add a company name in your profile, workspace, or the fields on this page first.");
      return;
    }
    setLoading(true);
    try {
      await generateStrategy(workspace.companyName, workspace.companyWebsite);
      push("Agent 1 (strategy) regenerated with latest saved company, website, and region.");
    } catch {
      push("Strategy run failed. Check AI keys and try again.");
    } finally {
      setLoading(false);
    }
  };

  const competitorRows = workspace?.competitors ?? [];

  const strategyResearchMetaLine = useMemo(
    () => formatStrategySaved(workspace?.strategyUpdatedAt, workspace?.strategyVersion),
    [workspace?.strategyUpdatedAt, workspace?.strategyVersion],
  );

  const filteredCompetitors = useMemo(() => {
    const q = competitorSearch.trim().toLowerCase();
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
  }, [competitorRows, competitorSearch]);

  const competitorPageCount = Math.max(1, Math.ceil(filteredCompetitors.length / COMPETITORS_PAGE_SIZE) || 1);
  const safeCompetitorPage = Math.min(competitorPage, competitorPageCount - 1);

  const competitorSlice = useMemo(
    () =>
      filteredCompetitors.slice(
        safeCompetitorPage * COMPETITORS_PAGE_SIZE,
        safeCompetitorPage * COMPETITORS_PAGE_SIZE + COMPETITORS_PAGE_SIZE,
      ),
    [filteredCompetitors, safeCompetitorPage],
  );

  useEffect(() => {
    setCompetitorPage((p) => Math.min(p, Math.max(0, competitorPageCount - 1)));
  }, [competitorPageCount, filteredCompetitors.length]);

  const marketGaps = workspace?.strategy?.marketGaps ?? [];
  const gapsPageCount = Math.max(1, Math.ceil(marketGaps.length / GAPS_PAGE_SIZE) || 1);
  const safeGapsPage = Math.min(gapsPage, gapsPageCount - 1);
  const gapsSlice = useMemo(
    () => marketGaps.slice(safeGapsPage * GAPS_PAGE_SIZE, (safeGapsPage + 1) * GAPS_PAGE_SIZE),
    [marketGaps, safeGapsPage],
  );

  useEffect(() => {
    setGapsPage((p) => Math.min(p, Math.max(0, gapsPageCount - 1)));
  }, [marketGaps.length, gapsPageCount]);

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card className="rounded-2xl border-violet-200 bg-violet-50/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">1 — Regenerate strategy (Agent 1)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-700">
            <p>
              Re-run the <span className="font-medium">first agent</span> anytime your company, site, or market changes, or on a <span className="font-medium">weekly</span> cadence so research stays
              fresh.
            </p>
            <p className="text-xs text-zinc-500">
              Uses saved workspace: company, website, industry scenario, and primary region (
              {workspace ? primaryRegionLabel(workspace.primaryRegion) : "—"}). Does not delete your content drafts unless you run full calendar regen in Command center.
            </p>
            <Button
              type="button"
              className="w-full rounded-2xl"
              disabled={loading || !workspace?.companyName?.trim()}
              onClick={() => void runRegenerateFromWorkspace()}
            >
              {loading ? "Running Agent 1…" : "Regenerate from workspace (recommended)"}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Override inputs (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="co">Company name</Label>
              <Input id="co" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="From workspace or type here" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="web">Website</Label>
              <Input id="web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" className="rounded-xl" />
            </div>
            <Button type="button" className="w-full rounded-2xl" disabled={loading} onClick={() => void runAnalysis()}>
              {loading ? "Analyzing…" : "Run with fields above"}
            </Button>
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4 text-sm text-zinc-600">
              If you leave overrides empty, the button still sends your current workspace values from the store after load.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Competitors</CardTitle>
            {strategyResearchMetaLine ? (
              <p className="text-xs font-medium tabular-nums leading-snug text-zinc-500">{strategyResearchMetaLine}</p>
            ) : null}
            <p className="text-xs text-zinc-500">
              Regenerating strategy replaces this list with the latest research. Open a card’s showcase to keep a readable snapshot.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="strategy-comp-search" className="text-xs text-zinc-600">
                Search
              </Label>
              <Input
                id="strategy-comp-search"
                value={competitorSearch}
                onChange={(e) => {
                  setCompetitorSearch(e.target.value);
                  setCompetitorPage(0);
                }}
                placeholder="Filter by name, domain, positioning, strengths…"
                className="rounded-xl"
              />
            </div>
            {loading &&
              Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}
            {!loading && competitorRows.length === 0 && (
              <p className="text-sm text-zinc-500 md:col-span-2">Run Agent 1 to load competitor cards.</p>
            )}
            {!loading && competitorRows.length > 0 && filteredCompetitors.length === 0 && (
              <p className="text-sm text-zinc-500 md:col-span-2">No matches for that search.</p>
            )}
            {!loading &&
              filteredCompetitors.length > 0 &&
              competitorSlice.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-zinc-900">{item.name}</p>
                      <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 rounded-lg text-xs" asChild>
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
                          View showcase
                        </Link>
                      </Button>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">{item.positioning}</p>
                    {item.domain ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-700">Domain:</span> {item.domain}
                      </p>
                    ) : null}
                    {item.marketRank ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-700">Rank:</span> {item.marketRank}
                      </p>
                    ) : null}
                    {item.marketGap ? (
                      <p className="mt-2 text-xs text-zinc-600">
                        <span className="font-medium text-zinc-800">Gap:</span> {item.marketGap}
                      </p>
                    ) : null}
                    {item.marketingPurpose ? (
                      <p className="mt-1 text-xs text-zinc-600">
                        <span className="font-medium text-zinc-800">Marketing purpose:</span> {item.marketingPurpose}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Strengths:</span> {item.strengths.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Weaknesses:</span> {item.weaknesses.join(", ")}
                    </p>
                  </div>
                ))}
            {!loading && filteredCompetitors.length > COMPETITORS_PAGE_SIZE ? (
              <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row sm:items-center sm:justify-between md:col-span-2">
                <p className="text-xs tabular-nums text-zinc-500">
                  Showing {safeCompetitorPage * COMPETITORS_PAGE_SIZE + 1}–
                  {Math.min((safeCompetitorPage + 1) * COMPETITORS_PAGE_SIZE, filteredCompetitors.length)} of{" "}
                  {filteredCompetitors.length}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    disabled={safeCompetitorPage <= 0}
                    onClick={() => setCompetitorPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs tabular-nums text-zinc-500">
                    Page {safeCompetitorPage + 1} / {competitorPageCount}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    disabled={safeCompetitorPage >= competitorPageCount - 1}
                    onClick={() => setCompetitorPage((p) => Math.min(competitorPageCount - 1, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Strategy plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-700">
            {loading && <Skeleton className="h-36 rounded-2xl" />}
            {!loading && workspace?.strategy && (
              <>
                <p>
                  <span className="font-medium text-zinc-900">Target audience:</span> {workspace.strategy.targetAudience}
                </p>
                <p>
                  <span className="font-medium text-zinc-900">Content themes:</span> {workspace.strategy.contentThemes.join(", ")}
                </p>
                <p>
                  <span className="font-medium text-zinc-900">Platform focus:</span> {workspace.strategy.platformFocus.join(", ")}
                </p>
                <div>
                  <p className="font-medium text-zinc-900">Market gaps</p>
                  {marketGaps.length === 0 ? (
                    <p className="mt-1 text-zinc-600">—</p>
                  ) : (
                    <ul className="mt-1 list-inside list-disc space-y-1 pl-0 text-zinc-700">
                      {gapsSlice.map((gap, i) => (
                        <li key={`g-${safeGapsPage}-${i}`}>{gap}</li>
                      ))}
                    </ul>
                  )}
                  {marketGaps.length > GAPS_PAGE_SIZE ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-zinc-500">
                        Gaps {safeGapsPage * GAPS_PAGE_SIZE + 1}–{Math.min((safeGapsPage + 1) * GAPS_PAGE_SIZE, marketGaps.length)} of {marketGaps.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg text-xs"
                          disabled={safeGapsPage <= 0}
                          onClick={() => setGapsPage((p) => Math.max(0, p - 1))}
                        >
                          Previous
                        </Button>
                        <span className="text-xs tabular-nums text-zinc-500">
                          {safeGapsPage + 1} / {gapsPageCount}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg text-xs"
                          disabled={safeGapsPage >= gapsPageCount - 1}
                          onClick={() => setGapsPage((p) => Math.min(gapsPageCount - 1, p + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )}
            {!loading && !workspace?.strategy && <p className="text-zinc-500">Regenerate strategy (Agent 1) to populate this section.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
