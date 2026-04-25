export type ContentStatus = "PENDING" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "REJECTED";
export type PublishingPlatform = "linkedin" | "instagram" | "facebook" | "twitter";
export type WorkspaceScenario = string;
export type MediaType = "Image" | "Video" | "Carousel" | "Media";
export type PublishStatus = "Success" | "Failed";
export type LeadStatus = "New" | "Contacted" | "Qualified";
export type CrmStatus = "Pending" | "Synced";

export interface Competitor {
  id: string;
  name: string;
  positioning: string;
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
}

export interface Campaign {
  id: string;
  name: string;
  budget: number;
  status: "Draft" | "Active" | "Paused";
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
  /** AI region focus: global | uae-gcc | india | uae-india */
  primaryRegion: string;
  workspaceConfigured: boolean;
  strategy: StrategyPlan | null;
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
