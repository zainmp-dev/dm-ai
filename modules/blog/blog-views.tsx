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
  BLOG_PRIMARY_BUTTON,
  BLOG_STATUS_COLORS,
  BLOG_STATUS_LABELS,
  formatBlogDate,
  type BlogClicksData,
  type BlogDashboardData,
  type BlogPost,
  type BlogStatus,
} from "./blog-core";

const BLOG_SURFACE =
  "rounded-2xl border border-blue-100/90 bg-white shadow-sm shadow-blue-900/[0.04] dark:border-blue-900/50 dark:bg-zinc-900/60";

const BLOG_TAB_ACTIVE =
  "border-blue-300 bg-gradient-to-b from-blue-50 to-white text-blue-950 shadow-sm ring-1 ring-blue-200/60 dark:border-blue-600 dark:from-blue-950/50 dark:to-zinc-900 dark:text-blue-50 dark:ring-blue-700/50";

const BLOG_TAB_INACTIVE =
  "border-blue-100/80 bg-slate-50/50 text-slate-600 hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-sm dark:border-blue-950/50 dark:bg-zinc-800/40 dark:text-slate-300 dark:hover:bg-blue-950/30";

const BLOG_PILL_ACTIVE =
  "border-slate-900 bg-slate-900 text-white shadow-sm dark:border-zinc-100 dark:bg-zinc-100 dark:text-slate-900";

const BLOG_PILL_INACTIVE =
  "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600";

const BLOG_NAV: Array<{
  href: string;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  dashboard?: boolean;
}> = [
  { href: "/blog", label: "Dashboard", hint: "Stats and recent posts", icon: LayoutDashboard, dashboard: true },
  { href: "/blog/posts", label: "Blogs", hint: "All posts and drafts", icon: FileText },
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
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Blog</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create, publish, and manage your content.</p>
        </div>
        <Link
          href="/blog/posts/create"
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#1a56db] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1648c0] active:bg-[#1340ad]"
        >
          <Plus className="size-3.5 shrink-0" strokeWidth={2.5} />
          Create blog
        </Link>
      </div>

      <section className={cn(BLOG_SURFACE, "p-3.5 sm:p-4")} aria-label="Blog sections">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Choose a section below.</p>
        <nav className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label="Blog sections">
          {BLOG_NAV.map((item) => {
            const active = isActive(pathname, item.href, item.exact, item.dashboard);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-0 min-w-0 flex-col items-start justify-center gap-1 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 sm:items-center sm:py-3 sm:text-center",
                  active ? BLOG_TAB_ACTIVE : BLOG_TAB_INACTIVE
                )}
              >
                <span className="flex w-full items-center gap-1.5 sm:justify-center">
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      active ? "text-blue-600 dark:text-blue-300" : "text-slate-500 dark:text-slate-400"
                    )}
                    aria-hidden
                  />
                  <span className="text-sm font-semibold">{item.label}</span>
                </span>
                <span
                  className={cn(
                    "w-full pl-[22px] text-[10px] sm:mt-0.5 sm:pl-0 sm:text-xs",
                    active ? "text-blue-700/80 dark:text-blue-200/80" : "text-slate-500 dark:text-slate-500"
                  )}
                >
                  {item.hint}
                </span>
              </Link>
            );
          })}
        </nav>
      </section>

      <div>{children}</div>
    </div>
  );
}

const STAT_CARDS = [
  {
    key: "totalBlogs" as const,
    label: "Total blogs",
    icon: BookOpen,
    href: "/blog/posts",
    iconWrap: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    hover: "hover:border-blue-200 hover:bg-blue-50/40 dark:hover:border-blue-800 dark:hover:bg-blue-950/20",
  },
  {
    key: "publishedBlogs" as const,
    label: "Published",
    icon: BadgeCheck,
    href: "/blog/posts?status=published",
    iconWrap: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    hover: "hover:border-emerald-200 hover:bg-emerald-50/40 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20",
  },
  {
    key: "draftBlogs" as const,
    label: "Drafts",
    icon: FilePenLine,
    href: "/blog/posts?status=draft",
    iconWrap: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    hover: "hover:border-amber-200 hover:bg-amber-50/40 dark:hover:border-amber-800 dark:hover:bg-amber-950/20",
  },
  {
    key: "totalClicks" as const,
    label: "Clicked blogs",
    icon: MousePointerClick,
    href: "/blog/clicks",
    iconWrap: "bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
    hover: "hover:border-violet-200 hover:bg-violet-50/40 dark:hover:border-violet-800 dark:hover:bg-violet-950/20",
  },
];

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
        <Link href={`/blog/posts/${post.id}`} className="block overflow-hidden rounded-2xl bg-slate-100 dark:bg-zinc-800">
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

      <Link href={`/blog/posts/${post.id}`} className="block pt-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">{post.categoryName || "Blog"}</p>
        <h3 className="mt-2 line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-slate-900 transition-colors group-hover:text-slate-600 dark:text-zinc-50 dark:group-hover:text-zinc-300">
          {post.title}
        </h3>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{formatBlogDate(post.updatedAt)}</p>
      </Link>
    </article>
  );
}

type RecentPostsView = "list" | "card";

export function BlogDashboard() {
  const { push } = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<BlogDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentView, setRecentView] = useState<RecentPostsView>("card");

  const reload = () => {
    fetchBlogDashboard()
      .then(setData)
      .catch(() => setError("Unable to load blog dashboard."));
  };

  useEffect(() => {
    setLoading(true);
    fetchBlogDashboard()
      .then(setData)
      .catch(() => setError("Unable to load blog dashboard."))
      .finally(() => setLoading(false));
  }, []);

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
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, href, iconWrap, hover }) => (
          <Link
            key={key}
            href={href}
            className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
          >
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-sm transition-all duration-200",
                "dark:border-zinc-800 dark:bg-zinc-900/80",
                hover
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105",
                  iconWrap
                )}
              >
                <Icon className="size-[18px]" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-semibold tabular-nums leading-none tracking-tight text-slate-900 dark:text-zinc-50">
                  {data.stats[key]}
                </p>
                <p className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Card className={cn(BLOG_SURFACE, "p-5")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Recent posts</h2>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-xl border border-blue-100/80 bg-slate-50/50 p-1 dark:border-blue-950/50 dark:bg-zinc-800/40"
              role="group"
              aria-label="Recent posts view"
            >
              <button
                type="button"
                onClick={() => setRecentView("card")}
                aria-pressed={recentView === "card"}
                aria-label="Card view"
                className={cn(
                  "inline-flex h-7 w-8 items-center justify-center rounded-lg transition",
                  recentView === "card"
                    ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500"
                    : "text-slate-500 hover:bg-white hover:text-slate-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
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
                  "inline-flex h-7 w-8 items-center justify-center rounded-lg transition",
                  recentView === "list"
                    ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500"
                    : "text-slate-500 hover:bg-white hover:text-slate-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Link
              href="/blog/posts"
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
            >
              View all
            </Link>
          </div>
        </div>
        {data.recentPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">No blog posts yet.</p>
          </div>
        ) : recentView === "card" ? (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
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
  }, [page, status]);

  useEffect(() => {
    setPage(1);
  }, [status]);

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
    <div className="space-y-8">
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search blogs..."
          className="h-11 w-full rounded-full border-slate-200 bg-white pl-9 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-wrap justify-center gap-2">
          {STATUS_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={cn(
                "rounded-full border px-5 py-2 text-sm font-medium transition-all duration-200",
                status === value ? BLOG_PILL_ACTIVE : BLOG_PILL_INACTIVE
              )}
            >
              {value === "all" ? "All blogs" : value === "published" ? "Published" : "Draft"}
            </button>
          ))}
        </div>
        <div
          className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
          role="group"
          aria-label="Blog list view"
        >
          <button
            type="button"
            onClick={() => setListView("card")}
            aria-pressed={listView === "card"}
            aria-label="Card view"
            className={cn(
              "inline-flex h-8 w-9 items-center justify-center rounded-full transition",
              listView === "card"
                ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-slate-900"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"
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
              "inline-flex h-8 w-9 items-center justify-center rounded-full transition",
              listView === "list"
                ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-slate-900"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className={cn(listView === "card" ? "grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10" : "space-y-3")}>
          {Array.from({ length: listView === "card" ? 6 : 4 }).map((_, i) => (
            <Skeleton key={i} className={cn(listView === "card" ? "aspect-[4/3] rounded-2xl" : "h-20 rounded-2xl")} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed p-10 text-center text-sm text-muted-foreground">
          No blogs found. Create a new post to get started.
        </Card>
      ) : listView === "card" ? (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
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
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchBlogPost(postId)
      .then(setPost)
      .catch(() => setError("Unable to load this blog post."))
      .finally(() => setLoading(false));
  }, [postId]);

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
                variant="outline"
                className="rounded-full border-slate-200 bg-slate-50 px-3 py-0.5 text-xs font-medium text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
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
  const [data, setData] = useState<BlogClicksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBlogClicks()
      .then(setData)
      .catch(() => setError("Unable to load click analytics."))
      .finally(() => setLoading(false));
  }, []);

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
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
            <Link href="/blog">
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
          <h2 className="text-lg font-semibold">Clicked blogs</h2>
          <p className="text-sm text-muted-foreground">
            {data.totalClicks.toLocaleString()} total clicks across {data.blogs.length} blog{data.blogs.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-blue-100/90 bg-white px-4 py-3 shadow-sm ring-1 ring-blue-50/50 dark:border-blue-900/50 dark:bg-zinc-900/80 dark:ring-blue-950/30">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
            <MousePointerClick className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Total clicks</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-zinc-50">{data.totalClicks.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <Card className={cn(BLOG_SURFACE, "p-5")}>
        {data.blogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">No blogs yet. Clicks will appear here once posts get traffic.</p>
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
