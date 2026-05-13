/** Shared localStorage keys for FlowPilot workspace presets (client-only). */

export const WORKSPACE_SETUPS_STORAGE_KEY = "flowpilot.workspaceSetups";
export const ACTIVE_WORKSPACE_STORAGE_KEY = "flowpilot.activeWorkspaceId";

/**
 * Removes all preset blobs: legacy unscoped keys and every `*.email…` scoped variant.
 * Call whenever auth ends so a wiped DB / new OAuth user row cannot reuse stale UI state.
 */
export function clearAllWorkspacePresetStorage(): void {
  if (typeof window === "undefined") return;
  const prefixes = [WORKSPACE_SETUPS_STORAGE_KEY, ACTIVE_WORKSPACE_STORAGE_KEY];
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (prefixes.some((p) => k === p || k.startsWith(`${p}.`))) {
      keys.push(k);
    }
  }
  for (const k of keys) {
    window.localStorage.removeItem(k);
  }
}
