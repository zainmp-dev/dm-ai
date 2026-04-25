"use client";

import { useEffect, type ReactNode } from "react";
import { useWorkspaceStore } from "@/lib/workspace-store";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const loadWorkspaceSetups = useWorkspaceStore((s) => s.loadWorkspaceSetups);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceSetups = useWorkspaceStore((s) => s.workspaceSetups);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const deleteCurrentWorkspace = useWorkspaceStore((s) => s.deleteCurrentWorkspace);
  useEffect(() => {
    loadWorkspaceSetups();
    void refreshWorkspace();
  }, [loadWorkspaceSetups, refreshWorkspace]);
  useEffect(() => {
    if (!workspace?.workspaceConfigured || activeWorkspaceId || workspaceSetups.length > 0) {
      return;
    }
    void deleteCurrentWorkspace();
  }, [activeWorkspaceId, deleteCurrentWorkspace, workspace?.workspaceConfigured, workspaceSetups.length]);
  useEffect(() => {
    if (!activeWorkspaceId || workspaceSetups.length === 0) {
      return;
    }
    void setActiveWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId, setActiveWorkspace, workspaceSetups.length]);
  return children;
}
