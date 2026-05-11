/**
 * Validates a public company website for workspace setup.
 * Only http:// and https:// URLs are accepted (full URL with scheme required).
 */

export type WorkspaceWebsiteValidation =
  | { ok: true; normalized: string }
  | { ok: false; message: string };

/** Hostname allowed for local development only. */
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function validateNonEmptyHttpHttpsWebsite(raw: string): WorkspaceWebsiteValidation {
  const candidate = raw.replace(/\s+/g, "");
  if (!/^https?:\/\//i.test(candidate)) {
    return {
      ok: false,
      message: "Start with http:// or https:// (for example https://yourcompany.com).",
    };
  }

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { ok: false, message: "That does not look like a valid website address." };
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, message: "Only http and https links are allowed." };
  }

  const host = u.hostname.trim().toLowerCase();
  if (!host) {
    return { ok: false, message: "Add a domain name after the scheme (e.g. https://yourcompany.com)." };
  }

  if (LOCAL_DEV_HOSTS.has(host) || host.endsWith(".localhost")) {
    const normalized = stripTrailingSlash(u.href);
    return { ok: true, normalized };
  }

  if (!host.includes(".")) {
    return {
      ok: false,
      message: "Use your full domain name, such as https://yourcompany.com.",
    };
  }

  if (host.startsWith(".") || host.endsWith(".")) {
    return { ok: false, message: "Check the domain spelling." };
  }

  const normalized = stripTrailingSlash(u.href);
  return { ok: true, normalized };
}

/** Required website (first-run setup). Must be non-empty and a valid http(s) URL. */
export function validateWorkspaceWebsiteUrl(raw: string): WorkspaceWebsiteValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter your company website." };
  }
  return validateNonEmptyHttpHttpsWebsite(trimmed);
}

/** Optional website (e.g. new-workspace modal). Empty is allowed; otherwise same http(s) rules. */
export function validateOptionalWorkspaceWebsiteUrl(raw: string): WorkspaceWebsiteValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, normalized: "" };
  }
  return validateNonEmptyHttpHttpsWebsite(trimmed);
}
