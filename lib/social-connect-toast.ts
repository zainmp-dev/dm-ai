/**
 * Plain-language copy for LinkedIn / Meta connect flows (toasts, not logs).
 */

export type SocialBrand = "LinkedIn" | "Meta";

export function socialConnectOpeningLine(brand: SocialBrand): string {
  if (brand === "LinkedIn") {
    return "Taking you to LinkedIn to sign in… when you’re done, you’ll land back here automatically.";
  }
  return "Taking you to Facebook to pick your Page and permissions… when you’re done, you’ll land back here automatically.";
}

export function socialConnectAlreadyLine(brand: SocialBrand): string {
  if (brand === "LinkedIn") {
    return "LinkedIn is already linked. You’re all set.";
  }
  return "Facebook and Instagram are already linked. You’re all set.";
}

/**
 * Turn thrown errors / API text into one calm sentence for a toast.
 */
export function socialConnectProblemLine(brand: SocialBrand, error: unknown): string {
  const raw =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";

  if (/\b429\b|rate[\s-]?limit|too many/i.test(raw)) {
    return `${brand} is busy right now. Wait a minute or two, then tap Connect again.`;
  }

  if (/Could not reach|Cannot reach|ERR_NETWORK|network/i.test(raw)) {
    return "We couldn’t reach the app. Check your Wi‑Fi or connection and try again.";
  }

  if (/session|401|expired|log in|sign in/i.test(raw)) {
    return "Your session may have timed out. Sign out, sign back in, then try Connect again.";
  }

  if (/did not return|sign-in link|sign in screen|start LinkedIn|start Meta/i.test(raw)) {
    return `We couldn’t open the ${brand} sign-in screen. Wait a moment and try Connect again. If this keeps happening, contact your admin.`;
  }

  // Long or technical-looking messages → generic calm line
  if (raw.length > 140 || /detail:|http|\b500\b|trace|exception|axios/i.test(raw)) {
    return `We couldn’t finish linking ${brand}. Please try again in a moment.`;
  }

  if (raw) return raw;
  return `We couldn’t link ${brand}. Please try again.`;
}
