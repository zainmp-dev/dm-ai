"use client";

import { addDays, format, startOfWeek } from "date-fns";
import Link from "next/link";
import { AlertCircle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FacebookPostPreview } from "@/components/previews/facebook-post-preview";
import { InstagramPostPreview } from "@/components/previews/instagram-post-preview";
import { LinkedInPostPreview } from "@/components/previews/linkedin-post-preview";
import { TwitterPostPreview } from "@/components/previews/twitter-post-preview";
import { PlatformSelectDialog } from "@/components/platform-select-dialog";
import { ContentStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { isPlatformConnected, platformLabel } from "@/lib/platform";
import { MediaPreviewBlock } from "@/components/media-preview-block";
import { primaryRegionLabel } from "@/lib/primary-region";
import type { ContentItem, PublishingPlatform, WorkspaceSnapshot } from "@/lib/types";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";

type CompetitorDraft = {
  id: string;
  name: string;
  website: string;
  focus: string;
};

type SpreadsheetCell = string | number | boolean | Date | DateConstructor | null | undefined;

function createCompetitorDraft(): CompetitorDraft {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "",
    website: "",
    focus: "",
  };
}

function parseDelimitedRow(row: string) {
  const cells: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const next = row[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if ((char === "," || char === "\t") && !insideQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeCompetitorRows(rows: SpreadsheetCell[][]): CompetitorDraft[] {
  const cleanedRows = rows
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some(Boolean));
  if (cleanedRows.length === 0) return [];

  const hasHeader = /competitor|company|name|website|url|focus|gap/i.test(cleanedRows[0].join(" "));
  const dataRows = hasHeader ? cleanedRows.slice(1) : cleanedRows;

  return dataRows
    .map(([name = "", website = "", focus = ""]) => ({
      id: createCompetitorDraft().id,
      name,
      website,
      focus,
    }))
    .filter((row) => row.name || row.website || row.focus);
}

function parseCompetitorFile(text: string): CompetitorDraft[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  return normalizeCompetitorRows(lines.map(parseDelimitedRow));
}

function PlatformBadge({ platform }: { platform: PublishingPlatform | null }) {
  if (!platform) {
    return <span className="text-xs text-zinc-400">No platform</span>;
  }
  return <Badge className="rounded-lg bg-zinc-100 font-normal text-zinc-700">{platformLabel(platform)}</Badge>;
}

function AiProcessingBannerIcon() {
  return (
    <div
      className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-200/90 bg-gradient-to-br from-white/80 to-blue-50/50 shadow-inner"
      style={{ animation: "cc-ai-glow 2.2s ease-in-out infinite" }}
    >
      <div
        className="absolute inset-[-40%] rounded-full opacity-50"
        style={{
          background: "conic-gradient(from 0deg, rgba(59,130,246,0.15), rgba(6,182,212,0.45), rgba(99,102,241,0.35), rgba(59,130,246,0.15))",
          animation: "cc-ai-spin 3.2s linear infinite",
        }}
      />
      <div
        className="absolute inset-[-20%] rounded-full opacity-35 blur-[1px]"
        style={{
          background: "conic-gradient(from 90deg, transparent, rgba(37, 99, 235, 0.5), transparent 40%)",
          animation: "cc-ai-spin 2.2s linear infinite reverse",
        }}
      />
      <Sparkles className="relative z-10 h-7 w-7 text-blue-600" strokeWidth={1.5} aria-hidden />
      <div className="absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-300/50"
            style={{
              animation: "cc-ai-wave 0.9s ease-in-out infinite",
              animationDelay: `${i * 0.12}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function AiOutputMissingIcon() {
  return (
    <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl border border-amber-200/80 bg-amber-50/90 shadow-inner">
      <AlertCircle className="h-8 w-8 text-amber-700" strokeWidth={1.75} aria-hidden />
    </div>
  );
}

export function CommandCenterView() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const generateStrategy = useWorkspaceStore((s) => s.generateStrategy);
  const generateContent = useWorkspaceStore((s) => s.generateContent);
  const approve = useWorkspaceStore((s) => s.approve);
  const reject = useWorkspaceStore((s) => s.reject);
  const publish = useWorkspaceStore((s) => s.publish);
  const { push } = useToast();

  const [competitorName, setCompetitorName] = useState("");
  const [competitorWebsite, setCompetitorWebsite] = useState("");
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [calendarDays, setCalendarDays] = useState(14);
  const [platformTargetId, setPlatformTargetId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<PublishingPlatform>("linkedin");
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [publishLoading, setPublishLoading] = useState(false);
  const [competitorDrafts, setCompetitorDrafts] = useState<CompetitorDraft[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const bootstrapStartedRef = useRef(false);

  const updateContentItem = useWorkspaceStore((s) => s.updateContentItem);

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

  const researchCompetitors = useMemo(() => {
    const marketGaps = workspace?.strategy?.marketGaps ?? [];
    const primaryRows =
      competitorName.trim() || competitorWebsite.trim()
        ? [
            {
              id: "primary-competitor",
              name: competitorName.trim() || competitorWebsite.trim() || "Primary competitor",
              website: competitorWebsite.trim(),
              focus: "Primary competitor research target.",
            },
          ]
        : [];
    const manualRows = [...primaryRows, ...competitorDrafts]
      .filter((draft) => draft.name.trim() || draft.website.trim() || draft.focus.trim())
      .map((draft) => ({
        id: draft.id,
        name: draft.name.trim() || draft.website.trim() || "Unnamed competitor",
        website: draft.website.trim(),
        positioning: draft.focus.trim() || "Manual research target queued from command center setup.",
        strengths: ["Manual benchmark", "Needs validation"],
        weaknesses: marketGaps.length ? marketGaps.slice(0, 2) : ["Gap research pending"],
        source: "Setup",
      }));
    const generatedRows =
      workspace?.competitors.map((competitor) => ({
        ...competitor,
        website: "",
        source: "Generated",
      })) ?? [];
    return [...manualRows, ...generatedRows];
  }, [competitorDrafts, competitorName, competitorWebsite, workspace?.competitors, workspace?.strategy?.marketGaps]);

  const workspaceReady = Boolean(workspace?.workspaceConfigured);
  const aiOutputMissing = Boolean(
    workspaceReady && workspace && !workspace.strategy && workspace.competitors.length === 0 && workspace.content.length === 0,
  );
  const aiProcessing = strategyLoading || contentLoading || bootstrapLoading || loading;

  useEffect(() => {
    if (!aiOutputMissing || bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;
    const runBootstrap = async () => {
      setBootstrapLoading(true);
      try {
        await generateContent(calendarDays);
        push("AI agents finished workspace research and content setup.");
      } catch {
        push("AI setup failed. Check the backend server and run AI setup again.");
      } finally {
        setBootstrapLoading(false);
      }
    };
    void runBootstrap();
  }, [aiOutputMissing, calendarDays, generateContent, push]);

  if (!workspace && loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[420px] rounded-2xl" />
        <Skeleton className="h-[420px] rounded-2xl lg:col-span-1" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-16 text-center text-sm text-zinc-500">Workspace data is unavailable. Use Retry in the header.</CardContent>
      </Card>
    );
  }

  const openPlatformModal = (id: string) => setPlatformTargetId(id);

  const handlePlatformConfirm = (platforms: PublishingPlatform[]) => {
    if (!platformTargetId) return;
    if (!platforms[0]) return;
    void approve(platformTargetId, platforms)
      .then(() => {
        if (platforms.length > 1) {
          push(`Content approved for ${platforms.length} platforms.`);
        } else {
          push(`Content approved for ${platformLabel(platforms[0])}`);
        }
      })
      .catch(() => push("Approval failed"))
      .finally(() => setPlatformTargetId(null));
  };

  const eligibleToPublish = workspace.content.filter(
    (c) =>
      (c.status === "APPROVED" || c.status === "SCHEDULED") &&
      c.selectedPlatform &&
      isPlatformConnected(workspace.integrations, c.selectedPlatform),
  );
  const blocked = workspace.content.filter(
    (c) =>
      (c.status === "APPROVED" || c.status === "SCHEDULED") &&
      (!c.selectedPlatform || !isPlatformConnected(workspace.integrations, c.selectedPlatform)),
  );

  const scheduledList = workspace.content
    .filter((c) => c.scheduledAt && (c.status === "APPROVED" || c.status === "SCHEDULED" || c.status === "PUBLISHED"))
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  const handleCompetitorFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    const isSpreadsheet = /\.(xlsx|xls)$/i.test(file.name);
    const importedRows = isSpreadsheet
      ? await import("read-excel-file/browser").then(async ({ default: readXlsxFile }) => {
          const sheets = await readXlsxFile(file);
          return normalizeCompetitorRows(sheets[0]?.data ?? []);
        })
      : parseCompetitorFile(await file.text());

    if (importedRows.length === 0) {
      push("No competitor rows found in the upload.");
      return;
    }

    setCompetitorDrafts(importedRows);
    push(`Imported ${importedRows.length} competitor row(s)`);
  };

  const runPublish = async () => {
    if (eligibleToPublish.length === 0) {
      push("Nothing ready to publish. Approve items, pick a platform, and connect accounts.");
      return;
    }
    setPublishLoading(true);
    try {
      const result = await publish(eligibleToPublish.map((c) => c.id));
      if (result.warnings.length) {
        result.warnings.slice(0, 3).forEach((w) => push(w));
      }
      push(`Published ${result.published} asset(s)`);
    } catch {
      push("Publish request failed");
    } finally {
      setPublishLoading(false);
    }
  };

  const runStrategy = async () => {
    if (!workspaceReady) {
      push("Complete workspace setup before choosing a model or generating strategy.");
      return;
    }
    const competitorInputs = [...competitorDrafts];
    if (competitorName.trim() || competitorWebsite.trim()) {
      competitorInputs.unshift({
        id: "primary-competitor",
        name: competitorName.trim(),
        website: competitorWebsite.trim(),
        focus: "Manual competitor research target.",
      });
    }
    setStrategyLoading(true);
    try {
      await generateStrategy(
        workspace.companyName,
        workspace.companyWebsite,
        competitorInputs.map(({ name, website: competitorUrl, focus }) => ({
          name,
          website: competitorUrl,
          focus,
        })),
      );
      push("Agent 1 done: strategy and competitors updated for your region and latest inputs.");
    } finally {
      setStrategyLoading(false);
    }
  };

  const runContent = async () => {
    if (!workspaceReady) {
      push("Complete workspace setup before choosing a model or generating content.");
      return;
    }
    setContentLoading(true);
    try {
      await generateContent(calendarDays);
      push("Content library refreshed");
    } finally {
      setContentLoading(false);
    }
  };

  const openEdit = (item: ContentItem) => {
    setEditItem(item);
    setEditTitle(item.title);
    setEditText(item.contentText);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    await updateContentItem({
      contentId: editItem.id,
      title: editTitle,
      contentText: editText,
    });
    setEditItem(null);
    push("Content saved");
  };

  return (
    <div className="space-y-6">
      {(aiProcessing || aiOutputMissing) && (
        <Card
          className={cn(
            "relative overflow-hidden rounded-2xl border shadow-sm transition-shadow duration-500",
            aiProcessing
              ? "border-blue-300/80 bg-gradient-to-r from-blue-50/90 via-sky-50/75 to-indigo-50/60 shadow-md shadow-blue-200/30"
              : "border-amber-200/90 bg-amber-50/40 shadow-sm",
          )}
        >
          {aiProcessing && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-2xl bg-blue-200/30" aria-hidden>
              <div
                className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-blue-400/90 to-transparent"
                style={{ animation: "cc-ai-shimmer-bar 1.8s ease-in-out infinite" }}
              />
            </div>
          )}
          <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {aiProcessing ? <AiProcessingBannerIcon /> : <AiOutputMissingIcon />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900">
                  {aiProcessing ? "AI agents are processing this workspace" : "AI setup output is missing"}
                </p>
                <p className="mt-1.5 text-sm text-zinc-700">
                  {aiProcessing ? (
                    <>
                      Agent 1 is researching the company, website/domain, competitors, positioning, feature gaps, and strategy.{" "}
                      <span className="font-medium text-blue-800">Agent 2</span> is shaping content from that strategy.
                    </>
                  ) : (
                    "Agent 1 is researching the company, website/domain, competitors, positioning, feature gaps, and strategy. Agent 2 creates content from that strategy."
                  )}
                </p>
              </div>
            </div>
            <Button type="button" className="shrink-0 rounded-xl" disabled={aiProcessing} onClick={() => void runContent()}>
              {aiProcessing ? "Working…" : "Run AI setup now"}
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 xl:grid-cols-12">
        {/* Left */}
        <div className="space-y-4 xl:col-span-3">
          <Card className="rounded-2xl border-violet-200 bg-violet-50/30 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Agent 1 — Strategy first</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-700">
              <p className="text-xs text-zinc-600">
                Regenerate the first agent with your <span className="font-medium">latest</span> company, site, and region (
                {primaryRegionLabel(workspace.primaryRegion)}). Recommended weekly; then refresh content (Agent 2) when you need new posts.
              </p>
              <Button
                type="button"
                className="w-full rounded-2xl"
                disabled={strategyLoading || !workspaceReady}
                onClick={() => void runStrategy()}
              >
                {strategyLoading ? "Agent 1 running…" : workspaceReady ? "Regenerate strategy (Agent 1)" : "Set up workspace first"}
              </Button>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-zinc-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Competitor Upload (optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cc-name">Competitor name</Label>
              <Input
                id="cc-name"
                value={competitorName}
                onChange={(e) => setCompetitorName(e.target.value)}
                placeholder="Competitor name"
                className="rounded-xl border-zinc-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-web">Competitor website URL</Label>
              <Input
                id="cc-web"
                value={competitorWebsite}
                onChange={(e) => setCompetitorWebsite(e.target.value)}
                placeholder="https://competitor.com"
                className="rounded-xl border-zinc-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="competitor-upload">Upload competitor Excel / CSV</Label>
              <Input
                id="competitor-upload"
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                className="rounded-xl border-zinc-200"
                onChange={(event) => void handleCompetitorFile(event.target.files)}
              />
            </div>
            <Button type="button" variant="secondary" className="w-full rounded-2xl" disabled={strategyLoading || !workspaceReady} onClick={() => void runStrategy()}>
              {strategyLoading ? "Working…" : workspaceReady ? "Run again with these competitors" : "Set up workspace first"}
            </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-zinc-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Competitor research</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4 text-sm text-zinc-600">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Strategy output</p>
              {workspace.strategy ? (
                <div className="mt-3 space-y-2">
                  <p>
                    <span className="font-medium text-zinc-800">Target audience:</span> {workspace.strategy.targetAudience}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-800">Content themes:</span> {workspace.strategy.contentThemes.join(", ")}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-800">Market gaps:</span> {workspace.strategy.marketGaps.join(" ")}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-zinc-500">Run strategy to populate audience and themes.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Research and gap marking</p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {researchCompetitors.length === 0 && <p className="text-sm text-zinc-500">No competitor cards yet.</p>}
                {researchCompetitors.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm shadow-sm transition hover:border-zinc-300">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">{c.name}</p>
                        {c.website && <p className="truncate text-xs text-zinc-500">{c.website}</p>}
                      </div>
                      <Badge className={c.source === "Setup" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}>{c.source}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">{c.positioning}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Strengths:</span> {c.strengths.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Weaknesses:</span> {c.weaknesses.join(", ")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(workspace.strategy?.marketGaps.length ? workspace.strategy.marketGaps : c.weaknesses).slice(0, 3).map((gap, index) => (
                        <Badge key={`${c.id}-gap-${index}`} className="bg-amber-100 text-amber-800">
                          Gap {index + 1}: {gap}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle */}
        <Card className="rounded-2xl border-zinc-200 shadow-sm xl:col-span-5">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Content queue</CardTitle>
            <Button type="button" variant="secondary" size="sm" className="rounded-xl" disabled={contentLoading || !workspaceReady} onClick={() => void runContent()}>
              {contentLoading ? "Refreshing…" : workspaceReady ? "Regenerate library" : "Setup required"}
            </Button>
          </CardHeader>
          <CardContent className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {[7, 14, 21, 30].map((days) => (
                <Button key={days} type="button" size="sm" variant={calendarDays === days ? "default" : "outline"} className="rounded-xl" onClick={() => setCalendarDays(days)}>
                  {days}d
                </Button>
              ))}
              <p className="text-xs text-zinc-500">Calendar length</p>
            </div>
            {workspace.content.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500">No content yet. Regenerate the library.</div>
            )}
            {workspace.content.map((item) => (
              <div key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-900">{item.title}</p>
                    <p className="text-xs text-zinc-500">{item.mediaType}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformBadge platform={item.selectedPlatform} />
                    <ContentStatusBadge status={item.status} />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[140px_1fr]">
                  <div className="aspect-video w-full min-w-0 max-w-[140px] overflow-hidden rounded-xl">
                    <MediaPreviewBlock
                      url={item.mediaPreview}
                      mediaType={item.mediaType}
                      className="h-full w-full"
                      videoClassName="aspect-video h-full w-full rounded-xl object-cover"
                      imgClassName="aspect-video h-full w-full rounded-xl object-cover"
                    />
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-700">{item.contentText}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.status === "PENDING" && (
                    <Button type="button" size="sm" className="rounded-xl" onClick={() => openPlatformModal(item.id)}>
                      Approve
                    </Button>
                  )}
                  {item.status === "APPROVED" && (
                    <Button type="button" size="sm" variant="secondary" className="rounded-xl" onClick={() => openPlatformModal(item.id)}>
                      Select platform
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={item.status === "PUBLISHED"}
                    onClick={() => void reject(item.id).then(() => push("Marked as rejected"))}
                  >
                    Reject
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => openEdit(item)}>
                    Edit
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="rounded-xl" onClick={() => setPreviewItem(item)}>
                    Preview
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Right */}
        <Card className="rounded-2xl border-zinc-200 shadow-sm xl:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Scheduled posts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {scheduledList.length === 0 && <p className="text-sm text-zinc-500">No scheduled posts.</p>}
              {scheduledList.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{item.title}</p>
                    <p className="text-xs text-zinc-500">{item.scheduledAt ? format(new Date(item.scheduledAt), "PPp") : ""}</p>
                  </div>
                  <PlatformBadge platform={item.selectedPlatform} />
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Calendar preview</p>
              <div className="grid grid-cols-7 gap-1.5">
                {weekDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const count = workspace.content.filter((c) => c.scheduledAt?.startsWith(key)).length;
                  return (
                    <div key={key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-center">
                      <p className="text-[10px] font-medium uppercase text-zinc-400">{format(day, "EEE")}</p>
                      <p className="text-sm font-semibold text-zinc-900">{format(day, "d")}</p>
                      <p className="text-[10px] text-zinc-500">{count ? `${count} slot` : "—"}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Assign slots on the{" "}
                <Link href="/scheduling" className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                  Scheduling
                </Link>{" "}
                page using drag-and-drop.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom */}
      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardContent className="flex flex-col gap-4 py-6 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Publishing</p>
            <Button type="button" className="w-full max-w-xs rounded-2xl" disabled={publishLoading} onClick={() => void runPublish()}>
              {publishLoading ? "Publishing…" : `Publish ready (${eligibleToPublish.length})`}
            </Button>
            {blocked.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-medium">Action required</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {blocked.map((b) => (
                    <li key={b.id}>
                      {b.title}:{" "}
                      {!b.selectedPlatform
                        ? "Select a platform when approving."
                        : !isPlatformConnected(workspace.integrations, b.selectedPlatform)
                          ? `${platformLabel(b.selectedPlatform)} is not connected — open Settings → Integrations.`
                          : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex-1 border-t border-zinc-100 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Automation status</p>
            <p className="mt-1 text-sm text-zinc-600">Publishing is connected to approval, scheduling, and platform integrations.</p>
            <p className="mt-2 text-sm text-zinc-600">
              Open <Link href="/publishing" className="font-medium text-zinc-900 underline-offset-2 hover:underline">Publishing</Link> to run manual or cron cycles.
            </p>
          </div>
        </CardContent>
      </Card>

      <PlatformSelectDialog
        open={Boolean(platformTargetId)}
        onOpenChange={(o) => !o && setPlatformTargetId(null)}
        onConfirm={(platforms) => void handlePlatformConfirm(platforms)}
      />

      <Dialog open={Boolean(editItem)} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit content</DialogTitle>
            <DialogDescription>Updates reset approval until reviewed again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="rounded-xl" />
            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-28 rounded-xl" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button type="button" className="rounded-xl" onClick={() => void saveEdit()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewItem)} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Platform preview</DialogTitle>
            <DialogDescription>Review formatting before scheduling or publishing.</DialogDescription>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(["linkedin", "instagram", "facebook", "twitter"] as const).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={previewPlatform === p ? "default" : "outline"}
                    className="rounded-xl"
                    onClick={() => setPreviewPlatform(p)}
                  >
                    {platformLabel(p)}
                  </Button>
                ))}
              </div>
              <PreviewPane item={previewItem} workspace={workspace} platform={previewPlatform} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewPane({
  item,
  workspace,
  platform,
}: {
  item: ContentItem;
  workspace: WorkspaceSnapshot;
  platform: PublishingPlatform;
}) {
  if (platform === "linkedin") {
    return <LinkedInPostPreview item={item} workspace={workspace} />;
  }
  if (platform === "instagram") {
    return <InstagramPostPreview item={item} workspace={workspace} />;
  }
  if (platform === "twitter") {
    return <TwitterPostPreview item={item} workspace={workspace} />;
  }
  return <FacebookPostPreview item={item} workspace={workspace} />;
}
