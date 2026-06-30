"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type SunEditorCore from "suneditor/src/lib/core";
import "suneditor/dist/css/suneditor.min.css";
import { AI_MODEL_GROUPS } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api";
import { normalizeFastApiDetail } from "@/lib/api-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { getAuthUser } from "@/lib/auth";
import { useWorkspaceStore } from "@/lib/workspace-store";
import {
  BLOG_AI_DEFAULT_FULL_PARAMS,
  BLOG_AI_GENERATION_MODAL_STEPS,
  BLOG_PRIMARY_BUTTON,
  createBlogCategory,
  createBlogPost,
  deleteBlogCategory,
  fetchBlogCategories,
  fetchBlogPost,
  fetchBlogSettings,
  generateBlogWithAI,
  slugify,
  updateBlogPost,
  uploadBlogFeaturedImage,
  type BlogAIFullGenerateParams,
  type BlogAIGeneratedContent,
  type BlogAIGenerationStep,
  type BlogAIGenerationStepId,
  type BlogAIFormHandlers,
  type BlogCategory,
  type BlogPostInput,
  type BlogStatus,
} from "./blog-core";
import { BlogContentAnalysisPanel } from "./blog-content-analysis-panel";

const SunEditor = dynamic(() => import("suneditor-react"), {
  ssr: false,
  loading: () => <div className="h-[360px] animate-pulse rounded-2xl bg-muted/40" />,
});

type BlogRichEditorProps = {
  value: string;
  onChange: (html: string) => void;
  editorRef?: MutableRefObject<SunEditorCore | null>;
};

export function BlogRichEditor({ value, onChange, editorRef }: BlogRichEditorProps) {
  const internalRef = useRef<SunEditorCore | null>(null);
  const ref = editorRef ?? internalRef;

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <SunEditor
        height="360px"
        setContents={value}
        onChange={(html) => onChange(html || "")}
        getSunEditorInstance={(instance) => {
          ref.current = instance;
        }}
        setOptions={{
          buttonList: [
            ["undo", "redo", "formatBlock", "bold", "underline", "italic", "list", "link", "image"],
            ["align", "outdent", "indent", "fullScreen", "codeView"],
          ],
        }}
      />
    </div>
  );
}

type BlogFeaturedImageFieldProps = {
  value: string;
  onChange: (value: string) => void;
  fieldClass: string;
  onPreview: () => void;
};

export function BlogFeaturedImageField({ value, onChange, fieldClass, onPreview }: BlogFeaturedImageFieldProps) {
  const { push } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      push("Please choose an image file.", { kind: "error" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadBlogFeaturedImage(file);
      onChange(url);
      push("Image uploaded.", { kind: "success" });
    } catch {
      push("Failed to upload image.", { kind: "error" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Label className="text-sm font-medium">Featured image</Label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
          e.target.value = "";
        }}
      />

      {!value ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            fieldClass,
            "flex w-full items-center gap-2 text-left text-muted-foreground transition",
            "hover:border-[#1a56db]/40 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <Plus className="h-4 w-4 shrink-0 text-[#1a56db] dark:text-[#3b82f6]" />
          <span className="text-sm">
            {uploading ? "Uploading..." : "Upload a file or use AI to generate an image"}
          </span>
        </button>
      ) : (
        <div className={cn(fieldClass, "relative mt-1 flex w-full items-center gap-3 p-2 pr-10")}>
          <button
            type="button"
            onClick={onPreview}
            className="flex h-10 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40"
            aria-label="View featured image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-full w-full object-cover" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <ImageIcon className="h-4 w-4 shrink-0 text-[#1a56db] dark:text-[#3b82f6]" />
              Featured image added
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-0.5 text-xs text-[#1a56db] hover:underline disabled:opacity-50 dark:text-[#3b82f6]"
            >
              {uploading ? "Uploading..." : "Replace image"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
            aria-label="Remove featured image"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const categoryFieldClass =
  "w-full rounded-2xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-[#1a56db]/40 focus:ring-2 focus:ring-[#1a56db]/15";

type BlogCategoryPickerProps = {
  categories: BlogCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  onMore: () => void;
  onDeleted: () => void;
};

export function BlogCategoryPicker({
  categories,
  value,
  onChange,
  onMore,
  onDeleted,
}: BlogCategoryPickerProps) {
  const { push } = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = categories.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const handleDelete = async (category: BlogCategory, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const ok = await confirm({
      title: "Delete category?",
      description: `Delete "${category.name}"? Blogs using it will be unassigned.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await deleteBlogCategory(category.id);
      if (value === category.id) onChange("");
      onDeleted();
      push("Category deleted", { kind: "success" });
    } catch {
      push("Failed to delete category", { kind: "error" });
    }
  };

  return (
    <div ref={rootRef} className="relative mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          categoryFieldClass,
          "flex items-center justify-between gap-2 text-left",
          !selected && "text-muted-foreground"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.name ?? "Select category"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1 max-h-60 w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
          role="listbox"
        >
          <ul className="max-h-60 overflow-y-auto py-1">
            {categories.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No categories yet</li>
            ) : (
              categories.map((category) => {
                const active = value === category.id;
                return (
                  <li key={category.id}>
                    <div
                      className={cn(
                        "flex items-center gap-1 px-1 py-0.5",
                        active && "bg-[#1a56db]/10"
                      )}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onChange(category.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-hover",
                          active && "font-medium text-[#1a56db]"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          <span className="truncate">{category.name}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(category, e)}
                        className="mr-1 shrink-0 rounded-lg p-2 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })
            )}
            <li className="border-t border-border/60 px-1 py-0.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onMore();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#1a56db] hover:bg-[#1a56db]/10"
              >
                <Plus className="h-4 w-4" />
                More
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export const MORE_CATEGORY_VALUE = "__more__";

type BlogQuickCategoryDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (categoryId: string) => void;
};

const quickFieldClass =
  "mt-1 w-full rounded-2xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-[#1a56db]/40 focus:ring-2 focus:ring-[#1a56db]/15";

export function BlogQuickCategoryDialog({ open, onClose, onCreated }: BlogQuickCategoryDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setError("");
  }, [open]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Category name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await createBlogCategory({
        name: trimmed,
        slug: slugify(trimmed),
        description: description.trim(),
        color: "#7c3aed",
        status: "active",
      });
      onCreated(id);
      onClose();
    } catch {
      setError("Failed to create category.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add category</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label htmlFor="quick-cat-name">Category name *</Label>
            <Input
              id="quick-cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Payroll"
              className={cn(quickFieldClass, "mt-1")}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="quick-cat-desc">Description</Label>
            <Textarea
              id="quick-cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional short description"
              className={cn(quickFieldClass, "mt-1 min-h-[72px] resize-y")}
            />
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" className={BLOG_PRIMARY_BUTTON} disabled={saving} onClick={handleSave}>
            {saving ? "Adding..." : "Add category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function resolveCategoryId(categories: BlogCategory[], categoryName: string): string {
  const trimmed = categoryName.trim();
  if (!trimmed) return "";
  const exact = categories.find((c) => c.name === trimmed);
  if (exact) return exact.id;
  const lowered = trimmed.toLowerCase();
  const caseInsensitive = categories.find((c) => c.name.toLowerCase() === lowered);
  return caseInsensitive?.id ?? "";
}

export function useBlogAIAssistant() {
  const [activeStep, setActiveStep] = useState<BlogAIGenerationStepId | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<BlogAIGenerationStepId>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BlogAIGeneratedContent | null>(null);
  const cancelledRef = useRef(false);

  const resetProgress = useCallback(() => {
    cancelledRef.current = false;
    setActiveStep(null);
    setCompletedSteps(new Set());
    setError(null);
  }, []);

  const cancelGeneration = useCallback(() => {
    cancelledRef.current = true;
    setIsGenerating(false);
    setActiveStep(null);
    setCompletedSteps(new Set());
    setError(null);
  }, []);

  const applyToForm = useCallback(
    (
      result: BlogAIGeneratedContent,
      handlers: BlogAIFormHandlers,
      categories: BlogCategory[],
      extra?: { permalink?: string },
    ) => {
      handlers.resetPermalinkAuto?.();
      handlers.setTitle(result.title);
      handlers.setMetaDescription(result.metaDescription);
      handlers.setTags(result.keywords.join(", "));
      if (result.image) handlers.setImage(result.image);
      handlers.setContent(result.contentHtml);
      handlers.setEditorContents(result.contentHtml);
      if (extra?.permalink && handlers.setPermalink) {
        handlers.setPermalink(extra.permalink);
      }
      const categoryId = resolveCategoryId(categories, result.categoryName);
      if (categoryId) handlers.setCategoryId(categoryId);
    },
    [],
  );

  type GenerationRunOptions = {
    permalink?: string;
    aiModel?: string;
    excludePostId?: string;
    author?: string;
    image?: string;
  };

  const runWithProgress = useCallback(
    async (
      request: () => Promise<BlogAIGeneratedContent>,
      handlers: BlogAIFormHandlers,
      categories: BlogCategory[],
      options: GenerationRunOptions,
    ) => {
      cancelledRef.current = false;
      setIsGenerating(true);
      setError(null);
      setCompletedSteps(new Set());
      setActiveStep("generating");

      try {
        const generated = await request();
        if (cancelledRef.current || !generated) return null;

        setCompletedSteps(new Set(["generating"]));
        setIsGenerating(false);
        setActiveStep(null);

        const draftPermalink = options.permalink ?? slugify(generated.title);
        setLastResult(generated);
        applyToForm(generated, handlers, categories, { permalink: draftPermalink });

        return { content: generated };
      } catch (err) {
        if (cancelledRef.current) return null;
        if (axios.isAxiosError(err) && err.response?.data) {
          const detail = normalizeFastApiDetail(err.response.data);
          if (detail) {
            setError(detail);
            return null;
          }
        }
        setError(apiErrorMessage(err));
        return null;
      } finally {
        setIsGenerating(false);
        setActiveStep(null);
      }
    },
    [applyToForm],
  );

  const generateFromTitle = useCallback(
    (
      title: string,
      categories: BlogCategory[],
      handlers: BlogAIFormHandlers,
      aiModel: string,
      options: GenerationRunOptions,
    ) =>
      runWithProgress(
        () =>
          generateBlogWithAI({
            mode: "title",
            title,
            aiModel,
            excludePostId: options.excludePostId,
            author: options.author,
          }),
        handlers,
        categories,
        { ...options, aiModel },
      ),
    [runWithProgress],
  );

  const generateEntireBlog = useCallback(
    (
      params: BlogAIFullGenerateParams,
      categories: BlogCategory[],
      handlers: BlogAIFormHandlers,
      aiModel: string,
      options: GenerationRunOptions,
    ) =>
      runWithProgress(
        () =>
          generateBlogWithAI({
            mode: "full",
            topic: params.topic,
            industry: params.industry,
            audience: params.audience,
            tone: params.tone,
            wordCount: params.wordCount,
            aiModel,
            excludePostId: options.excludePostId,
            author: options.author,
          }),
        handlers,
        categories,
        { ...options, aiModel },
      ),
    [runWithProgress],
  );

  return {
    isGenerating,
    activeStep,
    completedSteps,
    steps: BLOG_AI_GENERATION_MODAL_STEPS,
    error,
    lastResult,
    resetProgress,
    cancelGeneration,
    generateFromTitle,
    generateEntireBlog,
  };
}

type BlogAIModelPickerProps = {
  open: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
};

export function BlogAIModelPicker({
  open,
  onClose,
  anchorRect,
  selectedModelId,
  onSelectModel,
}: BlogAIModelPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  const top = anchorRect.bottom + 8;
  const left = Math.max(12, Math.min(anchorRect.right - 320, window.innerWidth - 320 - 12));

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Choose AI model"
      className="fixed z-[95] w-[min(100vw-1.5rem,20rem)] rounded-2xl border border-border bg-surface p-2 shadow-xl"
      style={{ top, left }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-[#1a56db] dark:text-[#3b82f6]" />
        <div>
          <p className="text-sm font-semibold text-foreground">Choose AI model</p>
          <p className="text-xs text-muted-foreground">Generation starts right after you pick</p>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto py-1">
        {AI_MODEL_GROUPS.map((group) => (
          <div key={group.label} className="py-1">
            <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul>
              {group.options.map((model) => {
                const isSelected = model.value === selectedModelId;
                return (
                  <li key={model.value}>
                    <button
                      type="button"
                      onClick={() => onSelectModel(model.value)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                        isSelected ? "bg-[#1a56db]/10 dark:bg-[#3b82f6]/10" : "hover:bg-hover"
                      )}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {isSelected ? (
                          <Check className="h-4 w-4 text-[#1a56db] dark:text-[#3b82f6]" />
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full bg-[#1a56db]/40 dark:bg-[#3b82f6]/40" />
                        )}
                      </span>
                      <span className="text-sm font-medium text-foreground">{model.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

type BlogAIGenerationProgressProps = {
  open: boolean;
  steps: BlogAIGenerationStep[];
  activeStep: BlogAIGenerationStepId | null;
  completedSteps: Set<BlogAIGenerationStepId>;
  error?: string | null;
  onClose?: () => void;
  onCancel?: () => void;
};

export function BlogAIGenerationProgress({
  open,
  steps,
  activeStep,
  completedSteps,
  error,
  onClose,
  onCancel,
}: BlogAIGenerationProgressProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blog-ai-progress-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a56db]/10 text-[#1a56db] dark:bg-[#3b82f6]/10 dark:text-[#3b82f6]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 id="blog-ai-progress-title" className="text-lg font-semibold text-foreground">
                {error ? "Generation issue" : "Generating with AI"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {error ? "Review the message below" : "This may take a moment…"}
              </p>
            </div>
          </div>
          {!error && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-hover"
              aria-label="Cancel generation"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {error ? (
          <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        ) : (
          <ul className="space-y-3">
            {steps.map((step) => {
              const done = completedSteps.has(step.id);
              const active = activeStep === step.id;
              return (
                <li key={step.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      done
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                        : active
                          ? "bg-[#1a56db]/10 text-[#1a56db] dark:bg-[#3b82f6]/10 dark:text-[#3b82f6]"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {done ? (
                      <Check className="h-4 w-4" />
                    ) : active ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-current opacity-40" />
                    )}
                  </span>
                  <span className={done || active ? "font-medium text-foreground" : "text-muted-foreground"}>
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {error && onClose && (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className={cn("rounded-2xl px-4 py-2 text-sm font-semibold text-white", BLOG_PRIMARY_BUTTON)}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type BlogTitleAIButtonProps = {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
};

export function BlogTitleAIButton({ onClick, disabled }: BlogTitleAIButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Generate blog from title"
      aria-label="Generate blog from title"
      className={cn(
        "absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#1a56db] transition",
        "hover:bg-[#1a56db]/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#3b82f6] dark:hover:bg-[#3b82f6]/10"
      )}
    >
      <Sparkles className="h-4 w-4" />
    </button>
  );
}


function normalizeEditorStatus(status: BlogStatus): BlogStatus {
  if (status === "scheduled" || status === "archived") return "draft";
  return status;
}

function submitLabel(isEdit: boolean, currentStatus: BlogStatus): string {
  if (isEdit && currentStatus === "published") return "Update Post";
  return "Publish Post";
}

const fieldClass =
  "mt-1 w-full rounded-2xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-[#1a56db]/40 focus:ring-2 focus:ring-[#1a56db]/15";

export function BlogEditor({ postId }: { postId?: string }) {
  const router = useRouter();
  const { push } = useToast();
  const editorRef = useRef<SunEditorCore | null>(null);
  const isEdit = Boolean(postId);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [image, setImage] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState("");
  const [permalink, setPermalink] = useState("");
  const permalinkTouched = useRef(false);
  const [status, setStatus] = useState<BlogStatus>("draft");
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerAnchor, setModelPickerAnchor] = useState<DOMRect | null>(null);
  const [pendingAiMode, setPendingAiMode] = useState<"full" | "title">("full");
  const [lastAiParams, setLastAiParams] = useState<BlogAIFullGenerateParams>(BLOG_AI_DEFAULT_FULL_PARAMS);
  const [lastAiMode, setLastAiMode] = useState<"full" | "title">("full");
  const [lastAiModel, setLastAiModel] = useState<string | null>(null);
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const setSelectedAiModel = useWorkspaceStore((s) => s.setSelectedAiModel);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const ai = useBlogAIAssistant();

  useEffect(() => {
    const user = getAuthUser();
    if (user?.name) setAuthor(user.name);

    let cancelled = false;
    void fetchBlogCategories()
      .then((cats) => {
        if (cancelled) return;
        setCategories(cats);
        return fetchBlogSettings()
          .then((settings) => {
            if (cancelled) return;
            if (settings.content.defaultAuthor) {
              setAuthor((prev) => prev || settings.content.defaultAuthor);
            }
            if (settings.content.defaultCategory) {
              const match = cats.find((c) => c.name === settings.content.defaultCategory);
              if (match) setCategoryId(match.id);
            }
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    fetchBlogPost(postId)
      .then((post) => {
        setTitle(post.title);
        setAuthor(post.author);
        setContent(post.content);
        setMetaDescription(post.metaDescription);
        setImage(post.image);
        setCategoryId(post.categoryId);
        setTags(post.tags.join(", "));
        setPermalink(post.slug);
        permalinkTouched.current = true;
        setStatus(normalizeEditorStatus(post.status));
        if (editorRef.current) editorRef.current.setContents(post.content);
      })
      .catch(() => push("Failed to load blog", { kind: "error" }))
      .finally(() => setLoading(false));
  }, [postId, activeWorkspaceId, push]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!permalinkTouched.current) {
      setPermalink(slugify(value));
    }
  };

  const handlePermalinkChange = (value: string) => {
    permalinkTouched.current = true;
    setPermalink(value);
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const activeCategories = categories.filter((c) => c.status !== "inactive");
  const keywordList = useMemo(
    () =>
      tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tags],
  );

  const refreshCategories = () => {
    fetchBlogCategories({ force: true }).then(setCategories).catch(() => {});
  };

  const handleCategoryCreated = (newCategoryId: string) => {
    refreshCategories();
    setCategoryId(newCategoryId);
    push("Category added", { kind: "success" });
  };

  const aiFormHandlers = {
    setTitle: handleTitleChange,
    setAuthor,
    setMetaDescription,
    setTags,
    setImage,
    setContent,
    setCategoryId,
    setEditorContents: (html: string) => {
      setContent(html);
      editorRef.current?.setContents(html);
    },
    setPermalink: handlePermalinkChange,
    resetPermalinkAuto: () => {
      permalinkTouched.current = false;
    },
  };

  const buildGenerationOptions = () => ({
    permalink,
    excludePostId: postId,
    author: author.trim() || getAuthUser()?.name || "",
    image,
  });

  const openModelPicker = (event: React.MouseEvent<HTMLElement>, mode: "full" | "title") => {
    if (ai.isGenerating) return;
    if (mode === "title" && !title.trim()) {
      push("Enter a title first.", { kind: "error" });
      return;
    }
    setPendingAiMode(mode);
    setModelPickerAnchor(event.currentTarget.getBoundingClientRect());
    setModelPickerOpen(true);
  };

  const runGeneration = async (
    modelId: string,
    mode: "full" | "title",
    paramsOverride?: BlogAIFullGenerateParams
  ) => {
    setSelectedAiModel(modelId);
    setLastAiModel(modelId);
    setLastAiMode(mode);

    const result =
      mode === "title" && title.trim()
        ? await ai.generateFromTitle(title.trim(), activeCategories, aiFormHandlers, modelId, buildGenerationOptions())
        : await (() => {
            const params =
              paramsOverride ??
              (title.trim()
                ? { ...BLOG_AI_DEFAULT_FULL_PARAMS, topic: title.trim() }
                : BLOG_AI_DEFAULT_FULL_PARAMS);
            setLastAiParams(params);
            return ai.generateEntireBlog(params, activeCategories, aiFormHandlers, modelId, buildGenerationOptions());
          })();

    if (result) {
      push(`Blog generated with ${result.content.modelUsed}`, { kind: "success" });
    }
  };

  const handleModelSelect = (modelId: string) => {
    setModelPickerOpen(false);
    void runGeneration(modelId, pendingAiMode);
  };

  const handleRegenerate = async () => {
    if (ai.isGenerating) return;
    const modelId = lastAiModel ?? selectedAiModel;
    if (lastAiMode === "title" && title.trim()) {
      await runGeneration(modelId, "title");
      return;
    }
    await runGeneration(modelId, "full", lastAiParams);
  };

  const handleSave = async (saveStatus: BlogStatus) => {
    const trimmedTitle = title.trim();
    const editorHtml = editorRef.current?.getContents(true) ?? content;
    const plain = editorHtml.replace(/<[^>]+>/g, "").trim();

    if (!trimmedTitle || !plain) {
      push("Please fill title and content.", { kind: "error" });
      return;
    }
    if (!categoryId) {
      push("Please select a category.", { kind: "error" });
      return;
    }

    const payload: BlogPostInput = {
      title: trimmedTitle,
      slug: permalink.trim() || slugify(trimmedTitle),
      author: author.trim(),
      content: editorHtml,
      description: plain.slice(0, 150),
      metaDescription: metaDescription.trim() || plain.slice(0, 160),
      image,
      categoryId,
      categoryName: selectedCategory?.name || "",
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      status: saveStatus,
      scheduledAt: null,
    };

    setSaving(true);
    try {
      if (isEdit && postId) {
        await updateBlogPost(postId, payload);
        push(saveStatus === "draft" ? "Blog saved as draft" : "Blog updated", { kind: "success" });
      } else {
        await createBlogPost(payload);
        push(saveStatus === "draft" ? "Blog saved as draft" : "Blog published", { kind: "success" });
      }
      setStatus(saveStatus);
      router.push("/blog/posts");
    } catch {
      push("Failed to save blog", { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSave("published");
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Skeleton className="h-12 w-48 rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <div className="-mx-1 flex min-h-[calc(100vh-12rem)] flex-col rounded-2xl border border-border bg-surface shadow-sm md:-mx-2">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/blog/posts"
              className="inline-flex items-center gap-1 text-sm font-medium text-[#1a56db] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Blogs
            </Link>
            <h1 className="text-lg font-bold text-foreground">{isEdit ? "Edit Blog" : "Create Blog"}</h1>
          </div>
          <div className="flex items-center gap-2">
            {ai.lastResult && !ai.isGenerating && (
              <button
                type="button"
                onClick={handleRegenerate}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-2 text-sm font-medium hover:bg-hover"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </button>
            )}
            <button
              type="button"
              onClick={(event) => openModelPicker(event, "full")}
              disabled={ai.isGenerating}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60",
                BLOG_PRIMARY_BUTTON
              )}
            >
              <Sparkles className="h-4 w-4" />
              {ai.isGenerating ? "Generating…" : "Generate With AI"}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
          <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
            <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-sm font-medium">Title *</Label>
                <div className="relative mt-1">
                  <Input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    required
                    className={cn(fieldClass, "mt-0 pr-11")}
                  />
                  <BlogTitleAIButton
                    onClick={(event) => openModelPicker(event, "title")}
                    disabled={ai.isGenerating || !title.trim()}
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Author *</Label>
                <Input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  required
                  className={cn(fieldClass, "mt-1")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-sm font-medium">Keywords</Label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="keyword one, keyword two"
                  className={cn(fieldClass, "mt-1")}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Permalink</Label>
                <Input
                  value={permalink}
                  onChange={(e) => handlePermalinkChange(e.target.value)}
                  placeholder="my-custom-permalink"
                  className={cn(fieldClass, "mt-1")}
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Category *</Label>
              <BlogCategoryPicker
                categories={activeCategories}
                value={categoryId}
                onChange={setCategoryId}
                onMore={() => setCategoryModalOpen(true)}
                onDeleted={refreshCategories}
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Meta Description</Label>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    metaDescription.length > 160
                      ? "font-semibold text-rose-600"
                      : metaDescription.length >= 120
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                  )}
                >
                  {metaDescription.length}/160
                </span>
              </div>
              <Textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={3}
                maxLength={200}
                placeholder="Short summary for search results and social previews"
                className={cn(fieldClass, "mt-1 min-h-[88px] resize-y")}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Aim for 120–160 characters for search and social previews.
              </p>
            </div>

            <BlogFeaturedImageField
              value={image}
              onChange={setImage}
              fieldClass={fieldClass}
              onPreview={() => setImagePreviewOpen(true)}
            />

            <div>
              <Label className="mb-2 block text-sm font-medium">Content *</Label>
              <BlogRichEditor value={content} onChange={setContent} editorRef={editorRef} />
            </div>

              <div className="flex justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => router.push("/blog/posts")}
                  className="rounded-2xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave("draft")}
                  className="rounded-2xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-hover disabled:opacity-60"
                >
                  Save as Draft
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={cn(
                    "rounded-2xl px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60",
                    BLOG_PRIMARY_BUTTON
                  )}
                >
                  {submitLabel(isEdit, status)}
                </button>
              </div>
            </form>

            <div className="min-h-0 lg:flex lg:h-full lg:flex-col lg:self-stretch">
              <BlogContentAnalysisPanel
                title={title}
                keywords={keywordList}
                metaDescription={metaDescription}
                contentHtml={content}
                permalink={permalink}
                author={author}
                featuredImageUrl={image}
                className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-10rem)] lg:overscroll-y-contain"
              />
            </div>
          </div>
        </div>
      </div>

      <BlogQuickCategoryDialog
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onCreated={handleCategoryCreated}
      />

      <BlogAIModelPicker
        open={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        anchorRect={modelPickerAnchor}
        selectedModelId={selectedAiModel}
        onSelectModel={handleModelSelect}
      />

      <BlogAIGenerationProgress
        open={ai.isGenerating || Boolean(ai.error)}
        steps={ai.steps}
        activeStep={ai.activeStep}
        completedSteps={ai.completedSteps}
        error={ai.error}
        onCancel={ai.cancelGeneration}
        onClose={() => {
          ai.resetProgress();
        }}
      />

      {imagePreviewOpen && image && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Featured image preview"
          onClick={() => setImagePreviewOpen(false)}
        >
          <button
            type="button"
            onClick={() => setImagePreviewOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="Featured image full size"
            className="max-h-[90vh] max-w-[min(100%,72rem)] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
