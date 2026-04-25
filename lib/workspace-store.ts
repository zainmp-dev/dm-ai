"use client";

import { create } from "zustand";
import {
  apiApprove,
  apiConnectLinkedin,
  apiConnectMeta,
  apiGetWorkspace,
  apiPostContent,
  apiPostStrategy,
  apiPublish,
  apiRunCronCycle,
  apiReject,
  apiSchedule,
  apiSetupWorkspace,
  apiUpdatePreferences,
  apiUpdateProfile,
} from "@/lib/api";
import type { MediaType, PostingPreferences, PublishingPlatform, UserProfile, WorkspaceScenario, WorkspaceSnapshot } from "@/lib/types";

export interface WorkspaceSetupConfig {
  id: string;
  companyName: string;
  website: string;
  scenario: WorkspaceScenario;
  workspaceOwnerName: string;
  workspaceOwnerEmail: string;
  createdAt: string;
}

interface WorkspaceStore {
  workspace: WorkspaceSnapshot | null;
  workspaceSetups: WorkspaceSetupConfig[];
  activeWorkspaceId: string | null;
  loading: boolean;
  error: string | null;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  loadWorkspaceSetups: () => void;
  setActiveWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspace: (options?: { soft?: boolean }) => Promise<void>;
  generateStrategy: (companyName: string, website: string) => Promise<void>;
  generateContent: (calendarDays?: number) => Promise<void>;
  createContentItem: (payload: {
    title: string;
    contentText: string;
    mediaType: MediaType;
    mediaPreview: string;
    scheduledAt?: string;
    autoActivate?: boolean;
  }) => Promise<void>;
  updateContentItem: (payload: {
    contentId: string;
    title: string;
    contentText: string;
    mediaType?: MediaType;
    mediaPreview?: string;
    scheduledAt?: string;
    autoActivate?: boolean;
  }) => Promise<void>;
  approve: (contentId: string, platformOrPlatforms: PublishingPlatform | PublishingPlatform[]) => Promise<void>;
  reject: (contentId: string) => Promise<void>;
  schedule: (contentId: string, scheduledAt: string) => Promise<void>;
  publish: (contentIds: string[]) => Promise<{ published: number; warnings: string[] }>;
  runCron: () => Promise<{ published: number; warnings: string[] }>;
  connectLinkedin: () => Promise<void>;
  connectMeta: () => Promise<void>;
  saveProfile: (patch: Partial<UserProfile>) => Promise<void>;
  savePreferences: (patch: Partial<PostingPreferences>) => Promise<void>;
  setupWorkspace: (payload: {
    companyName: string;
    website: string;
    scenario: WorkspaceScenario;
    workspaceOwnerName: string;
    workspaceOwnerEmail: string;
  }) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  workspace: null,
  workspaceSetups: [],
  activeWorkspaceId: null,
  loading: false,
  error: null,
  sidebarCollapsed: false,
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
  loadWorkspaceSetups: () => {
    const setups = get().workspaceSetups;
    const activeWorkspaceId = setups[0]?.id ?? null;
    set({ workspaceSetups: setups, activeWorkspaceId });
  },
  setActiveWorkspace: async (workspaceId) => {
    const setup = get().workspaceSetups.find((item) => item.id === workspaceId);
    if (!setup) {
      return;
    }
    const current = get().workspace;
    const alreadyActive =
      get().activeWorkspaceId === workspaceId &&
      current?.companyName.trim().toLowerCase() === setup.companyName.trim().toLowerCase() &&
      current?.companyWebsite.trim().toLowerCase() === setup.website.trim().toLowerCase() &&
      current?.workspaceScenario === setup.scenario;
    if (alreadyActive) {
      return;
    }
    set({ activeWorkspaceId: setup.id, loading: true, error: null });
    try {
      await apiSetupWorkspace({
        companyName: setup.companyName,
        website: setup.website,
        scenario: setup.scenario,
        workspaceOwnerName: setup.workspaceOwnerName,
        workspaceOwnerEmail: setup.workspaceOwnerEmail,
      });
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Unable to switch workspace",
        loading: false,
      });
    }
  },
  refreshWorkspace: async (options) => {
    const soft = options?.soft;
    if (!soft) {
      set({ loading: true, error: null });
    }
    try {
      const workspace = await apiGetWorkspace();
      set({ workspace, loading: false, error: null });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Unable to reach workspace API",
        loading: false,
      });
    }
  },
  generateStrategy: async (companyName, website) => {
    try {
      await apiPostStrategy(companyName, website);
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Strategy request failed",
      });
    }
  },
  generateContent: async (calendarDays) => {
    try {
      await apiPostContent({ action: "generate", calendarDays });
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Content generation failed",
      });
    }
  },
  createContentItem: async (payload) => {
    try {
      await apiPostContent({
        action: "create",
        title: payload.title,
        contentText: payload.contentText,
        mediaType: payload.mediaType,
        mediaPreview: payload.mediaPreview,
        scheduledAt: payload.scheduledAt,
        autoActivate: payload.autoActivate,
      });
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Create content failed",
      });
    }
  },
  updateContentItem: async (payload) => {
    try {
      await apiPostContent({
        action: "update",
        contentId: payload.contentId,
        title: payload.title,
        contentText: payload.contentText,
        mediaType: payload.mediaType,
        mediaPreview: payload.mediaPreview,
        scheduledAt: payload.scheduledAt,
        autoActivate: payload.autoActivate,
      });
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Update failed",
      });
    }
  },
  approve: async (contentId, platformOrPlatforms) => {
    const platforms = Array.isArray(platformOrPlatforms) ? platformOrPlatforms : [platformOrPlatforms];
    await apiApprove(contentId, platforms);
    await get().refreshWorkspace({ soft: true });
  },
  reject: async (contentId) => {
    await apiReject(contentId);
    await get().refreshWorkspace({ soft: true });
  },
  schedule: async (contentId, scheduledAt) => {
    await apiSchedule(contentId, scheduledAt);
    await get().refreshWorkspace({ soft: true });
  },
  publish: async (contentIds) => {
    try {
      const res = await apiPublish(contentIds);
      await get().refreshWorkspace({ soft: true });
      return { published: res.published_count, warnings: res.warnings };
    } catch (e) {
      await get().refreshWorkspace({ soft: true });
      return {
        published: 0,
        warnings: [e instanceof Error ? e.message : "Publish request failed"],
      };
    }
  },
  runCron: async () => {
    try {
      const res = await apiRunCronCycle();
      await get().refreshWorkspace({ soft: true });
      return { published: res.published_count, warnings: res.warnings };
    } catch (e) {
      await get().refreshWorkspace({ soft: true });
      return {
        published: 0,
        warnings: [e instanceof Error ? e.message : "Cron run failed"],
      };
    }
  },
  connectLinkedin: async () => {
    await apiConnectLinkedin();
    await get().refreshWorkspace({ soft: true });
  },
  connectMeta: async () => {
    await apiConnectMeta();
    await get().refreshWorkspace({ soft: true });
  },
  saveProfile: async (patch) => {
    await apiUpdateProfile(patch);
    await get().refreshWorkspace({ soft: true });
  },
  savePreferences: async (patch) => {
    await apiUpdatePreferences(patch);
    await get().refreshWorkspace({ soft: true });
  },
  setupWorkspace: async (payload) => {
    await apiSetupWorkspace(payload);
    const existingSetups = get().workspaceSetups;
    const matched = existingSetups.find((item) => item.companyName.toLowerCase() === payload.companyName.toLowerCase());
    const setupId = matched?.id ?? `ws-local-${Date.now()}`;
    const nextSetup: WorkspaceSetupConfig = {
      id: setupId,
      companyName: payload.companyName,
      website: payload.website,
      scenario: payload.scenario,
      workspaceOwnerName: payload.workspaceOwnerName,
      workspaceOwnerEmail: payload.workspaceOwnerEmail,
      createdAt: matched?.createdAt ?? new Date().toISOString(),
    };
    const nextSetups = matched ? existingSetups.map((item) => (item.id === matched.id ? nextSetup : item)) : [nextSetup, ...existingSetups];
    set({ workspaceSetups: nextSetups, activeWorkspaceId: setupId });
    await get().refreshWorkspace({ soft: true });
  },
}));

export const useMarketingStore = useWorkspaceStore;
