"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  Clock,
  Eye,
  FileText,
  Tag,
  User,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/workspace-store";
import {
  estimateBlogReadingMinutes,
  formatBlogDate,
  getBlogExcerpt,
} from "./blog-core";
import {
  OK_ARTICLE_CATEGORY,
  OK_ARTICLE_IMAGE_RADIUS,
  OK_ARTICLE_META,
  OK_ARTICLE_TITLE,
  OK_BACK_LINK,
  OK_BLOG_CARD,
  OK_BLOG_CARD_EXCERPT,
  OK_BLOG_CARD_FOOTER,
  OK_BLOG_CARD_TITLE,
  OK_BLOG_ROOT,
  OK_CATEGORY_PILL,
  OK_PREVIEW_BACK_BTN,
  OK_PREVIEW_BAR,
  OK_PREVIEW_PAGE_BG,
  OK_PREVIEW_STATUS,
} from "./blog-officekit-theme";
import {
  BLOG_EDITOR_PREVIEW_PATH,
  loadBlogEditorPreview,
  saveBlogEditorPreview,
  type BlogEditorPreviewSnapshot,
} from "./blog-preview";

const articleProseClass = "blog-article-prose";

type BlogEditorPreviewCardProps = {
  snapshot: BlogEditorPreviewSnapshot;
  className?: string;
};

export function BlogEditorPreviewCard({ snapshot, className }: BlogEditorPreviewCardProps) {
  const readingMinutes = estimateBlogReadingMinutes(snapshot.content, snapshot.metaDescription);
  const excerpt = getBlogExcerpt(
    {
      metaDescription: snapshot.metaDescription,
      description: snapshot.metaDescription,
      content: snapshot.content,
    },
    160,
  );
  const displayTitle = snapshot.title.trim() || "Untitled post";
  const displayAuthor = snapshot.author.trim() || "FlowPilot";
  const displayDate = formatBlogDate(snapshot.savedAt);

  return (
    <article className={cn(OK_BLOG_ROOT, "group block h-full", className)}>
      <div className={OK_BLOG_CARD}>
        <div className="relative aspect-[16/10] overflow-hidden">
          {snapshot.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={snapshot.image}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#E5EEFF]">
              <FileText className="size-10 text-[#0055FF]/30" strokeWidth={1.25} />
            </div>
          )}
        </div>

        <div className="flex flex-grow flex-col p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#515E70]">
            <span className={OK_CATEGORY_PILL}>
              <Tag className="size-3 shrink-0" strokeWidth={2} />
              {snapshot.categoryName || "Blog"}
            </span>
            <span>{readingMinutes} min read</span>
          </div>

          <h3 className={OK_BLOG_CARD_TITLE}>{displayTitle}</h3>

          {excerpt ? (
            <p className={OK_BLOG_CARD_EXCERPT}>{excerpt}</p>
          ) : (
            <div className="mb-4 flex-grow" />
          )}

          <div className={OK_BLOG_CARD_FOOTER}>
            <span className="truncate">{displayAuthor}</span>
            <time className="ml-2 shrink-0 tabular-nums">{displayDate}</time>
          </div>
        </div>
      </div>
    </article>
  );
}

type BlogEditorPreviewMenuProps = {
  buildSnapshot: () => BlogEditorPreviewSnapshot;
  canPreview: boolean;
};

export function BlogEditorPreviewMenu({ buildSnapshot, canPreview }: BlogEditorPreviewMenuProps) {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<BlogEditorPreviewSnapshot | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canPreview) setOpen(false);
  }, [canPreview]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const handleToggle = () => {
    if (!canPreview) return;
    const nextSnapshot = buildSnapshot();
    saveBlogEditorPreview(nextSnapshot, activeWorkspaceId);
    setSnapshot(nextSnapshot);
    setOpen((prev) => !prev);
  };

  const handleOpenFullPreview = () => {
    const nextSnapshot = snapshot ?? buildSnapshot();
    saveBlogEditorPreview(nextSnapshot, activeWorkspaceId);
    setOpen(false);
    router.push(BLOG_EDITOR_PREVIEW_PATH);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={!canPreview}
        title={
          canPreview
            ? "Preview your blog post"
            : "Fill title, author, category, and content to preview"
        }
        className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Eye className="h-4 w-4" />
        Preview
      </button>

      {open ? (
        <div
          className={cn(
            OK_BLOG_ROOT,
            "absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,380px)] rounded-xl border border-[#E2E4E9] bg-white p-4 shadow-[0_10px_30px_-5px_rgba(0,85,255,0.15)]",
          )}
          role="dialog"
          aria-label="Blog preview"
        >
          <p className="mb-3 text-xs font-medium text-[#515E70]">Draft preview</p>
          <button
            type="button"
            onClick={handleOpenFullPreview}
            className="block w-full text-left transition hover:opacity-95"
            aria-label="Open full preview"
          >
            {snapshot ? <BlogEditorPreviewCard snapshot={snapshot} /> : null}
            <p className="mt-3 text-center text-xs font-medium text-[#0055FF]">
              Click to open full preview
            </p>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function BlogEditorPreviewPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [snapshot, setSnapshot] = useState<BlogEditorPreviewSnapshot | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSnapshot(loadBlogEditorPreview(activeWorkspaceId));
    setReady(true);
  }, [activeWorkspaceId]);

  if (!ready) {
    return (
      <div className={cn(OK_BLOG_ROOT, "flex min-h-[50vh] items-center justify-center bg-white")}>
        <p className="text-sm text-[#515E70]">Loading preview…</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className={cn(OK_BLOG_ROOT, "flex min-h-[60vh] flex-col items-center justify-center bg-white px-6 py-16")}>
        <p className="text-sm text-[#515E70]">No preview data found. Open the editor and click Preview first.</p>
        <Link href="/blog/posts/create" className={cn("mt-4", OK_BACK_LINK)}>
          <ArrowLeft className="size-4 shrink-0" />
          Back to editor
        </Link>
      </div>
    );
  }

  const readingMinutes = estimateBlogReadingMinutes(snapshot.content, snapshot.metaDescription);
  const displayDate = new Date(snapshot.savedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const displayTitle = snapshot.title.trim() || "Untitled post";
  const displayAuthor = snapshot.author.trim() || "FlowPilot";
  const plainContent = snapshot.content.replace(/<[^>]+>/g, "").trim();

  return (
    <article className={cn(OK_BLOG_ROOT, OK_PREVIEW_PAGE_BG, "min-h-full pb-16")}>
      <div className={OK_PREVIEW_BAR}>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href={snapshot.returnPath} className={OK_PREVIEW_BACK_BTN}>
            <ArrowLeft className="size-4 shrink-0" strokeWidth={1.75} />
            Back to editor
          </Link>
          <span className={OK_PREVIEW_STATUS}>
            <Eye className="size-4 shrink-0 text-[#0055FF]" strokeWidth={1.75} />
            Preview mode — not published
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-8">
          {snapshot.categoryName ? (
            <p className={OK_ARTICLE_CATEGORY}>{snapshot.categoryName}</p>
          ) : null}
          <h1 className={OK_ARTICLE_TITLE}>{displayTitle}</h1>
          <div className={cn("mt-5 flex flex-wrap items-center gap-x-5 gap-y-2", OK_ARTICLE_META)}>
            <span className="inline-flex items-center gap-1.5">
              <User className="size-4 shrink-0" strokeWidth={1.75} />
              {displayAuthor}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-4 shrink-0" strokeWidth={1.75} />
              {displayDate}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 shrink-0" strokeWidth={1.75} />
              {readingMinutes} min read
            </span>
          </div>
        </header>

        {snapshot.image ? (
          <div className={cn("mb-10 overflow-hidden", OK_ARTICLE_IMAGE_RADIUS)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={snapshot.image} alt="" className="w-full object-cover" />
          </div>
        ) : null}

        {plainContent ? (
          <div className={articleProseClass} dangerouslySetInnerHTML={{ __html: snapshot.content }} />
        ) : (
          <p className="text-sm text-[#515E70]">No content entered yet.</p>
        )}

        {snapshot.tags.length > 0 ? (
          <div className="mt-10 flex flex-wrap gap-2 border-t border-[#E2E4E9] pt-8">
            {snapshot.tags.map((tag) => (
              <span key={tag} className={OK_CATEGORY_PILL}>
                <Tag className="size-3 shrink-0" strokeWidth={2} />
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
