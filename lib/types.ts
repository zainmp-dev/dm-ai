export type ContentStatus = "PENDING" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "REJECTED";
export type PublishingPlatform = "linkedin" | "instagram" | "facebook" | "twitter";
export type WorkspaceScenario = string;
export type MediaType = "Image" | "Video" | "Carousel" | "Media";
export type PublishStatus = "Success" | "Failed";
export type LeadStatus = "New" | "Contacted" | "Qualified";
export type CrmStatus = "Pending" | "Synced";

export interface Competitor {
  id: string;
  /** Primary site host or URL root from research */
  domain: string;
  name: string;
  positioning: string;
  /** Qualitative tier (e.g. category leader, challenger) */
  marketRank: string;
  /** Exploitable gap vs this competitor */
  marketGap: string;
  /** Their apparent GTM / communications objective */
  marketingPurpose: string;
  strengths: string[];
  weaknesses: string[];
}

export interface StrategyPlan {
  targetAudience: string;
  contentThemes: string[];
  platformFocus: string[];
  marketGaps: string[];
}

export interface ContentItem {
  id: string;
  title: string;
  contentText: string;
  mediaType: MediaType;
  mediaPreview: string;
  status: ContentStatus;
  selectedPlatform: PublishingPlatform | null;
  scheduledAt: string | null;
  /** ISO timestamp from workspace content row (optional on older snapshots). */
  createdAt?: string;
  updatedAt?: string;
}

export interface Campaign {
  id: string;
  name: string;
  budget: number;
  status: "Draft" | "Active" | "Paused";
}

export type CampaignGoal = "Awareness" | "Engagement" | "LeadGen" | "Conversion";

export interface ContentCampaign {
  id: string;
  name: string;
  description: string;
  goal: CampaignGoal;
  platforms: PublishingPlatform[];
  budget: number;
  status: "Draft" | "Active" | "Paused" | "Completed";
  startDate: string | null;
  endDate: string | null;
  contentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityItem {
  id: string;
  text: string;
  createdAt: string;
}

export interface PublishingLogItem {
  id: string;
  contentId: string;
  platform: PublishingPlatform | string;
  timestamp: string;
  status: PublishStatus;
  /** Permalink to the live post on the network, when the publisher returned one */
  postUrl?: string | null;
}

export interface MediaLibraryItem {
  id: string;
  name: string;
  mediaType: MediaType;
  mediaUrl: string;
  createdAt: string;
}

export interface LeadItem {
  id: string;
  name: string;
  email: string;
  source: string;
  status: LeadStatus;
  crmStatus: CrmStatus;
  capturedAt: string;
}

export interface IntegrationInfo {
  connected: boolean;
  accountName: string | null;
  accountHandle: string | null;
  /** Public profile or Page URL (opens on the social network) */
  accountUrl?: string | null;
}

export interface UserProfile {
  name: string;
  email: string;
  company: string;
  timezone: string;
}

export interface PostingPreferences {
  defaultPlatform: PublishingPlatform;
  quietHoursEnabled: boolean;
  approvalDigest: "instant" | "daily";
}

export interface EngagementPoint {
  name: string;
  engagement: number;
  reach: number;
}

export interface LeadsGrowthPoint {
  name: string;
  leads: number;
}

export interface WorkspaceSnapshot {
  companyName: string;
  companyWebsite: string;
  workspaceScenario: WorkspaceScenario;
  /** AI region focus: uae-gcc | india | uae-india (legacy global is normalized to uae-india) */
  primaryRegion: string;
  workspaceConfigured: boolean;
  /** Backend has CLOUDINARY_* env set; Media setup can upload to Cloudinary instead of local disk. */
  cloudinaryUploadsReady: boolean;
  strategy: StrategyPlan | null;
  /** Last Agent 1 save time (flowpilot_strategy.updated_at), ISO string. */
  strategyUpdatedAt?: string;
  /** Monotonic version counter incremented on each full Agent 1 persistence. */
  strategyVersion?: number;
  competitors: Competitor[];
  content: ContentItem[];
  leads: LeadItem[];
  activities: ActivityItem[];
  publishingLog: PublishingLogItem[];
  mediaLibrary: MediaLibraryItem[];
  integrations: {
    linkedin: IntegrationInfo;
    meta: IntegrationInfo;
  };
  profile: UserProfile;
  preferences: PostingPreferences;
  crmLastBulkStatus: "Synced" | "Pending";
  campaigns: Campaign[];
  engagementSeries: EngagementPoint[];
  leadsGrowth: LeadsGrowthPoint[];
}

export interface ScheduledRow {
  contentId: string;
  title: string;
  scheduledAt: string;
  platform: PublishingPlatform | null;
  status: ContentStatus;
}
