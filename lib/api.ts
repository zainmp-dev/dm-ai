import axios, { type InternalAxiosRequestConfig } from "axios";
import { formatApiErrorMessage, flowSuccessMessages } from "@/lib/api-errors";
import { notifyApiRequestEnd, notifyApiRequestStart, type FlowApiLoadingKind } from "@/lib/api-loading-store";
import { clearAuthSession, getAuthToken } from "@/lib/auth";
import { normalizePrimaryRegionCode } from "@/lib/primary-region";
import type {
  ActivityItem,
  Campaign,
  Competitor,
  ContentItem,
  CrmStatus,
  EngagementPoint,
  IntegrationInfo,
  LeadItem,
  LeadsGrowthPoint,
  MediaLibraryItem,
  MediaType,
  PostingPreferences,
  PublishStatus,
  PublishingLogItem,
  PublishingPlatform,
  StrategyPlan,
  UserProfile,
  WorkspaceScenario,
  WorkspaceSnapshot,
} from "@/lib/types";

const API_PREFIX = (process.env.NEXT_PUBLIC_API_PREFIX || "/api/backend").replace(/\/+$/, "");

/** Default cap so hung proxies do not block the UI forever; AI routes override below. */
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const AUTH_REQUEST_TIMEOUT_MS = 10_000;
const OPENROUTER_BALANCE_TIMEOUT_MS = 10_000;
const AI_LONG_REQUEST_TIMEOUT_MS = 300_000;
const WORKSPACE_SEARCH_TIMEOUT_MS = 120_000;

declare module "axios" {
  interface AxiosRequestConfig {
    skipGlobalLoading?: boolean;
    __flowLoading?: FlowApiLoadingKind;
    __flowLoadingId?: string;
  }
}

const apiClient = axios.create({
  baseURL: API_PREFIX,
  withCredentials: true,
  timeout: DEFAULT_REQUEST_TIMEOUT_MS,
});

async function withAiRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!axios.isAxiosError(err)) throw err;
      const status = err.response?.status;
      const transient = status === 408 || status === 429 || (typeof status === "number" && status >= 500);
      if (!transient || i >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI request failed");
}

function requestPathKey(config: InternalAxiosRequestConfig): string {
  const raw = (config.url || "").split("?")[0];
  const piece = raw.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(piece)) {
    try {
      return new URL(piece).pathname.replace(/\/+$/, "") || "/";
    } catch {
      /* fall through */
    }
  }
  const base = (config.baseURL || "").replace(/\/+$/, "");
  const combined = [base, piece].filter(Boolean).join("/").replace(/\/{2,}/g, "/");
  return combined.replace(/\/+$/, "") || "/";
}

function extractContentAction(data: unknown): string | undefined {
  if (data == null) return undefined;
  if (typeof data === "string") {
    try {
      const obj = JSON.parse(data) as Record<string, unknown>;
      const a = obj.action;
      return typeof a === "string" ? a : undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof data === "object" && !(data instanceof FormData) && !(data instanceof URLSearchParams)) {
    const a = (data as Record<string, unknown>).action;
    return typeof a === "string" ? a : undefined;
  }
  return undefined;
}

function classifyGlobalLoading(config: InternalAxiosRequestConfig): FlowApiLoadingKind | "skip" {
  if (config.skipGlobalLoading) return "skip";
  const method = (config.method || "get").toUpperCase();
  const path = requestPathKey(config);

  /** Auth and read-only fetches: no full-screen loader (login/signup UX + routine GETs). */
  if (path.endsWith("/login") || path.endsWith("/signup")) return "skip";
  if (method === "GET") return "skip";

  if (path.endsWith("/strategy")) return "skip";
  /** Media uploads: dropzone/spinner carries progress; skip full-screen blocker for faster-feeling uploads. */
  if (path.includes("/media/upload/cloudinary") || path.includes("/media/upload/local")) return "skip";
  if (path.endsWith("/content") && method === "POST") {
    const action = extractContentAction(config.data);
    if (action === "generate" || action === "suggest" || action === "delete") return "skip";
    if (action === "bulk_delete") return "delete";
  }
  if (path.endsWith("/publish") || path.endsWith("/cron/run")) return "publish";
  if (
    path.endsWith("/analytics/analyze") ||
    path.endsWith("/workspace/search") ||
    path.endsWith("/workspace/clear-ai") ||
    path.endsWith("/workspace/research-patch")
  )
    return "ai";
  return "default";
}

function resolveProcessLabel(config: InternalAxiosRequestConfig): string {
  const method = (config.method || "get").toUpperCase();
  const path = requestPathKey(config);

  if (path.endsWith("/workspace/search")) return "Workspace search";
  if (path.endsWith("/workspace/clear-ai")) return "Clearing AI library";
  if (path.endsWith("/workspace/research-patch")) return "Updating research";
  if (path.endsWith("/strategy")) return "Generating strategy";
  if (path.endsWith("/analytics/analyze")) return "Analyzing performance";
  if (path.endsWith("/publish")) return "Publishing to channels";
  if (path.endsWith("/cron/run")) return "Running scheduled tasks";
  if (path.endsWith("/content") && method === "POST") {
    const action = extractContentAction(config.data);
    if (action === "generate") return "Generating content";
    if (action === "suggest") return "Suggesting content";
    if (action === "create") return "Creating content";
    if (action === "update") return "Updating content";
    if (action === "delete") return "Removing content";
    if (action === "bulk_delete") return "Deleting all content";
    return "Saving content";
  }
  if (path.endsWith("/approve")) return "Approving content";
  if (path.endsWith("/reject")) return "Rejecting content";
  if (path.endsWith("/schedule") && method === "POST") return "Scheduling post";
  if (path.endsWith("/schedule") && method === "GET") return "Loading schedule";
  if (path.endsWith("/workspace") && method === "GET") return "Loading workspace";
  if (path.endsWith("/workspace") && method === "POST") return "Saving workspace";
  if (path.endsWith("/workspace") && method === "DELETE") return "Removing workspace";
  if (path.endsWith("/account") && method === "DELETE") return "Deleting account";
  if (path.includes("/media/upload/cloudinary") || path.includes("/media/upload/local")) return "Uploading media";
  if (path.endsWith("/media/library/remove")) return "Removing from library";
  if (path.endsWith("/media/library/add-url")) return "Adding media";
  if (path.endsWith("/profile") && method === "POST") return "Saving profile";
  if (path.endsWith("/profile") && method === "GET") return "Loading profile";
  if (path.endsWith("/preferences")) return "Saving preferences";
  if (path.endsWith("/connect/linkedin")) return "Connecting LinkedIn";
  if (path.endsWith("/connect/meta")) return "Connecting Meta";
  if (path.endsWith("/signup")) return "Creating account";
  if (path.endsWith("/login")) return "Signing in";
  return method === "GET" ? "Loading data" : "Syncing with server";
}

function normalizeMediaTypeForApi(mediaType: MediaType | undefined): MediaType | "Image" | "Video" | "Carousel" | undefined {
  if (!mediaType) return undefined;
  // Some backend builds only allow Image/Video/Carousel.
  return mediaType === "Media" ? "Image" : mediaType;
}

/** Avoid broken <img> / <video> when API or models send `null` as a string. */
export function sanitizeMediaUrl(value: unknown): string {
  if (value == null) return "";
  let s = String(value).trim();
  if (s === "" || s === "null" || s === "undefined" || s === "None") return "";
  s = s.replace(/^[`"'«»]+|[`"'«»]+$/g, "").trim();
  if (s.startsWith("/")) {
    return s.split(/\s/)[0]?.replace(/[),.;]+$/g, "") ?? "";
  }
  if (/^https?:\/\//i.test(s) || s.startsWith("data:image/") || s.startsWith("data:video/")) {
    let out = s.split(/\s/)[0]?.replace(/[),.;]+$/g, "") ?? "";
    if (/^http:\/\/res\.cloudinary\.com\//i.test(out)) {
      out = `https://${out.slice("http://".length)}`;
    }
    return out;
  }
  const m = s.match(/(https?:\/\/[^\s"'<>]+)/i);
  return m ? m[1].replace(/[),.;]+$/g, "") : "";
}

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const kind = classifyGlobalLoading(config);
  if (kind !== "skip") {
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `flow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    config.__flowLoading = kind;
    config.__flowLoadingId = requestId;
    notifyApiRequestStart(kind, resolveProcessLabel(config), requestId);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const id = response.config.__flowLoadingId;
    if (id) notifyApiRequestEnd(id);
    return response;
  },
  (error) => {
    const id = error.config?.__flowLoadingId;
    if (id) notifyApiRequestEnd(id);
    const status = error?.response?.status as number | undefined;
    if (status === 401 && typeof window !== "undefined") {
      const path = error.config ? requestPathKey(error.config) : "";
      const isCredentialAttempt = path.endsWith("/login") || path.endsWith("/signup");
      if (!isCredentialAttempt) {
        clearAuthSession();
        if (window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
      }
    }
    return Promise.reject(error);
  },
);

/** User-visible message for axios / FastAPI errors (see `lib/api-errors.ts`). */
export function apiErrorMessage(error: unknown): string {
  return formatApiErrorMessage(error);
}

export { flowSuccessMessages };

export type OpenrouterBalance = {
  configured: boolean;
  message?: string;
  error?: string;
  label?: string;
  limit?: number | null;
  limit_remaining?: number | null;
  usage?: number;
  usage_daily?: number;
  usage_weekly?: number;
  usage_monthly?: number;
  is_free_tier?: boolean;
};

/** OpenRouter GET /v1/key via backend — credits for the server API key (shared by all models). */
export async function apiGetOpenrouterBalance(): Promise<OpenrouterBalance> {
  const { data } = await apiClient.get<OpenrouterBalance>("/openrouter/balance", {
    skipGlobalLoading: true,
    timeout: OPENROUTER_BALANCE_TIMEOUT_MS,
  });
  return data;
}

export async function apiGetWorkspace(): Promise<WorkspaceSnapshot> {
  const { data } = await apiClient.get<Record<string, unknown>>("/workspace", { skipGlobalLoading: true });
  const raw = data;
  return normalizeWorkspace(raw);
}

export async function apiWorkspaceSearch(body: { query: string; aiModel?: string }) {
  const { data } = await withAiRetry(() =>
    apiClient.post<{
      answer: string;
      ai_model_used?: string;
      ai_model_requested?: string | null;
    }>(
      "/workspace/search",
      {
        query: body.query,
        ai_model: body.aiModel,
      },
      { timeout: WORKSPACE_SEARCH_TIMEOUT_MS },
    ),
  );
  return {
    answer: data.answer,
    aiModelUsed: data.ai_model_used,
    aiModelRequested: data.ai_model_requested,
  };
}

type AuthApiUser = { name: string; email: string; role?: "admin" | "user" };

export async function apiSignup(body: { name: string; email: string; password: string }) {
  const { data } = await apiClient.post<{ token: string; user: AuthApiUser }>("/signup", body, {
    skipGlobalLoading: true,
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export async function apiLogin(body: { email: string; password: string }) {
  const { data } = await apiClient.post<{ token: string; user: AuthApiUser }>("/login", body, {
    skipGlobalLoading: true,
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export interface AdminOverview {
  total_users: number;
  admin_count: number;
  workspace_rows: number;
  configured_workspaces: number;
  oauth_users: number;
  password_only_users: number;
  total_content_items: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  auth_provider: string | null;
  created_at: string | null;
  has_workspace: boolean;
  company_name: string | null;
  company_website: string | null;
  workspace_scenario: string | null;
  primary_region: string | null;
  workspace_configured: boolean | null;
  workspace_updated_at: string | null;
  content_count: number;
  competitor_count: number;
}

export interface AdminUsersPageResponse {
  items: AdminUserRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminWorkspaceRow {
  workspace_id: string;
  owner_name: string;
  owner_email: string;
  company_name: string;
  company_website: string;
  workspace_scenario: string;
  primary_region: string;
  workspace_configured: boolean;
  updated_at: string | null;
  content_count: number;
  competitor_count: number;
}

export interface AdminWorkspacesPageResponse {
  items: AdminWorkspaceRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminIntegrationRow {
  workspace_id: string;
  owner_name: string;
  owner_email: string;
  platform: string;
  connected: boolean;
  account_name: string | null;
  account_handle: string | null;
  updated_at: string | null;
}

export interface AdminIntegrationsPageResponse {
  items: AdminIntegrationRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminContentStatusCount {
  status: string;
  count: number;
}

export interface AdminContentSummaryResponse {
  total: number;
  by_status: AdminContentStatusCount[];
}

export type AdminUsersSetupFilter = "all" | "configured" | "in_progress" | "no_workspace";
export type AdminRoleFilter = "all" | "admin" | "user";
export type AdminAuthFilter = "all" | "email" | "google" | "facebook";

export async function apiAdminOverview(): Promise<AdminOverview> {
  const { data } = await apiClient.get<AdminOverview>("/admin/overview", {
    skipGlobalLoading: true,
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export async function apiAdminUsers(params: {
  page?: number;
  page_size?: number;
  q?: string;
  setup?: AdminUsersSetupFilter;
  role?: AdminRoleFilter;
  auth?: AdminAuthFilter;
}): Promise<AdminUsersPageResponse> {
  const { data } = await apiClient.get<AdminUsersPageResponse>("/admin/users", {
    params: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 25,
      q: params.q ?? "",
      setup: params.setup ?? "all",
      role: params.role ?? "all",
      auth: params.auth ?? "all",
    },
    skipGlobalLoading: true,
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export async function apiAdminWorkspaces(params: {
  page?: number;
  page_size?: number;
  q?: string;
  configured?: "all" | "yes" | "no";
}): Promise<AdminWorkspacesPageResponse> {
  const { data } = await apiClient.get<AdminWorkspacesPageResponse>("/admin/workspaces", {
    params: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 25,
      q: params.q ?? "",
      configured: params.configured ?? "all",
    },
    skipGlobalLoading: true,
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export async function apiAdminIntegrations(params: {
  page?: number;
  page_size?: number;
  q?: string;
  connected?: "all" | "yes" | "no";
  platform?: string;
}): Promise<AdminIntegrationsPageResponse> {
  const { data } = await apiClient.get<AdminIntegrationsPageResponse>("/admin/integrations", {
    params: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 25,
      q: params.q ?? "",
      connected: params.connected ?? "all",
      platform: params.platform ?? "all",
    },
    skipGlobalLoading: true,
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export async function apiAdminContentSummary(): Promise<AdminContentSummaryResponse> {
  const { data } = await apiClient.get<AdminContentSummaryResponse>("/admin/content/summary", {
    skipGlobalLoading: true,
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export async function apiStartOAuth(body: {
  provider: "google" | "facebook";
  intent?: "login" | "signup";
  appOrigin?: string;
}) {
  const { data } = await apiClient.post<{ auth_url: string }>(
    "/auth/oauth/start",
    {
      provider: body.provider,
      intent: body.intent || "login",
      app_origin: body.appOrigin,
    },
    { skipGlobalLoading: true, timeout: AUTH_REQUEST_TIMEOUT_MS },
  );
  return data;
}

export async function apiCompleteOAuth(body: { code: string; state: string }) {
  const { data } = await apiClient.get<{ token: string; user: { name: string; email: string } }>("/auth/oauth/callback", {
    params: { code: body.code, state: body.state },
    skipGlobalLoading: true,
  });
  return data;
}

export async function apiPostStrategy(
  companyName: string,
  website: string,
  aiModel?: string,
  competitors?: { name: string; website: string; focus: string }[],
  scenario?: WorkspaceScenario,
) {
  const { data } = await apiClient.post<{
    strategy: Record<string, unknown>;
    competitors: Record<string, unknown>[];
    ai_model_used?: string | null;
    ai_model_requested?: string | null;
    ai_models_by_step?: { strategy?: string; content?: string };
    used_free_model?: boolean;
  }>(
    "/strategy",
    {
      company_name: companyName,
      website,
      ai_model: aiModel,
      competitors,
      scenario,
    },
    { timeout: AI_LONG_REQUEST_TIMEOUT_MS },
  );
  return data;
}

export type MasterContentSuggestion = {
  title: string;
  content_text: string;
  media_type: string;
  media_preview: string;
  /** When set, the channel the AI targeted for hashtags and tone (linkedin | instagram | facebook). */
  suggested_platform?: string;
};

type PostContentResponse = {
  content: Record<string, unknown>[];
  created_content_id?: string;
  suggestion?: MasterContentSuggestion;
  /** Present for action "suggest" when a model completed (may differ from requested after fallback). */
  ai_model_used?: string;
  ai_model_requested?: string | null;
  /** True when the system fell back to a free OpenRouter model (paid model ran out of credits). */
  used_free_model?: boolean;
};

// Each /content?action=generate run takes 30-180s on free models. Without dedupe, React Strict
// Mode (dev), retry-on-mount, or accidental double-clicks fire concurrent flows that double the
// load and trip OpenRouter free-model rate limits. Share one in-flight promise per workspace.
let generateContentInflight: Promise<PostContentResponse> | null = null;

export async function apiPostContent(body: {
  action: "generate" | "update" | "create" | "suggest" | "delete" | "bulk_delete";
  contentId?: string;
  contentIds?: string[];
  title?: string;
  contentText?: string;
  calendarDays?: number;
  mediaType?: MediaType;
  mediaPreview?: string;
  scheduledAt?: string | null;
  autoActivate?: boolean;
  /** When auto-activating, pin the channel (linkedin | instagram | facebook). */
  selectedPlatform?: PublishingPlatform;
  aiModel?: string;
  suggestHint?: string;
}) {
  if (body.action === "generate" && generateContentInflight) {
    return generateContentInflight;
  }
  const payload: Record<string, unknown> = {
    action: body.action,
    content_id: body.contentId,
    content_ids: body.contentIds,
    title: body.title,
    content_text: body.contentText,
    calendar_days: body.calendarDays,
    media_type: normalizeMediaTypeForApi(body.mediaType),
    media_preview: body.mediaPreview,
    auto_activate: body.autoActivate,
    ai_model: body.aiModel,
    suggest_hint: body.suggestHint,
  };
  if (body.selectedPlatform) {
    payload.selected_platform = body.selectedPlatform;
  }
  if (body.action === "update") {
    if (body.scheduledAt !== undefined) {
      payload.scheduled_at = body.scheduledAt;
    }
  } else if (body.scheduledAt != null && body.scheduledAt !== "") {
    payload.scheduled_at = body.scheduledAt;
  }
  const longRunning = body.action === "generate" || body.action === "suggest";
  const request = apiClient
    .post<PostContentResponse>("/content", payload, {
      timeout: longRunning ? AI_LONG_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS,
    })
    .then((res) => res.data);

  if (body.action === "generate") {
    generateContentInflight = request.finally(() => {
      generateContentInflight = null;
    });
    return generateContentInflight;
  }
  return request;
}

export async function apiApprove(contentId: string, platforms: PublishingPlatform[]) {
  const uniquePlatforms = Array.from(new Set(platforms));
  const { data } = await apiClient.post<{
    content: Record<string, unknown>[];
    /** One id per selected platform (original + clones when multi-platform). */
    approved_content_ids?: string[];
  }>("/approve", {
    content_id: contentId,
    platform: uniquePlatforms[0],
    platforms: uniquePlatforms,
  });
  return data;
}

export async function apiReject(contentId: string) {
  const { data } = await apiClient.post<{ content: Record<string, unknown>[] }>("/reject", { content_id: contentId });
  return data;
}

export async function apiSchedule(contentId: string, scheduledAt: string) {
  const { data } = await apiClient.post<{ content: Record<string, unknown>[] }>("/schedule", { content_id: contentId, scheduled_at: scheduledAt });
  return data;
}

export async function apiGetSchedule() {
  const { data } = await apiClient.get<{ scheduled: Record<string, unknown>[] }>("/schedule");
  return data;
}

export async function apiPublish(contentIds: string[]) {
  const { data } = await apiClient.post<{
    content: Record<string, unknown>[];
    leads: Record<string, unknown>[];
    publishing_log: Record<string, unknown>[];
    published_count: number;
    warnings: string[];
  }>("/publish", { content_ids: contentIds });
  return data;
}

export async function apiUploadMediaToCloudinary(body: { dataUrl: string; fileName?: string; mediaType?: MediaType }) {
  const { data } = await apiClient.post<{ media_url: string; media_type: MediaType; folder: string }>("/media/upload/cloudinary", {
    data_url: body.dataUrl,
    file_name: body.fileName,
    media_type: normalizeMediaTypeForApi(body.mediaType),
  });
  return {
    mediaUrl: data.media_url,
    mediaType: data.media_type,
    folder: data.folder,
  };
}

/** Upload to server local disk; returned URLs are /api/backend/media-assets/... (proxied to FastAPI). */
export async function apiUploadMediaLocal(body: { dataUrl: string; fileName?: string; mediaType?: MediaType }) {
  const { data } = await apiClient.post<{ media_url: string; media_type: MediaType; storage: string }>("/media/upload/local", {
    data_url: body.dataUrl,
    file_name: body.fileName,
    media_type: normalizeMediaTypeForApi(body.mediaType),
  });
  return {
    mediaUrl: data.media_url,
    mediaType: data.media_type,
    storage: data.storage,
  };
}

export async function apiRemoveMediaLibraryItem(assetId: string) {
  const { data } = await apiClient.post<{ removed: number }>("/media/library/remove", {
    asset_id: assetId,
  });
  return data;
}

/** Link an existing Cloudinary HTTPS URL (or /api/backend/media-assets/…) into the library without re-uploading. */
export async function apiAddMediaLibraryByUrl(body: { mediaUrl: string; name?: string; mediaType?: MediaType }) {
  const { data } = await apiClient.post<{
    id: string;
    media_url: string;
    media_type: MediaType;
    name: string;
    duplicate?: boolean;
  }>("/media/library/add-url", {
    media_url: body.mediaUrl.trim(),
    name: body.name,
    media_type: normalizeMediaTypeForApi(body.mediaType),
  });
  return {
    id: data.id,
    mediaUrl: data.media_url,
    mediaType: data.media_type,
    name: data.name,
    duplicate: Boolean(data.duplicate),
  };
}

export async function apiRunCronCycle() {
  const { data } = await apiClient.post<{
    published_count: number;
    warnings: string[];
  }>("/cron/run");
  return data;
}

export async function apiAnalyzeContent(body: { content: string; likes: number; comments: number; reach: number; aiModel?: string }) {
  const { data } = await withAiRetry(() =>
    apiClient.post<{
      performance_summary: string;
      what_worked: string[];
      what_failed: string[];
      improvements: string[];
    }>("/analytics/analyze", {
      content: body.content,
      likes: body.likes,
      comments: body.comments,
      reach: body.reach,
      ai_model: body.aiModel,
    }),
  );
  return data;
}

export async function apiGenerateCarousel(body: { topic: string; brandContext?: string; aiModel?: string }) {
  const { data } = await withAiRetry(() =>
    apiClient.post<{ title: string; slides: { heading: string; description: string; imagePrompt: string }[]; _ai_model_used?: string }>(
      "/ai/carousel",
      {
        topic: body.topic,
        brand_context: body.brandContext,
        ai_model: body.aiModel,
      },
    ),
  );
  return data;
}

export async function apiGenerateImagePrompt(body: { brief: string; style?: string; platform?: string; aiModel?: string }) {
  const { data } = await withAiRetry(() =>
    apiClient.post<{ image_prompt: string; _ai_model_used?: string }>("/ai/image-prompt", {
      brief: body.brief,
      style: body.style,
      platform: body.platform,
      ai_model: body.aiModel,
    }),
  );
  return data;
}

export async function apiConnectLinkedin() {
  const { data } = await apiClient.post<{ integrations: Record<string, Record<string, unknown>>; auth_url?: string }>("/connect/linkedin");
  return data;
}

export async function apiConnectMeta() {
  const { data } = await apiClient.post<{ integrations: Record<string, Record<string, unknown>>; auth_url?: string }>("/connect/meta");
  return data;
}

export async function apiUpdateProfile(patch: Partial<UserProfile>) {
  const { data } = await apiClient.post<{ profile: Record<string, unknown> }>("/profile", {
      name: patch.name,
      email: patch.email,
      company: patch.company,
      timezone: patch.timezone,
  });
  return data;
}

export async function apiGetProfile() {
  const { data } = await apiClient.get<{ profile: Record<string, unknown> }>("/profile");
  return data;
}

export async function apiUpdatePreferences(patch: Partial<PostingPreferences>) {
  const { data } = await apiClient.post<{ preferences: Record<string, unknown> }>("/preferences", {
      default_platform: patch.defaultPlatform,
      quiet_hours_enabled: patch.quietHoursEnabled,
      approval_digest: patch.approvalDigest,
  });
  return data;
}

export async function apiSetupWorkspace(
  body: {
    companyName: string;
    website: string;
    scenario: WorkspaceScenario;
    primaryRegion?: string;
    workspaceOwnerName: string;
    workspaceOwnerEmail: string;
    aiModel?: string;
    competitors?: { name: string; website: string; focus: string }[];
  },
  requestOptions?: { skipGlobalLoading?: boolean },
) {
  const { data } = await apiClient.post<Record<string, unknown>>(
    "/workspace",
    {
      company_name: body.companyName,
      website: body.website,
      scenario: body.scenario,
      primary_region: normalizePrimaryRegionCode(body.primaryRegion),
      workspace_owner_name: body.workspaceOwnerName,
      workspace_owner_email: body.workspaceOwnerEmail,
      ai_model: body.aiModel,
      competitors: body.competitors,
    },
    requestOptions?.skipGlobalLoading ? { skipGlobalLoading: true } : undefined,
  );
  const raw = data;
  return normalizeWorkspace(raw);
}

export async function apiDeleteWorkspace(): Promise<WorkspaceSnapshot> {
  const { data } = await apiClient.delete<Record<string, unknown>>("/workspace");
  return normalizeWorkspace(data);
}

/** Permanently delete the current user and all data (DELETE /account). */
export async function apiDeleteAccount(): Promise<void> {
  await apiClient.delete("/account");
}

export async function apiPostClearAiOutputs(): Promise<WorkspaceSnapshot> {
  const { data } = await apiClient.post<Record<string, unknown>>("/workspace/clear-ai", {});
  return normalizeWorkspace(data);
}

export async function apiPatchWorkspaceResearch(patch: {
  deleteCompetitorIds?: string[];
  removeMarketGaps?: string[];
}): Promise<WorkspaceSnapshot> {
  const { data } = await apiClient.post<Record<string, unknown>>("/workspace/research-patch", {
    delete_competitor_ids: patch.deleteCompetitorIds ?? [],
    remove_market_gaps: patch.removeMarketGaps ?? [],
  });
  return normalizeWorkspace(data);
}

function normalizeWorkspace(raw: Record<string, unknown>): WorkspaceSnapshot {
  const stratRaw =
    raw.strategy && typeof raw.strategy === "object" ? (raw.strategy as Record<string, unknown>) : null;
  let strategyUpdatedAt: string | undefined;
  let strategyVersion: number | undefined;
  if (stratRaw) {
    const u = stratRaw.updated_at;
    if (u != null && String(u).trim()) strategyUpdatedAt = String(u);
    const sv = stratRaw.strategy_version;
    if (sv != null && String(sv).trim() !== "") {
      const n = Number(sv);
      if (!Number.isNaN(n)) strategyVersion = n;
    }
  }

  return {
    companyName: String(raw.company_name ?? ""),
    companyWebsite: String(raw.company_website ?? ""),
    workspaceScenario: (raw.workspace_scenario as WorkspaceScenario) ?? "b2b-saas",
    primaryRegion: normalizePrimaryRegionCode(
      typeof raw.primary_region === "string" && raw.primary_region ? String(raw.primary_region) : undefined,
    ),
    workspaceConfigured: Boolean(raw.workspace_configured),
    cloudinaryUploadsReady: Boolean(raw.cloudinary_uploads_ready),
    strategy: raw.strategy ? normalizeStrategy(raw.strategy as Record<string, unknown>) : null,
    strategyUpdatedAt,
    strategyVersion,
    competitors: Array.isArray(raw.competitors) ? raw.competitors.map((c) => normalizeCompetitor(c as Record<string, unknown>)) : [],
    content: Array.isArray(raw.content) ? raw.content.map((c) => normalizeContent(c as Record<string, unknown>)) : [],
    leads: Array.isArray(raw.leads) ? raw.leads.map((l) => normalizeLead(l as Record<string, unknown>)) : [],
    activities: Array.isArray(raw.activities) ? raw.activities.map((a) => normalizeActivity(a as Record<string, unknown>)) : [],
    publishingLog: Array.isArray(raw.publishing_log)
      ? raw.publishing_log.map((p) => normalizePublishing(p as Record<string, unknown>))
      : [],
    mediaLibrary: Array.isArray(raw.media_library)
      ? raw.media_library.map((m) => normalizeMediaLibraryItem(m as Record<string, unknown>))
      : [],
    integrations: {
      linkedin: normalizeIntegration((raw.integrations as Record<string, unknown>)?.linkedin as Record<string, unknown>),
      meta: normalizeIntegration((raw.integrations as Record<string, unknown>)?.meta as Record<string, unknown>),
    },
    profile: normalizeProfile(raw.profile as Record<string, unknown>),
    preferences: normalizePreferences(raw.preferences as Record<string, unknown>),
    crmLastBulkStatus: raw.crm_last_bulk_status === "Synced" ? "Synced" : "Pending",
    campaigns: Array.isArray(raw.campaigns) ? raw.campaigns.map((c) => normalizeCampaign(c as Record<string, unknown>)) : [],
    engagementSeries: Array.isArray(raw.engagement_series)
      ? raw.engagement_series.map((e) => normalizeEngagement(e as Record<string, unknown>))
      : [],
    leadsGrowth: Array.isArray(raw.leads_growth) ? raw.leads_growth.map((g) => normalizeLeadsGrowth(g as Record<string, unknown>)) : [],
  };
}

export function normalizeStrategy(raw: Record<string, unknown>): StrategyPlan {
  return {
    targetAudience: String(raw.target_audience ?? ""),
    contentThemes: Array.isArray(raw.content_themes) ? (raw.content_themes as string[]) : [],
    platformFocus: Array.isArray(raw.platform_focus) ? (raw.platform_focus as string[]) : [],
    marketGaps: Array.isArray(raw.market_gaps) ? (raw.market_gaps as string[]) : [],
  };
}

export function normalizeCompetitor(raw: Record<string, unknown>): Competitor {
  return {
    id: String(raw.id ?? ""),
    domain: String(raw.domain ?? ""),
    name: String(raw.name ?? ""),
    positioning: String(raw.positioning ?? ""),
    marketRank: String(raw.market_rank ?? ""),
    marketGap: String(raw.market_gap ?? ""),
    marketingPurpose: String(raw.marketing_purpose ?? ""),
    strengths: Array.isArray(raw.strengths) ? (raw.strengths as string[]) : [],
    weaknesses: Array.isArray(raw.weaknesses) ? (raw.weaknesses as string[]) : [],
  };
}

export function normalizeContent(raw: Record<string, unknown>): ContentItem {
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? ""),
    contentText: String(raw.content_text ?? ""),
    mediaType: (raw.media_type as ContentItem["mediaType"]) ?? "Image",
    mediaPreview: sanitizeMediaUrl(raw.media_preview),
    status: (raw.status as ContentItem["status"]) ?? "PENDING",
    selectedPlatform:
      raw.selected_platform != null && raw.selected_platform !== ""
        ? (raw.selected_platform as PublishingPlatform)
        : null,
    scheduledAt: raw.scheduled_at ? String(raw.scheduled_at) : null,
    createdAt: raw.created_at != null && raw.created_at !== "" ? String(raw.created_at) : undefined,
    updatedAt: raw.updated_at != null && raw.updated_at !== "" ? String(raw.updated_at) : undefined,
  };
}

export function normalizeLead(raw: Record<string, unknown>): LeadItem {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    source: String(raw.source ?? ""),
    status: (raw.status as LeadItem["status"]) ?? "New",
    crmStatus: (raw.crm_status as CrmStatus) ?? "Pending",
    capturedAt: String(raw.captured_at ?? ""),
  };
}

export function normalizeActivity(raw: Record<string, unknown>): ActivityItem {
  return {
    id: String(raw.id ?? ""),
    text: String(raw.text ?? ""),
    createdAt: String(raw.created_at ?? ""),
  };
}

export function normalizePublishing(raw: Record<string, unknown>): PublishingLogItem {
  const pu = raw.post_url;
  return {
    id: String(raw.id ?? ""),
    contentId: String(raw.content_id ?? ""),
    platform: String(raw.platform ?? ""),
    timestamp: String(raw.timestamp ?? ""),
    status: (raw.status as PublishStatus) ?? "Success",
    postUrl: typeof pu === "string" && pu.trim() ? pu.trim() : null,
  };
}

export function normalizeMediaLibraryItem(raw: Record<string, unknown>): MediaLibraryItem {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    mediaType: (raw.media_type as MediaLibraryItem["mediaType"]) ?? "Image",
    mediaUrl: sanitizeMediaUrl(raw.media_url),
    createdAt: String(raw.created_at ?? ""),
  };
}


export function normalizeIntegration(raw: Record<string, unknown> | undefined): IntegrationInfo {
  if (!raw) {
    return { connected: false, accountName: null, accountHandle: null, accountUrl: null };
  }
  const au = raw.account_url;
  return {
    connected: Boolean(raw.connected),
    accountName: raw.account_name ? String(raw.account_name) : null,
    accountHandle: raw.account_handle ? String(raw.account_handle) : null,
    accountUrl: typeof au === "string" && au.trim() ? au.trim() : null,
  };
}

export function normalizeProfile(raw: Record<string, unknown> | undefined): UserProfile {
  if (!raw) {
    return { name: "", email: "", company: "", timezone: "" };
  }
  return {
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    company: String(raw.company ?? ""),
    timezone: String(raw.timezone ?? ""),
  };
}

export function normalizePreferences(raw: Record<string, unknown> | undefined): PostingPreferences {
  if (!raw) {
    return { defaultPlatform: "linkedin", quietHoursEnabled: true, approvalDigest: "daily" };
  }
  return {
    defaultPlatform: (raw.default_platform as PublishingPlatform) ?? "linkedin",
    quietHoursEnabled: Boolean(raw.quiet_hours_enabled),
    approvalDigest: raw.approval_digest === "instant" ? "instant" : "daily",
  };
}

export function normalizeCampaign(raw: Record<string, unknown>): Campaign {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    budget: Number(raw.budget ?? 0),
    status: (raw.status as Campaign["status"]) ?? "Draft",
  };
}

export function normalizeEngagement(raw: Record<string, unknown>): EngagementPoint {
  return {
    name: String(raw.name ?? ""),
    engagement: Number(raw.engagement ?? 0),
    reach: Number(raw.reach ?? 0),
  };
}

export function normalizeLeadsGrowth(raw: Record<string, unknown>): LeadsGrowthPoint {
  return {
    name: String(raw.name ?? ""),
    leads: Number(raw.leads ?? 0),
  };
}

export type NativeSocialPostTarget = { platform: string; status: string; post_url?: string | null };

export type NativeSocialPostSummary = {
  id: string;
  content: string;
  status: string;
  scheduled_at: string | null;
  created_at: string | null;
  targets: NativeSocialPostTarget[];
};

/** Native `posts` rows (FastAPI social module), not flowpilot content library items. */
export async function apiListNativeSocialPosts(params?: { limit?: number }) {
  const { data } = await apiClient.get<{ posts: NativeSocialPostSummary[] }>("/posts", {
    params: { limit: params?.limit ?? 50 },
    skipGlobalLoading: true,
  } as InternalAxiosRequestConfig);
  return data.posts;
}

export async function apiGetNativePostBoostLinks(postId: string) {
  const { data } = await apiClient.get<{ links: { platform: string; url: string }[] }>(
    `/posts/${encodeURIComponent(postId)}/boost-link`,
    { skipGlobalLoading: true } as InternalAxiosRequestConfig,
  );
  return data.links;
}

/** Optional Meta Marketing API: creates paused campaign/ad (requires ads permissions on token). */
export async function apiRequestMetaAdsBoost(body: { postId: string; budget: number }) {
  const { data } = await apiClient.post<{
    ok: boolean;
    row_id: string;
    campaign_id: string;
    ad_id: string;
  }>("/ads/boost", { post_id: body.postId, budget: body.budget });
  return data;
}
