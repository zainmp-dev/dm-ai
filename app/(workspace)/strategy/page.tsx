"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { primaryRegionLabel } from "@/lib/primary-region";
import { useWorkspaceStore } from "@/lib/workspace-store";

export default function StrategyPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const generateStrategy = useWorkspaceStore((s) => s.generateStrategy);
  const { push } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);

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
      push("Set company name in Workspace setup first.");
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
            <Button type="button" className="w-full rounded-2xl" disabled={loading || !workspace?.workspaceConfigured} onClick={() => void runRegenerateFromWorkspace()}>
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
          <CardHeader>
            <CardTitle className="text-base">Competitors</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {loading &&
              Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}
            {!loading &&
              (workspace?.competitors.length ? (
                workspace.competitors.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="font-medium text-zinc-900">{item.name}</p>
                    <p className="mt-1 text-sm text-zinc-600">{item.positioning}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Strengths:</span> {item.strengths.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Weaknesses:</span> {item.weaknesses.join(", ")}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500 md:col-span-2">Run Agent 1 to load competitor cards.</p>
              ))}
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
                <p>
                  <span className="font-medium text-zinc-900">Market gaps:</span> {workspace.strategy.marketGaps.join(" ")}
                </p>
              </>
            )}
            {!loading && !workspace?.strategy && <p className="text-zinc-500">Regenerate strategy (Agent 1) to populate this section.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
