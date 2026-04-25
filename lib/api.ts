import axios from "axios";
import { clearAuthSession, getAuthToken } from "@/lib/auth";
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

const API_PREFIX = "/api/backend";

const apiClient = axios.create({
  baseURL: API_PREFIX,
});

function normalizeMediaTypeForApi(mediaType: MediaType | undefined): MediaType | "Image" | "Video" | "Carousel" | undefined {
  if (!mediaType) return undefined;
  // Some backend builds only allow Image/Video/Carousel.
  return mediaType === "Media" ? "Image" : mediaType;
}

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status as number | undefined;
    if (status === 401 && typeof window !== "undefined") {
      clearAuthSession();
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
    return Promise.reject(error);
  },
);

export async function apiGetWorkspace(): Promise<WorkspaceSnapshot> {
  const { data } = await apiClient.get<Record<string, unknown>>("/workspace");
  const raw = data;
  return normalizeWorkspace(raw);
}

export async function apiSignup(body: { name: string; email: string; password: string }) {
  const { data } = await apiClient.post<{ token: string; user: { name: string; email: string } }>("/signup", body);
  return data;
}

export async function apiLogin(body: { email: string; password: string }) {
  const { data } = await apiClient.post<{ token: string; user: { name: string; email: string } }>("/login", body);
  return data;
}

export async function apiPostStrategy(companyName: string, website: string) {
  const { data } = await apiClient.post<{ strategy: Record<string, unknown>; competitors: Record<string, unknown>[] }>("/strategy", {
    company_name: companyName,
    website,
  });
  return data;
}

export async function apiPostContent(body: {
  action: "generate" | "update" | "create";
  contentId?: string;
  title?: string;
  contentText?: string;
  calendarDays?: number;
  mediaType?: MediaType;
  mediaPreview?: string;
  scheduledAt?: string;
  autoActivate?: boolean;
}) {
  const { data } = await apiClient.post<{ content: Record<string, unknown>[] }>("/content", {
      action: body.action,
      content_id: body.contentId,
      title: body.title,
      content_text: body.contentText,
      calendar_days: body.calendarDays,
      media_type: normalizeMediaTypeForApi(body.mediaType),
      media_preview: body.mediaPreview,
      scheduled_at: body.scheduledAt,
      auto_activate: body.autoActivate,
  });
  return data;
}

export async function apiApprove(contentId: string, platforms: PublishingPlatform[]) {
  const uniquePlatforms = Array.from(new Set(platforms));
  const { data } = await apiClient.post<{ content: Record<string, unknown>[] }>("/approve", {
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

export async function apiRemoveMediaLibraryItem(assetId: string) {
  const { data } = await apiClient.post<{ removed: number }>("/media/library/remove", {
    asset_id: assetId,
  });
  return data;
}

export async function apiRunCronCycle() {
  const { data } = await apiClient.post<{
    published_count: number;
    warnings: string[];
  }>("/cron/run");
  return data;
}

export async function apiConnectLinkedin() {
  const { data } = await apiClient.post<{ integrations: Record<string, Record<string, unknown>> }>("/connect/linkedin");
  return data;
}

export async function apiConnectMeta() {
  const { data } = await apiClient.post<{ integrations: Record<string, Record<string, unknown>> }>("/connect/meta");
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

export async function apiSetupWorkspace(body: {
  companyName: string;
  website: string;
  scenario: WorkspaceScenario;
  workspaceOwnerName: string;
  workspaceOwnerEmail: string;
}) {
  const { data } = await apiClient.post<Record<string, unknown>>("/workspace", {
      company_name: body.companyName,
      website: body.website,
      scenario: body.scenario,
      workspace_owner_name: body.workspaceOwnerName,
      workspace_owner_email: body.workspaceOwnerEmail,
  });
  const raw = data;
  return normalizeWorkspace(raw);
}

function normalizeWorkspace(raw: Record<string, unknown>): WorkspaceSnapshot {
  return {
    companyName: String(raw.company_name ?? ""),
    companyWebsite: String(raw.company_website ?? ""),
    workspaceScenario: (raw.workspace_scenario as WorkspaceScenario) ?? "b2b-saas",
    workspaceConfigured: Boolean(raw.workspace_configured),
    strategy: raw.strategy ? normalizeStrategy(raw.strategy as Record<string, unknown>) : null,
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
    name: String(raw.name ?? ""),
    positioning: String(raw.positioning ?? ""),
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
    mediaPreview: String(raw.media_preview ?? ""),
    status: (raw.status as ContentItem["status"]) ?? "PENDING",
    selectedPlatform:
      raw.selected_platform != null && raw.selected_platform !== ""
        ? (raw.selected_platform as PublishingPlatform)
        : null,
    scheduledAt: raw.scheduled_at ? String(raw.scheduled_at) : null,
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
  return {
    id: String(raw.id ?? ""),
    contentId: String(raw.content_id ?? ""),
    platform: String(raw.platform ?? ""),
    timestamp: String(raw.timestamp ?? ""),
    status: (raw.status as PublishStatus) ?? "Success",
  };
}

export function normalizeMediaLibraryItem(raw: Record<string, unknown>): MediaLibraryItem {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    mediaType: (raw.media_type as MediaLibraryItem["mediaType"]) ?? "Image",
    mediaUrl: String(raw.media_url ?? ""),
    createdAt: String(raw.created_at ?? ""),
  };
}


export function normalizeIntegration(raw: Record<string, unknown> | undefined): IntegrationInfo {
  if (!raw) {
    return { connected: false, accountName: null, accountHandle: null };
  }
  return {
    connected: Boolean(raw.connected),
    accountName: raw.account_name ? String(raw.account_name) : null,
    accountHandle: raw.account_handle ? String(raw.account_handle) : null,
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
