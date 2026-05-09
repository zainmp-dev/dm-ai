"use client";

import { create } from "zustand";
import { getAuthUser } from "@/lib/auth";
import type { ContentCampaign, CampaignGoal, PublishingPlatform } from "@/lib/types";

const CAMPAIGNS_STORAGE_KEY = "flowpilot.campaigns";

function userScopedKey(key: string): string {
  const email = getAuthUser()?.email?.trim().toLowerCase();
  return email ? `${key}.${email}` : key;
}

function readStoredCampaigns(): ContentCampaign[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(userScopedKey(CAMPAIGNS_STORAGE_KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ContentCampaign =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string",
    );
  } catch {
    return [];
  }
}

function writeStoredCampaigns(campaigns: ContentCampaign[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(userScopedKey(CAMPAIGNS_STORAGE_KEY), JSON.stringify(campaigns));
}

export interface CreateCampaignPayload {
  name: string;
  description: string;
  goal: CampaignGoal;
  platforms: PublishingPlatform[];
  budget: number;
  startDate: string | null;
  endDate: string | null;
  contentIds: string[];
  status: "Draft" | "Active";
}

export interface UpdateCampaignPayload extends Partial<Omit<ContentCampaign, "id" | "createdAt">> {
  id: string;
}

interface CampaignStore {
  campaigns: ContentCampaign[];
  /** Currently viewed campaign id */
  selectedCampaignId: string | null;

  loadCampaigns: () => void;
  createCampaign: (payload: CreateCampaignPayload) => ContentCampaign;
  updateCampaign: (payload: UpdateCampaignPayload) => void;
  deleteCampaign: (id: string) => void;
  assignContent: (campaignId: string, contentId: string) => void;
  unassignContent: (campaignId: string, contentId: string) => void;
  setSelectedCampaign: (id: string | null) => void;
  setStatus: (id: string, status: ContentCampaign["status"]) => void;
}

export const useCampaignStore = create<CampaignStore>()((set, get) => ({
  campaigns: [],
  selectedCampaignId: null,

  loadCampaigns: () => {
    const campaigns = readStoredCampaigns();
    set({ campaigns });
  },

  createCampaign: (payload) => {
    const now = new Date().toISOString();
    const newCampaign: ContentCampaign = {
      id: `camp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: payload.name.trim(),
      description: payload.description.trim(),
      goal: payload.goal,
      platforms: payload.platforms,
      budget: payload.budget,
      status: payload.status,
      startDate: payload.startDate,
      endDate: payload.endDate,
      contentIds: payload.contentIds,
      createdAt: now,
      updatedAt: now,
    };
    const next = [newCampaign, ...get().campaigns];
    writeStoredCampaigns(next);
    set({ campaigns: next });
    return newCampaign;
  },

  updateCampaign: (payload) => {
    const { id, ...rest } = payload;
    const next = get().campaigns.map((c) =>
      c.id === id ? { ...c, ...rest, updatedAt: new Date().toISOString() } : c,
    );
    writeStoredCampaigns(next);
    set({ campaigns: next });
  },

  deleteCampaign: (id) => {
    const next = get().campaigns.filter((c) => c.id !== id);
    writeStoredCampaigns(next);
    set({
      campaigns: next,
      selectedCampaignId: get().selectedCampaignId === id ? null : get().selectedCampaignId,
    });
  },

  assignContent: (campaignId, contentId) => {
    const next = get().campaigns.map((c) => {
      if (c.id !== campaignId) return c;
      if (c.contentIds.includes(contentId)) return c;
      return { ...c, contentIds: [...c.contentIds, contentId], updatedAt: new Date().toISOString() };
    });
    writeStoredCampaigns(next);
    set({ campaigns: next });
  },

  unassignContent: (campaignId, contentId) => {
    const next = get().campaigns.map((c) => {
      if (c.id !== campaignId) return c;
      return { ...c, contentIds: c.contentIds.filter((id) => id !== contentId), updatedAt: new Date().toISOString() };
    });
    writeStoredCampaigns(next);
    set({ campaigns: next });
  },

  setSelectedCampaign: (id) => set({ selectedCampaignId: id }),

  setStatus: (id, status) => {
    const next = get().campaigns.map((c) =>
      c.id === id ? { ...c, status, updatedAt: new Date().toISOString() } : c,
    );
    writeStoredCampaigns(next);
    set({ campaigns: next });
  },
}));
