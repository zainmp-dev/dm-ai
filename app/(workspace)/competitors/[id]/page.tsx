"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { readCompetitorView } from "@/lib/competitor-view-cache";
import { primaryRegionLabel } from "@/lib/primary-region";
import { effectiveContentTimeZone, formatInstantInZone } from "@/lib/workspace-datetime";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";

export default function CompetitorResearchDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? decodeURIComponent(rawId) : Array.isArray(rawId) ? decodeURIComponent(rawId[0]) : "";
  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const contentTimeZone = useMemo(
    () => effectiveContentTimeZone(workspace?.profile?.timezone, workspace?.primaryRegion),
    [workspace?.profile?.timezone, workspace?.primaryRegion],
  );

  const merged = useMemo(() => {
    if (!id) return null;
    const cached = readCompetitorView(id);
    const fromWs = workspace?.competitors.find((c) => c.id === id);
    if (!cached && !fromWs) return null;
    const name = fromWs?.name ?? cached?.name ?? "Competitor";
    const positioning = fromWs?.positioning ?? cached?.positioning ?? "";
    const strengths = fromWs?.strengths?.length ? fromWs.strengths : cached?.strengths ?? [];
    const weaknesses = fromWs?.weaknesses?.length ? fromWs.weaknesses : cached?.weaknesses ?? [];
    const domain = (fromWs?.domain || cached?.domain || "").trim();
    const website = (cached?.website || "").trim();
    const marketRank = (fromWs?.marketRank || cached?.marketRank || "").trim();
    const marketGap = (fromWs?.marketGap || cached?.marketGap || "").trim();
    const marketingPurpose = (fromWs?.marketingPurpose || cached?.marketingPurpose || "").trim();
    const source = cached?.source ?? (fromWs ? "Generated" : "Setup");
    const viewedAt = cached?.viewedAt ?? null;
    const linkTarget = website || domain;
    return {
      name,
      positioning,
      strengths,
      weaknesses,
      domain,
      website,
      marketRank,
      marketGap,
      marketingPurpose,
      source,
      viewedAt,
      linkTarget,
    };
  }, [id, workspace]);

  if (shellPending) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  if (!id || !merged) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <p className="text-sm text-zinc-600">This competitor profile was not found. It may have been removed after a strategy refresh.</p>
        <Button type="button" variant="outline" className="rounded-xl" asChild>
          <Link href="/pipeline?tab=command">
            <ArrowLeft className="mr-2 size-4" />
            Back to Command Center
          </Link>
        </Button>
      </div>
    );
  }

  const strategy = workspace.strategy;
  const viewedLabel = merged.viewedAt ? formatInstantInZone(merged.viewedAt, contentTimeZone) : null;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" className="rounded-xl pl-0 text-zinc-700 hover:bg-transparent" asChild>
          <Link href="/pipeline?tab=command" className="inline-flex items-center gap-2">
            <ArrowLeft className="size-4" />
            Command Center
          </Link>
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" asChild>
          <Link href="/strategy">Strategy overview</Link>
        </Button>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-gradient-to-br from-white via-zinc-50/80 to-violet-50/40 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-950 dark:to-violet-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Competitor research showcase</p>
            <p className="text-xs text-zinc-500">
              <span className="font-medium text-zinc-700">Company name</span> · how they show up in-market
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{merged.name}</h2>
            {merged.domain ? (
              <p className="text-sm text-zinc-600">
                <span className="font-medium text-zinc-800">Domain:</span> {merged.domain}
              </p>
            ) : null}
            {merged.linkTarget ? (
              <a
                href={merged.linkTarget.startsWith("http") ? merged.linkTarget : `https://${merged.linkTarget}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 underline-offset-4 hover:underline dark:text-blue-400"
              >
                Visit site
                <ExternalLink className="size-3.5 opacity-70" />
              </a>
            ) : null}
          </div>
          <Badge className={merged.source === "Setup" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}>{merged.source}</Badge>
        </div>
        {viewedLabel ? (
          <p className="mt-4 text-xs text-zinc-500">Profile opened: {viewedLabel}</p>
        ) : (
          <p className="mt-4 text-xs text-zinc-500">Open this profile from Command Center to record a view time.</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current market rank</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-zinc-700">
              {merged.marketRank || "Run Agent 1 to generate a qualitative rank for this region and category."}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Marketing purpose</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-zinc-700">
              {merged.marketingPurpose || "Their apparent GTM goal will appear here after the next strategy run."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-amber-200/80 bg-amber-50/30 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/15">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Market gap (vs your brand)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-zinc-800">
            {merged.marketGap || "No competitor-specific gap captured yet — weaknesses below are a starting point."}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Positioning</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-zinc-700">{merged.positioning || "No positioning summary yet."}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Strengths</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-zinc-700">
              {merged.strengths.length ? merged.strengths.map((s, i) => <li key={`${i}-${s}`}>{s}</li>) : <li className="list-none text-zinc-500">—</li>}
            </ul>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Weaknesses / gaps</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-zinc-700">
              {merged.weaknesses.length ? merged.weaknesses.map((w, i) => <li key={`${i}-${w}`}>{w}</li>) : <li className="list-none text-zinc-500">—</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-violet-200 bg-violet-50/40 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/20">
        <CardHeader>
          <CardTitle className="text-base">Workspace context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-700">
          <p>
            <span className="font-medium text-zinc-900">Company:</span> {workspace.companyName || "—"}
          </p>
          <p>
            <span className="font-medium text-zinc-900">Region:</span> {primaryRegionLabel(workspace.primaryRegion)}
          </p>
          {strategy ? (
            <>
              <p>
                <span className="font-medium text-zinc-900">Market gaps (strategy):</span> {strategy.marketGaps.join(" · ")}
              </p>
              <p>
                <span className="font-medium text-zinc-900">Content themes:</span> {strategy.contentThemes.join(", ")}
              </p>
            </>
          ) : (
            <p className="text-zinc-500">Run Agent 1 in Strategy or Command Center to attach market gaps and themes.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
