"use client";

import { create } from "zustand";
import {
  apiApprove,
  apiConnectLinkedin,
  apiConnectMeta,
  apiDeleteWorkspace,
  apiErrorMessage,
  apiGetWorkspace,
  type MasterContentSuggestion,
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
import { DEFAULT_AI_MODEL } from "@/lib/ai-models";
import { getAuthUser } from "@/lib/auth";
import type { MediaType, PostingPreferences, PublishingPlatform, UserProfile, WorkspaceScenario, WorkspaceSnapshot } from "@/lib/types";

const AI_MODEL_STORAGE_KEY = "flowpilot.aiModel";
const WORKSPACE_SETUPS_STORAGE_KEY = "flowpilot.workspaceSetups";
const ACTIVE_WORKSPACE_STORAGE_KEY = "flowpilot.activeWorkspaceId";

function userScopedStorageKey(key: string) {
  const email = getAuthUser()?.email?.trim().toLowerCase();
  return email ? `${key}.${email}` : key;
}

function loadSelectedAiModel() {
  if (typeof window === "undefined") return DEFAULT_AI_MODEL;
  return window.localStorage.getItem(AI_MODEL_STORAGE_KEY) || DEFAULT_AI_MODEL;
}

function isWorkspaceScenario(value: unknown): value is WorkspaceScenario {
  return typeof value === "string" && value.trim().length > 0;
}

function readStoredWorkspaceSetups(): { setups: WorkspaceSetupConfig[]; activeWorkspaceId: string | null } {
  if (typeof window === "undefined") {
    return { setups: [], activeWorkspaceId: null };
  }

  try {
    const rawSetups = window.localStorage.getItem(userScopedStorageKey(WORKSPACE_SETUPS_STORAGE_KEY));
    const parsed = rawSetups ? JSON.parse(rawSetups) : [];
    const setups = Array.isArray(parsed)
      ? parsed
          .map((item): WorkspaceSetupConfig | null => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            const id = String(record.id ?? "");
            const companyName = String(record.companyName ?? "");
            const scenario = record.scenario;
            if (!id || !companyName || !isWorkspaceScenario(scenario)) return null;
            return {
              id,
              companyName,
              website: String(record.website ?? ""),
              scenario,
              primaryRegion: typeof record.primaryRegion === "string" ? record.primaryRegion : "global",
              workspaceOwnerName: String(record.workspaceOwnerName ?? ""),
              workspaceOwnerEmail: String(record.workspaceOwnerEmail ?? ""),
              aiModel: String(record.aiModel ?? DEFAULT_AI_MODEL),
              competitors: Array.isArray(record.competitors)
                ? record.competitors
                    .map((competitor): CompetitorSetupInput | null => {
                      if (!competitor || typeof competitor !== "object") return null;
                      const competitorRecord = competitor as Record<string, unknown>;
                      return {
                        name: String(competitorRecord.name ?? ""),
                        website: String(competitorRecord.website ?? ""),
                        focus: String(competitorRecord.focus ?? ""),
                      };
                    })
                    .filter((competitor): competitor is CompetitorSetupInput => Boolean(competitor))
                : [],
              createdAt: String(record.createdAt ?? new Date().toISOString()),
            };
          })
          .filter((item): item is WorkspaceSetupConfig => Boolean(item))
      : [];
    const storedActiveId = window.localStorage.getItem(userScopedStorageKey(ACTIVE_WORKSPACE_STORAGE_KEY));
    const activeWorkspaceId = setups.some((item) => item.id === storedActiveId) ? storedActiveId : setups[0]?.id ?? null;
    return { setups, activeWorkspaceId };
  } catch {
    return { setups: [], activeWorkspaceId: null };
  }
}

function writeStoredWorkspaceSetups(setups: WorkspaceSetupConfig[], activeWorkspaceId: string | null) {
  if (typeof window === "undefined") return;
  const setupsKey = userScopedStorageKey(WORKSPACE_SETUPS_STORAGE_KEY);
  const activeKey = userScopedStorageKey(ACTIVE_WORKSPACE_STORAGE_KEY);
  window.localStorage.setItem(setupsKey, JSON.stringify(setups));
  if (activeWorkspaceId) {
    window.localStorage.setItem(activeKey, activeWorkspaceId);
  } else {
    window.localStorage.removeItem(activeKey);
  }
}

export interface WorkspaceSetupConfig {
  id: string;
  companyName: string;
  website: string;
  scenario: WorkspaceScenario;
  primaryRegion?: string;
  workspaceOwnerName: string;
  workspaceOwnerEmail: string;
  aiModel: string;
  createdAt: string;
  competitors?: CompetitorSetupInput[];
}

export interface CompetitorSetupInput {
  name: string;
  website: string;
  focus: string;
}

interface WorkspaceStore {
  workspace: WorkspaceSnapshot | null;
  workspaceSetups: WorkspaceSetupConfig[];
  activeWorkspaceId: string | null;
  loading: boolean;
  error: string | null;
  selectedAiModel: string;
  sidebarCollapsed: boolean;
  setSelectedAiModel: (model: string) => void;
  setSidebarCollapsed: (value: boolean) => void;
  loadWorkspaceSetups: () => void;
  setActiveWorkspace: (workspaceId: string) => Promise<void>;
  removeWorkspaceSetup: (workspaceId: string) => Promise<void>;
  deleteCurrentWorkspace: () => Promise<void>;
  refreshWorkspace: (options?: { soft?: boolean }) => Promise<void>;
  generateStrategy: (companyName: string, website: string, competitors?: CompetitorSetupInput[]) => Promise<void>;
  generateContent: (calendarDays?: number) => Promise<void>;
  suggestMasterContent: (suggestHint?: string) => Promise<MasterContentSuggestion>;
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
    workspaceId?: string;
    companyName: string;
    website: string;
    scenario: WorkspaceScenario;
    primaryRegion?: string;
    workspaceOwnerName: string;
    workspaceOwnerEmail: string;
    aiModel: string;
    competitors?: CompetitorSetupInput[];
  }) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  workspace: null,
  workspaceSetups: [],
  activeWorkspaceId: null,
  loading: false,
  error: null,
  selectedAiModel: loadSelectedAiModel(),
  sidebarCollapsed: false,
  setSelectedAiModel: (model) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AI_MODEL_STORAGE_KEY, model);
    }
    const activeWorkspaceId = get().activeWorkspaceId;
    const workspaceSetups = activeWorkspaceId
      ? get().workspaceSetups.map((setup) => (setup.id === activeWorkspaceId ? { ...setup, aiModel: model } : setup))
      : get().workspaceSetups;
    if (activeWorkspaceId) {
      writeStoredWorkspaceSetups(workspaceSetups, activeWorkspaceId);
    }
    set({ selectedAiModel: model, workspaceSetups });
  },
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
  loadWorkspaceSetups: () => {
    const { setups, activeWorkspaceId } = readStoredWorkspaceSetups();
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
    writeStoredWorkspaceSetups(get().workspaceSetups, setup.id);
    set({ activeWorkspaceId: setup.id, loading: true, error: null });
    try {
      await apiSetupWorkspace({
        companyName: setup.companyName,
        website: setup.website,
        scenario: setup.scenario,
        primaryRegion: setup.primaryRegion,
        workspaceOwnerName: setup.workspaceOwnerName,
        workspaceOwnerEmail: setup.workspaceOwnerEmail,
        aiModel: setup.aiModel,
        competitors: setup.competitors,
      });
      get().setSelectedAiModel(setup.aiModel);
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Unable to switch workspace",
        loading: false,
      });
    }
  },
  removeWorkspaceSetup: async (workspaceId) => {
    const existingSetups = get().workspaceSetups;
    const nextSetups = existingSetups.filter((item) => item.id !== workspaceId);
    const removingActive = get().activeWorkspaceId === workspaceId;
    const nextActiveId = get().activeWorkspaceId === workspaceId ? nextSetups[0]?.id ?? null : get().activeWorkspaceId;
    writeStoredWorkspaceSetups(nextSetups, nextActiveId);
    set({ workspaceSetups: nextSetups, activeWorkspaceId: nextActiveId });

    if (removingActive) {
      const workspace = await apiDeleteWorkspace();
      set({ workspace, loading: false, error: null });
    }

    if (removingActive && nextActiveId) {
      await get().setActiveWorkspace(nextActiveId);
    }
  },
  deleteCurrentWorkspace: async () => {
    const workspace = await apiDeleteWorkspace();
    writeStoredWorkspaceSetups([], null);
    set({ workspace, workspaceSetups: [], activeWorkspaceId: null, loading: false, error: null });
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
  generateStrategy: async (companyName, website, competitors) => {
    try {
      await apiPostStrategy(companyName, website, get().selectedAiModel, competitors, get().workspace?.workspaceScenario);
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      const message = apiErrorMessage(e);
      set({ error: message });
      throw new Error(message);
    }
  },
  generateContent: async (calendarDays) => {
    try {
      await apiPostContent({ action: "generate", calendarDays, aiModel: get().selectedAiModel });
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Content generation failed";
      set({
        error: message,
      });
      throw new Error(message);
    }
  },
  suggestMasterContent: async (suggestHint) => {
    try {
      const data = await apiPostContent({
        action: "suggest",
        aiModel: get().selectedAiModel,
        suggestHint: suggestHint?.trim() || undefined,
      });
      if (!data.suggestion) {
        throw new Error("No suggestion returned");
      }
      await get().refreshWorkspace({ soft: true });
      return data.suggestion;
    } catch (e) {
      const message = apiErrorMessage(e);
      set({ error: message });
      throw new Error(message);
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
    const matched = payload.workspaceId
      ? existingSetups.find((item) => item.id === payload.workspaceId)
      : existingSetups.find((item) => item.companyName.toLowerCase() === payload.companyName.toLowerCase());
    const setupId = matched?.id ?? `ws-local-${Date.now()}`;
    const nextSetup: WorkspaceSetupConfig = {
      id: setupId,
      companyName: payload.companyName,
      website: payload.website,
      scenario: payload.scenario,
      primaryRegion: payload.primaryRegion ?? "global",
      workspaceOwnerName: payload.workspaceOwnerName,
      workspaceOwnerEmail: payload.workspaceOwnerEmail,
      aiModel: payload.aiModel,
      competitors: payload.competitors,
      createdAt: matched?.createdAt ?? new Date().toISOString(),
    };
    const nextSetups = matched ? existingSetups.map((item) => (item.id === matched.id ? nextSetup : item)) : [nextSetup, ...existingSetups];
    writeStoredWorkspaceSetups(nextSetups, setupId);
    set({ workspaceSetups: nextSetups, activeWorkspaceId: setupId, selectedAiModel: payload.aiModel });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AI_MODEL_STORAGE_KEY, payload.aiModel);
    }
    await get().refreshWorkspace({ soft: true });
  },
}));

export const useMarketingStore = useWorkspaceStore;
