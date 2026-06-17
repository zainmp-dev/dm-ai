"use client";

import { create } from "zustand";
import {
  apiApprove,
  apiConnectLinkedin,
  apiConnectMeta,
  apiDeleteWorkspace,
  apiErrorMessage,
  apiGetAuthSession,
  apiGetWorkspace,
  type MasterContentSuggestion,
  apiPatchWorkspaceResearch,
  apiPostClearAiOutputs,
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
import { DEFAULT_AI_MODEL, normalizeStoredAiModel, buildGlobalAiModelTryOrder } from "@/lib/ai-models";
import { getAuthToken, getAuthUser, patchAuthUser } from "@/lib/auth";
import { normalizePrimaryRegionCode } from "@/lib/primary-region";
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  WORKSPACE_SETUPS_STORAGE_KEY,
  clearAllWorkspacePresetStorage,
} from "@/lib/workspace-local-storage";
import type { MediaType, PostingPreferences, PublishingPlatform, UserProfile, WorkspaceScenario, WorkspaceSnapshot } from "@/lib/types";
import { useAiPipelineJobStore } from "@/lib/ai-pipeline-job-store";
import { signalAiWorkflowComplete } from "@/lib/ai-completion-signal";
import { isAiProviderRetryableError } from "@/lib/api-errors";

async function invokeWithGlobalAiFallbacks<T>(params: {
  preferredModel: string;
  invoke: (modelId: string) => Promise<T>;
}): Promise<T> {
  const order = buildGlobalAiModelTryOrder(params.preferredModel);
  let lastErr: unknown;
  for (let i = 0; i < order.length; i += 1) {
    const modelId = order[i]!;
    try {
      return await params.invoke(modelId);
    } catch (e) {
      lastErr = e;
      if (!isAiProviderRetryableError(e) || i >= order.length - 1) {
        throw e;
      }
    }
  }
  throw lastErr;
}

const AI_MODEL_STORAGE_KEY = "flowpilot.aiModel";

function userScopedStorageKey(key: string) {
  const email = getAuthUser()?.email?.trim().toLowerCase();
  return email ? `${key}.${email}` : key;
}

function loadSelectedAiModel() {
  if (typeof window === "undefined") return DEFAULT_AI_MODEL;
  return normalizeStoredAiModel(window.localStorage.getItem(AI_MODEL_STORAGE_KEY));
}

function isWorkspaceScenario(value: unknown): value is WorkspaceScenario {
  return typeof value === "string" && value.trim().length > 0;
}

function readStoredWorkspaceSetups(): { setups: WorkspaceSetupConfig[]; activeWorkspaceId: string | null } {
  if (typeof window === "undefined") {
    return { setups: [], activeWorkspaceId: null };
  }
  const emailGate = Boolean(getAuthUser()?.email?.trim());
  if (!emailGate) {
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
              primaryRegion: normalizePrimaryRegionCode(typeof record.primaryRegion === "string" ? record.primaryRegion : undefined),
              workspaceOwnerName: String(record.workspaceOwnerName ?? ""),
              workspaceOwnerEmail: String(record.workspaceOwnerEmail ?? ""),
              aiModel: normalizeStoredAiModel(String(record.aiModel ?? DEFAULT_AI_MODEL)),
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
  if (!getAuthUser()?.email?.trim()) return;
  const setupsKey = userScopedStorageKey(WORKSPACE_SETUPS_STORAGE_KEY);
  const activeKey = userScopedStorageKey(ACTIVE_WORKSPACE_STORAGE_KEY);
  window.localStorage.setItem(setupsKey, JSON.stringify(setups));
  if (activeWorkspaceId) {
    window.localStorage.setItem(activeKey, activeWorkspaceId);
  } else {
    window.localStorage.removeItem(activeKey);
  }
}

/** Loose match for website fields so local setup and API snapshot don't trigger redundant POST /workspace. */
function normalizeWebsiteKey(url: string): string {
  const raw = url.trim().toLowerCase();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    const host = u.hostname.replace(/^www\./, "");
    const path = (u.pathname || "/").replace(/\/+$/, "") || "";
    return `${host}${path}`;
  } catch {
    return raw.replace(/^www\./, "").replace(/\/+$/, "");
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

/** Dedupe overlapping GET /workspace (React Strict Mode double-mount + parallel mounts). */
let workspaceRefreshInflight: Promise<void> | null = null;

/** OAuth: `redirect` — opening provider; `already_connected` — no URL, integration already active. */
export type SocialConnectOutcome = "redirect" | "already_connected";

interface WorkspaceStore {
  workspace: WorkspaceSnapshot | null;
  workspaceSetups: WorkspaceSetupConfig[];
  activeWorkspaceId: string | null;
  /** True after the first GET /workspace attempt (success or failure). Used so initial fetch does not flip global `loading`. */
  workspaceHydrated: boolean;
  loading: boolean;
  error: string | null;
  selectedAiModel: string;
  /** Set to true after the last AI run used a free OpenRouter fallback (paid credits exhausted). Reset on next paid run. */
  lastRunUsedFreeModel: boolean;
  /** True while the first-login assistant wizard is mounted (hides main app chrome on Settings → Workspace). */
  firstRunOnboardingFocused: boolean;
  setFirstRunOnboardingFocused: (value: boolean) => void;
  sidebarCollapsed: boolean;
  setSelectedAiModel: (model: string) => void;
  /** Sync localStorage-backed prefs after mount (avoids SSR/client hydration mismatch). */
  hydrateClientPreferences: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  /** Bumped after `syncAuthSessionFromServer` updates local role/name from GET /auth/session (re-renders staff UI). */
  authSessionRevision: number;
  syncAuthSessionFromServer: () => Promise<void>;
  loadWorkspaceSetups: () => void;
  /**
   * POST the preset to the server workspace and refresh the snapshot (does not clear AI output).
   * @returns true if POST /workspace ran; false when already in sync / unknown id.
   */
  setActiveWorkspace: (workspaceId: string) => Promise<boolean>;
  removeWorkspaceSetup: (workspaceId: string) => Promise<void>;
  deleteCurrentWorkspace: () => Promise<void>;
  /** Clear workspace presets and snapshot after the account is deleted on the server (caller clears auth). */
  resetAfterAccountDeletion: () => void;
  refreshWorkspace: (options?: { soft?: boolean }) => Promise<void>;
  /** Clears transient UI errors without changing workspace data. */
  clearWorkspaceError: () => void;
  generateStrategy: (
    companyName: string,
    website: string,
    options?: {
      competitors?: CompetitorSetupInput[];
      completionNotify?: boolean;
    },
  ) => Promise<void>;
  generateContent: (calendarDays?: number, options?: { completionNotify?: boolean }) => Promise<void>;
  clearAiOutputs: () => Promise<void>;
  patchWorkspaceResearch: (patch: {
    deleteCompetitorIds?: string[];
    removeMarketGaps?: string[];
  }) => Promise<void>;
  suggestMasterContent: (suggestHint?: string) => Promise<MasterContentSuggestion>;
  createContentItem: (payload: {
    title: string;
    contentText: string;
    mediaType: MediaType;
    mediaPreview: string;
    scheduledAt?: string;
    autoActivate?: boolean;
    selectedPlatform?: PublishingPlatform;
  }) => Promise<string | null>;
  updateContentItem: (payload: {
    contentId: string;
    title: string;
    contentText: string;
    mediaType?: MediaType;
    mediaPreview?: string;
    /** Omit to leave unchanged; ISO UTC string to set; null to clear */
    scheduledAt?: string | null;
    autoActivate?: boolean;
    selectedPlatform?: PublishingPlatform;
  }) => Promise<void>;
  deleteContentItem: (contentId: string) => Promise<void>;
  bulkDeleteContentItems: (contentIds: string[]) => Promise<void>;
  approve: (contentId: string, platformOrPlatforms: PublishingPlatform | PublishingPlatform[]) => Promise<string[]>;
  reject: (contentId: string) => Promise<void>;
  schedule: (contentId: string, scheduledAt: string) => Promise<void>;
  publish: (contentIds: string[]) => Promise<{ published: number; warnings: string[] }>;
  runCron: () => Promise<{ published: number; warnings: string[] }>;
  connectLinkedin: (target?: "_self" | "_blank") => Promise<SocialConnectOutcome>;
  connectMeta: (target?: "_self" | "_blank") => Promise<SocialConnectOutcome>;
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
  workspaceHydrated: false,
  loading: false,
  error: null,
  selectedAiModel: DEFAULT_AI_MODEL,
  lastRunUsedFreeModel: false,
  firstRunOnboardingFocused: false,
  setFirstRunOnboardingFocused: (firstRunOnboardingFocused) => set({ firstRunOnboardingFocused }),
  sidebarCollapsed: false,
  authSessionRevision: 0,
  hydrateClientPreferences: () => {
    if (typeof window === "undefined") return;
    set({ selectedAiModel: loadSelectedAiModel() });
  },
  setSelectedAiModel: (model) => {
    const m = normalizeStoredAiModel(model);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AI_MODEL_STORAGE_KEY, m);
    }
    const activeWorkspaceId = get().activeWorkspaceId;
    const workspaceSetups = activeWorkspaceId
      ? get().workspaceSetups.map((setup) => (setup.id === activeWorkspaceId ? { ...setup, aiModel: m } : setup))
      : get().workspaceSetups;
    if (activeWorkspaceId) {
      writeStoredWorkspaceSetups(workspaceSetups, activeWorkspaceId);
    }
    set({ selectedAiModel: m, workspaceSetups });
  },
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
  syncAuthSessionFromServer: async () => {
    if (typeof window === "undefined") return;
    if (!getAuthToken()) return;
    try {
      const sess = await apiGetAuthSession();
      patchAuthUser({
        name: sess.name,
        email: sess.email,
        role: sess.role,
      });
      set((s) => ({ authSessionRevision: s.authSessionRevision + 1 }));
    } catch {
      /* invalid token or offline */
    }
  },
  loadWorkspaceSetups: () => {
    const { setups, activeWorkspaceId } = readStoredWorkspaceSetups();
    set({ workspaceSetups: setups, activeWorkspaceId });
  },
  setActiveWorkspace: async (workspaceId) => {
    const setup = get().workspaceSetups.find((item) => item.id === workspaceId);
    if (!setup) {
      return false;
    }
    const current = get().workspace;
    const alreadyActive =
      get().activeWorkspaceId === workspaceId &&
      current?.companyName.trim().toLowerCase() === setup.companyName.trim().toLowerCase() &&
      normalizeWebsiteKey(current?.companyWebsite ?? "") === normalizeWebsiteKey(setup.website) &&
      current?.workspaceScenario === setup.scenario;
    if (alreadyActive) {
      return false;
    }
    writeStoredWorkspaceSetups(get().workspaceSetups, setup.id);
    set({ activeWorkspaceId: setup.id, loading: true, error: null });
    try {
      await apiSetupWorkspace(
        {
          companyName: setup.companyName,
          website: setup.website,
          scenario: setup.scenario,
          primaryRegion: setup.primaryRegion,
          workspaceOwnerName: setup.workspaceOwnerName,
          workspaceOwnerEmail: setup.workspaceOwnerEmail,
          aiModel: normalizeStoredAiModel(setup.aiModel),
          competitors: setup.competitors,
        },
        { skipGlobalLoading: true },
      );
      get().setSelectedAiModel(setup.aiModel);
      await get().refreshWorkspace({ soft: true });
      return true;
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Unable to switch workspace",
        loading: false,
      });
      return false;
    }
  },
  removeWorkspaceSetup: async (workspaceId) => {
    const existingSetups = get().workspaceSetups;
    const nextSetups = existingSetups.filter((item) => item.id !== workspaceId);
    const removingActive = get().activeWorkspaceId === workspaceId;
    const nextActiveId = removingActive ? (nextSetups[0]?.id ?? null) : get().activeWorkspaceId;

    if (!removingActive) {
      writeStoredWorkspaceSetups(nextSetups, nextActiveId);
      set({ workspaceSetups: nextSetups });
      return;
    }

    // Removing the active preset: clear the server first so WorkspaceProvider cannot race a POST
    // against the old workspace, and so local state is not updated if delete fails.
    try {
      const workspace = await apiDeleteWorkspace();
      writeStoredWorkspaceSetups(nextSetups, nextActiveId);
      set({ workspace, workspaceSetups: nextSetups, activeWorkspaceId: nextActiveId, loading: false, error: null });
      if (nextActiveId) {
        await get().setActiveWorkspace(nextActiveId);
      }
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Could not remove workspace",
        loading: false,
      });
      throw e;
    }
  },
  deleteCurrentWorkspace: async () => {
    const workspace = await apiDeleteWorkspace();
    writeStoredWorkspaceSetups([], null);
    set({ workspace, workspaceSetups: [], activeWorkspaceId: null, loading: false, error: null });
  },
  resetAfterAccountDeletion: () => {
    if (typeof window !== "undefined") {
      clearAllWorkspacePresetStorage();
    }
    useAiPipelineJobStore.getState().resetAll();
    set({
      workspace: null,
      workspaceSetups: [],
      activeWorkspaceId: null,
      workspaceHydrated: false,
      loading: false,
      error: null,
      lastRunUsedFreeModel: false,
    });
  },
  clearAiOutputs: async () => {
    try {
      const snapshot = await apiPostClearAiOutputs();
      useAiPipelineJobStore.getState().resetBootstrapClaim();
      set({ workspace: snapshot, error: null });
    } catch (e) {
      const message = apiErrorMessage(e);
      set({ error: message });
      throw new Error(message);
    }
  },
  patchWorkspaceResearch: async (patch) => {
    try {
      const snapshot = await apiPatchWorkspaceResearch(patch);
      set({ workspace: snapshot, error: null });
    } catch (e) {
      const message = apiErrorMessage(e);
      set({ error: message });
      throw new Error(message);
    }
  },
  refreshWorkspace: async (options) => {
    if (workspaceRefreshInflight) {
      await workspaceRefreshInflight;
      return;
    }
    const soft = options?.soft;
    workspaceRefreshInflight = (async () => {
      if (!soft) {
        set({ loading: true, error: null });
      }
      try {
        const workspace = await apiGetWorkspace();

        // Auto-recover the workspace setup from backend data when localStorage is empty.
        // This unblocks users who log in on a new device or after clearing local storage —
        // without this they would see "No saved setups yet" even though the backend has data.
        if (workspace.workspaceConfigured && workspace.companyName.trim()) {
          const currentSetups = get().workspaceSetups;
          if (currentSetups.length === 0) {
            const recovered: WorkspaceSetupConfig = {
              id: `ws-local-${Date.now()}`,
              companyName: workspace.companyName,
              website: workspace.companyWebsite ?? "",
              scenario: workspace.workspaceScenario,
              primaryRegion: normalizePrimaryRegionCode(workspace.primaryRegion),
              workspaceOwnerName: workspace.profile?.name ?? "",
              workspaceOwnerEmail: workspace.profile?.email ?? "",
              aiModel: get().selectedAiModel,
              competitors: [],
              createdAt: new Date().toISOString(),
            };
            writeStoredWorkspaceSetups([recovered], recovered.id);
            set({ workspaceSetups: [recovered], activeWorkspaceId: recovered.id });
          }
        }

        set({ workspace, loading: false, error: null, workspaceHydrated: true });
      } catch (e) {
        set({
          error: apiErrorMessage(e),
          loading: false,
          workspaceHydrated: true,
        });
      }
    })().finally(() => {
      workspaceRefreshInflight = null;
    });
    await workspaceRefreshInflight;
  },
  clearWorkspaceError: () => set({ error: null }),
  generateStrategy: async (companyName, website, options) => {
    const competitors = options?.competitors ?? [];
    const job = useAiPipelineJobStore.getState();
    job.beginStrategy();
    try {
      const data = await invokeWithGlobalAiFallbacks({
        preferredModel: get().selectedAiModel,
        invoke: (m) =>
          apiPostStrategy(companyName, website, m, competitors, get().workspace?.workspaceScenario),
      });
      const used = data.ai_model_used?.trim();
      if (used && used !== get().selectedAiModel) {
        get().setSelectedAiModel(used);
      }
      set({ lastRunUsedFreeModel: data.used_free_model === true });
      await get().refreshWorkspace({ soft: true });
      if (options?.completionNotify === true) {
        signalAiWorkflowComplete("strategy", "Strategy ready", "Agent 1 finished. Open Workflow to review research and drafts.");
      }
    } catch (e) {
      const message = apiErrorMessage(e);
      set({ error: message });
      throw new Error(message);
    } finally {
      useAiPipelineJobStore.getState().endStrategy();
    }
  },
  generateContent: async (calendarDays, options) => {
    const job = useAiPipelineJobStore.getState();
    job.beginContent();
    try {
      const data = await invokeWithGlobalAiFallbacks({
        preferredModel: get().selectedAiModel,
        invoke: (m) => apiPostContent({ action: "generate", calendarDays, aiModel: m }),
      });
      const used = data.ai_model_used?.trim();
      if (used && used !== get().selectedAiModel) {
        get().setSelectedAiModel(used);
      }
      set({ lastRunUsedFreeModel: data.used_free_model === true });
      await get().refreshWorkspace({ soft: true });
      if (options?.completionNotify === true) {
        signalAiWorkflowComplete(
          "content",
          "Content calendar ready",
          "Your AI content calendar finished generating. Open Workflow to review posts.",
        );
      }
    } catch (e) {
      const message = apiErrorMessage(e);
      set({
        error: message,
      });
      throw new Error(message);
    } finally {
      useAiPipelineJobStore.getState().endContent();
    }
  },
  suggestMasterContent: async (suggestHint) => {
    try {
      const data = await invokeWithGlobalAiFallbacks({
        preferredModel: get().selectedAiModel,
        invoke: (m) =>
          apiPostContent({
            action: "suggest",
            aiModel: m,
            suggestHint: suggestHint?.trim() || undefined,
          }),
      });
      if (!data.suggestion) {
        throw new Error("No suggestion returned");
      }
      const used = data.ai_model_used?.trim();
      if (used && used !== get().selectedAiModel) {
        get().setSelectedAiModel(used);
      }
      set({ lastRunUsedFreeModel: data.used_free_model === true });
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
      const data = await apiPostContent({
        action: "create",
        title: payload.title,
        contentText: payload.contentText,
        mediaType: payload.mediaType,
        mediaPreview: payload.mediaPreview,
        scheduledAt: payload.scheduledAt,
        autoActivate: payload.autoActivate,
        selectedPlatform: payload.selectedPlatform,
      });
      await get().refreshWorkspace({ soft: true });
      return typeof data.created_content_id === "string" ? data.created_content_id : null;
    } catch (e) {
      const message = apiErrorMessage(e);
      set({
        error: message,
      });
      throw new Error(message);
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
        selectedPlatform: payload.selectedPlatform,
      });
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      const message = apiErrorMessage(e);
      set({
        error: message,
      });
      throw new Error(message);
    }
  },
  deleteContentItem: async (contentId) => {
    try {
      await apiPostContent({ action: "delete", contentId });
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      const message = apiErrorMessage(e);
      set({ error: message });
      throw new Error(message);
    }
  },
  bulkDeleteContentItems: async (contentIds) => {
    try {
      const deduped = Array.from(new Set(contentIds.map((id) => id.trim()).filter(Boolean)));
      if (deduped.length === 0) return;
      await apiPostContent({ action: "bulk_delete", contentIds: deduped });
      await get().refreshWorkspace({ soft: true });
    } catch (e) {
      const message = apiErrorMessage(e);
      set({ error: message });
      throw new Error(message);
    }
  },
  approve: async (contentId, platformOrPlatforms) => {
    const platforms = Array.isArray(platformOrPlatforms) ? platformOrPlatforms : [platformOrPlatforms];
    try {
      const data = await apiApprove(contentId, platforms);
      await get().refreshWorkspace({ soft: true });
      const ids = data.approved_content_ids;
      return Array.isArray(ids) && ids.length > 0 ? ids : [contentId];
    } catch (e) {
      await get().refreshWorkspace({ soft: true });
      const message = apiErrorMessage(e);
      throw new Error(message);
    }
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
  connectLinkedin: async (target = "_self") => {
    const res = await apiConnectLinkedin();
    const authUrl = typeof res.auth_url === "string" ? res.auth_url.trim() : "";
    if (authUrl && typeof window !== "undefined") {
      if (target === "_blank") {
        const popup = window.open(authUrl, "_blank", "noopener,noreferrer");
        if (!popup) {
          window.location.assign(authUrl);
        }
      } else {
        window.location.assign(authUrl);
      }
      return "redirect";
    }
    await get().refreshWorkspace({ soft: true });
    if (get().workspace?.integrations.linkedin.connected) {
      return "already_connected";
    }
    throw new Error(
      "We couldn’t open the LinkedIn sign-in screen from here. Wait a moment, check your connection, and try Connect again.",
    );
  },
  connectMeta: async (target = "_self") => {
    const res = await apiConnectMeta();
    const authUrl = typeof res.auth_url === "string" ? res.auth_url.trim() : "";
    if (authUrl && typeof window !== "undefined") {
      if (target === "_blank") {
        const popup = window.open(authUrl, "_blank", "noopener,noreferrer");
        if (!popup) {
          window.location.assign(authUrl);
        }
      } else {
        window.location.assign(authUrl);
      }
      return "redirect";
    }
    await get().refreshWorkspace({ soft: true });
    if (get().workspace?.integrations.meta.connected) {
      return "already_connected";
    }
    throw new Error(
      "We couldn’t open the Facebook sign-in screen from here. Wait a moment, check your connection, and try Connect again.",
    );
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
    const payloadNorm = { ...payload, aiModel: normalizeStoredAiModel(payload.aiModel) };
    const existingSetups = get().workspaceSetups;
    const matched = payload.workspaceId
      ? existingSetups.find((item) => item.id === payload.workspaceId)
      : existingSetups.find((item) => item.companyName.toLowerCase() === payload.companyName.toLowerCase());
    /** New brand card (not an edit of an existing id) — wipe server strategy/drafts so Workflow matches this company. */
    const isNewPreset = !payload.workspaceId && !matched;

    await apiSetupWorkspace(payloadNorm);
    if (isNewPreset) {
      await apiPostClearAiOutputs();
      set({ lastRunUsedFreeModel: false });
    }
    const setupId = matched?.id ?? `ws-local-${Date.now()}`;
    const nextSetup: WorkspaceSetupConfig = {
      id: setupId,
      companyName: payload.companyName,
      website: payload.website,
      scenario: payload.scenario,
      primaryRegion: normalizePrimaryRegionCode(payload.primaryRegion),
      workspaceOwnerName: payload.workspaceOwnerName,
      workspaceOwnerEmail: payload.workspaceOwnerEmail,
      aiModel: payloadNorm.aiModel,
      competitors: payload.competitors,
      createdAt: matched?.createdAt ?? new Date().toISOString(),
    };
    const nextSetups = matched ? existingSetups.map((item) => (item.id === matched.id ? nextSetup : item)) : [nextSetup, ...existingSetups];
    const resolvedModel = nextSetup.aiModel;
    writeStoredWorkspaceSetups(nextSetups, setupId);
    set({ workspaceSetups: nextSetups, activeWorkspaceId: setupId, selectedAiModel: resolvedModel });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AI_MODEL_STORAGE_KEY, resolvedModel);
    }
    await get().refreshWorkspace({ soft: true });
  },
}));

export const useMarketingStore = useWorkspaceStore;

/** Full-page skeleton: first load in flight, or blocking refresh with no snapshot yet. */
export function selectWorkspaceShellPending(s: {
  workspace: WorkspaceSnapshot | null;
  workspaceHydrated: boolean;
  loading: boolean;
}): boolean {
  return !s.workspace && (!s.workspaceHydrated || s.loading);
}
