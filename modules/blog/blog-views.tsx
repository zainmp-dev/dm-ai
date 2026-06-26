"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Calendar,
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
  getCachedBlogDashboard,
  BLOG_PRIMARY_BUTTON,
  BLOG_STATUS_COLORS,
  BLOG_STATUS_LABELS,
  formatBlogDate,
  type BlogClicksData,
  type BlogDashboardData,
  type BlogPost,
  type BlogStatus,
} from "./blog-core";

const BLOG_SURFACE = "rounded-xl border border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-zinc-900/80";

const BLOG_TAB_ACTIVE = "border-[#1a56db] text-[#1a56db]";

const BLOG_TAB_INACTIVE = "border-transparent text-[#6b7280] hover:text-[#111827] dark:text-zinc-400 dark:hover:text-zinc-100";

const BLOG_PILL_ACTIVE = "border-[#1a56db] bg-[#f0f4ff] text-[#1a56db]";

const BLOG_PILL_INACTIVE =
  "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600";

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
    /\/blog\/posts\/[^/]+\/edit$/.test(pathname) ||
    /\/blog\/posts\/[^/]+$/.test(pathname);

  if (isFullBleedRoute) {
    return <div className="w-full min-w-0">{children}</div>;
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827] dark:text-zinc-50">Blog</h1>
          <p className="mt-1 text-sm text-[#6b7280] dark:text-zinc-400">Create, publish, and manage your content.</p>
        </div>
        <Link
          href="/blog/posts/create"
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#1a56db] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1648c0] active:bg-[#1340ad]"
        >
          <Plus className="size-3.5 shrink-0" strokeWidth={2.5} />
          New post
        </Link>
      </div>

      <nav className="flex gap-1 border-b border-[#e5e7eb] dark:border-zinc-800" aria-label="Blog sections">
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

export function getCachedBlogDashboard(): BlogDashboardData | null {
  const key = blogDashboardCacheKey();
  if (
    blogDashboardCache &&
    blogDashboardCache.key === key &&
    Date.now() - blogDashboardCache.at < BLOG_DASHBOARD_CACHE_TTL_MS
  ) {
    return blogDashboardCache.data;
  }
  return null;
}

export function useBlogDashboardData() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [data, setData] = useState<BlogDashboardData | null>(() => getCachedBlogDashboard());
  const [loading, setLoading] = useState(() => getCachedBlogDashboard() === null);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedBlogDashboard();
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    fetchBlogDashboard()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  return { data, loading };
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
          <Button asChild size="sm" className="h-8 rounded-lg bg-[#1a56db] text-[12.5px] hover:bg-[#1648c0]">
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
            <Button asChild size="sm" className="mt-3 h-8 rounded-lg bg-[#1a56db] hover:bg-[#1648c0]">
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
                  <p className="truncate text-[13px] font-medium text-[#111827] group-hover:text-[#1a56db]">{post.title}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-[#9ca3af]">
                    {post.author} · {formatBlogDate(post.updatedAt)}
                  </p>
                </div>
                <Badge className={cn("shrink-0", BLOG_STATUS_COLORS[post.status])}>{BLOG_STATUS_LABELS[post.status]}</Badge>
              </Link>
            ))}
            <div className="pt-1 text-right">
              <Link href="/blog/posts" className="text-[12px] font-medium text-[#1a56db] hover:underline">
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
    accent: "#1a56db",
    bg: "#f0f4ff",
  },
  {
    key: "publishedBlogs" as const,
    label: "Published",
    icon: BadgeCheck,
    href: "/blog/posts?status=published",
    accent: "#047857",
    bg: "#ecfdf5",
  },
  {
    key: "draftBlogs" as const,
    label: "Drafts",
    icon: FilePenLine,
    href: "/blog/posts?status=draft",
    accent: "#b45309",
    bg: "#fffbeb",
  },
  {
    key: "totalClicks" as const,
    label: "Total clicks",
    icon: MousePointerClick,
    href: "/blog/clicks",
    accent: "#7c3aed",
    bg: "#f5f3ff",
  },
] as const;

type BlogCardData = {
  id: string;
  title: string;
  author: string;
  status: BlogStatus;
  views: number;
  image: string;
  categoryName: string;
  updatedAt: string | null;
};

function BlogPostCardActions({ postId, onDelete }: { postId: string; onDelete: () => void }) {
  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        className="size-8 rounded-full border-0 bg-white/95 text-slate-700 shadow-md backdrop-blur-sm hover:bg-white dark:bg-zinc-900/95 dark:text-zinc-200"
        asChild
      >
        <Link href={`/blog/posts/${postId}/edit`} aria-label="Edit post">
          <Edit2 className="size-3.5" />
        </Link>
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="size-8 rounded-full border-0 bg-white/95 text-slate-700 shadow-md backdrop-blur-sm hover:bg-red-50 hover:text-red-600 dark:bg-zinc-900/95 dark:text-zinc-200"
        type="button"
        onClick={onDelete}
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
  return (
    <article className="group">
      <div className="relative">
        <Link href={`/blog/posts/${post.id}`} className="block overflow-hidden rounded-xl bg-slate-100 dark:bg-zinc-800">
          {post.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.image}
              alt=""
              className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 dark:bg-zinc-800">
              <FileText className="size-10 text-slate-300 dark:text-zinc-600" strokeWidth={1.25} />
            </div>
          )}
        </Link>
        {actions ? (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            {actions}
          </div>
        ) : null}
      </div>

      <Link href={`/blog/posts/${post.id}`} className="block pt-3">
        <p className="text-[12px] text-[#6b7280] dark:text-zinc-400">{post.categoryName || "Blog"}</p>
        <h3 className="mt-1.5 line-clamp-2 text-base font-semibold leading-snug tracking-tight text-[#111827] transition-colors group-hover:text-[#1a56db] dark:text-zinc-50">
          {post.title}
        </h3>
        <p className="mt-2 text-[12.5px] text-[#9ca3af]">{formatBlogDate(post.updatedAt)}</p>
      </Link>
    </article>
  );
}

type RecentPostsView = "list" | "card";

export function BlogDashboard() {
  const { push } = useToast();
  const confirm = useConfirm();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [data, setData] = useState<BlogDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentView, setRecentView] = useState<RecentPostsView>("card");

  const reload = () => {
    fetchBlogDashboard({ force: true })
      .then(setData)
      .catch(() => setError("Unable to load blog dashboard."));
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    const cached = getCachedBlogDashboard();
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    fetchBlogDashboard()
      .then(setData)
      .catch(() => setError("Unable to load blog dashboard."))
      .finally(() => setLoading(false));
  }, [activeWorkspaceId]);

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
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="rounded-2xl border-dashed p-8 text-center text-sm text-muted-foreground">
        {error ?? "Dashboard unavailable."}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, href, accent, bg }) => (
          <Link
            key={key}
            href={href}
            className="group block rounded-xl border border-[#e5e7eb] bg-white px-5 py-4 transition-shadow hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80"
            aria-label={`Open ${label}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12.5px] font-medium text-[#6b7280]">{label}</p>
                <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight" style={{ color: accent }}>
                  {data.stats[key]}
                </p>
              </div>
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: bg }}
              >
                <Icon className="size-[17px]" strokeWidth={1.7} style={{ color: accent }} />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <Card className={cn(BLOG_SURFACE, "p-5")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[13.5px] font-semibold text-[#111827] dark:text-zinc-50">Recent posts</h2>
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
                    ? "bg-white text-[#1a56db] shadow-sm dark:bg-zinc-700 dark:text-blue-300"
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
                    ? "bg-white text-[#1a56db] shadow-sm dark:bg-zinc-700 dark:text-blue-300"
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
            <Button asChild size="sm" className="mt-3 h-8 rounded-lg bg-[#1a56db] hover:bg-[#1648c0]">
              <Link href="/blog/posts/create">Create your first post</Link>
            </Button>
          </div>
        ) : recentView === "card" ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.recentPosts.map((post) => (
              <BlogPostCard key={post.id} post={post} actions={postActions(post)} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {data.recentPosts.map((post) => (
              <Card
                key={post.id}
                className={cn(
                  "group relative rounded-2xl border border-border p-4 shadow-sm transition-all duration-200",
                  "hover:-translate-y-0.5 hover:border-[#1a56db]/30 hover:bg-[#1a56db]/[0.03] hover:shadow-md",
                  "dark:hover:border-[#3b82f6]/30 dark:hover:bg-[#3b82f6]/[0.06]"
                )}
              >
                <Link href={`/blog/posts/${post.id}`} className="absolute inset-0 z-0 rounded-2xl" aria-label={`Read ${post.title}`} />
                <div className="relative z-[1] flex flex-col gap-3 pointer-events-none sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium transition-colors group-hover:text-[#1a56db] dark:group-hover:text-[#3b82f6]">
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
      </Card>
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
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>(parseStatusFilter(searchParams.get("status")));
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBlogs, setTotalBlogs] = useState(0);
  const [listView, setListView] = useState<RecentPostsView>("card");
  const pageSize = 20;

  const load = () => {
    setLoading(true);
    const apiStatus = status === "all" ? undefined : status;
    fetchBlogPosts(apiStatus, page, pageSize)
      .then((result) => {
        setPosts(result.blogs ?? []);
        setTotalPages(result.totalPages);
        setTotalBlogs(result.totalBlogs);
      })
      .catch(() => push("Failed to load blogs", { kind: "error" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, status, activeWorkspaceId]);

  useEffect(() => {
    setPage(1);
  }, [status, activeWorkspaceId]);

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
      const result = await fetchBlogPosts(apiStatus, page, pageSize);
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
                ? "bg-white text-[#1a56db] shadow-sm dark:bg-zinc-700 dark:text-blue-300"
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
                ? "bg-white text-[#1a56db] shadow-sm dark:bg-zinc-700 dark:text-blue-300"
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
            onClick={() => setStatus(value)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[12.5px] font-medium transition-all duration-200",
              status === value ? BLOG_PILL_ACTIVE : BLOG_PILL_INACTIVE
            )}
          >
            {value === "all" ? "All posts" : value === "published" ? "Published" : "Drafts"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={cn(listView === "card" ? "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3")}>
          {Array.from({ length: listView === "card" ? 6 : 4 }).map((_, i) => (
            <Skeleton key={i} className={cn(listView === "card" ? "aspect-[4/3] rounded-xl" : "h-20 rounded-xl")} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-xl border border-dashed border-[#e5e7eb] bg-[#fafafa] p-10 text-center text-sm text-[#6b7280] dark:border-zinc-700 dark:bg-zinc-800/40">
          No posts found. Create a new post to get started.
        </Card>
      ) : listView === "card" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <BlogPostCard
              key={post.id}
              post={post}
              actions={<BlogPostCardActions postId={post.id} onDelete={() => handleDelete(post)} />}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <Card
              key={post.id}
              className={cn(
                "group relative cursor-pointer rounded-2xl border border-border p-4 shadow-sm transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-[#1a56db]/30 hover:bg-[#1a56db]/[0.03] hover:shadow-md",
                "dark:hover:border-[#3b82f6]/30 dark:hover:bg-[#3b82f6]/[0.06]"
              )}
            >
              <Link href={`/blog/posts/${post.id}`} className="absolute inset-0 z-0 rounded-2xl" aria-label={`Read ${post.title}`} />
              <div className="relative z-[1] flex flex-col gap-3 pointer-events-none sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium transition-colors group-hover:text-[#1a56db] dark:group-hover:text-[#3b82f6]">{post.title}</h3>
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

const articleProseClass =
  "blog-article-prose text-[1.125rem] leading-[1.8] text-slate-700 dark:text-zinc-300 [&_h2]:mb-5 [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-slate-900 dark:[&_h2]:text-zinc-50 [&_h3]:mb-4 [&_h3]:mt-10 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-zinc-50 [&_p]:mb-6 [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2 [&_strong]:font-semibold [&_em]:italic [&_a]:font-medium [&_a]:text-blue-600 [&_a]:underline-offset-2 hover:[&_a]:underline dark:[&_a]:text-blue-400 [&_img]:my-8 [&_img]:w-full [&_img]:rounded-2xl";

const BLOG_ARTICLE_BLEED =
  "-mx-4 -mt-4 w-[calc(100%+2rem)] sm:-mx-6 sm:-mt-5 sm:w-[calc(100%+3rem)] md:-mx-7 md:-mt-6 md:w-[calc(100%+3.5rem)]";

function BlogPostNav({
  postId,
  onHero = false,
}: {
  postId: string;
  onHero?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8",
        onHero
          ? "bg-black/15 backdrop-blur-[2px]"
          : "border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90"
      )}
    >
      <Link
        href="/blog"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition",
          onHero
            ? "text-white/90 hover:bg-white/10 hover:text-white"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        )}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to blog
      </Link>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          asChild
          className={onHero ? "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" : undefined}
        >
          <Link href="/blog/posts">All posts</Link>
        </Button>
        <Button size="sm" className={onHero ? "bg-white text-slate-900 hover:bg-white/90" : BLOG_PRIMARY_BUTTON} asChild>
          <Link href={`/blog/posts/${postId}/edit`}>
            <Edit2 className="mr-1.5 h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function BlogPostView({ postId }: { postId: string }) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchBlogPost(postId)
      .then(setPost)
      .catch(() => setError("Unable to load this blog post."))
      .finally(() => setLoading(false));
  }, [postId, activeWorkspaceId]);

  if (loading) {
    return (
      <div className={cn(BLOG_ARTICLE_BLEED, "min-h-screen bg-white dark:bg-zinc-950")}>
        <Skeleton className="h-14 w-full rounded-none" />
        <Skeleton className="h-[min(50vh,520px)] w-full rounded-none" />
        <div className="mx-auto max-w-4xl space-y-4 px-6 py-12 lg:max-w-5xl">
          <Skeleton className="h-12 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded" />
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
      <div className={cn(BLOG_ARTICLE_BLEED, "flex min-h-[60vh] flex-col items-center justify-center bg-white px-6 py-16 dark:bg-zinc-950")}>
        <p className="text-sm text-muted-foreground">{error ?? "Post not found."}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/blog">Back to Blog</Link>
        </Button>
      </div>
    );
  }

  const displayDate = formatBlogDate(post.publishedAt || post.updatedAt || post.createdAt);

  return (
    <article className={cn(BLOG_ARTICLE_BLEED, "min-h-screen bg-white dark:bg-zinc-950")}>
      {post.image ? (
        <div className="relative h-[min(58vh,620px)] w-full overflow-hidden bg-slate-900">
          <div className="absolute inset-x-0 top-0 z-20">
            <BlogPostNav postId={post.id} onHero />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image}
            alt={post.title}
            className="absolute inset-0 size-full object-cover object-center"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[32%] bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-8 pt-4 sm:px-8 sm:pb-10 lg:px-12">
            <div className="mx-auto max-w-5xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {post.categoryName ? (
                  <Badge className="rounded-full border-0 bg-white/20 px-3 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                    {post.categoryName}
                  </Badge>
                ) : null}
                <Badge className={cn("rounded-full border-0", BLOG_STATUS_COLORS[post.status])}>{BLOG_STATUS_LABELS[post.status]}</Badge>
              </div>
              <h1 className="max-w-4xl text-3xl font-bold leading-tight tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)] sm:text-4xl lg:text-5xl lg:leading-[1.1]">
                {post.title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]">
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-4 w-4 shrink-0" />
                  {post.author || "Unknown author"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 shrink-0" />
                  {displayDate}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="sticky top-0 z-30">
          <BlogPostNav postId={post.id} />
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-14 lg:max-w-5xl lg:px-12 lg:py-16">
        {post.image && post.metaDescription ? (
          <p className="mb-6 max-w-3xl text-lg leading-relaxed text-slate-600 dark:text-zinc-400">{post.metaDescription}</p>
        ) : null}
        {post.image && post.tags.length > 0 ? (
          <div className="mb-8 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Badge
                key={tag}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-xs font-medium text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
        {!post.image ? (
          <header className="mb-12 border-b border-slate-200 pb-10 dark:border-zinc-800">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {post.categoryName ? (
                <Badge className="rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900">
                  {post.categoryName}
                </Badge>
              ) : null}
              <Badge className={cn("rounded-full", BLOG_STATUS_COLORS[post.status])}>{BLOG_STATUS_LABELS[post.status]}</Badge>
            </div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-zinc-50">
              {post.title}
            </h1>
            {post.metaDescription ? (
              <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600 dark:text-zinc-400">{post.metaDescription}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-4 w-4 shrink-0" />
                {post.author || "Unknown author"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4 shrink-0" />
                {displayDate}
              </span>
              {post.tags.length > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Tag className="h-4 w-4 shrink-0" />
                  {post.tags.join(", ")}
                </span>
              ) : null}
            </div>
          </header>
        ) : null}

        <div className={articleProseClass} dangerouslySetInnerHTML={{ __html: post.content }} />

        <footer className="mt-16 flex flex-wrap gap-3 border-t border-slate-200 pt-10 dark:border-zinc-800">
          <Button variant="outline" asChild>
            <Link href="/blog/posts">All blogs</Link>
          </Button>
          <Button className={BLOG_PRIMARY_BUTTON} asChild>
            <Link href={`/blog/posts/${post.id}/edit`}>
              <Edit2 className="mr-1.5 h-4 w-4" />
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
  const [data, setData] = useState<BlogClicksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchBlogClicks()
      .then(setData)
      .catch(() => setError("Unable to load click analytics."))
      .finally(() => setLoading(false));
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
        <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#f5f3ff] text-[#7c3aed]">
            <MousePointerClick className="size-[17px]" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-[11px] font-medium text-[#6b7280]">Total clicks</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-[#111827] dark:text-zinc-50">{data.totalClicks.toLocaleString()}</p>
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
