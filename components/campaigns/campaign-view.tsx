"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Edit2,
  Megaphone,
  Pause,
  Play,
  Plus,
  Rocket,
  Search,
  Target,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ContentStatusBadge } from "@/components/status-badge";
import { MediaPreviewBlock } from "@/components/media-preview-block";
import { useCampaignStore, type CreateCampaignPayload } from "@/lib/campaign-store";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";
import type { CampaignGoal, ContentCampaign, ContentItem, PublishingPlatform } from "@/lib/types";
import { platformLabel } from "@/lib/platform";

// ─── constants ──────────────────────────────────────────────────────────────

const GOALS: { id: CampaignGoal; label: string; description: string; icon: typeof Target }[] = [
  { id: "Awareness", label: "Brand Awareness", description: "Reach new audiences and grow visibility", icon: Megaphone },
  { id: "Engagement", label: "Engagement", description: "Drive likes, comments and shares", icon: Zap },
  { id: "LeadGen", label: "Lead Generation", description: "Capture leads and grow your pipeline", icon: Users },
  { id: "Conversion", label: "Conversion", description: "Turn followers into customers", icon: Target },
];

const PLATFORM_OPTIONS: { id: PublishingPlatform; label: string }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "twitter", label: "Twitter / X" },
];

const STATUS_COLORS: Record<ContentCampaign["status"], string> = {
  Draft: "bg-zinc-100 text-zinc-600 border-zinc-200",
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Paused: "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-blue-50 text-blue-700 border-blue-200",
};

const GOAL_COLORS: Record<CampaignGoal, string> = {
  Awareness: "bg-purple-50 text-purple-700 border-purple-200",
  Engagement: "bg-amber-50 text-amber-700 border-amber-200",
  LeadGen: "bg-blue-50 text-blue-700 border-blue-200",
  Conversion: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function goalLabel(goal: CampaignGoal): string {
  return GOALS.find((g) => g.id === goal)?.label ?? goal;
}

// ─── campaign status badge ────────────────────────────────────────────────────

function CampaignStatusBadge({ status }: { status: ContentCampaign["status"] }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", STATUS_COLORS[status])}>
      {status}
    </span>
  );
}

// ─── empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e5e7eb] bg-white px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#f0f4ff]">
        <Megaphone className="size-7 text-[#1a56db]" strokeWidth={1.75} />
      </div>
      <h3 className="mb-1 text-[15px] font-semibold text-[#111827]">No campaigns yet</h3>
      <p className="mb-5 max-w-xs text-[13px] text-[#6b7280]">
        Create your first campaign to organise content, set goals and publish across all your platforms at once.
      </p>
      <Button onClick={onNew} className="h-9 gap-2 rounded-xl bg-[#1a56db] text-white hover:bg-[#1648c0]">
        <Plus className="size-3.5" strokeWidth={2.5} />
        New Campaign
      </Button>
    </div>
  );
}

// ─── campaign card ────────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  contentCount,
  onClick,
}: {
  campaign: ContentCampaign;
  contentCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-2xl border border-[#e5e7eb] bg-white p-4 text-left shadow-sm transition-all hover:border-[#1a56db]/30 hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-[#111827] group-hover:text-[#1a56db]">{campaign.name}</p>
          {campaign.description && (
            <p className="mt-0.5 line-clamp-2 text-[12px] text-[#6b7280]">{campaign.description}</p>
          )}
        </div>
        <CampaignStatusBadge status={campaign.status} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", GOAL_COLORS[campaign.goal])}>
          {goalLabel(campaign.goal)}
        </span>
        {campaign.platforms.slice(0, 3).map((p) => (
          <span key={p} className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-2 py-0.5 text-[11px] font-medium text-[#374151]">
            {platformLabel(p)}
          </span>
        ))}
        {campaign.platforms.length > 3 && (
          <span className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-2 py-0.5 text-[11px] font-medium text-[#6b7280]">
            +{campaign.platforms.length - 3}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[11.5px] text-[#6b7280]">
        <span className="flex items-center gap-1">
          <Clock className="size-3" strokeWidth={1.75} />
          {formatDate(campaign.startDate)} → {formatDate(campaign.endDate)}
        </span>
        <span className="flex items-center gap-1 font-medium">
          <CheckCircle2 className="size-3 text-[#1a56db]" strokeWidth={1.75} />
          {contentCount} post{contentCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-[11.5px] font-medium text-[#1a56db] opacity-0 transition-opacity group-hover:opacity-100">
        View campaign <ChevronRight className="size-3.5" strokeWidth={2} />
      </div>
    </button>
  );
}

// ─── step 1: campaign details ─────────────────────────────────────────────────

interface Step1Data {
  name: string;
  description: string;
  goal: CampaignGoal;
  platforms: PublishingPlatform[];
  budget: string;
  startDate: string;
  endDate: string;
}

function Step1Details({
  data,
  onChange,
}: {
  data: Step1Data;
  onChange: (patch: Partial<Step1Data>) => void;
}) {
  function togglePlatform(id: PublishingPlatform) {
    const has = data.platforms.includes(id);
    onChange({ platforms: has ? data.platforms.filter((p) => p !== id) : [...data.platforms, id] });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="camp-name" className="text-[13px] font-medium">Campaign name <span className="text-red-500">*</span></Label>
        <Input
          id="camp-name"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Summer Product Launch"
          className="h-9 rounded-xl border-[#e5e7eb] text-[13px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="camp-desc" className="text-[13px] font-medium">Description</Label>
        <Textarea
          id="camp-desc"
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Brief overview of the campaign objective…"
          rows={2}
          className="resize-none rounded-xl border-[#e5e7eb] text-[13px]"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[13px] font-medium">Campaign goal <span className="text-red-500">*</span></Label>
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ goal: id })}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                data.goal === id
                  ? "border-[#1a56db] bg-[#f0f4ff]"
                  : "border-[#e5e7eb] bg-white hover:border-[#1a56db]/40 hover:bg-[#f9fafb]",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", data.goal === id ? "text-[#1a56db]" : "text-[#9ca3af]")} strokeWidth={1.75} />
              <div>
                <p className={cn("text-[12px] font-semibold", data.goal === id ? "text-[#1a56db]" : "text-[#374151]")}>{label}</p>
                <p className="text-[11px] text-[#6b7280]">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[13px] font-medium">Platforms <span className="text-red-500">*</span></Label>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map(({ id, label }) => {
            const active = data.platforms.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => togglePlatform(id)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
                  active
                    ? "border-[#1a56db] bg-[#1a56db] text-white"
                    : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#1a56db]/40",
                )}
              >
                {active && <CheckCircle2 className="size-3.5" strokeWidth={2} />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="camp-start" className="text-[13px] font-medium">Start date</Label>
          <Input
            id="camp-start"
            type="date"
            value={data.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
            className="h-9 rounded-xl border-[#e5e7eb] text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="camp-end" className="text-[13px] font-medium">End date</Label>
          <Input
            id="camp-end"
            type="date"
            value={data.endDate}
            onChange={(e) => onChange({ endDate: e.target.value })}
            className="h-9 rounded-xl border-[#e5e7eb] text-[13px]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="camp-budget" className="text-[13px] font-medium">Daily budget (USD)</Label>
        <Input
          id="camp-budget"
          type="number"
          min="0"
          step="1"
          value={data.budget}
          onChange={(e) => onChange({ budget: e.target.value })}
          placeholder="0"
          className="h-9 rounded-xl border-[#e5e7eb] text-[13px]"
        />
      </div>
    </div>
  );
}

// ─── step 2: assign content ───────────────────────────────────────────────────

function Step2Content({
  allContent,
  selectedIds,
  onToggle,
}: {
  allContent: ContentItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allContent;
    return allContent.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.contentText.toLowerCase().includes(q) ||
        (c.selectedPlatform ?? "").toLowerCase().includes(q),
    );
  }, [allContent, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9ca3af]" strokeWidth={1.75} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts…"
          className="h-9 rounded-xl border-[#e5e7eb] pl-8 text-[13px]"
        />
      </div>

      {selectedIds.length > 0 && (
        <p className="text-[12px] font-medium text-[#1a56db]">
          {selectedIds.length} post{selectedIds.length !== 1 ? "s" : ""} selected
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e5e7eb] py-10 text-center text-[13px] text-[#9ca3af]">
          {allContent.length === 0 ? "No content in your library yet." : "No posts match your search."}
        </div>
      ) : (
        <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
          {filtered.map((item) => {
            const selected = selectedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  selected
                    ? "border-[#1a56db] bg-[#f0f4ff]"
                    : "border-[#e5e7eb] bg-white hover:border-[#1a56db]/30 hover:bg-[#f9fafb]",
                )}
              >
                {/* thumbnail */}
                <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f9fafb]">
                  <MediaPreviewBlock
                    url={item.mediaPreview}
                    mediaType={item.mediaType}
                    className="size-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn("truncate text-[12.5px] font-semibold", selected ? "text-[#1a56db]" : "text-[#111827]")}>
                      {item.title}
                    </p>
                    <ContentStatusBadge status={item.status} />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11.5px] text-[#6b7280]">{item.contentText}</p>
                  {item.selectedPlatform && (
                    <span className="mt-1 inline-block text-[11px] text-[#9ca3af]">{platformLabel(item.selectedPlatform)}</span>
                  )}
                </div>

                <div className={cn("mt-0.5 shrink-0 rounded-full border-2 size-5 flex items-center justify-center transition-colors", selected ? "border-[#1a56db] bg-[#1a56db]" : "border-[#d1d5db] bg-white")}>
                  {selected && <CheckCircle2 className="size-3 text-white" strokeWidth={2.5} />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── step 3: review & launch ──────────────────────────────────────────────────

function Step3Review({
  step1,
  selectedContent,
}: {
  step1: Step1Data;
  selectedContent: ContentItem[];
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 space-y-3">
        <h4 className="text-[13px] font-semibold text-[#111827]">Campaign summary</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
          <div>
            <span className="text-[#9ca3af]">Name</span>
            <p className="font-medium text-[#111827]">{step1.name || "—"}</p>
          </div>
          <div>
            <span className="text-[#9ca3af]">Goal</span>
            <p className="font-medium text-[#111827]">{goalLabel(step1.goal)}</p>
          </div>
          <div>
            <span className="text-[#9ca3af]">Platforms</span>
            <p className="font-medium text-[#111827]">
              {step1.platforms.length > 0 ? step1.platforms.map((p) => platformLabel(p)).join(", ") : "—"}
            </p>
          </div>
          <div>
            <span className="text-[#9ca3af]">Budget/day</span>
            <p className="font-medium text-[#111827]">${Number(step1.budget) || 0}</p>
          </div>
          <div>
            <span className="text-[#9ca3af]">Dates</span>
            <p className="font-medium text-[#111827]">
              {step1.startDate ? formatDate(step1.startDate) : "—"} → {step1.endDate ? formatDate(step1.endDate) : "—"}
            </p>
          </div>
          <div>
            <span className="text-[#9ca3af]">Posts assigned</span>
            <p className="font-medium text-[#111827]">{selectedContent.length}</p>
          </div>
        </div>
        {step1.description && (
          <div>
            <span className="text-[12px] text-[#9ca3af]">Description</span>
            <p className="text-[12.5px] text-[#374151]">{step1.description}</p>
          </div>
        )}
      </div>

      {selectedContent.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-[#374151]">Assigned content ({selectedContent.length})</p>
          <div className="max-h-[200px] space-y-1.5 overflow-y-auto">
            {selectedContent.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2">
                <div className="size-8 shrink-0 overflow-hidden rounded-md border border-[#e5e7eb] bg-[#f9fafb]">
                  <MediaPreviewBlock url={c.mediaPreview} mediaType={c.mediaType} className="size-full object-cover" />
                </div>
                <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#374151]">{c.title}</p>
                <ContentStatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── create / edit dialog ─────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Details" },
  { id: 2, label: "Content" },
  { id: 3, label: "Review" },
] as const;

interface CreateDialogProps {
  open: boolean;
  onClose: () => void;
  editTarget?: ContentCampaign | null;
  allContent: ContentItem[];
}

function CreateCampaignDialog({ open, onClose, editTarget, allContent }: CreateDialogProps) {
  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const updateCampaign = useCampaignStore((s) => s.updateCampaign);
  const { push: pushToast } = useToast();

  const defaultStep1: Step1Data = {
    name: "",
    description: "",
    goal: "Awareness",
    platforms: ["linkedin"],
    budget: "",
    startDate: "",
    endDate: "",
  };

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [step1, setStep1] = useState<Step1Data>(defaultStep1);
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      setStep1({
        name: editTarget.name,
        description: editTarget.description,
        goal: editTarget.goal,
        platforms: editTarget.platforms,
        budget: String(editTarget.budget),
        startDate: editTarget.startDate?.slice(0, 10) ?? "",
        endDate: editTarget.endDate?.slice(0, 10) ?? "",
      });
      setSelectedContentIds(editTarget.contentIds);
    } else {
      setStep1(defaultStep1);
      setSelectedContentIds([]);
    }
    setStep(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTarget?.id]);

  function toggleContentId(id: string) {
    setSelectedContentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function canAdvance(): boolean {
    if (step === 1) return step1.name.trim().length > 0 && step1.platforms.length > 0;
    return true;
  }

  async function handleSave(status: "Draft" | "Active") {
    if (!step1.name.trim()) {
      pushToast("Campaign name is required.", { kind: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload: CreateCampaignPayload = {
        name: step1.name.trim(),
        description: step1.description.trim(),
        goal: step1.goal,
        platforms: step1.platforms,
        budget: Number(step1.budget) || 0,
        startDate: step1.startDate || null,
        endDate: step1.endDate || null,
        contentIds: selectedContentIds,
        status,
      };
      if (editTarget) {
        updateCampaign({ id: editTarget.id, ...payload });
        pushToast("Campaign updated.", { kind: "success" });
      } else {
        createCampaign(payload);
        pushToast(
          status === "Active" ? "Campaign launched! 🚀" : "Campaign saved as draft.",
          { kind: "success" },
        );
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const selectedContent = useMemo(
    () => allContent.filter((c) => selectedContentIds.includes(c.id)),
    [allContent, selectedContentIds],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-[#e5e7eb] px-6 py-4">
          <DialogTitle className="text-[15px] font-semibold text-[#111827]">
            {editTarget ? "Edit campaign" : "Create campaign"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {editTarget ? "Edit your existing campaign." : "Set up a new campaign in 3 steps."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-0 border-b border-[#e5e7eb] bg-[#f9fafb] px-6 py-2.5">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                    step > s.id
                      ? "bg-[#1a56db] text-white"
                      : step === s.id
                        ? "bg-[#1a56db] text-white"
                        : "bg-[#e5e7eb] text-[#9ca3af]",
                  )}
                >
                  {step > s.id ? <CheckCircle2 className="size-3" strokeWidth={2.5} /> : s.id}
                </div>
                <span className={cn("text-[12px] font-medium", step >= s.id ? "text-[#111827]" : "text-[#9ca3af]")}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("mx-2 h-px w-6 flex-1", step > s.id ? "bg-[#1a56db]" : "bg-[#e5e7eb]")} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: "calc(90vh - 200px)" }}>
          {step === 1 && (
            <Step1Details data={step1} onChange={(patch) => setStep1((prev) => ({ ...prev, ...patch }))} />
          )}
          {step === 2 && (
            <Step2Content allContent={allContent} selectedIds={selectedContentIds} onToggle={toggleContentId} />
          )}
          {step === 3 && <Step3Review step1={step1} selectedContent={selectedContent} />}
        </div>

        <DialogFooter className="flex items-center justify-between border-t border-[#e5e7eb] px-6 py-4">
          <div>
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((prev) => (prev - 1) as 1 | 2 | 3)}
                className="h-9 rounded-xl border-[#e5e7eb] text-[13px]"
                disabled={saving}
              >
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-9 rounded-xl border-[#e5e7eb] text-[13px]"
              disabled={saving}
            >
              Cancel
            </Button>

            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep((prev) => (prev + 1) as 2 | 3)}
                disabled={!canAdvance()}
                className="h-9 gap-1.5 rounded-xl bg-[#1a56db] text-[13px] text-white hover:bg-[#1648c0]"
              >
                Next <ChevronRight className="size-3.5" strokeWidth={2} />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleSave("Draft")}
                  disabled={saving}
                  className="h-9 rounded-xl border-[#e5e7eb] text-[13px]"
                >
                  Save as draft
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSave("Active")}
                  disabled={saving}
                  className="h-9 gap-1.5 rounded-xl bg-[#1a56db] text-[13px] text-white hover:bg-[#1648c0]"
                >
                  <Rocket className="size-3.5" strokeWidth={1.75} />
                  {saving ? "Launching…" : "Launch campaign"}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── add content picker (for detail view) ────────────────────────────────────

function AddContentDialog({
  open,
  onClose,
  campaignId,
  allContent,
  assignedIds,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  allContent: ContentItem[];
  assignedIds: string[];
}) {
  const assignContent = useCampaignStore((s) => s.assignContent);
  const unassignContent = useCampaignStore((s) => s.unassignContent);
  const { push: pushToast } = useToast();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allContent;
    return allContent.filter(
      (c) => c.title.toLowerCase().includes(q) || c.contentText.toLowerCase().includes(q),
    );
  }, [allContent, query]);

  function toggle(id: string) {
    if (assignedIds.includes(id)) {
      unassignContent(campaignId, id);
    } else {
      assignContent(campaignId, id);
      pushToast("Post added to campaign.", { kind: "success" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[80vh] max-w-lg rounded-2xl p-0">
        <DialogHeader className="border-b border-[#e5e7eb] px-6 py-4">
          <DialogTitle className="text-[15px] font-semibold text-[#111827]">Assign content</DialogTitle>
          <DialogDescription className="text-[13px] text-[#6b7280]">
            Select posts from your library to add to this campaign.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: "calc(80vh - 140px)" }}>
          <div className="mb-3 relative">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9ca3af]" strokeWidth={1.75} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search posts…"
              className="h-9 rounded-xl border-[#e5e7eb] pl-8 text-[13px]"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#9ca3af]">No posts found.</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((item) => {
                const assigned = assignedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                      assigned
                        ? "border-[#1a56db] bg-[#f0f4ff]"
                        : "border-[#e5e7eb] bg-white hover:border-[#1a56db]/30",
                    )}
                  >
                    <div className="size-10 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f9fafb]">
                      <MediaPreviewBlock url={item.mediaPreview} mediaType={item.mediaType} className="size-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-[12.5px] font-semibold", assigned ? "text-[#1a56db]" : "text-[#111827]")}>
                        {item.title}
                      </p>
                      <ContentStatusBadge status={item.status} />
                    </div>
                    <div className={cn("shrink-0 rounded-full border-2 size-5 flex items-center justify-center transition-colors", assigned ? "border-[#1a56db] bg-[#1a56db]" : "border-[#d1d5db] bg-white")}>
                      {assigned && <CheckCircle2 className="size-3 text-white" strokeWidth={2.5} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-[#e5e7eb] px-6 py-4">
          <Button onClick={onClose} className="h-9 w-full rounded-xl bg-[#1a56db] text-[13px] text-white hover:bg-[#1648c0]">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── campaign detail view ─────────────────────────────────────────────────────

function CampaignDetail({
  campaign,
  allContent,
  onBack,
  onEdit,
}: {
  campaign: ContentCampaign;
  allContent: ContentItem[];
  onBack: () => void;
  onEdit: () => void;
}) {
  const deleteCampaign = useCampaignStore((s) => s.deleteCampaign);
  const setStatus = useCampaignStore((s) => s.setStatus);
  const unassignContent = useCampaignStore((s) => s.unassignContent);
  const publish = useWorkspaceStore((s) => s.publish);
  const { push: pushToast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const assignedContent = useMemo(
    () => allContent.filter((c) => campaign.contentIds.includes(c.id)),
    [allContent, campaign.contentIds],
  );

  const publishableIds = assignedContent
    .filter((c) => c.status === "APPROVED" || c.status === "SCHEDULED")
    .map((c) => c.id);

  async function handlePublish() {
    if (publishableIds.length === 0) {
      pushToast("No approved posts to publish. Approve content in the Workflow first.", { kind: "info" });
      return;
    }
    setPublishing(true);
    try {
      const { published, warnings } = await publish(publishableIds);
      if (published > 0) {
        setStatus(campaign.id, "Completed");
        pushToast(`Published ${published} post${published !== 1 ? "s" : ""} successfully!`, { kind: "success" });
      }
      if (warnings.length > 0) {
        pushToast(warnings[0], { kind: "error" });
      }
    } finally {
      setPublishing(false);
    }
  }

  function handleDelete() {
    deleteCampaign(campaign.id);
    pushToast("Campaign deleted.", { kind: "info" });
    onBack();
  }

  return (
    <div className="space-y-5">
      {/* Back + title row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex size-8 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f5f7fa] hover:text-[#111827]"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold text-[#111827]">{campaign.name}</h2>
          {campaign.description && (
            <p className="text-[12.5px] text-[#6b7280]">{campaign.description}</p>
          )}
        </div>
        <CampaignStatusBadge status={campaign.status} />
      </div>

      {/* Campaign meta */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div>
            <p className="text-[11.5px] font-medium text-[#9ca3af] uppercase tracking-wide">Goal</p>
            <span className={cn("mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold", GOAL_COLORS[campaign.goal])}>
              {goalLabel(campaign.goal)}
            </span>
          </div>
          <div>
            <p className="text-[11.5px] font-medium text-[#9ca3af] uppercase tracking-wide">Platforms</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {campaign.platforms.map((p) => (
                <span key={p} className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-2 py-0.5 text-[11px] font-medium text-[#374151]">
                  {platformLabel(p)}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11.5px] font-medium text-[#9ca3af] uppercase tracking-wide">Duration</p>
            <p className="mt-1 text-[12.5px] font-medium text-[#374151]">
              {formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}
            </p>
          </div>
          <div>
            <p className="text-[11.5px] font-medium text-[#9ca3af] uppercase tracking-wide">Budget/day</p>
            <p className="mt-1 text-[12.5px] font-medium text-[#374151]">${campaign.budget}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => void handlePublish()}
          disabled={publishing || campaign.status === "Completed"}
          className="h-9 gap-1.5 rounded-xl bg-[#1a56db] text-[13px] text-white hover:bg-[#1648c0] disabled:opacity-50"
        >
          <Rocket className="size-3.5" strokeWidth={1.75} />
          {publishing ? "Publishing…" : `Publish campaign (${publishableIds.length} ready)`}
        </Button>

        {campaign.status === "Active" && (
          <Button type="button" variant="outline" onClick={() => setStatus(campaign.id, "Paused")} className="h-9 gap-1.5 rounded-xl border-[#e5e7eb] text-[13px]">
            <Pause className="size-3.5" strokeWidth={1.75} /> Pause
          </Button>
        )}
        {campaign.status === "Paused" && (
          <Button type="button" variant="outline" onClick={() => setStatus(campaign.id, "Active")} className="h-9 gap-1.5 rounded-xl border-[#e5e7eb] text-[13px]">
            <Play className="size-3.5" strokeWidth={1.75} /> Resume
          </Button>
        )}
        {campaign.status === "Draft" && (
          <Button type="button" variant="outline" onClick={() => setStatus(campaign.id, "Active")} className="h-9 gap-1.5 rounded-xl border-[#e5e7eb] text-[13px]">
            <Play className="size-3.5" strokeWidth={1.75} /> Activate
          </Button>
        )}

        <Button type="button" variant="outline" onClick={onEdit} className="h-9 gap-1.5 rounded-xl border-[#e5e7eb] text-[13px]">
          <Edit2 className="size-3.5" strokeWidth={1.75} /> Edit
        </Button>

        <button
          type="button"
          onClick={() => setDeleteConfirm(true)}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} /> Delete
        </button>
      </div>

      {/* Assigned content */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[#111827]">
            Assigned posts <span className="ml-1 text-[12px] font-normal text-[#6b7280]">({assignedContent.length})</span>
          </h3>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddOpen(true)}
            className="h-8 gap-1.5 rounded-xl border-[#e5e7eb] text-[12.5px]"
          >
            <Plus className="size-3.5" strokeWidth={2.5} /> Add content
          </Button>
        </div>

        {assignedContent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e5e7eb] py-10 text-center">
            <Circle className="mx-auto mb-2 size-8 text-[#d1d5db]" strokeWidth={1} />
            <p className="text-[13px] text-[#9ca3af]">No posts assigned yet.</p>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-2 text-[12.5px] font-medium text-[#1a56db] hover:underline"
            >
              Add content from library
            </button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {assignedContent.map((item) => (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-xl border border-[#e5e7eb] bg-white"
              >
                {/* thumbnail */}
                <div className="aspect-[4/3] w-full overflow-hidden bg-[#f9fafb]">
                  <MediaPreviewBlock
                    url={item.mediaPreview}
                    mediaType={item.mediaType}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="line-clamp-1 text-[12.5px] font-semibold text-[#111827]">{item.title}</p>
                    <ContentStatusBadge status={item.status} />
                  </div>
                  {item.selectedPlatform && (
                    <p className="text-[11px] text-[#9ca3af]">{platformLabel(item.selectedPlatform)}</p>
                  )}
                </div>
                {/* remove button */}
                <button
                  type="button"
                  title="Remove from campaign"
                  onClick={() => unassignContent(campaign.id, item.id)}
                  className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-white/90 text-[#6b7280] opacity-0 shadow transition-opacity hover:text-red-600 group-hover:opacity-100"
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete campaign?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{campaign.name}&quot;. Content items will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleDelete} className="rounded-xl bg-red-600 text-white hover:bg-red-700">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddContentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        campaignId={campaign.id}
        allContent={allContent}
        assignedIds={campaign.contentIds}
      />
    </div>
  );
}

// ─── campaign list ────────────────────────────────────────────────────────────

const FILTER_OPTIONS = ["All", "Draft", "Active", "Paused", "Completed"] as const;

function CampaignList({
  campaigns,
  allContent,
  onNew,
  onSelect,
}: {
  campaigns: ContentCampaign[];
  allContent: ContentItem[];
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]>("All");

  const filtered = useMemo(() => {
    let list = campaigns;
    if (filter !== "All") {
      list = list.filter((c) => c.status === filter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [campaigns, filter, query]);

  const counts = useMemo(() => {
    const total = campaigns.length;
    const active = campaigns.filter((c) => c.status === "Active").length;
    const draft = campaigns.filter((c) => c.status === "Draft").length;
    const completed = campaigns.filter((c) => c.status === "Completed").length;
    return { total, active, draft, completed };
  }, [campaigns]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-[#111827]">All campaigns</h2>
          <p className="text-[13px] text-[#6b7280]">Plan, organise and publish content campaigns</p>
        </div>
        <Button
          type="button"
          onClick={onNew}
          className="h-9 gap-1.5 rounded-xl bg-[#1a56db] text-[13px] text-white hover:bg-[#1648c0]"
        >
          <Plus className="size-3.5" strokeWidth={2.5} />
          New campaign
        </Button>
      </div>

      {/* Stats */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: counts.total, color: "text-[#374151]" },
            { label: "Active", value: counts.active, color: "text-emerald-600" },
            { label: "Draft", value: counts.draft, color: "text-zinc-500" },
            { label: "Completed", value: counts.completed, color: "text-blue-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-[#e5e7eb] bg-white p-3 text-center">
              <p className={cn("text-[22px] font-bold", color)}>{value}</p>
              <p className="text-[11.5px] text-[#9ca3af]">{label}</p>
            </div>
          ))}
        </div>
      )}

      {campaigns.length === 0 ? (
        <EmptyState onNew={onNew} />
      ) : (
        <>
          {/* Filter + search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-xl border border-[#e5e7eb] bg-white p-1">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[12px] font-medium transition-colors",
                    filter === f ? "bg-[#1a56db] text-white" : "text-[#6b7280] hover:text-[#111827]",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9ca3af]" strokeWidth={1.75} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search campaigns…"
                className="h-9 rounded-xl border-[#e5e7eb] pl-8 text-[13px]"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#e5e7eb] py-12 text-center text-[13px] text-[#9ca3af]">
              No campaigns match your search.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  contentCount={allContent.filter((item) => c.contentIds.includes(item.id)).length}
                  onClick={() => onSelect(c.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── root campaign view ───────────────────────────────────────────────────────

export function CampaignView() {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const loadCampaigns = useCampaignStore((s) => s.loadCampaigns);
  const selectedCampaignId = useCampaignStore((s) => s.selectedCampaignId);
  const setSelectedCampaign = useCampaignStore((s) => s.setSelectedCampaign);

  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ContentCampaign | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Auto-open the create dialog when navigated here with ?new=1
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditTarget(null);
      setCreateOpen(true);
      // Remove the param without full navigation so closing the dialog doesn't re-open it
      const next = new URLSearchParams(searchParams.toString());
      next.delete("new");
      const qs = next.toString();
      router.replace(qs ? `/campaigns?${qs}` : "/campaigns", { scroll: false });
    }
  }, [searchParams, router]);

  const allContent = workspace?.content ?? [];
  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId) ?? null;

  if (shellPending) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-5 w-44 animate-pulse rounded-lg bg-[#e5e7eb]" />
            <div className="h-4 w-64 animate-pulse rounded-lg bg-[#e5e7eb]" />
          </div>
          <div className="h-9 w-36 animate-pulse rounded-xl bg-[#e5e7eb]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-[#e5e7eb]" />
          ))}
        </div>
      </div>
    );
  }

  function openEdit(c: ContentCampaign) {
    setEditTarget(c);
    setCreateOpen(true);
  }

  function handleCloseDialog() {
    setCreateOpen(false);
    setEditTarget(null);
  }

  return (
    <>
      {selectedCampaign ? (
        <CampaignDetail
          campaign={selectedCampaign}
          allContent={allContent}
          onBack={() => setSelectedCampaign(null)}
          onEdit={() => openEdit(selectedCampaign)}
        />
      ) : (
        <CampaignList
          campaigns={campaigns}
          allContent={allContent}
          onNew={() => { setEditTarget(null); setCreateOpen(true); }}
          onSelect={(id) => setSelectedCampaign(id)}
        />
      )}

      <CreateCampaignDialog
        open={createOpen}
        onClose={handleCloseDialog}
        editTarget={editTarget}
        allContent={allContent}
      />
    </>
  );
}
