"use client";

import { format, formatDistanceToNow, parseISO } from "date-fns";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Search, Sparkles, X } from "lucide-react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FacebookPostPreview } from "@/components/previews/facebook-post-preview";
import { InstagramPostPreview } from "@/components/previews/instagram-post-preview";
import { LinkedInPostPreview } from "@/components/previews/linkedin-post-preview";
import { TwitterPostPreview } from "@/components/previews/twitter-post-preview";
import { requestAiCompletionNotifyPreference } from "@/components/ai-completion-notify-bridge";
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
import { platformLabel } from "@/lib/platform";
import { apiErrorMessage, sanitizeMediaUrl } from "@/lib/api";
import { shouldUseVideoElement } from "@/lib/media-detect";
import { primaryRegionLabel } from "@/lib/primary-region";
import type { ContentItem, PublishingPlatform, WorkspaceSnapshot } from "@/lib/types";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";
import { useElapsedSecondsWhileActive, useSimulatedAiProgress } from "@/hooks/use-simulated-ai-progress";

/** Resolved workspace branding — avoids silent failures when flowpilot_workspace.company_name is empty but Profile › Company is set. */
function effectiveWorkspaceCompanyName(w: WorkspaceSnapshot): string {
  const a = w.companyName.trim();
  if (a) return a;
  return w.profile.company.trim();
}

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
  return <Badge className="rounded-lg border border-blue-100/80 bg-blue-50/90 font-normal text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100">{platformLabel(platform)}</Badge>;
}

function formatQueueDate(item: ContentItem): string {
  const raw = item.scheduledAt ?? item.createdAt ?? item.updatedAt;
  if (!raw) return "No date set";
  try {
    const d = parseISO(String(raw));
    if (Number.isNaN(d.getTime())) return "No date set";
    return format(d, "MMM d, yyyy");
  } catch {
    return "No date set";
  }
}

function formatQueueBodyPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatSnapshotInstant(iso: string | null | undefined, empty = "—"): string {
  if (!iso?.trim()) return empty;
  try {
    const d = parseISO(String(iso));
    if (Number.isNaN(d.getTime())) return empty;
    return format(d, "MMM d, yyyy · h:mm a");
  } catch {
    return empty;
  }
}

function pickLatestContentCreatedIso(items: ContentItem[]): string | null {
  let best: string | null = null;
  for (const c of items) {
    const v = c.createdAt;
    if (!v?.trim()) continue;
    if (!best || new Date(v) > new Date(best)) best = v;
  }
  return best;
}

const COMPETITOR_RESEARCH_PAGE_SIZE = 4;
const STRATEGY_THEMES_PAGE_SIZE = 8;
const STRATEGY_GAPS_PAGE_SIZE = 5;
/** XL grid is 3 columns; 12 cards = 4 rows per page for a dense first view. */
const CONTENT_QUEUE_PAGE_SIZE = 12;
const MAX_GAPS_PER_COMPETITOR_CARD = 10;

type ResearchHoverPreviewRow = {
  id: string;
  name: string;
  website: string;
  domain: string;
  positioning: string;
  marketRank: string;
  marketGap: string;
  marketingPurpose: string;
  strengths: string[];
  weaknesses: string[];
  source: "Setup" | "Generated";
};

function gapLinesForCompetitorCard(
  c: { source: "Setup" | "Generated"; marketGap: string; weaknesses: string[] },
  strategyGaps: string[] | undefined,
): string[] {
  if (c.source === "Generated") {
    const raw = [c.marketGap, ...c.weaknesses].map((g) => String(g).trim()).filter(Boolean);
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const line of raw) {
      if (seen.has(line)) continue;
      seen.add(line);
      deduped.push(line);
      if (deduped.length >= MAX_GAPS_PER_COMPETITOR_CARD) break;
    }
    if (deduped.length > 0) {
      return deduped;
    }
  }
  const pool = strategyGaps?.length ? strategyGaps : c.weaknesses;
  return pool.slice(0, MAX_GAPS_PER_COMPETITOR_CARD);
}

function ContentQueueThumb({ item }: { item: ContentItem }) {
  const safe = sanitizeMediaUrl(item.mediaPreview);
  const useVideo = shouldUseVideoElement(safe, item.mediaType);
  const videoFallback = item.mediaType === "Video" && !useVideo;
  if (!safe) {
    return <div className="h-16 w-16 shrink-0 rounded-xl bg-blue-50/80 dark:bg-blue-950/30" aria-hidden />;
  }
  return (
    <div className="relative h-16 w-16 shrink-0">
      {useVideo ? (
        <video
          src={safe}
          className="h-16 w-16 rounded-xl object-cover"
          muted
          playsInline
          preload="metadata"
          aria-hidden
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safe} alt="" className="h-16 w-16 rounded-xl object-cover" loading="lazy" />
      )}
      {item.mediaType === "Carousel" ? (
        <span className="absolute bottom-0.5 right-0.5 z-[1] rounded bg-zinc-900/85 px-0.5 text-[7px] font-bold uppercase leading-none text-white">
          C
        </span>
      ) : null}
      {videoFallback ? (
        <span className="absolute bottom-0.5 left-0.5 z-[1] rounded bg-violet-800/90 px-0.5 text-[7px] font-bold uppercase leading-none text-white">
          V
        </span>
      ) : null}
    </div>
  );
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

type CommandCenterViewProps = {
  serverSyncing?: boolean;
};

export function CommandCenterView({ serverSyncing = false }: CommandCenterViewProps) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const generateStrategy = useWorkspaceStore((s) => s.generateStrategy);
  const generateContent = useWorkspaceStore((s) => s.generateContent);
  const lastRunUsedFreeModel = useWorkspaceStore((s) => s.lastRunUsedFreeModel);
  const bulkDeleteContentItems = useWorkspaceStore((s) => s.bulkDeleteContentItems);
  const patchWorkspaceResearch = useWorkspaceStore((s) => s.patchWorkspaceResearch);
  const approve = useWorkspaceStore((s) => s.approve);
  const reject = useWorkspaceStore((s) => s.reject);
  const { push } = useToast();

  const [competitorName, setCompetitorName] = useState("");
  const [competitorWebsite, setCompetitorWebsite] = useState("");
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [calendarDays, setCalendarDays] = useState(10);
  const [platformTargetId, setPlatformTargetId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<PublishingPlatform>("linkedin");
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [competitorDrafts, setCompetitorDrafts] = useState<CompetitorDraft[]>([]);
  const [competitorResearchPage, setCompetitorResearchPage] = useState(0);
  const [competitorResearchQuery, setCompetitorResearchQuery] = useState("");
  const [contentQueuePage, setContentQueuePage] = useState(0);
  const [competitorUploadOpen, setCompetitorUploadOpen] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [competitorAllDeleteOpen, setCompetitorAllDeleteOpen] = useState(false);
  const [researchPatchBusy, setResearchPatchBusy] = useState(false);
  const [strategyOutputQuery, setStrategyOutputQuery] = useState("");
  const [strategyThemesPage, setStrategyThemesPage] = useState(0);
  const [strategyGapsPage, setStrategyGapsPage] = useState(0);
  const [researchCardSelected, setResearchCardSelected] = useState<string[]>([]);
  const [marketGapSelected, setMarketGapSelected] = useState<string[]>([]);
  const [marketGapModalText, setMarketGapModalText] = useState<string | null>(null);
  const [researchHoverModal, setResearchHoverModal] = useState<ResearchHoverPreviewRow | null>(null);
  const researchHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marketGapHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapStartedRef = useRef(false);

  const cancelResearchHoverClose = useCallback(() => {
    if (researchHoverCloseTimerRef.current != null) {
      clearTimeout(researchHoverCloseTimerRef.current);
      researchHoverCloseTimerRef.current = null;
    }
  }, []);

  const scheduleResearchHoverClose = useCallback(() => {
    cancelResearchHoverClose();
    researchHoverCloseTimerRef.current = setTimeout(() => {
      setResearchHoverModal(null);
      researchHoverCloseTimerRef.current = null;
    }, 300);
  }, [cancelResearchHoverClose]);

  const cancelMarketGapHoverClose = useCallback(() => {
    if (marketGapHoverCloseTimerRef.current != null) {
      clearTimeout(marketGapHoverCloseTimerRef.current);
      marketGapHoverCloseTimerRef.current = null;
    }
  }, []);

  const scheduleMarketGapHoverClose = useCallback(() => {
    cancelMarketGapHoverClose();
    marketGapHoverCloseTimerRef.current = setTimeout(() => {
      setMarketGapModalText(null);
      marketGapHoverCloseTimerRef.current = null;
    }, 300);
  }, [cancelMarketGapHoverClose]);

  useEffect(() => {
    return () => {
      if (researchHoverCloseTimerRef.current != null) {
        clearTimeout(researchHoverCloseTimerRef.current);
      }
      if (marketGapHoverCloseTimerRef.current != null) {
        clearTimeout(marketGapHoverCloseTimerRef.current);
      }
    };
  }, []);

  const updateContentItem = useWorkspaceStore((s) => s.updateContentItem);

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
      .map((draft) => {
        const website = draft.website.trim();
        const domain = website.replace(/^https?:\/\//i, "").split("/")[0]?.trim() ?? "";
        const gapLine = marketGaps.length ? marketGaps[0] : draft.focus.trim() || "Gap analysis will appear after strategy refresh.";
        return {
          id: draft.id,
          name: draft.name.trim() || draft.website.trim() || "Unnamed competitor",
          website,
          domain,
          positioning: draft.focus.trim() || "Manual research target queued from command center setup.",
          marketRank: "Manual target (not formally ranked)",
          marketGap: gapLine,
          marketingPurpose: "Competitive benchmark and positioning reference",
          strengths: ["Manual benchmark", "Needs validation"],
          weaknesses: marketGaps.length ? marketGaps.slice(0, 2) : ["Gap research pending"],
          source: "Setup" as const,
        };
      });
    const generatedRows =
      workspace?.competitors.map((competitor) => ({
        ...competitor,
        website: competitor.domain || "",
        source: "Generated" as const,
      })) ?? [];
    return [...manualRows, ...generatedRows];
  }, [competitorDrafts, competitorName, competitorWebsite, workspace?.competitors, workspace?.strategy?.marketGaps]);

  const filteredResearchCompetitors = useMemo(() => {
    const q = competitorResearchQuery.trim().toLowerCase();
    if (!q) return researchCompetitors;
    return researchCompetitors.filter((c) => {
      const blob = [
        c.name,
        c.domain,
        c.website ?? "",
        c.positioning,
        c.marketRank,
        c.marketGap,
        c.marketingPurpose ?? "",
        ...c.strengths,
        ...c.weaknesses,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [researchCompetitors, competitorResearchQuery]);

  const researchPageCount = Math.max(1, Math.ceil(filteredResearchCompetitors.length / COMPETITOR_RESEARCH_PAGE_SIZE) || 1);
  const safeResearchPage = Math.min(competitorResearchPage, Math.max(0, researchPageCount - 1));

  const researchSlice = useMemo(
    () =>
      filteredResearchCompetitors.slice(
        safeResearchPage * COMPETITOR_RESEARCH_PAGE_SIZE,
        safeResearchPage * COMPETITOR_RESEARCH_PAGE_SIZE + COMPETITOR_RESEARCH_PAGE_SIZE,
      ),
    [filteredResearchCompetitors, safeResearchPage],
  );

  const strategyOutQ = strategyOutputQuery.trim().toLowerCase();

  const filteredStrategyThemes = useMemo(() => {
    const themes = workspace?.strategy?.contentThemes ?? [];
    if (!strategyOutQ) return themes;
    return themes.filter((t) => t.toLowerCase().includes(strategyOutQ));
  }, [workspace?.strategy?.contentThemes, strategyOutQ]);

  const filteredStrategyGaps = useMemo(() => {
    const gaps = workspace?.strategy?.marketGaps ?? [];
    if (!strategyOutQ) return gaps;
    return gaps.filter((g) => g.toLowerCase().includes(strategyOutQ));
  }, [workspace?.strategy?.marketGaps, strategyOutQ]);

  const audienceMatches = useMemo(() => {
    const ta = workspace?.strategy?.targetAudience ?? "";
    if (!strategyOutQ) return true;
    return ta.toLowerCase().includes(strategyOutQ);
  }, [workspace?.strategy?.targetAudience, strategyOutQ]);

  const themesPageCount = Math.max(1, Math.ceil(filteredStrategyThemes.length / STRATEGY_THEMES_PAGE_SIZE));
  const safeStrategyThemesPage = Math.min(strategyThemesPage, Math.max(0, themesPageCount - 1));
  const themesSlice = useMemo(
    () =>
      filteredStrategyThemes.slice(
        safeStrategyThemesPage * STRATEGY_THEMES_PAGE_SIZE,
        (safeStrategyThemesPage + 1) * STRATEGY_THEMES_PAGE_SIZE,
      ),
    [filteredStrategyThemes, safeStrategyThemesPage],
  );

  const strategyGapsPageCount = Math.max(1, Math.ceil(filteredStrategyGaps.length / STRATEGY_GAPS_PAGE_SIZE));
  const safeStrategyGapsPage = Math.min(strategyGapsPage, Math.max(0, strategyGapsPageCount - 1));
  const gapsSlice = useMemo(
    () =>
      filteredStrategyGaps.slice(
        safeStrategyGapsPage * STRATEGY_GAPS_PAGE_SIZE,
        (safeStrategyGapsPage + 1) * STRATEGY_GAPS_PAGE_SIZE,
      ),
    [filteredStrategyGaps, safeStrategyGapsPage],
  );

  useEffect(() => {
    startTransition(() => {
      setStrategyThemesPage(0);
      setStrategyGapsPage(0);
    });
  }, [strategyOutputQuery]);

  useEffect(() => {
    setMarketGapSelected([]);
  }, [strategyOutputQuery]);

  const strategyCompetitorsPayload = useMemo(() => {
    const rows = [...competitorDrafts];
    if (competitorName.trim() || competitorWebsite.trim()) {
      rows.unshift({
        id: "primary-competitor",
        name: competitorName.trim(),
        website: competitorWebsite.trim(),
        focus: "Manual competitor research target.",
      });
    }
    return rows.map(({ name, website: competitorUrl, focus }) => ({
      name,
      website: competitorUrl,
      focus,
    }));
  }, [competitorDrafts, competitorName, competitorWebsite]);

  const strategyResearchMeta = useMemo(() => {
    const v = workspace?.strategyVersion;
    const updated = formatSnapshotInstant(workspace?.strategyUpdatedAt);
    const rel =
      workspace?.strategyUpdatedAt?.trim() && updated !== "—"
        ? formatDistanceToNow(parseISO(workspace.strategyUpdatedAt!), { addSuffix: true })
        : "";
    const parts: string[] = [];
    if (v != null) parts.push(`v${v}`);
    if (updated !== "—") parts.push(`saved ${updated}`);
    if (rel) parts.push(rel);
    return parts.join(" · ");
  }, [workspace?.strategyVersion, workspace?.strategyUpdatedAt]);

  const contentQueueItems = useMemo(() => workspace?.content ?? [], [workspace?.content]);
  const latestContentCreatedAt = useMemo(() => pickLatestContentCreatedIso(contentQueueItems), [contentQueueItems]);
  const contentCreatedMeta = useMemo(() => {
    if (!latestContentCreatedAt) return "";
    const abs = formatSnapshotInstant(latestContentCreatedAt);
    if (abs === "—") return "";
    const rel = formatDistanceToNow(parseISO(latestContentCreatedAt), { addSuffix: true });
    return `Latest content created ${abs} · ${rel}`;
  }, [latestContentCreatedAt]);
  const contentQueuePageCount = Math.max(1, Math.ceil(contentQueueItems.length / CONTENT_QUEUE_PAGE_SIZE) || 1);
  const safeContentQueuePage = Math.min(contentQueuePage, Math.max(0, contentQueuePageCount - 1));

  const contentQueueSlice = useMemo(
    () =>
      contentQueueItems.slice(
        safeContentQueuePage * CONTENT_QUEUE_PAGE_SIZE,
        safeContentQueuePage * CONTENT_QUEUE_PAGE_SIZE + CONTENT_QUEUE_PAGE_SIZE,
      ),
    [contentQueueItems, safeContentQueuePage],
  );

  const workspaceReady = Boolean(
    workspace?.companyName?.trim() ||
      workspace?.profile.company?.trim() ||
      workspace?.workspaceConfigured,
  );
  const aiOutputMissing = Boolean(
    workspaceReady && workspace && !workspace.strategy && workspace.competitors.length === 0 && workspace.content.length === 0,
  );
  const aiJobActive = strategyLoading || contentLoading || bootstrapLoading;
  const aiProgressPct = useSimulatedAiProgress(aiJobActive);
  const aiElapsedSec = useElapsedSecondsWhileActive(aiJobActive);
  useEffect(() => {
    if (!aiOutputMissing || bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;
    const runBootstrap = async () => {
      setBootstrapLoading(true);
      try {
        const notify = await requestAiCompletionNotifyPreference("content");
        await generateContent(calendarDays, { completionNotify: notify });
        const usedFree = useWorkspaceStore.getState().lastRunUsedFreeModel;
        push(
          usedFree
            ? "Setup complete (used free AI model — add OpenRouter credits for faster runs)."
            : "Setup complete. Your strategy and content plan are ready.",
        );
      } catch (e) {
        push(apiErrorMessage(e));
      } finally {
        setBootstrapLoading(false);
      }
    };
    void runBootstrap();
  }, [aiOutputMissing, calendarDays, generateContent, push]);

  const aiPhaseLine = useMemo(() => {
    if (!aiJobActive) return "";
    if (bootstrapLoading) return "Running full setup: strategy research, then content planning for your calendar.";
    if (strategyLoading) return "Building strategy from competitors, website fit, positioning, and market gaps.";
    if (contentLoading) return "Creating post titles, captions, and media ideas for each slot.";
    return "";
  }, [aiJobActive, bootstrapLoading, strategyLoading, contentLoading]);

  const aiElapsedLabel = useMemo(() => {
    if (aiElapsedSec < 60) return `${aiElapsedSec}s`;
    const m = Math.floor(aiElapsedSec / 60);
    const s = aiElapsedSec % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }, [aiElapsedSec]);

  const aiFeelsSlow = aiJobActive && aiElapsedSec >= 90;

  const buildStrategyCompetitorPayload = useCallback(() => {
    const competitorInputs = [...competitorDrafts];
    if (competitorName.trim() || competitorWebsite.trim()) {
      competitorInputs.unshift({
        id: "primary-competitor",
        name: competitorName.trim(),
        website: competitorWebsite.trim(),
        focus: "Manual competitor research target.",
      });
    }
    return competitorInputs.map(({ name, website: competitorUrl, focus }) => ({
      name,
      website: competitorUrl,
      focus,
    }));
  }, [competitorDrafts, competitorName, competitorWebsite]);

  if (shellPending) {
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

  const runStrategy = async () => {
    if (!workspace) return;
    const company = effectiveWorkspaceCompanyName(workspace);
    const website = workspace.companyWebsite.trim();
    if (!company) {
      push("Add a company name in Profile or Workspace setup before generating strategy.");
      return;
    }
    if (!workspaceReady) {
      push("Complete company and workspace setup before running strategy.");
      return;
    }
    setStrategyLoading(true);
    try {
      const notify = await requestAiCompletionNotifyPreference("strategy");
      await generateStrategy(company, website, {
        competitors: buildStrategyCompetitorPayload(),
        completionNotify: notify,
      });
      push("Strategy is updated with your latest company, website, and market details.");
    } catch (e) {
      push(apiErrorMessage(e));
    } finally {
      setStrategyLoading(false);
    }
  };

  /** One click: Agent 1 (strategy / competitors) then Agent 2 (content calendar). */
  const runStrategyThenContent = async () => {
    if (!workspace) return;
    const company = effectiveWorkspaceCompanyName(workspace);
    const website = workspace.companyWebsite.trim();
    if (!company) {
      push("Add a company name in Profile or Workspace setup before generating strategy.");
      return;
    }
    if (!workspaceReady) {
      push("Complete company and workspace setup before running AI refresh.");
      return;
    }
    setStrategyLoading(true);
    try {
      await generateStrategy(company, website, {
        competitors: buildStrategyCompetitorPayload(),
        completionNotify: false,
      });
    } catch (e) {
      push(apiErrorMessage(e));
      return;
    } finally {
      setStrategyLoading(false);
    }
    setContentLoading(true);
    try {
      const notify = await requestAiCompletionNotifyPreference("content");
      await generateContent(calendarDays, { completionNotify: notify });
      setContentQueuePage(0);
      push(`Strategy saved and ${calendarDays}-day content library generated.`);
    } catch (e) {
      push(apiErrorMessage(e));
    } finally {
      setContentLoading(false);
    }
  };

  const runContent = async () => {
    if (!workspaceReady) {
      push("Add a company name in Profile or Workspace setup before regenerating content.");
      return;
    }
    setContentLoading(true);
    try {
      const notify = await requestAiCompletionNotifyPreference("content");
      await generateContent(calendarDays, { completionNotify: notify });
      setContentQueuePage(0);
      push(`Content calendar refreshed (${calendarDays} slots).`);
    } catch (e) {
      push(apiErrorMessage(e));
    } finally {
      setContentLoading(false);
    }
  };

  const runBulkDeleteGenerated = async () => {
    const ids = (workspace?.content ?? []).map((item) => item.id).filter(Boolean);
    if (ids.length === 0) {
      push("No generated content to delete.");
      return;
    }
    setBulkDeleteOpen(false);
    setContentLoading(true);
    try {
      await bulkDeleteContentItems(ids);
      setContentQueuePage(0);
      push(`Deleted ${ids.length} generated content item(s).`);
    } catch (e) {
      push(apiErrorMessage(e));
    } finally {
      setContentLoading(false);
    }
  };

  const toggleResearchCardSelect = (id: string) => {
    setResearchCardSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllResearchOnPage = () => {
    const ids = researchSlice.map((c) => c.id);
    const allSelected = ids.length > 0 && ids.every((id) => researchCardSelected.includes(id));
    setResearchCardSelected((prev) => {
      if (allSelected) return prev.filter((id) => !ids.includes(id));
      return Array.from(new Set([...prev, ...ids]));
    });
  };

  const toggleMarketGapSelect = (gap: string) => {
    setMarketGapSelected((prev) => (prev.includes(gap) ? prev.filter((g) => g !== gap) : [...prev, gap]));
  };

  const selectAllGapsOnPage = () => {
    const gaps = gapsSlice;
    const allSelected = gaps.length > 0 && gaps.every((g) => marketGapSelected.includes(g));
    setMarketGapSelected((prev) => {
      if (allSelected) return prev.filter((x) => !gaps.includes(x));
      return Array.from(new Set([...prev, ...gaps]));
    });
  };

  const runDeleteSelectedResearch = async () => {
    if (researchCardSelected.length === 0) return;
    setResearchPatchBusy(true);
    try {
      const apiIds: string[] = [];
      for (const id of researchCardSelected) {
        const row = researchCompetitors.find((r) => r.id === id);
        if (row?.source === "Generated") apiIds.push(id);
      }
      if (researchCardSelected.includes("primary-competitor")) {
        setCompetitorName("");
        setCompetitorWebsite("");
      }
      setCompetitorDrafts((prev) => prev.filter((d) => !researchCardSelected.includes(d.id)));
      if (apiIds.length > 0) {
        await patchWorkspaceResearch({ deleteCompetitorIds: apiIds });
      }
      const hadLocal =
        researchCardSelected.includes("primary-competitor") ||
        researchCardSelected.some((id) => id.startsWith("draft-"));
      setResearchCardSelected([]);
      if (apiIds.length > 0 && hadLocal) {
        push(`Removed ${apiIds.length} saved card(s) and cleared local setup rows.`);
      } else if (apiIds.length > 0) {
        push(`Removed ${apiIds.length} saved competitor card(s).`);
      } else if (hadLocal) {
        push("Cleared local competitor setup rows.");
      }
    } catch (e) {
      push(apiErrorMessage(e));
    } finally {
      setResearchPatchBusy(false);
    }
  };

  const runDeleteAllSavedCompetitors = async () => {
    const ids = (workspace?.competitors ?? []).map((c) => c.id).filter(Boolean);
    if (ids.length === 0) {
      push("No saved competitor cards to delete.");
      return;
    }
    setCompetitorAllDeleteOpen(false);
    setResearchPatchBusy(true);
    try {
      await patchWorkspaceResearch({ deleteCompetitorIds: ids });
      setResearchCardSelected([]);
      setCompetitorResearchPage(0);
      push(`Deleted ${ids.length} saved competitor card(s).`);
    } catch (e) {
      push(apiErrorMessage(e));
    } finally {
      setResearchPatchBusy(false);
    }
  };

  const runRemoveSelectedGaps = async () => {
    const gaps = marketGapSelected;
    if (gaps.length === 0) return;
    setResearchPatchBusy(true);
    try {
      await patchWorkspaceResearch({ removeMarketGaps: gaps });
      if (marketGapModalText && gaps.includes(marketGapModalText)) {
        cancelMarketGapHoverClose();
        setMarketGapModalText(null);
      }
      setMarketGapSelected([]);
      startTransition(() => setStrategyGapsPage(0));
      push(`Removed ${gaps.length} market gap line(s).`);
    } catch (e) {
      push(apiErrorMessage(e));
    } finally {
      setResearchPatchBusy(false);
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
    <div className="flex min-h-0 flex-col gap-4">
      {serverSyncing && workspace ? (
        <div
          className="relative h-1 w-full overflow-hidden rounded-full bg-blue-100/90 dark:bg-blue-950/50"
          role="status"
          aria-label="Syncing workspace from server"
        >
          <div
            className="absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-sky-400/95 via-blue-500/95 to-sky-400/95"
            style={{ animation: "cc-ai-shimmer-bar 1.5s ease-in-out infinite" }}
          />
        </div>
      ) : null}
      {(aiJobActive || aiOutputMissing) && (
        <Card
          className={cn(
            "relative overflow-hidden rounded-2xl border shadow-sm transition-shadow duration-500",
            aiJobActive
              ? "border-blue-300/80 bg-gradient-to-r from-blue-50/90 via-sky-50/75 to-indigo-50/60 shadow-md shadow-blue-200/30"
              : "border-amber-200/90 bg-amber-50/40 shadow-sm",
          )}
        >
          {aiJobActive && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-2xl bg-blue-200/30" aria-hidden>
              <div
                className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-blue-400/90 to-transparent"
                style={{ animation: "cc-ai-shimmer-bar 1.8s ease-in-out infinite" }}
              />
            </div>
          )}
          <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {aiJobActive ? <AiProcessingBannerIcon /> : <AiOutputMissingIcon />}
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{aiJobActive ? "Setting up your workspace" : "Setup not started yet"}</p>
                  <p className="mt-1.5 text-sm text-zinc-700">
                    {aiJobActive ? (
                      <>
                        <span className="font-medium text-blue-900">{aiPhaseLine}</span> We are preparing your company profile,
                        strategy, and first content plan. This can take a few minutes. Elapsed <span className="tabular-nums">{aiElapsedLabel}</span>.
                      </>
                    ) : (
                      "Start setup to generate your company insights, strategy, and ready-to-use content ideas."
                    )}
                  </p>
                  {aiJobActive && aiFeelsSlow ? (
                    <p className="text-xs font-medium text-amber-900 dark:text-amber-200/95">
                      Still working. Full setup may take several minutes; Groq and Gemini are tried before OpenRouter.
                    </p>
                  ) : null}
                  {!aiJobActive && lastRunUsedFreeModel ? (
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Last run used a free AI model (low credits). Add credits at{" "}
                      <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener noreferrer" className="underline">
                        openrouter.ai
                      </a>{" "}
                      for faster generation.
                    </p>
                  ) : null}
                </div>
                {aiJobActive ? (
                  <div
                    className="space-y-1.5"
                    role="progressbar"
                    aria-valuenow={aiProgressPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Estimated progress ${aiProgressPct} percent, elapsed ${aiElapsedLabel}`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold tabular-nums text-blue-950">
                      <span>Estimated progress</span>
                      <span>
                        {aiProgressPct}% · {aiElapsedLabel}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full border border-blue-100/90 bg-white/80 shadow-inner dark:border-blue-900/40 dark:bg-zinc-900/80">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 shadow-sm transition-[width] duration-300 ease-out"
                        style={{ width: `${aiProgressPct}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <Button type="button" className="shrink-0 rounded-xl" disabled={aiJobActive} onClick={() => void runContent()}>
              {aiJobActive ? `Working… ${aiProgressPct}%` : "Run AI setup now"}
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid items-stretch gap-4 xl:grid-cols-12 xl:gap-6">
        {/* Left — wider competitor / strategy column */}
        <div className="flex min-h-0 flex-col gap-3 xl:col-span-5 xl:min-h-[46rem]">
          <Card className="rounded-2xl border-blue-100/90 bg-gradient-to-br from-white to-blue-50/50 shadow-sm shadow-blue-900/[0.04] dark:border-blue-900/50 dark:from-zinc-900 dark:to-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-900 dark:text-zinc-50">Strategy setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Use your <span className="font-medium">latest</span> company, website, and market ({primaryRegionLabel(workspace.primaryRegion)}).{" "}
                <span className="font-medium">One tap</span> runs strategy research and rebuilds your content calendar — no second click.
              </p>
              <Button
                type="button"
                className="w-full rounded-2xl"
                disabled={aiJobActive || !workspaceReady}
                onClick={() => void runStrategyThenContent()}
              >
                {strategyLoading
                  ? "Updating strategy…"
                  : contentLoading
                    ? "Creating content library…"
                    : workspaceReady
                      ? "Refresh strategy & content"
                      : "Set up workspace first"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-2xl"
                disabled={aiJobActive || !workspaceReady}
                onClick={() => void runStrategy()}
              >
                {strategyLoading && !contentLoading
                  ? "Updating strategy…"
                  : workspaceReady
                    ? "Strategy only (leave posts as-is)"
                    : "Set up workspace first"}
              </Button>
              <p className="text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                Strategy saved: {strategyResearchMeta || "— not generated yet"}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-blue-100/90 bg-white shadow-sm dark:border-blue-900/50 dark:bg-zinc-900/40">
            <CardHeader className="p-0">
              <button
                type="button"
                aria-expanded={competitorUploadOpen}
                aria-controls="competitor-upload-panel"
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-blue-50/40 dark:hover:bg-blue-950/30",
                  competitorUploadOpen ? "rounded-t-2xl" : "rounded-2xl",
                )}
                onClick={() => setCompetitorUploadOpen((o) => !o)}
              >
                <CardTitle className="text-base text-slate-900 dark:text-zinc-50">Competitor Upload (optional)</CardTitle>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "h-5 w-5 shrink-0 text-zinc-500 transition-transform duration-200 dark:text-zinc-400",
                    competitorUploadOpen && "rotate-180",
                  )}
                />
              </button>
            </CardHeader>
            {competitorUploadOpen ? (
              <CardContent id="competitor-upload-panel" className="space-y-4 border-t border-blue-100/80 pb-5 pt-2 dark:border-blue-900/40">
            <div className="space-y-2">
              <Label htmlFor="cc-name">Competitor name</Label>
              <Input
                id="cc-name"
                value={competitorName}
                onChange={(e) => setCompetitorName(e.target.value)}
                placeholder="Competitor name"
                className="rounded-xl border-blue-100/90 dark:border-blue-900/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-web">Competitor website URL</Label>
              <Input
                id="cc-web"
                value={competitorWebsite}
                onChange={(e) => setCompetitorWebsite(e.target.value)}
                placeholder="https://competitor.com"
                className="rounded-xl border-blue-100/90 dark:border-blue-900/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="competitor-upload">Upload competitor Excel / CSV</Label>
              <Input
                id="competitor-upload"
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                className="rounded-xl border-blue-100/90 dark:border-blue-900/50"
                onChange={(event) => void handleCompetitorFile(event.target.files)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-2xl"
              disabled={aiJobActive || !workspaceReady}
              onClick={() => void runStrategyThenContent()}
            >
              {strategyLoading
                ? "Updating strategy…"
                : contentLoading
                  ? "Creating content library…"
                  : workspaceReady
                    ? "Refresh strategy & content with these competitors"
                    : "Set up workspace first"}
            </Button>
              </CardContent>
            ) : null}
          </Card>

          <Card className="flex min-h-0 flex-1 flex-col rounded-2xl border-blue-100/90 bg-white shadow-sm shadow-blue-900/[0.03] dark:border-blue-900/50 dark:bg-zinc-900/40 xl:min-h-[46rem]">
            <CardHeader className="shrink-0 border-b border-blue-100/80 pb-3 dark:border-blue-900/40">
              <div className="flex w-full flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base text-slate-900 dark:text-zinc-50">Competitor research</CardTitle>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Strategy output · gap marking · pagination above lists
                  </p>
                  {strategyResearchMeta ? (
                    <p className="mt-1 text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">{strategyResearchMeta}</p>
                  ) : null}
                </div>
                <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={researchPatchBusy || researchCardSelected.length === 0}
                    onClick={() => void runDeleteSelectedResearch()}
                  >
                    Delete selected
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={researchPatchBusy || (workspace?.competitors?.length ?? 0) === 0}
                    onClick={() => setCompetitorAllDeleteOpen(true)}
                  >
                    Delete all saved
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Strategy refresh</span> replaces saved competitor cards each run
                — use <span className="font-medium">View</span> for an exportable snapshot. Content queue regenerates separately.
              </p>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-3 pb-5">
              <div className="rounded-2xl border border-blue-100/90 bg-white p-4 text-sm shadow-sm dark:border-blue-900/50 dark:bg-zinc-900/80">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Strategy output</p>
                <div className="relative mt-2">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                    aria-hidden
                  />
                  <Input
                    id="cc-strategy-output-filter"
                    value={strategyOutputQuery}
                    onChange={(e) => {
                      setStrategyOutputQuery(e.target.value);
                      startTransition(() => {
                        setStrategyThemesPage(0);
                        setStrategyGapsPage(0);
                      });
                    }}
                    placeholder="Filter audience, themes, gaps…"
                    className="h-9 rounded-xl border-blue-100/90 pl-8 pr-8 text-[13px] dark:border-blue-900/50"
                  />
                  {strategyOutputQuery.trim() ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-600"
                      aria-label="Clear filter"
                      onClick={() => {
                        setStrategyOutputQuery("");
                        startTransition(() => {
                          setStrategyThemesPage(0);
                          setStrategyGapsPage(0);
                        });
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                {workspace.strategy ? (
                  <div className="mt-4 space-y-4">
                    {audienceMatches ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Target audience
                        </p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                          {workspace.strategy.targetAudience}
                        </p>
                      </div>
                    ) : strategyOutQ ? (
                      <p className="text-xs text-zinc-500">No target audience match for that filter.</p>
                    ) : null}

                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Content themes
                      </p>
                      {filteredStrategyThemes.length > STRATEGY_THEMES_PAGE_SIZE ? (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-b border-blue-100/80 pb-3 dark:border-blue-900/40">
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Showing {safeStrategyThemesPage * STRATEGY_THEMES_PAGE_SIZE + 1}–
                            {Math.min(
                              (safeStrategyThemesPage + 1) * STRATEGY_THEMES_PAGE_SIZE,
                              filteredStrategyThemes.length,
                            )}{" "}
                            of {filteredStrategyThemes.length}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-0.5 rounded-lg px-2"
                              disabled={safeStrategyThemesPage <= 0}
                              onClick={() => setStrategyThemesPage((p) => Math.max(0, p - 1))}
                              aria-label="Previous themes page"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="min-w-[5.5rem] text-center tabular-nums text-xs text-zinc-600 dark:text-zinc-400">
                              Page {safeStrategyThemesPage + 1} / {themesPageCount}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-0.5 rounded-lg px-2"
                              disabled={safeStrategyThemesPage >= themesPageCount - 1}
                              onClick={() => setStrategyThemesPage((p) => Math.min(themesPageCount - 1, p + 1))}
                              aria-label="Next themes page"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {themesSlice.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {themesSlice.map((theme, i) => (
                            <span
                              key={`th-${safeStrategyThemesPage}-${i}`}
                              className="inline-flex max-w-full rounded-lg bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-blue-900 dark:bg-blue-950/40 dark:text-blue-100"
                            >
                              {theme}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-500">No themes match that filter.</p>
                      )}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            Market gaps
                          </p>
                          <p className="mt-0.5 text-[10.5px] text-zinc-400 dark:text-zinc-500">
                            Hover gap text for the full modal — pointer away closes it (checkbox selects for bulk remove).
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {gapsSlice.length > 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-zinc-600"
                              onClick={() => selectAllGapsOnPage()}
                            >
                              {gapsSlice.every((g) => marketGapSelected.includes(g)) ? "Deselect page" : "Select page"}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-lg text-xs"
                            disabled={researchPatchBusy || marketGapSelected.length === 0}
                            onClick={() => void runRemoveSelectedGaps()}
                          >
                            Remove selected gaps
                          </Button>
                        </div>
                      </div>
                      {filteredStrategyGaps.length > STRATEGY_GAPS_PAGE_SIZE ? (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-b border-blue-100/80 pb-3 dark:border-blue-900/40">
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Showing {safeStrategyGapsPage * STRATEGY_GAPS_PAGE_SIZE + 1}–
                            {Math.min(
                              (safeStrategyGapsPage + 1) * STRATEGY_GAPS_PAGE_SIZE,
                              filteredStrategyGaps.length,
                            )}{" "}
                            of {filteredStrategyGaps.length}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-0.5 rounded-lg px-2"
                              disabled={safeStrategyGapsPage <= 0}
                              onClick={() => setStrategyGapsPage((p) => Math.max(0, p - 1))}
                              aria-label="Previous gaps page"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="min-w-[5.5rem] text-center tabular-nums text-xs text-zinc-600 dark:text-zinc-400">
                              Page {safeStrategyGapsPage + 1} / {strategyGapsPageCount}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-0.5 rounded-lg px-2"
                              disabled={safeStrategyGapsPage >= strategyGapsPageCount - 1}
                              onClick={() => setStrategyGapsPage((p) => Math.min(strategyGapsPageCount - 1, p + 1))}
                              aria-label="Next gaps page"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {gapsSlice.length > 0 ? (
                        <ul className="mt-2 space-y-2">
                          {gapsSlice.map((g, i) => (
                            <li
                              key={`gap-${safeStrategyGapsPage}-${i}`}
                              className="group flex gap-2.5 rounded-xl border border-blue-100/90 bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-zinc-700 shadow-sm transition-[border-color,box-shadow] dark:border-blue-900/50 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:border-blue-700/60"
                            >
                              <input
                                type="checkbox"
                                className="mt-1 size-3.5 shrink-0 rounded border-zinc-300 text-blue-600"
                                checked={marketGapSelected.includes(g)}
                                onChange={() => toggleMarketGapSelect(g)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select market gap ${safeStrategyGapsPage * STRATEGY_GAPS_PAGE_SIZE + i + 1}`}
                              />
                              <div
                                className="-mx-1 -my-1 min-w-0 flex-1 cursor-default rounded-lg px-2 py-1 text-left transition-colors hover:bg-blue-50/90 dark:hover:bg-zinc-800/90"
                                onMouseEnter={() => {
                                  cancelMarketGapHoverClose();
                                  cancelResearchHoverClose();
                                  setResearchHoverModal(null);
                                  setMarketGapModalText(g);
                                }}
                                onMouseLeave={scheduleMarketGapHoverClose}
                              >
                                <span className="line-clamp-3 block">{g}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-500">
                          {(workspace.strategy.marketGaps?.length ?? 0) === 0 ? "—" : "No gaps match that filter."}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">Run strategy to populate audience and themes.</p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <Label
                      htmlFor="cc-competitor-search"
                      className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      Research and gaps
                    </Label>
                    <p className="mt-1 max-w-[20rem] text-[10.5px] leading-snug text-zinc-400 dark:text-zinc-500">
                      Hover a competitor card for the full detail modal — pointer away from the card closes it.
                    </p>
                  </div>
                  {researchSlice.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-zinc-600"
                      onClick={() => selectAllResearchOnPage()}
                    >
                      {researchSlice.every((c) => researchCardSelected.includes(c.id)) ? "Deselect page" : "Select page"}
                    </Button>
                  ) : null}
                </div>
                <Input
                  id="cc-competitor-search"
                  value={competitorResearchQuery}
                  onChange={(e) => {
                    setCompetitorResearchQuery(e.target.value);
                    setCompetitorResearchPage(0);
                  }}
                  placeholder="Filter by name, domain, positioning, strengths…"
                  className="rounded-xl border-blue-100/90 dark:border-blue-900/50"
                />
                {filteredResearchCompetitors.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100/80 pb-3 dark:border-blue-900/40">
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Showing {safeResearchPage * COMPETITOR_RESEARCH_PAGE_SIZE + 1}–
                      {Math.min(
                        (safeResearchPage + 1) * COMPETITOR_RESEARCH_PAGE_SIZE,
                        filteredResearchCompetitors.length,
                      )}{" "}
                      of {filteredResearchCompetitors.length}
                      {researchCompetitors.length !== filteredResearchCompetitors.length ? (
                        <span> ({researchCompetitors.length} total)</span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-0.5 rounded-lg px-2"
                        disabled={safeResearchPage <= 0}
                        onClick={() => setCompetitorResearchPage((p) => Math.max(0, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                      </Button>
                      <span className="min-w-[5.5rem] text-center tabular-nums text-xs text-zinc-600 dark:text-zinc-400">
                        Page {safeResearchPage + 1} / {researchPageCount}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-0.5 rounded-lg px-2"
                        disabled={safeResearchPage >= researchPageCount - 1}
                        onClick={() => setCompetitorResearchPage((p) => Math.min(researchPageCount - 1, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ) : null}
                {filteredResearchCompetitors.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    {researchCompetitors.length === 0 ? "No competitor cards yet." : "No matches—try a different search."}
                  </p>
                )}
                <div className="min-h-0 space-y-2.5 overflow-y-auto pr-1">
                  {researchSlice.map((c) => (
                    <div
                      key={c.id}
                      onMouseEnter={() => {
                        cancelResearchHoverClose();
                        cancelMarketGapHoverClose();
                        setMarketGapModalText(null);
                        setResearchHoverModal(c);
                      }}
                      onMouseLeave={scheduleResearchHoverClose}
                      className="flex min-h-[14rem] flex-col gap-2 rounded-2xl border border-blue-100/90 bg-white p-4 text-sm shadow-sm outline-none transition hover:border-blue-200 hover:shadow-md dark:border-blue-900/50 dark:bg-zinc-900/80 dark:hover:border-blue-800"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 size-3.5 shrink-0 rounded border-zinc-300 text-blue-600"
                          checked={researchCardSelected.includes(c.id)}
                          onChange={() => toggleResearchCardSelect(c.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${c.name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-zinc-900 dark:text-zinc-50">{c.name}</p>
                          {c.domain ? (
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">Domain: {c.domain}</p>
                          ) : c.website ? (
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{c.website}</p>
                          ) : null}
                          {c.marketRank ? (
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">Segment / rank: {c.marketRank}</p>
                          ) : null}
                        </div>
                        <Badge
                          className={
                            c.source === "Setup"
                              ? "shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200"
                              : "shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                          }
                        >
                          {c.source}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{c.positioning}</p>
                      <p className="mt-auto text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Strengths:</span> {c.strengths.join(", ")}
                      </p>
                      <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Weaknesses:</span> {c.weaknesses.join(", ")}
                      </p>
                      <div className="flex flex-wrap gap-1.5 border-t border-blue-100/80 pt-2 dark:border-blue-900/40">
                        {gapLinesForCompetitorCard(c, workspace.strategy?.marketGaps).map((gap, index) => (
                          <Badge
                            key={`${c.id}-gap-${index}`}
                            className="bg-amber-100 text-amber-900 dark:bg-amber-950/35 dark:text-amber-100"
                          >
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

        {/* Content queue — compact cards, 3 per row on xl */}
        <Card className="flex min-h-0 w-full shrink-0 flex-col rounded-2xl border-blue-100/90 bg-white shadow-sm shadow-blue-900/[0.03] dark:border-blue-900/50 dark:bg-zinc-900/40 xl:col-span-7 xl:min-h-[46rem]">
          <CardHeader className="shrink-0 pb-2">
            <div className="flex w-full items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base text-slate-900 dark:text-zinc-50">Content queue</CardTitle>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Pagination above the grid · uniform card height</p>
                <p className="mt-1 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                  {contentCreatedMeta || "Latest content created: — (no posts in the library yet)"}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={contentLoading || workspace.content.length === 0}
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  Delete all generated
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-xl"
                  disabled={aiJobActive || !workspaceReady}
                  onClick={() => void runContent()}
                >
                  {contentLoading ? "Refreshing…" : workspaceReady ? "Regenerate library only" : "Setup required"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-2 pb-5">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {[7, 14, 21, 30].map((days) => (
                <Button
                  key={days}
                  type="button"
                  size="sm"
                  variant={calendarDays === days ? "default" : "outline"}
                  className="rounded-xl"
                  onClick={() => {
                    setCalendarDays(days);
                    setContentQueuePage(0);
                  }}
                >
                  {days}d
                </Button>
              ))}
              <span className="text-xs text-slate-500 dark:text-slate-400">Calendar length</span>
            </div>
            {workspace.content.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100/80 pb-3 dark:border-blue-900/40">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Showing {safeContentQueuePage * CONTENT_QUEUE_PAGE_SIZE + 1}–
                  {Math.min((safeContentQueuePage + 1) * CONTENT_QUEUE_PAGE_SIZE, workspace.content.length)} of{" "}
                  {workspace.content.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-0.5 rounded-lg px-2"
                    disabled={safeContentQueuePage <= 0}
                    onClick={() => setContentQueuePage((p) => Math.max(0, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Button>
                  <span className="min-w-[5.5rem] text-center tabular-nums text-xs text-zinc-600 dark:text-zinc-400">
                    Page {safeContentQueuePage + 1} / {contentQueuePageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-0.5 rounded-lg px-2"
                    disabled={safeContentQueuePage >= contentQueuePageCount - 1}
                    onClick={() => setContentQueuePage((p) => Math.min(contentQueuePageCount - 1, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ) : null}
            {workspace.content.length === 0 && (
              <div className="rounded-2xl border border-dashed border-blue-200/80 bg-blue-50/30 py-10 text-center text-sm text-slate-600 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-slate-400">
                No content yet. Regenerate the library.
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {contentQueueSlice.map((item) => {
                  const bodyPreview = formatQueueBodyPreview(item.contentText);
                  return (
                    <div
                      key={item.id}
                      tabIndex={0}
                      onClick={() => setPreviewItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setPreviewItem(item);
                        }
                      }}
                      className="flex h-[23rem] cursor-pointer flex-col gap-2 rounded-2xl border border-blue-100/90 bg-white p-4 shadow-sm outline-none transition hover:border-blue-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-blue-900/50 dark:bg-zinc-900/80 dark:hover:border-blue-800"
                      aria-label={`Open preview: ${item.title}`}
                    >
                      <div className="flex shrink-0 items-start gap-3">
                        <ContentQueueThumb item={item} />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">{formatQueueDate(item)}</p>
                          <p
                            className="line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50"
                            title={item.title}
                          >
                            {item.title}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            <span className="font-medium text-zinc-600 dark:text-zinc-400">Format</span> · {item.mediaType}
                          </p>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-hidden">
                        {bodyPreview ? (
                          <p
                            className="line-clamp-4 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300"
                            title={bodyPreview}
                          >
                            {bodyPreview}
                          </p>
                        ) : (
                          <p className="text-xs italic text-zinc-400">No body text yet.</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <PlatformBadge platform={item.selectedPlatform} />
                        <ContentStatusBadge status={item.status} />
                      </div>
                      <div
                        className="mt-auto shrink-0 flex flex-wrap gap-1.5 border-t border-blue-100/80 pt-3 dark:border-blue-900/40"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {item.status === "PENDING" && (
                          <Button type="button" size="sm" className="h-9 flex-1 rounded-lg px-3 text-xs sm:flex-none" onClick={() => openPlatformModal(item.id)}>
                            Approve
                          </Button>
                        )}
                        {item.status === "APPROVED" && (
                          <Button type="button" size="sm" variant="secondary" className="h-9 flex-1 rounded-lg px-3 text-xs sm:flex-none" onClick={() => openPlatformModal(item.id)}>
                            Platform
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-lg px-3 text-xs"
                          disabled={item.status === "PUBLISHED"}
                          onClick={() => void reject(item.id).then(() => push("Marked as rejected"))}
                        >
                          Reject
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg px-3 text-xs" onClick={() => openEdit(item)}>
                          Edit
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-9 rounded-lg px-3 text-xs" onClick={() => setPreviewItem(item)}>
                          Preview
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/*
        Right column — scheduled posts + week preview (hidden; use Pipeline → Scheduling for slots).
        <Card className="rounded-2xl border-zinc-200 shadow-sm xl:col-span-4">…</Card>
        */}
      </div>

      <PlatformSelectDialog
        open={Boolean(platformTargetId)}
        onOpenChange={(o) => !o && setPlatformTargetId(null)}
        onConfirm={(platforms) => void handlePlatformConfirm(platforms)}
      />

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete all generated content?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">
                {(workspace?.content ?? []).length} item{(workspace?.content ?? []).length !== 1 ? "s" : ""}
              </span>{" "}
              from your content queue. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setBulkDeleteOpen(false)}>
              No, keep them
            </Button>
            <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => void runBulkDeleteGenerated()}>
              Yes, delete all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={competitorAllDeleteOpen} onOpenChange={setCompetitorAllDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete all saved competitors?</DialogTitle>
            <DialogDescription>
              This removes{" "}
              <span className="font-semibold text-foreground">{(workspace?.competitors ?? []).length}</span> saved competitor card
              {(workspace?.competitors ?? []).length !== 1 ? "s" : ""} from your workspace. Manual rows in this panel are unchanged. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCompetitorAllDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => void runDeleteAllSavedCompetitors()}>
              Delete all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        modal={false}
        open={marketGapModalText !== null}
        onOpenChange={(open) => {
          if (!open) {
            cancelMarketGapHoverClose();
            setMarketGapModalText(null);
          }
        }}
      >
        <DialogContent
          overlayClassName="pointer-events-none bg-zinc-900/25 backdrop-blur-[1px]"
          className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
          onMouseEnter={cancelMarketGapHoverClose}
          onMouseLeave={scheduleMarketGapHoverClose}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {marketGapModalText ? (
            <>
              <DialogHeader className="shrink-0 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
                <DialogTitle>Market gap</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  Hover a gap line to open — move the pointer off the row and this panel to close.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">{marketGapModalText}</p>
              </div>
              <DialogFooter className="shrink-0 border-t border-zinc-100 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/80">
                <Button
                  type="button"
                  className="rounded-xl"
                  onClick={() => {
                    cancelMarketGapHoverClose();
                    setMarketGapModalText(null);
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        modal={false}
        open={researchHoverModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            cancelResearchHoverClose();
            setResearchHoverModal(null);
          }
        }}
      >
        <DialogContent
          overlayClassName="pointer-events-none bg-zinc-900/25 backdrop-blur-[1px]"
          className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
          onMouseEnter={cancelResearchHoverClose}
          onMouseLeave={scheduleResearchHoverClose}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {researchHoverModal ? (
            <>
              <DialogHeader className="shrink-0 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-2 pr-6">
                  <DialogTitle className="text-left leading-snug">{researchHoverModal.name}</DialogTitle>
                  <Badge
                    className={
                      researchHoverModal.source === "Setup"
                        ? "shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200"
                        : "shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                    }
                  >
                    {researchHoverModal.source}
                  </Badge>
                </div>
                <DialogDescription className="text-zinc-500">
                  Hover a research card to open this panel — move the pointer away from the card and this window to close.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
                {researchHoverModal.domain ? (
                  <p>
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">Domain:</span> {researchHoverModal.domain}
                  </p>
                ) : researchHoverModal.website ? (
                  <p>
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">Site:</span> {researchHoverModal.website}
                  </p>
                ) : null}
                {researchHoverModal.marketRank ? (
                  <p>
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">Segment / rank:</span>{" "}
                    {researchHoverModal.marketRank}
                  </p>
                ) : null}
                <p>
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Positioning</span>
                </p>
                <p className="text-zinc-700 dark:text-zinc-200">{researchHoverModal.positioning}</p>
                {researchHoverModal.marketGap ? (
                  <p>
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">Gap:</span> {researchHoverModal.marketGap}
                  </p>
                ) : null}
                {researchHoverModal.marketingPurpose ? (
                  <p>
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">Purpose:</span>{" "}
                    {researchHoverModal.marketingPurpose}
                  </p>
                ) : null}
                <p>
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Strengths:</span>{" "}
                  {researchHoverModal.strengths.join(", ")}
                </p>
                <p>
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Weaknesses:</span>{" "}
                  {researchHoverModal.weaknesses.join(", ")}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {gapLinesForCompetitorCard(researchHoverModal, workspace?.strategy?.marketGaps).map((gap, index) => (
                    <Badge
                      key={`modal-${researchHoverModal.id}-gap-${index}`}
                      className="bg-amber-100 text-amber-900 dark:bg-amber-950/35 dark:text-amber-100"
                    >
                      Gap {index + 1}: {gap}
                    </Badge>
                  ))}
                </div>
              </div>
              <DialogFooter className="shrink-0 border-t border-zinc-100 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/80">
                <Button
                  type="button"
                  className="rounded-xl"
                  onClick={() => {
                    cancelResearchHoverClose();
                    setResearchHoverModal(null);
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

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
