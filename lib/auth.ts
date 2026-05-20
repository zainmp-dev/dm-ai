import { clearFirstLoginWizardKeys } from "@/lib/first-login-wizard";
import { clearAllWorkspacePresetStorage } from "@/lib/workspace-local-storage";

const TOKEN_KEY = "flowpilot_token";
const USER_KEY = "flowpilot_user";

/** Canonical tenant accounts remain `user`; privileged operators use enumerated roles stored server-side. */
export const PLATFORM_STAFF_ROLES = [
  "admin",
  "super_admin",
  "platform_admin",
  "workspace_admin",
  "moderator",
  "support_agent",
  "analyst",
] as const;

export type PlatformStaffRole = (typeof PLATFORM_STAFF_ROLES)[number];

export type AuthRole = PlatformStaffRole | "user" | (string & {});

export interface AuthUser {
  name: string;
  email: string;
  role?: AuthRole;
}

function normalizeAuthRoleKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

export function isPlatformStaffRole(role: string | null | undefined): boolean {
  if (role == null || String(role).trim() === "") return false;
  const n = normalizeAuthRoleKey(role);
  return (PLATFORM_STAFF_ROLES as readonly string[]).includes(n);
}

/** Operators route into `/admin`; end-users stay in workspace dashboards. */
export function hasAdminConsoleAccess(user: AuthUser | null | undefined): boolean {
  return isPlatformStaffRole(user?.role);
}

/** Back-compat alias for older call sites. */
export function isAdmin(user: AuthUser | null | undefined): boolean {
  return hasAdminConsoleAccess(user);
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const fromSession = sessionStorage.getItem(TOKEN_KEY);
  if (fromSession) return fromSession;
  const cookieToken = document.cookie
    .split("; ")
    .find((chunk) => chunk.startsWith(`${TOKEN_KEY}=`))
    ?.split("=")[1];
  return cookieToken ? decodeURIComponent(cookieToken) : null;
}

export function setAuthSession(token: string, user: AuthUser) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  const secureFlag = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `flowpilot_token=${encodeURIComponent(token)}; path=/; max-age=86400; samesite=lax${secureFlag}`;
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  clearFirstLoginWizardKeys();
  clearAllWorkspacePresetStorage();
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  const secureFlag = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `flowpilot_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax${secureFlag}`;
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthUser;
    const r = parsed.role;
    if (r != null && String(r).trim() !== "") {
      const key = normalizeAuthRoleKey(r);
      return { ...parsed, role: key as AuthUser["role"] };
    }
    return parsed;
  } catch {
    return null;
  }
}

export function patchAuthUser(updates: Partial<Pick<AuthUser, "name" | "email" | "role">>): void {
  if (typeof window === "undefined") return;
  const cur = getAuthUser();
  if (!cur) return;
  const next: AuthUser = { ...cur, ...updates };
  if (updates.role != null && String(updates.role).trim() !== "") {
    next.role = normalizeAuthRoleKey(String(updates.role)) as AuthUser["role"];
  }
  localStorage.setItem(USER_KEY, JSON.stringify(next));
}
