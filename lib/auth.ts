const TOKEN_KEY = "flowpilot_token";
const USER_KEY = "flowpilot_user";

export type AuthRole = "admin" | "user";

export interface AuthUser {
  name: string;
  email: string;
  role?: AuthRole;
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === "admin";
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
