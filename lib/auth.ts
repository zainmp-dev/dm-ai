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

export function isPlatformStaffRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (PLATFORM_STAFF_ROLES as readonly string[]).includes(role);
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
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
