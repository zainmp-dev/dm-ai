"use client";

import { useEffect, type ReactNode } from "react";
import { prefetchBlogDashboard } from "@/modules/blog/blog-core";
import { useWorkspaceStore } from "@/lib/workspace-store";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const loadWorkspaceSetups = useWorkspaceStore((s) => s.loadWorkspaceSetups);
  const hydrateClientPreferences = useWorkspaceStore((s) => s.hydrateClientPreferences);
  const syncAuthSessionFromServer = useWorkspaceStore((s) => s.syncAuthSessionFromServer);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceSetups = useWorkspaceStore((s) => s.workspaceSetups);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  useEffect(() => {
    hydrateClientPreferences();
    loadWorkspaceSetups();
    void Promise.all([syncAuthSessionFromServer(), refreshWorkspace({ soft: true })]);
  }, [hydrateClientPreferences, loadWorkspaceSetups, refreshWorkspace, syncAuthSessionFromServer]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    prefetchBlogDashboard();
  }, [activeWorkspaceId]);

  // Wait until the initial GET /workspace has populated `workspace` before syncing
  // the active local setup. Otherwise `setActiveWorkspace` sees `workspace === null`,
  // skips the "already active" short-circuit, and fires a redundant POST + GET on every load.
  useEffect(() => {
    if (!workspace || !activeWorkspaceId || workspaceSetups.length === 0) {
      return;
    }
    void setActiveWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId, setActiveWorkspace, workspace, workspaceSetups.length]);

  return children;
}
