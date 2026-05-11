/** Session keys for first-time onboarding (wizard persists after workspace save until user finishes). */

export const FP_FIRST_WIZARD_ACTIVE_KEY = "fp_first_wizard_active";
export const FP_FIRST_WIZARD_STEP_KEY = "fp_first_wizard_step";

export type FirstWizardStoredStep = "workspace" | "social" | "ready";

/** Where OAuth redirects after success/failure while onboarding (path only, same origin). */
export const FP_OAUTH_POST_CONNECT_KEY = "fp_oauth_post_connect";

export function readFirstWizardStep(): FirstWizardStoredStep | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(FP_FIRST_WIZARD_STEP_KEY);
  if (raw === "workspace" || raw === "social" || raw === "ready") return raw;
  return null;
}

export function setFirstWizardSession(active: boolean, step?: FirstWizardStoredStep) {
  if (typeof window === "undefined") return;
  if (!active) {
    sessionStorage.removeItem(FP_FIRST_WIZARD_ACTIVE_KEY);
    sessionStorage.removeItem(FP_FIRST_WIZARD_STEP_KEY);
    return;
  }
  const resolved = step ?? "workspace";
  sessionStorage.setItem(FP_FIRST_WIZARD_ACTIVE_KEY, "1");
  sessionStorage.setItem(FP_FIRST_WIZARD_STEP_KEY, resolved);
}

export function setOAuthPostConnectReturn(path: string) {
  if (typeof window === "undefined") return;
  const p = path.trim().split(/\s/)[0] ?? "";
  if (!p.startsWith("/") || p.includes("//") || p.includes(":")) return;
  sessionStorage.setItem(FP_OAUTH_POST_CONNECT_KEY, p.slice(0, 240));
}

export function clearFirstLoginWizardKeys() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(FP_FIRST_WIZARD_ACTIVE_KEY);
  sessionStorage.removeItem(FP_FIRST_WIZARD_STEP_KEY);
  sessionStorage.removeItem(FP_OAUTH_POST_CONNECT_KEY);
}
