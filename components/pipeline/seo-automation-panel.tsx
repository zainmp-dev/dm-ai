"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Globe,
  GripVertical,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StrategyPlan, WorkspaceSnapshot } from "@/lib/types";

export type SeoAutomationState = {
  websiteUrl: string;
  keywords: string[];
  keywordInput: string;
  contentBrief: string;
  automation: {
    autoClusterKeywords: boolean;
    autoGenerateTitles: boolean;
    autoBuildMeta: boolean;
    autoInternalLinks: boolean;
    autoSchemaMarkup: boolean;
  };
};

const AUTOMATION_OPTIONS: {
  key: keyof SeoAutomationState["automation"];
  label: string;
  hint: string;
}[] = [
  { key: "autoClusterKeywords", label: "Keyword clusters", hint: "Group related terms into content pillars" },
  { key: "autoGenerateTitles", label: "Titles & H1", hint: "Draft page titles aligned to search intent" },
  { key: "autoBuildMeta", label: "Meta tags", hint: "Meta title and description for each topic" },
  { key: "autoInternalLinks", label: "Internal links", hint: "Suggest hub pages and cross-links" },
  { key: "autoSchemaMarkup", label: "Schema plan", hint: "FAQ, article, and local business markup" },
];

const BRIEF_MIN_CHARS = 40;

type SeoAutomationPanelProps = {
  workspace: WorkspaceSnapshot;
  seoState: SeoAutomationState;
  onChange: (updater: (prev: SeoAutomationState) => SeoAutomationState) => void;
  onAddKeyword: () => void;
  onUseWorkspaceData: () => void;
  onRunAutoSetup: () => void;
  dragKeywordIndex: number | null;
  onDragKeywordIndex: (index: number | null) => void;
};

function isValidWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function displayHost(url: string) {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "yourdomain.com";
  }
}

function strategyKeywordHints(strategy: StrategyPlan | null): string[] {
  if (!strategy) return [];
  return Array.from(
    new Set(
      [
        ...strategy.contentThemes,
        ...strategy.marketGaps,
        ...strategy.platformFocus,
        strategy.targetAudience,
      ]
        .map((item) => item.trim())
        .filter((item) => item.length > 2 && item.length < 80),
    ),
  ).slice(0, 12);
}

function buildSearchPreview(workspace: WorkspaceSnapshot, seoState: SeoAutomationState) {
  const host = seoState.websiteUrl.trim() ? displayHost(seoState.websiteUrl) : displayHost(workspace.companyWebsite || "example.com");
  const primary = seoState.keywords[0] ?? workspace.companyName;
  const title = `${primary} | ${workspace.companyName}`.slice(0, 60);
  const description = (
    seoState.contentBrief.trim() ||
    `Learn how ${workspace.companyName} helps teams with ${primary}. Guides, comparisons, and resources for ${workspace.workspaceScenario.replace(/-/g, " ")}.`
  ).slice(0, 160);
  const path = `/${primary.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "solutions"}`;
  return { title, description, host, path };
}

export function SeoAutomationPanel({
  workspace,
  seoState,
  onChange,
  onAddKeyword,
  onUseWorkspaceData,
  onRunAutoSetup,
  dragKeywordIndex,
  onDragKeywordIndex,
}: SeoAutomationPanelProps) {
  const urlValid = isValidWebsiteUrl(seoState.websiteUrl);
  const hasKeywords = seoState.keywords.length >= 3;
  const hasBrief = seoState.contentBrief.trim().length >= BRIEF_MIN_CHARS;
  const automationCount = Object.values(seoState.automation).filter(Boolean).length;
  const hasAutomation = automationCount >= 4;

  const checklist = [
    { id: "url", label: "Valid website URL", done: urlValid },
    { id: "keywords", label: "At least 3 target keywords", done: hasKeywords },
    { id: "brief", label: `Content brief (${BRIEF_MIN_CHARS}+ characters)`, done: hasBrief },
    { id: "automation", label: "4+ automations enabled", done: hasAutomation },
  ] as const;

  const seoReadiness = checklist.filter((item) => item.done).length * 25;
  const suggestions = strategyKeywordHints(workspace.strategy).filter((hint) => !seoState.keywords.includes(hint));
  const preview = buildSearchPreview(workspace, seoState);
  const briefChars = seoState.contentBrief.trim().length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
      <div className="space-y-5">
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
                  <Search className="size-5" aria-hidden />
                </div>
                <div>
                  <CardTitle className="text-base">SEO automation setup</CardTitle>
                  <CardDescription className="mt-1 max-w-xl">
                    Connect your site, prioritize keywords, and define what content to generate. Settings save automatically per
                    workspace.
                  </CardDescription>
                </div>
              </div>
              <Badge
                className={cn(
                  "shrink-0",
                  seoReadiness === 100 ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-700",
                )}
              >
                {seoReadiness}% ready
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Setup progress</span>
                <span>{seoReadiness}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    seoReadiness === 100 ? "bg-emerald-600" : "bg-zinc-900",
                  )}
                  style={{ width: `${seoReadiness}%` }}
                />
              </div>
            </div>

            <ul className="grid gap-2 sm:grid-cols-2">
              {checklist.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
                    item.done ? "border-emerald-200 bg-emerald-50/80 text-emerald-900" : "border-zinc-200 bg-zinc-50 text-zinc-600",
                  )}
                >
                  {item.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <Circle className="size-4 shrink-0 text-zinc-400" aria-hidden />
                  )}
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </CardHeader>

          <CardContent className="space-y-4 border-t border-zinc-100 pt-5">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600">
              <span className="font-medium text-zinc-800">{workspace.companyName}</span>
              <span className="text-zinc-300">·</span>
              <span className="capitalize">{workspace.workspaceScenario.replace(/-/g, " ")}</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" className="rounded-lg" onClick={onUseWorkspaceData}>
                  Pull from strategy
                </Button>
                {!workspace.strategy && (
                  <Button type="button" size="sm" variant="ghost" className="rounded-lg" asChild>
                    <Link href="/strategy">Run strategy first</Link>
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seo-website-url" className="flex items-center gap-1.5">
                <Globe className="size-3.5 text-zinc-500" aria-hidden />
                Website URL
              </Label>
              <Input
                id="seo-website-url"
                type="url"
                inputMode="url"
                placeholder="https://yourdomain.com"
                value={seoState.websiteUrl}
                onChange={(e) => onChange((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                className={cn("rounded-xl", seoState.websiteUrl.trim() && !urlValid && "border-amber-300 focus-visible:ring-amber-400")}
                aria-invalid={seoState.websiteUrl.trim() ? !urlValid : undefined}
              />
              {seoState.websiteUrl.trim() && !urlValid && (
                <p className="text-xs text-amber-700">Enter a full URL (e.g. https://yourdomain.com).</p>
              )}
              {urlValid && (
                <a
                  href={seoState.websiteUrl.startsWith("http") ? seoState.websiteUrl : `https://${seoState.websiteUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
                >
                  Open site
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seo-keywords">Target keywords</Label>
              <div className="flex gap-2">
                <Input
                  id="seo-keywords"
                  placeholder="Add keywords — comma-separated or one at a time"
                  value={seoState.keywordInput}
                  onChange={(e) => onChange((prev) => ({ ...prev, keywordInput: e.target.value }))}
                  className="rounded-xl"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddKeyword();
                    }
                  }}
                />
                <Button type="button" variant="secondary" className="shrink-0 rounded-xl" onClick={onAddKeyword}>
                  Add
                </Button>
              </div>
              <p className="text-xs text-zinc-500">Drag chips to set priority. Top keyword drives your search preview.</p>
            </div>

            {suggestions.length > 0 && (
              <div className="space-y-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-3">
                <p className="text-xs font-medium text-zinc-700">Suggested from strategy</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((hint) => (
                    <button
                      key={hint}
                      type="button"
                      className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
                      onClick={() =>
                        onChange((prev) => ({
                          ...prev,
                          keywords: Array.from(new Set([...prev.keywords, hint])).slice(0, 20),
                        }))
                      }
                    >
                      + {hint}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              className="min-h-[3.5rem] rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropIndex = Number(e.currentTarget.getAttribute("data-drop-index") || -1);
                if (dragKeywordIndex === null || dropIndex < 0) return;
                onChange((prev) => {
                  const next = [...prev.keywords];
                  const [moving] = next.splice(dragKeywordIndex, 1);
                  next.splice(dropIndex, 0, moving);
                  return { ...prev, keywords: next };
                });
                onDragKeywordIndex(null);
              }}
              data-drop-index={Math.max(seoState.keywords.length - 1, 0)}
            >
              <div className="flex flex-wrap gap-2">
                {seoState.keywords.length === 0 && (
                  <p className="px-1 py-2 text-xs text-zinc-500">No keywords yet — add manually or pull from strategy.</p>
                )}
                {seoState.keywords.map((keyword, index) => (
                  <div
                    key={`${keyword}-${index}`}
                    className="flex cursor-grab items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-1 pl-2 pr-1 text-xs text-zinc-700 shadow-sm"
                    draggable
                    onDragStart={() => onDragKeywordIndex(index)}
                    onDragEnd={() => onDragKeywordIndex(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragKeywordIndex === null || dragKeywordIndex === index) return;
                      onChange((prev) => {
                        const next = [...prev.keywords];
                        const [moving] = next.splice(dragKeywordIndex, 1);
                        next.splice(index, 0, moving);
                        return { ...prev, keywords: next };
                      });
                      onDragKeywordIndex(null);
                    }}
                  >
                    <GripVertical className="size-3 text-zinc-400" aria-hidden />
                    <span className="font-semibold tabular-nums text-zinc-400">{index + 1}</span>
                    <span className="max-w-[200px] truncate">{keyword}</span>
                    <button
                      type="button"
                      className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                      aria-label={`Remove ${keyword}`}
                      onClick={() => onChange((prev) => ({ ...prev, keywords: prev.keywords.filter((_, i) => i !== index) }))}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="seo-brief">Content automation brief</Label>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    hasBrief ? "text-emerald-600" : briefChars > 0 ? "text-amber-600" : "text-zinc-400",
                  )}
                >
                  {briefChars}/{BRIEF_MIN_CHARS}
                </span>
              </div>
              <Textarea
                id="seo-brief"
                rows={4}
                value={seoState.contentBrief}
                onChange={(e) => onChange((prev) => ({ ...prev, contentBrief: e.target.value }))}
                placeholder="Audience, niche, content types (blogs, landing pages, FAQs), and conversion goals."
                className="min-h-[100px] resize-y rounded-xl"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Search preview</CardTitle>
            <CardDescription>Approximate Google snippet from your top keyword and brief.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-inner">
              <p className="truncate text-xs text-zinc-500">
                {preview.host}
                <span className="text-zinc-400">{preview.path}</span>
              </p>
              <p className="mt-1 truncate text-base font-medium text-[#1a0dab]">{preview.title}</p>
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-zinc-600">{preview.description}</p>
            </div>
            {!hasKeywords && (
              <p className="mt-3 text-xs text-zinc-500">Add keywords to refine the preview title and URL slug.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Automation toggles</CardTitle>
            <CardDescription>Choose what runs continuously for this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {AUTOMATION_OPTIONS.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 transition hover:border-zinc-300"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-zinc-900"
                  checked={seoState.automation[item.key]}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      automation: { ...prev.automation, [item.key]: e.target.checked },
                    }))
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-800">{item.label}</span>
                  <span className="block text-xs text-zinc-500">{item.hint}</span>
                </span>
              </label>
            ))}

            <Button type="button" className="mt-3 w-full rounded-xl gap-2" onClick={onRunAutoSetup}>
              <Sparkles className="size-4" aria-hidden />
              {seoReadiness === 100 ? "Re-run auto setup" : "Run auto SEO setup"}
            </Button>
            <p className="text-center text-xs text-zinc-500">
              Fills gaps from your workspace profile{workspace.strategy ? " and strategy" : ""}.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
