"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Calendar,
  Clock,
  Edit2,
  FilePenLine,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  List,
  MousePointerClick,
  Plus,
  Search,
  Tag,
  Trash2,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

import {
  deleteBlogPost,
  fetchBlogClicks,
  fetchBlogDashboard,
  fetchBlogPost,
  fetchBlogPosts,
  getCachedBlogClicks,
  getCachedBlogDashboard,
  getCachedBlogPost,
  getCachedBlogPosts,
  BLOG_PRIMARY_BUTTON,
  BLOG_STATUS_COLORS,
  BLOG_STATUS_LABELS,
  estimateBlogReadingMinutes,
  formatBlogDate,
  getBlogExcerpt,
  type BlogClicksData,
  type BlogDashboardData,
  type BlogPost,
  type BlogStatus,
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
  OK_BLOG_GRID,
  OK_BLOG_GRID_CONTAINER,
  OK_BLOG_ROOT,
  OK_CARD_RADIUS,
  OK_CATEGORY_PILL,
  OK_OUTLINE_BTN,
  OK_PAGE_CANVAS,
  OK_PAGE_CANVAS_INNER,
  OK_PILL_ACTIVE,
  OK_PILL_INACTIVE,
  OK_PRIMARY_BTN,
  OK_STAT_CARD,
  OK_TAB_ACTIVE,
  OK_TEXT_LINK,
} from "./blog-officekit-theme";

const BLOG_SURFACE = "rounded-xl border border-[#E2E4E9] bg-white dark:border-[#E2E4E9] dark:bg-white";

const BLOG_TAB_ACTIVE = OK_TAB_ACTIVE;

const BLOG_TAB_INACTIVE = "border-transparent text-[#515E70] hover:text-[#21232C] dark:text-[#515E70] dark:hover:text-[#21232C]";

const BLOG_PILL_ACTIVE = OK_PILL_ACTIVE;

const BLOG_PILL_INACTIVE = OK_PILL_INACTIVE;

const BLOG_NAV: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  dashboard?: boolean;
}> = [
  { href: "/blog", label: "Overview", icon: LayoutDashboard, dashboard: true },
  { href: "/blog/posts", label: "All posts", icon: FileText },
];

function isActive(pathname: string, href: string, exact?: boolean, dashboard?: boolean) {
  if (dashboard) return pathname === "/blog" || pathname === "/blog/clicks";
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BlogShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFullBleedRoute =
    pathname === "/blog/posts/create" ||
    pathname === "/blog/posts/preview" ||
    /\/blog\/posts\/[^/]+\/edit$/.test(pathname) ||
    /\/blog\/posts\/[^/]+$/.test(pathname);

  if (isFullBleedRoute) {
    return <div className={cn(OK_BLOG_ROOT, "w-full min-w-0")}>{children}</div>;
  }

  return (
    <div
      className={cn(
        OK_BLOG_ROOT,
        "w-full min-w-0 space-y-5 rounded-xl border border-[#E2E4E9] bg-white p-5 sm:p-6",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#21232C]">Blog</h1>
          <p className="mt-1 text-sm text-[#515E70]">Create, publish, and manage your content.</p>
        </div>
        <Link
          href="/blog/posts/create"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
            OK_PRIMARY_BTN,
          )}
        >
          <Plus className="size-3.5 shrink-0" strokeWidth={2.5} />
          New post
        </Link>
      </div>

      <nav className="flex gap-1 border-b border-[#E2E4E9]" aria-label="Blog sections">
        {BLOG_NAV.map((item) => {
          const active = isActive(pathname, item.href, item.exact, item.dashboard);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                active ? BLOG_TAB_ACTIVE : BLOG_TAB_INACTIVE
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}

const WORKSPACE_BLOG_METRICS = [
  {
    key: "totalBlogs" as const,
    label: "Total blogs",
    hint: "All posts in workspace",
    icon: BookOpen,
    href: "/blog/posts",
    accent: "#0ea5e9",
    bg: "#e0f2fe",
  },
  {
    key: "publishedBlogs" as const,
    label: "Published blogs",
    hint: "Live on your blog",
    icon: BadgeCheck,
    href: "/blog/posts?status=published",
    accent: "#059669",
    bg: "#d1fae5",
  },
  {
    key: "draftBlogs" as const,
    label: "Blog drafts",
    hint: "Still in progress",
    icon: FilePenLine,
    href: "/blog/posts?status=draft",
    accent: "#d97706",
    bg: "#fef3c7",
  },
] as const;

export function useBlogDashboardData() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [data, setData] = useState<BlogDashboardData | null>(() => getCachedBlogDashboard());
  const [loading, setLoading] = useState(() => getCachedBlogDashboard() === null);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    fetchBlogDashboard({ force: true })
      .then((next) => {
        setData(next);
        setError(null);
        return next;
      })
      .catch(() => {
        setError("Unable to load blog dashboard.");
        setData(null);
        return null;
      });

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedBlogDashboard();
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }

    fetchBlogDashboard()
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError("Unable to load blog dashboard.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  return { data, loading, error, reload };
}

export { WORKSPACE_BLOG_METRICS as BLOG_DASHBOARD_METRICS };

export function BlogWorkspaceSummary({
  data,
  loading,
}: {
  data: BlogDashboardData | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return <Skeleton className="h-44 rounded-2xl" />;
  }

  const recentPosts = data?.recentPosts.slice(0, 3) ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 border-b border-[#f3f4f6] bg-gradient-to-r from-[#f8fafc] to-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e0f2fe] text-[#0284c7]">
            <BookOpen className="size-[18px]" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-[14px] font-semibold text-[#111827]">Recent blog posts</p>
            <p className="mt-0.5 text-[12px] text-[#6b7280]">Latest drafts and published articles</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-[#e5e7eb] bg-white text-[12.5px]">
            <Link href="/blog">Open blog</Link>
          </Button>
          <Button asChild size="sm" className="h-8 rounded-lg bg-[#0055FF] text-[12.5px] hover:bg-[#0044CC]">
            <Link href="/blog/posts/create">
              <Plus className="mr-1 size-3.5" />
              New post
            </Link>
          </Button>
        </div>
      </div>

      <div className="px-5 py-4">
        {recentPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-[#fafafa] px-6 py-8 text-center">
            <p className="text-[13px] text-[#6b7280]">No blog posts yet.</p>
            <Button asChild size="sm" className="mt-3 h-8 rounded-lg bg-[#0055FF] hover:bg-[#0044CC]">
              <Link href="/blog/posts/create">Create your first post</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentPosts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/posts/${post.id}`}
                className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-all hover:border-[#e5e7eb] hover:bg-[#f8fafc]"
              >
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f1f5f9]">
                  {post.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.image} alt="" className="size-full object-cover" />
                  ) : (
                    <FileText className="size-4 text-[#94a3b8]" strokeWidth={1.5} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#111827] group-hover:text-[#0055FF]">{post.title}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-[#9ca3af]">
                    {post.author} · {formatBlogDate(post.updatedAt)}
                  </p>
                </div>
                <Badge className={cn("shrink-0", BLOG_STATUS_COLORS[post.status])}>{BLOG_STATUS_LABELS[post.status]}</Badge>
              </Link>
            ))}
            <div className="pt-1 text-right">
              <Link href="/blog/posts" className={cn("text-[12px]", OK_TEXT_LINK)}>
                View all posts
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const STAT_CARDS = [
  {
    key: "totalBlogs" as const,
    label: "Total posts",
    icon: BookOpen,
    href: "/blog/posts",
  },
  {
    key: "publishedBlogs" as const,
    label: "Published",
    icon: BadgeCheck,
    href: "/blog/posts?status=published",
  },
  {
    key: "draftBlogs" as const,
    label: "Drafts",
    icon: FilePenLine,
    href: "/blog/posts?status=draft",
  },
  {
    key: "totalClicks" as const,
    label: "Total clicks",
    icon: MousePointerClick,
    href: "/blog/clicks",
  },
] as const;

const BLOG_STAT_CARD_SURFACE = cn(OK_STAT_CARD, OK_CARD_RADIUS, "px-4 py-4 sm:px-5 sm:py-5");

type BlogCardData = {
  id: string;
  title: string;
  author: string;
  status: BlogStatus;
  views: number;
  image: string;
  categoryName: string;
  updatedAt: string | null;
  publishedAt?: string | null;
  metaDescription?: string;
  description?: string;
  content?: string;
};

const BLOG_CARD_SURFACE = OK_BLOG_CARD;

function BlogPostCardSkeleton() {
  return (
    <div className={BLOG_CARD_SURFACE}>
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="flex flex-col p-4 sm:p-5">
        <Skeleton className="mb-2 h-4 w-2/3 rounded" />
        <Skeleton className="mb-2 h-6 w-full rounded" />
        <Skeleton className="mb-2 h-6 w-4/5 rounded" />
        <Skeleton className="mb-4 h-4 w-full rounded" />
        <Skeleton className="mt-auto h-4 w-full rounded" />
      </div>
    </div>
  );
}

function BlogPostCardGrid({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  const grid = (
    <div className={cn(!embedded && OK_BLOG_GRID_CONTAINER)}>
      <div className={OK_BLOG_GRID}>{children}</div>
    </div>
  );

  if (embedded) return grid;

  return (
    <div className={OK_PAGE_CANVAS}>
      <div className={OK_PAGE_CANVAS_INNER}>{grid}</div>
    </div>
  );
}

function BlogPostCardActions({ postId, onDelete }: { postId: string; onDelete: () => void }) {
  const stopNav = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        className="size-8 rounded-full border-0 bg-white/95 text-[#515E70] shadow-md backdrop-blur-sm hover:bg-white hover:text-[#0055FF]"
        asChild
        onClick={stopNav}
      >
        <Link href={`/blog/posts/${postId}/edit`} aria-label="Edit post">
          <Edit2 className="size-3.5" />
        </Link>
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="size-8 rounded-full border-0 bg-white/95 text-[#515E70] shadow-md backdrop-blur-sm hover:bg-red-50 hover:text-red-600"
        type="button"
        onClick={(event) => {
          stopNav(event);
          onDelete();
        }}
        aria-label="Delete post"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </>
  );
}

function BlogPostCard({
  post,
  actions,
}: {
  post: BlogCardData;
  actions?: ReactNode;
}) {
  const displayDate = formatBlogDate(post.publishedAt || post.updatedAt);
  const readingMinutes = estimateBlogReadingMinutes(post.content, post.metaDescription);
  const excerpt = getBlogExcerpt(post, 160);
  const showStatus = post.status !== "published";

  return (
    <Link href={`/blog/posts/${post.id}`} className="group block h-full">
      <article className={BLOG_CARD_SURFACE}>
        <div className="relative aspect-[16/10] overflow-hidden">
          {post.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.image}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#E5EEFF]">
              <FileText className="size-10 text-[#0055FF]/30" strokeWidth={1.25} />
            </div>
          )}
          {showStatus ? (
            <Badge
              className={cn(
                "absolute left-3 top-3 z-10 border-0 shadow-sm",
                BLOG_STATUS_COLORS[post.status],
              )}
            >
              {BLOG_STATUS_LABELS[post.status]}
            </Badge>
          ) : null}
          {actions ? (
            <div
              className="absolute right-3 top-3 z-10 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
              onClick={(event) => event.preventDefault()}
            >
              {actions}
            </div>
          ) : null}
        </div>

        <div className="flex flex-grow flex-col p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#515E70]">
            <span className={OK_CATEGORY_PILL}>
              <Tag className="size-3 shrink-0" strokeWidth={2} />
              {post.categoryName || "Blog"}
            </span>
            <span>{readingMinutes} min read</span>
          </div>

          <h3 className={OK_BLOG_CARD_TITLE}>{post.title}</h3>

          {excerpt ? (
            <p className={OK_BLOG_CARD_EXCERPT}>{excerpt}</p>
          ) : (
            <div className="mb-4 flex-grow" />
          )}

          <div className={OK_BLOG_CARD_FOOTER}>
            <span className="truncate">{post.author || "FlowPilot"}</span>
            <time className="ml-2 shrink-0 tabular-nums">{displayDate}</time>
          </div>
        </div>
      </article>
    </Link>
  );
}

type RecentPostsView = "list" | "card";

export function BlogDashboard() {
  const { push } = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useBlogDashboardData();
  const [recentView, setRecentView] = useState<RecentPostsView>("card");

  const handleDelete = async (post: BlogCardData) => {
    const ok = await confirm({
      title: "Delete blog post?",
      description: `This will permanently delete "${post.title}".`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteBlogPost(post.id);
      push("Blog deleted", { kind: "success" });
      reload();
    } catch {
      push("Failed to delete blog", { kind: "error" });
    }
  };

  const postActions = (post: BlogCardData) => (
    <BlogPostCardActions postId={post.id} onDelete={() => handleDelete(post)} />
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className={cn("h-[5.5rem]", OK_CARD_RADIUS)} />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="rounded-2xl border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{error ?? "Dashboard unavailable."}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          If this keeps happening, run <code className="rounded bg-muted px-1">npm run dev:all</code> so the API on port 8011 is up.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void reload()}>
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, href }) => (
          <Link
            key={key}
            href={href}
            className={cn(BLOG_STAT_CARD_SURFACE, "group block")}
            aria-label={`Open ${label}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#515E70]">{label}</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-[#21232C] transition-colors group-hover:text-[#0055FF] sm:text-3xl">
                  {data.stats[key]}
                </p>
              </div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#E5EEFF] text-[#0055FF] transition-colors group-hover:bg-[#0055FF] group-hover:text-white">
                <Icon className="size-[17px]" strokeWidth={1.75} />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <section className="space-y-4 border-t border-[#E2E4E9] pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13.5px] font-semibold text-[#21232C]">Recent posts</h2>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-0.5 rounded-lg border border-[#e5e7eb] bg-[#fafafa] p-0.5 dark:border-zinc-700 dark:bg-zinc-800/60"
              role="group"
              aria-label="Recent posts view"
            >
              <button
                type="button"
                onClick={() => setRecentView("card")}
                aria-pressed={recentView === "card"}
                aria-label="Card view"
                className={cn(
                  "inline-flex h-7 w-8 items-center justify-center rounded-md transition",
                  recentView === "card"
                    ? "bg-white text-[#0055FF] shadow-sm dark:bg-zinc-700 dark:text-blue-300"
                    : "text-[#6b7280] hover:text-[#111827] dark:hover:text-zinc-200"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setRecentView("list")}
                aria-pressed={recentView === "list"}
                aria-label="List view"
                className={cn(
                  "inline-flex h-7 w-8 items-center justify-center rounded-md transition",
                  recentView === "list"
                    ? "bg-white text-[#0055FF] shadow-sm dark:bg-zinc-700 dark:text-blue-300"
                    : "text-[#6b7280] hover:text-[#111827] dark:hover:text-zinc-200"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Link
              href="/blog/posts"
              className="inline-flex h-8 items-center rounded-lg border border-[#e5e7eb] bg-white px-3 text-xs font-medium text-[#374151] transition hover:bg-[#fafafa] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              View all
            </Link>
          </div>
        </div>
        {data.recentPosts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e5e7eb] bg-[#fafafa] px-6 py-8 text-center dark:border-zinc-700 dark:bg-zinc-800/40">
            <p className="text-sm text-[#6b7280]">No blog posts yet.</p>
            <Button asChild size="sm" className="mt-3 h-8 rounded-lg bg-[#0055FF] hover:bg-[#0044CC]">
              <Link href="/blog/posts/create">Create your first post</Link>
            </Button>
          </div>
        ) : recentView === "card" ? (
          <BlogPostCardGrid embedded>
            {data.recentPosts.map((post) => (
              <BlogPostCard key={post.id} post={post} actions={postActions(post)} />
            ))}
          </BlogPostCardGrid>
        ) : (
          <div className="space-y-3">
            {data.recentPosts.map((post) => (
              <Card
                key={post.id}
                className={cn(
                  "group relative rounded-[0.5rem] border border-border p-4 shadow-sm transition-all duration-200",
                  "hover:-translate-y-0.5 hover:border-[#0055FF]/30 hover:bg-[#0055FF]/[0.03] hover:shadow-md",
                  "dark:hover:border-[#0055FF]/30 dark:hover:bg-[#0055FF]/[0.06]"
                )}
              >
                <Link href={`/blog/posts/${post.id}`} className="absolute inset-0 z-0 rounded-[0.5rem]" aria-label={`Read ${post.title}`} />
                <div className="relative z-[1] flex flex-col gap-3 pointer-events-none sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium transition-colors group-hover:text-[#0055FF] dark:group-hover:text-[#0055FF]">
                        {post.title}
                      </h3>
                      <Badge className={BLOG_STATUS_COLORS[post.status]}>{BLOG_STATUS_LABELS[post.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {post.author} · {post.categoryName || "Uncategorized"} · {formatBlogDate(post.updatedAt)}
                    </p>
                  </div>
                  <div className="pointer-events-auto z-[2] flex shrink-0 items-center gap-2">
                    {postActions(post)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const STATUS_FILTERS = ["all", "published", "draft"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function parseStatusFilter(value: string | null): StatusFilter {
  if (value === "published" || value === "draft") return value;
  return "all";
}

export function BlogList() {
  const searchParams = useSearchParams();
  const { push } = useToast();
  const confirm = useConfirm();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [status, setStatus] = useState<StatusFilter>(parseStatusFilter(searchParams.get("status")));
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const apiStatus = status === "all" ? undefined : status;
  const initialListCache = getCachedBlogPosts(apiStatus, page, pageSize);
  const [posts, setPosts] = useState<BlogPost[]>(() => initialListCache?.blogs ?? []);
  const [loading, setLoading] = useState(() => initialListCache === null);
  const [search, setSearch] = useState("");
  const [totalPages, setTotalPages] = useState(() => initialListCache?.totalPages ?? 1);
  const [totalBlogs, setTotalBlogs] = useState(() => initialListCache?.totalBlogs ?? 0);
  const [listView, setListView] = useState<RecentPostsView>("card");
  const skipLoadUntilPageReset = useRef(false);

  useEffect(() => {
    skipLoadUntilPageReset.current = true;
    setPage(1);
  }, [status, activeWorkspaceId]);

  useEffect(() => {
    if (skipLoadUntilPageReset.current && page !== 1) {
      return;
    }
    skipLoadUntilPageReset.current = false;

    let cancelled = false;
    const cached = getCachedBlogPosts(apiStatus, page, pageSize);
    if (cached) {
      setPosts(cached.blogs ?? []);
      setTotalPages(cached.totalPages);
      setTotalBlogs(cached.totalBlogs);
      setLoading(false);
    } else {
      setLoading(true);
    }

    fetchBlogPosts(apiStatus, page, pageSize)
      .then((result) => {
        if (cancelled) return;
        setPosts(result.blogs ?? []);
        setTotalPages(result.totalPages);
        setTotalBlogs(result.totalBlogs);
      })
      .catch(() => {
        if (!cancelled) push("Failed to load blogs", { kind: "error" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, status, activeWorkspaceId, pageSize, push]);

  const handleStatusChange = (value: StatusFilter) => {
    if (value === status) return;
    setStatus(value);
  };

  const filtered = useMemo(() => {
    return (posts ?? []).filter((post) => {
      const matchesStatus = status === "all" || post.status === status;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        post.title.toLowerCase().includes(q) ||
        post.author.toLowerCase().includes(q) ||
        post.categoryName.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [posts, search, status]);

  const handleDelete = async (post: BlogPost) => {
    const ok = await confirm({
      title: "Delete blog post?",
      description: `This will permanently delete \"${post.title}\".`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteBlogPost(post.id);
      push("Blog deleted", { kind: "success" });
      const apiStatus = status === "all" ? undefined : status;
      const result = await fetchBlogPosts(apiStatus, page, pageSize, { force: true });
      if (result.blogs.length === 0 && page > 1) {
        setPage((p) => p - 1);
      } else {
        setPosts(result.blogs ?? []);
        setTotalPages(result.totalPages);
        setTotalBlogs(result.totalBlogs);
      }
    } catch {
      push("Failed to delete blog", { kind: "error" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts..."
            className="h-9 w-full rounded-lg border-[#e5e7eb] bg-white pl-9 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div
          className="flex items-center gap-0.5 rounded-lg border border-[#e5e7eb] bg-[#fafafa] p-0.5 dark:border-zinc-700 dark:bg-zinc-800/60"
          role="group"
          aria-label="Blog list view"
        >
          <button
            type="button"
            onClick={() => setListView("card")}
            aria-pressed={listView === "card"}
            aria-label="Card view"
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-md transition",
              listView === "card"
                ? "bg-white text-[#0055FF] shadow-sm dark:bg-zinc-700 dark:text-blue-300"
                : "text-[#6b7280] hover:text-[#111827] dark:hover:text-zinc-200"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setListView("list")}
            aria-pressed={listView === "list"}
            aria-label="List view"
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-md transition",
              listView === "list"
                ? "bg-white text-[#0055FF] shadow-sm dark:bg-zinc-700 dark:text-blue-300"
                : "text-[#6b7280] hover:text-[#111827] dark:hover:text-zinc-200"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => handleStatusChange(value)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] font-medium transition-all duration-200",
              status === value ? BLOG_PILL_ACTIVE : BLOG_PILL_INACTIVE
            )}
          >
            {value === "all" ? "All Posts" : value === "published" ? "Published" : "Drafts"}
          </button>
        ))}
      </div>

      {loading ? (
        listView === "card" ? (
          <BlogPostCardGrid embedded>
            {Array.from({ length: 6 }).map((_, i) => (
              <BlogPostCardSkeleton key={i} />
            ))}
          </BlogPostCardGrid>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <Card className="rounded-lg border border-dashed border-[#E2E4E9] bg-white p-10 text-center text-sm text-[#515E70]">
          No posts found. Create a new post to get started.
        </Card>
      ) : listView === "card" ? (
        <BlogPostCardGrid embedded>
          {filtered.map((post) => (
            <BlogPostCard
              key={post.id}
              post={post}
              actions={<BlogPostCardActions postId={post.id} onDelete={() => handleDelete(post)} />}
            />
          ))}
        </BlogPostCardGrid>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <Card
              key={post.id}
              className={cn(
                "group relative cursor-pointer rounded-[0.5rem] border border-border p-4 shadow-sm transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-[#0055FF]/30 hover:bg-[#0055FF]/[0.03] hover:shadow-md",
                "dark:hover:border-[#0055FF]/30 dark:hover:bg-[#0055FF]/[0.06]"
              )}
            >
              <Link href={`/blog/posts/${post.id}`} className="absolute inset-0 z-0 rounded-[0.5rem]" aria-label={`Read ${post.title}`} />
              <div className="relative z-[1] flex flex-col gap-3 pointer-events-none sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium transition-colors group-hover:text-[#0055FF] dark:group-hover:text-[#0055FF]">{post.title}</h3>
                    <Badge className={BLOG_STATUS_COLORS[post.status]}>{BLOG_STATUS_LABELS[post.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {post.author} · {post.categoryName || "Uncategorized"} · Updated {formatBlogDate(post.updatedAt)}
                  </p>
                </div>
                <div className="pointer-events-auto z-[2] flex shrink-0 items-center gap-2">
                  <Link href={`/blog/posts/${post.id}/edit`}>
                    <Button variant="outline" size="sm" type="button">
                      <Edit2 className="mr-1 h-4 w-4" />
                      Edit
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" type="button" onClick={() => handleDelete(post)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {totalBlogs} posts
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const articleProseClass = "blog-article-prose";

function BlogPostStaffBar({ postId }: { postId: string }) {
  return (
    <div className="border-b border-[#E2E4E9] bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/blog" className={OK_BACK_LINK}>
          <ArrowLeft className="size-4 shrink-0" />
          Back to Blog
        </Link>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild className={cn("h-8 rounded-lg", OK_OUTLINE_BTN)}>
            <Link href="/blog/posts">All posts</Link>
          </Button>
          <Button size="sm" className={cn("h-8 rounded-lg", OK_PRIMARY_BTN)} asChild>
            <Link href={`/blog/posts/${postId}/edit`}>
              <Edit2 className="mr-1.5 size-3.5" />
              Edit
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BlogPostView({ postId }: { postId: string }) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [post, setPost] = useState<BlogPost | null>(() => getCachedBlogPost(postId));
  const [loading, setLoading] = useState(() => getCachedBlogPost(postId) === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedBlogPost(postId);
    if (cached) {
      setPost(cached);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
    }

    fetchBlogPost(postId)
      .then((next) => {
        if (!cancelled) {
          setPost(next);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPost(null);
          setError("Unable to load this blog post.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postId, activeWorkspaceId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Skeleton className="h-14 w-full rounded-none" />
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-10 sm:px-6 lg:px-8">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-12 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded" />
          <Skeleton className="mt-8 aspect-[16/9] w-full rounded-[0.5rem]" />
          <div className="space-y-3 pt-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-white px-6 py-16">
        <p className="text-sm text-[#515E70]">{error ?? "Post not found."}</p>
        <Button variant="outline" className={cn("mt-4 rounded-lg", OK_OUTLINE_BTN)} asChild>
          <Link href="/blog">Back to Blog</Link>
        </Button>
      </div>
    );
  }

  const displayDate = new Date(
    post.publishedAt || post.updatedAt || post.createdAt || "",
  ).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const readingMinutes = estimateBlogReadingMinutes(post.content, post.metaDescription);

  return (
    <article className={cn(OK_BLOG_ROOT, "min-h-screen bg-white pb-16")}>
      <BlogPostStaffBar postId={post.id} />

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-8">
          {post.categoryName ? (
            <p className={OK_ARTICLE_CATEGORY}>{post.categoryName}</p>
          ) : null}
          <h1 className={OK_ARTICLE_TITLE}>{post.title}</h1>
          <div className={cn("mt-5 flex flex-wrap items-center gap-x-5 gap-y-2", OK_ARTICLE_META)}>
            <span className="inline-flex items-center gap-1.5">
              <User className="size-4 shrink-0" strokeWidth={1.75} />
              {post.author || "FlowPilot"}
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
          {post.status !== "published" ? (
            <Badge className={cn("mt-4", BLOG_STATUS_COLORS[post.status])}>{BLOG_STATUS_LABELS[post.status]}</Badge>
          ) : null}
        </header>

        {post.image ? (
          <div className={cn("mb-10 overflow-hidden", OK_ARTICLE_IMAGE_RADIUS)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image} alt="" className="w-full object-cover" />
          </div>
        ) : null}

        {post.metaDescription ? (
          <p className="mb-8 text-lg leading-relaxed text-[#515E70]">{post.metaDescription}</p>
        ) : null}

        <div className={articleProseClass} dangerouslySetInnerHTML={{ __html: post.content }} />

        {post.tags.length > 0 ? (
          <div className="mt-10 flex flex-wrap gap-2 border-t border-[#E2E4E9] pt-8">
            {post.tags.map((tag) => (
              <span key={tag} className={OK_CATEGORY_PILL}>
                <Tag className="size-3 shrink-0" strokeWidth={2} />
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <footer className="mt-12 flex flex-wrap gap-3 border-t border-[#E2E4E9] pt-8">
          <Button variant="outline" className={cn("rounded-lg", OK_OUTLINE_BTN)} asChild>
            <Link href="/blog/posts">All posts</Link>
          </Button>
          <Button className={cn("rounded-lg", OK_PRIMARY_BTN)} asChild>
            <Link href={`/blog/posts/${post.id}/edit`}>
              <Edit2 className="mr-1.5 size-4" />
              Edit post
            </Link>
          </Button>
        </footer>
      </div>
    </article>
  );
}

export function BlogClicked() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [data, setData] = useState<BlogClicksData | null>(() => getCachedBlogClicks());
  const [loading, setLoading] = useState(() => getCachedBlogClicks() === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedBlogClicks();
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
    }

    fetchBlogClicks()
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError("Unable to load click analytics.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="rounded-2xl border-dashed p-8 text-center text-sm text-muted-foreground">
        {error ?? "Click analytics unavailable."}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 h-8 text-[#6b7280]" asChild>
            <Link href="/blog">
              <ArrowLeft className="h-4 w-4" />
              Back to overview
            </Link>
          </Button>
          <h2 className="text-[13.5px] font-semibold text-[#111827] dark:text-zinc-50">Click analytics</h2>
          <p className="mt-0.5 text-[12.5px] text-[#9ca3af]">
            {data.totalClicks.toLocaleString()} total clicks across {data.blogs.length} post{data.blogs.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className={cn(BLOG_STAT_CARD_SURFACE, "flex items-center gap-3")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#E5EEFF] text-[#0055FF]">
            <MousePointerClick className="size-[17px]" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-xs font-medium text-[#515E70]">Total clicks</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-[#21232C]">{data.totalClicks.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <Card className={cn(BLOG_SURFACE, "p-5")}>
        {data.blogs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#e5e7eb] bg-[#fafafa] px-6 py-8 text-center dark:border-zinc-700 dark:bg-zinc-800/40">
            <p className="text-sm text-[#6b7280]">No posts yet. Clicks will appear here once posts get traffic.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Title</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Category</th>
                  <th className="px-2 py-2 font-medium">Published</th>
                  <th className="px-2 py-2 text-right font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {data.blogs.map((blog, index) => (
                  <tr key={blog.id} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-3 text-muted-foreground">{index + 1}</td>
                    <td className="px-2 py-3">
                      <Link href={`/blog/posts/${blog.id}/edit`} className="font-medium hover:underline">
                        {blog.title}
                      </Link>
                    </td>
                    <td className="px-2 py-3">
                      <Badge className={BLOG_STATUS_COLORS[blog.status]}>{BLOG_STATUS_LABELS[blog.status]}</Badge>
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">{blog.categoryName || "Uncategorized"}</td>
                    <td className="px-2 py-3 text-muted-foreground">{formatBlogDate(blog.publishedAt)}</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{blog.clicks.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
