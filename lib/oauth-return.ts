import { FP_OAUTH_POST_CONNECT_KEY } from "@/lib/first-login-wizard";

/**
 * If onboarding saved a frontend return path before OAuth, go there instead of Settings and copy toast
 * query params from what Settings expects.
 */
export function resolvePostOAuthAppUrl(settingsFallbackAbsPath: string): string {
  if (typeof window === "undefined") return settingsFallbackAbsPath;
  try {
    const saved = sessionStorage.getItem(FP_OAUTH_POST_CONNECT_KEY);
    sessionStorage.removeItem(FP_OAUTH_POST_CONNECT_KEY);
    const p = typeof saved === "string" ? saved.trim() : "";
    if (!p.startsWith("/") || p.includes("//") || p.includes(":")) {
      return settingsFallbackAbsPath;
    }

    const [pathRaw, savedQsRaw] = p.split("?");
    const pathPart = pathRaw || "/workspace-setup";

    const fallbackQs =
      settingsFallbackAbsPath.includes("?") ? settingsFallbackAbsPath.split("?")[1]?.trim() ?? "" : "";
    const fbParams = new URLSearchParams(fallbackQs);

    const merged = new URLSearchParams(savedQsRaw ?? "");
    const toast = fbParams.get("toast");
    const toastDetail = fbParams.get("toast_detail");
    const section = fbParams.get("section");
    if (toast) merged.set("toast", toast);
    if (toastDetail != null && toastDetail !== "") merged.set("toast_detail", toastDetail);
    if (section != null && section !== "") merged.set("section", section);

    const qs = merged.toString();
    return qs ? `${pathPart}?${qs}` : pathPart;
  } catch {
    return settingsFallbackAbsPath;
  }
}
