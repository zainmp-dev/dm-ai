"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Calendar,
  Edit2,
  FilePen,
  FileText,
  Globe,
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
} from "./blog-core";

const BLOG_NAV: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  dashboard?: boolean;
}> = [
  { href: "/blog", label: "Dashboard", icon: LayoutDashboard, dashboard: true },
  { href: "/blog/posts", label: "Blogs", icon: FileText },
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
        <Button asChild size="default" className={cn("shadow-sm", BLOG_PRIMARY_BUTTON)}>
          <Link href="/blog/posts/create">
            <Plus className="h-4 w-4" />
            Create blog
          </Link>
        </Button>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Blog sections">
        {BLOG_NAV.map((item) => {
          const active = isActive(pathname, item.href, item.exact, item.dashboard);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                "hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-sm",
                active
                  ? "border-[#1a56db]/40 bg-[#1a56db] text-white shadow-md hover:bg-[#1648c0] hover:text-white dark:bg-[#3b82f6] dark:hover:bg-[#2563eb]"
                  : "border-border bg-surface text-foreground shadow-sm hover:border-[#1a56db]/30 hover:bg-hover"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-white" : "text-[#1a56db] dark:text-[#3b82f6]")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}

const STAT_CARDS = [
  { key: "totalBlogs" as const, label: "Total blogs", icon: FileText, href: "/blog/posts" },
  { key: "publishedBlogs" as const, label: "Published", icon: Globe, href: "/blog/posts?status=published" },
  { key: "draftBlogs" as const, label: "Drafts", icon: FilePen, href: "/blog/posts?status=draft" },
  { key: "totalClicks" as const, label: "Clicked blogs", icon: MousePointerClick, href: "/blog/clicks" },
];

type RecentPostsView = "list" | "card";

export function BlogDashboard() {
  const [data, setData] = useState<BlogDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentView, setRecentView] = useState<RecentPostsView>("card");

  useEffect(() => {
    fetchBlogDashboard()
      .then(setData)
      .catch(() => setError("Unable to load blog dashboard."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, href }) => (
          <Link
            key={key}
            href={href}
            className={cn(
              "group block rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm transition-all",
              "cursor-pointer hover:-translate-y-px hover:border-accent/30 hover:shadow-md active:translate-y-0"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground group-hover:text-foreground">{label}</p>
              <span className="rounded-md bg-accent/10 p-1 text-accent transition group-hover:bg-accent group-hover:text-white">
                <Icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-1.5 text-xl font-semibold tracking-tight">{data.stats[key]}</p>
          </Link>
        ))}
      </div>

      <Card className="rounded-2xl border border-border p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Recent posts</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1" role="group" aria-label="Recent posts view">
              <button
                type="button"
                onClick={() => setRecentView("card")}
                aria-pressed={recentView === "card"}
                aria-label="Card view"
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
                  recentView === "card"
                    ? "bg-[#1a56db] text-white shadow-sm dark:bg-[#3b82f6]"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground"
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
                  "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
                  recentView === "list"
                    ? "bg-[#1a56db] text-white shadow-sm dark:bg-[#3b82f6]"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/blog/posts">View all</Link>
            </Button>
          </div>
        </div>
        {data.recentPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">No blog posts yet.</p>
          </div>
        ) : recentView === "card" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.recentPosts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/posts/${post.id}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:-translate-y-px hover:border-[#1a56db]/30 hover:shadow-md"
              >
                <div className="aspect-video w-full overflow-hidden bg-muted/40">
                  {post.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.image}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <FileText className="h-10 w-10 opacity-30" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="line-clamp-2 font-medium leading-snug group-hover:text-[#1a56db] dark:group-hover:text-[#3b82f6]">
                    {post.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {post.author} · {post.categoryName || "Uncategorized"}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">{formatBlogDate(post.updatedAt)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{post.views} views</span>
                      <Badge className={BLOG_STATUS_COLORS[post.status]}>{BLOG_STATUS_LABELS[post.status]}</Badge>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {data.recentPosts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/posts/${post.id}`}
                className={cn(
                  "group flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-transparent px-3 py-3 transition-all duration-200",
                  "hover:-translate-y-0.5 hover:border-[#1a56db]/20 hover:bg-[#1a56db]/[0.04] hover:shadow-sm",
                  "dark:hover:border-[#3b82f6]/20 dark:hover:bg-[#3b82f6]/[0.06]"
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium transition-colors group-hover:text-[#1a56db] dark:group-hover:text-[#3b82f6]">
                    {post.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {post.author} · {post.categoryName || "Uncategorized"} · {formatBlogDate(post.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{post.views} views</span>
                  <Badge className={BLOG_STATUS_COLORS[post.status]}>{BLOG_STATUS_LABELS[post.status]}</Badge>
                </div>
              </Link>
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
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search blogs..." className="pl-9" />
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              status === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {value === "all" ? "All" : value === "published" ? "Published" : "Draft"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed p-10 text-center text-sm text-muted-foreground">
          No blogs found. Create a new post to get started.
        </Card>
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
  "blog-article-prose text-[1.0625rem] leading-[1.75] text-foreground [&_h2]:mb-4 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:mb-5 [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2 [&_strong]:font-semibold [&_em]:italic [&_a]:text-[#1a56db] [&_a]:underline dark:[&_a]:text-[#3b82f6]";

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
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="aspect-[21/9] w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-4 w-2/3 rounded" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error ?? "Post not found."}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/blog">Back to Blog</Link>
        </Button>
      </div>
    );
  }

  const displayDate = formatBlogDate(post.publishedAt || post.updatedAt || post.createdAt);

  return (
    <article className="min-h-[calc(100vh-8rem)] bg-surface">
      <div className="border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1a56db] hover:underline dark:text-[#3b82f6]">
            <ArrowLeft className="h-4 w-4" />
            Blog
          </Link>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/blog/posts/${post.id}/edit`}>
              <Edit2 className="mr-1.5 h-4 w-4" />
              Edit
            </Link>
          </Button>
        </div>
      </div>

      {post.image ? (
        <div className="w-full overflow-hidden bg-muted/30">
          <div className="mx-auto max-w-4xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image} alt={post.title} className="aspect-[21/9] w-full object-cover md:rounded-b-2xl" />
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
        <header className="mb-10 border-b border-border/60 pb-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {post.categoryName ? (
              <Badge className="rounded-full border border-border bg-surface px-3 py-0.5 text-xs font-medium text-foreground">
                {post.categoryName}
              </Badge>
            ) : null}
            <Badge className={cn("rounded-full", BLOG_STATUS_COLORS[post.status])}>{BLOG_STATUS_LABELS[post.status]}</Badge>
          </div>

          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl md:leading-tight">
            {post.title}
          </h1>

          {post.metaDescription ? <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{post.metaDescription}</p> : null}

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
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

        <div className={articleProseClass} dangerouslySetInnerHTML={{ __html: post.content }} />

        <footer className="mt-14 flex flex-wrap gap-3 border-t border-border/60 pt-8">
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
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
          <MousePointerClick className="h-4 w-4 text-[#1a56db] dark:text-[#3b82f6]" />
          <div>
            <p className="text-xs text-muted-foreground">Total clicks</p>
            <p className="text-xl font-semibold">{data.totalClicks.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl border border-border p-5 shadow-sm">
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
