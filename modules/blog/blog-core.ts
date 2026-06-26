import axios from "axios";

import { getAuthToken } from "@/lib/auth";
import { getActiveWorkspaceRequestHeaders } from "@/lib/workspace-store";

export type BlogStatus = "draft" | "published" | "scheduled" | "archived";

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  author: string;
  content: string;
  description: string;
  metaDescription: string;
  image: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
  status: BlogStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  views: number;
  clicks: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BlogPostInput = {
  title: string;
  slug?: string;
  author?: string;
  content?: string;
  description?: string;
  metaDescription?: string;
  image?: string;
  categoryId?: string | null;
  categoryName?: string;
  tags?: string[];
  status?: BlogStatus;
  scheduledAt?: string | null;
};

export type BlogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  status: "active" | "inactive";
  blogCount: number;
  createdAt: string | null;
};

export type BlogCategoryInput = {
  name: string;
  slug?: string;
  description?: string;
  color?: string;
  icon?: string;
  status?: "active" | "inactive";
};

export type BlogDashboardData = {
  stats: {
    totalBlogs: number;
    publishedBlogs: number;
    draftBlogs: number;
    scheduledBlogs: number;
    archivedBlogs: number;
    totalClicks: number;
  };
  recentPosts: Array<{
    id: string;
    title: string;
    author: string;
    status: BlogStatus;
    views: number;
    image: string;
    categoryName: string;
    updatedAt: string | null;
  }>;
};

export type BlogClicksData = {
  totalClicks: number;
  blogs: Array<{
    id: string;
    title: string;
    status: BlogStatus;
    clicks: number;
    categoryName: string;
    publishedAt: string | null;
  }>;
};

export type BlogListPage = {
  blogs: BlogPost[];
  currentPage: number;
  totalPages: number;
  totalBlogs: number;
};

export type BlogSettings = {
  general: {
    websiteName: string;
    websiteUrl: string;
    logoUrl: string;
    faviconUrl: string;
  };
  content: {
    defaultAuthor: string;
    defaultCategory: string;
  };
  appearance: {
    primaryColor: string;
    secondaryColor: string;
  };
};

export type BlogAIGenerationStepId = "generating";

export type BlogAIGenerationStep = {
  id: BlogAIGenerationStepId;
  label: string;
};

export const BLOG_AI_GENERATION_MODAL_STEPS: BlogAIGenerationStep[] = [
  { id: "generating", label: "Generating blog draft" },
];

/** Target score for post-generation AI optimization. */
export const BLOG_AI_OPTIMIZATION_TARGET_SCORE = 100;

export type BlogAIFullGenerateParams = {
  topic: string;
  industry: string;
  audience: string;
  tone: string;
  wordCount: number;
};

export const BLOG_AI_DEFAULT_FULL_PARAMS: BlogAIFullGenerateParams = {
  topic: "Practical insights and best practices for our audience",
  industry: "Business",
  audience: "Professionals and decision-makers",
  tone: "Professional",
  wordCount: 1500,
};

export type BlogAIGeneratedContent = {
  title: string;
  author?: string;
  metaDescription: string;
  keywords: string[];
  contentHtml: string;
  categoryName: string;
  image: string;
  modelUsed: string;
};

export type BlogAIOptimizedContent = {
  title: string;
  author?: string;
  metaDescription: string;
  keywords: string[];
  contentHtml: string;
  permalink?: string;
  modelUsed?: string;
};

export type BlogAIFailedCheckInput = {
  id: string;
  label: string;
  message: string;
  suggestionLabel: string;
  category: string;
  weight: number;
};

export type BlogAIOptimizationSummary = {
  generatedScore: number;
  optimizedScore: number;
  fixedIssues: Array<{ id: string; label: string }>;
  rounds: number;
  targetScore: number;
  permalink?: string;
  remainingIssues: number;
};

export type BlogAIFormHandlers = {
  setTitle: (value: string) => void;
  setAuthor?: (value: string) => void;
  setMetaDescription: (value: string) => void;
  setTags: (value: string) => void;
  setImage: (value: string) => void;
  setContent: (value: string) => void;
  setCategoryId: (value: string) => void;
  setEditorContents: (html: string) => void;
  setPermalink?: (value: string) => void;
  resetPermalinkAuto?: () => void;
};

export const BLOG_STATUS_LABELS: Record<BlogStatus, string> = {
  draft: "Draft",
  published: "Published",
  scheduled: "Scheduled",
  archived: "Archived",
};

export const BLOG_STATUS_COLORS: Record<BlogStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  archived: "bg-amber-50 text-amber-700 border-amber-200",
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function formatBlogDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Primary CTA styling — matches FlowPilot accent blue. */
export const BLOG_PRIMARY_BUTTON =
  "bg-[#1a56db] text-white shadow-sm hover:bg-[#1648c0] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb]";

const API_PREFIX = (
  process.env.NEXT_PUBLIC_API_PREFIX ||
  process.env.VITE_API_BASE_URL ||
  "/api/backend"
).replace(/\/+$/, "");

const blogClient = axios.create({
  baseURL: API_PREFIX,
  withCredentials: true,
  timeout: 60_000,
});

blogClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const scopeHeaders = getActiveWorkspaceRequestHeaders();
  for (const [key, value] of Object.entries(scopeHeaders)) {
    config.headers[key] = value;
  }
  return config;
});

function unwrap<T>(res: { data: { success?: boolean; data: T } }): T {
  return res.data.data;
}

const BLOG_DASHBOARD_CACHE_TTL_MS = 30_000;
let blogDashboardInflight: Promise<BlogDashboardData> | null = null;
let blogDashboardCache: { key: string; data: BlogDashboardData; at: number } | null = null;

function blogDashboardCacheKey(): string {
  const headers = getActiveWorkspaceRequestHeaders();
  return headers["X-Flowpilot-Workspace-Setup-Id"] ?? "default";
}

export function invalidateBlogDashboardCache(): void {
  blogDashboardCache = null;
}

export async function fetchBlogDashboard(options?: { force?: boolean }): Promise<BlogDashboardData> {
  const key = blogDashboardCacheKey();
  const now = Date.now();

  if (
    !options?.force &&
    blogDashboardCache &&
    blogDashboardCache.key === key &&
    now - blogDashboardCache.at < BLOG_DASHBOARD_CACHE_TTL_MS
  ) {
    return blogDashboardCache.data;
  }

  if (blogDashboardInflight) {
    return blogDashboardInflight;
  }

  blogDashboardInflight = blogClient
    .get<{ success: boolean; data: BlogDashboardData }>("/blog/dashboard")
    .then((res) => {
      const data = unwrap(res);
      blogDashboardCache = { key, data, at: Date.now() };
      return data;
    })
    .finally(() => {
      blogDashboardInflight = null;
    });

  return blogDashboardInflight;
}

/** Warm blog dashboard cache during app boot (runs in parallel with workspace fetch). */
export function prefetchBlogDashboard(): void {
  void fetchBlogDashboard().catch(() => undefined);
}

export async function fetchBlogPosts(
  status?: string,
  page = 1,
  limit = 20,
): Promise<BlogListPage> {
  const res = await blogClient.get<{ success: boolean; data: BlogListPage | BlogPost[] }>("/api/blogs", {
    params: {
      page,
      limit,
      ...(status ? { status } : {}),
    },
  });
  const data = unwrap(res);
  if (Array.isArray(data)) {
    return {
      blogs: data,
      currentPage: 1,
      totalPages: 1,
      totalBlogs: data.length,
    };
  }
  return {
    blogs: data?.blogs ?? [],
    currentPage: data?.currentPage ?? 1,
    totalPages: data?.totalPages ?? 1,
    totalBlogs: data?.totalBlogs ?? 0,
  };
}

export async function fetchBlogPost(id: string): Promise<BlogPost> {
  const res = await blogClient.get<{ success: boolean; data: BlogPost }>(`/api/blogs/${id}`);
  return unwrap(res);
}

export async function createBlogPost(input: BlogPostInput): Promise<BlogPost> {
  const res = await blogClient.post<{ success: boolean; data: BlogPost }>("/api/blogs", mapBlogInput(input));
  return unwrap(res);
}

export async function updateBlogPost(id: string, input: BlogPostInput): Promise<BlogPost> {
  const res = await blogClient.put<{ success: boolean; data: BlogPost }>(`/api/blogs/${id}`, mapBlogInput(input));
  return unwrap(res);
}

export async function deleteBlogPost(id: string): Promise<void> {
  await blogClient.delete(`/api/blogs/${id}`);
  invalidateBlogDashboardCache();
}

function mapBlogInput(input: BlogPostInput) {
  return {
    title: input.title,
    slug: input.slug,
    author: input.author,
    keywords: input.tags ?? [],
    categoryId: input.categoryId,
    metaDescription: input.metaDescription,
    content: input.content,
    featuredImageUrl: input.image,
    status: input.status ?? "draft",
  };
}

export async function uploadBlogFeaturedImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await blogClient.post<{ success: boolean; data: { url: string; featuredImageUrl: string } }>(
    "/api/blogs/upload-image",
    form,
    { headers: { "Content-Type": "multipart/form-data" }, timeout: 120_000 }
  );
  const data = unwrap(res);
  return data.featuredImageUrl || data.url;
}

export async function fetchBlogCategories(): Promise<BlogCategory[]> {
  const res = await blogClient.get<{ success: boolean; data: BlogCategory[] }>("/api/categories");
  return unwrap(res);
}

export async function createBlogCategory(input: BlogCategoryInput): Promise<string> {
  const res = await blogClient.post<{ success: boolean; data: { id: string } }>("/api/categories", {
    name: input.name,
    description: input.description ?? "",
  });
  return unwrap(res).id;
}

export async function deleteBlogCategory(id: string): Promise<void> {
  await blogClient.delete(`/api/categories/${id}`);
}

const BLOG_AI_REQUEST_TIMEOUT_MS = 600_000;

export async function generateBlogWithAI(input: {
  mode: "full" | "title";
  aiModel?: string;
  topic?: string;
  industry?: string;
  audience?: string;
  tone?: string;
  wordCount?: number;
  title?: string;
  excludePostId?: string;
  author?: string;
}): Promise<BlogAIGeneratedContent> {
  const res = await blogClient.post<{ success: boolean; data: BlogAIGeneratedContent }>("/api/blogs/generate", input, {
    timeout: BLOG_AI_REQUEST_TIMEOUT_MS,
  });
  return unwrap(res);
}

export async function optimizeBlogContentWithAI(input: {
  title: string;
  metaDescription: string;
  keywords: string[];
  contentHtml: string;
  permalink?: string;
  author?: string;
  failedChecks: BlogAIFailedCheckInput[];
  primaryKeyword?: string;
  aiModel?: string;
  excludePostId?: string;
  focus?: "content" | "ai_visibility" | "seo" | "all";
}): Promise<BlogAIOptimizedContent> {
  const res = await blogClient.post<{ success: boolean; data: BlogAIOptimizedContent }>("/api/blogs/optimize", input, {
    timeout: BLOG_AI_REQUEST_TIMEOUT_MS,
  });
  return unwrap(res);
}

export async function fetchBlogClicks(): Promise<BlogClicksData> {
  const res = await blogClient.get<{ success: boolean; data: BlogClicksData }>("/blog/clicks");
  return unwrap(res);
}

export async function fetchBlogSettings(): Promise<BlogSettings> {
  const res = await blogClient.get<{ success: boolean; data: BlogSettings }>("/blog/settings");
  return unwrap(res);
}
