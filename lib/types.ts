export type ContentStatus = "PENDING" | "APPROVED" | "REJECTED";
export type Platform = "LinkedIn" | "Instagram";
export type MediaType = "Image" | "Video" | "Carousel";
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
}

export interface ContentItem {
  id: string;
  title: string;
  platform: Platform;
  contentText: string;
  mediaType: MediaType;
  mediaPreview: string;
  status: ContentStatus;
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
  platform: Platform;
  timestamp: string;
  status: PublishStatus;
}

export interface LeadItem {
  id: string;
  name: string;
  email: string;
  sourceCampaign: string;
  status: LeadStatus;
  crmStatus: CrmStatus;
}
