/**
 * Maps spoken phrases to admin routes or the command palette.
 * Separate from workspace `voice-commands.ts` — only used under /admin.
 */

export type AdminVoiceResult =
  | { kind: "navigate"; href: string; label: string }
  | { kind: "open-command-palette" }
  | { kind: "unknown"; transcript: string };

function normalizeTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,!?']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWake(s: string): string {
  return s
    .replace(/^(go to|open|show me|show|navigate to|take me to|switch to|jump to)\s+/i, "")
    .trim();
}

type Rule = { href: string | null; label: string; test: (s: string) => boolean };

/** `href` null + label "palette" resolves to palette in interpreter (second pass). */
const RULES: Rule[] = [
  {
    href: null,
    label: "palette",
    test: (s) =>
      /\bcommand palette\b/.test(s) ||
      /\bopen palette\b/.test(s) ||
      /\bsearch admin\b/.test(s) ||
      /\bfind page\b/.test(s) ||
      /\b(command k|⌘ ?k)\b/i.test(s) ||
      /\b(control k)\b/i.test(s) ||
      (/^palette\b/.test(s) && s.length < 24),
  },
  { href: "/admin", label: "Overview", test: (s) => /\boverview\b/.test(s) || /^home\b/.test(s) || /^admin home\b/.test(s) },
  {
    href: "/admin/users",
    label: "Users",
    test: (s) =>
      /\b(users?|accounts|directory|people|operators)\b/.test(s) && !/\banalytics\b/.test(s),
  },
  {
    href: "/admin/workspaces",
    label: "Workspaces",
    test: (s) => /\b(workspaces?|tenants)\b/.test(s),
  },
  {
    href: "/admin/integrations",
    label: "Integrations",
    test: (s) => /\bintegrations?\b/.test(s) || /\boauth\b/.test(s) || /\bsocial connections?\b/.test(s),
  },
  {
    href: "/admin/content",
    label: "Content",
    test: (s) =>
      /\bcontent library\b/.test(s) ||
      (/^content\b/.test(s) && s.length < 32) ||
      /\badmin content\b/.test(s),
  },
  {
    href: "/admin/database",
    label: "Database",
    test: (s) => /\bdatabase\b/.test(s) || /^db\b/.test(s) || /\bdb overview\b/.test(s),
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    test: (s) => /\banalytics\b/.test(s) || /\breports\b/.test(s),
  },
  {
    href: "/admin/operations",
    label: "Operations",
    test: (s) => /\boperations?\b/.test(s) || /\bjobs?\b/.test(s) || /\bqueues?\b/.test(s),
  },
  {
    href: "/admin/ai",
    label: "AI Ops",
    test: (s) => /\bai\s*ops\b/.test(s) || /\bAI operations\b/i.test(s) || /^admin ai\b/.test(s),
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    test: (s) => /\baudit\b/.test(s) || /\baudit log\b/.test(s),
  },
  {
    href: "/admin/security",
    label: "Security",
    test: (s) => /\bsecurity\b/.test(s) || /\brbac\b/.test(s) || /\bpermissions?\b/.test(s),
  },
];

export function interpretAdminVoiceCommand(transcript: string): AdminVoiceResult {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) {
    return { kind: "unknown", transcript };
  }
  const s = stripWake(normalized);

  for (const rule of RULES) {
    if (rule.test(s)) {
      if (rule.href === null && rule.label === "palette") {
        return { kind: "open-command-palette" };
      }
      if (rule.href) {
        return { kind: "navigate", href: rule.href, label: rule.label };
      }
    }
  }

  return { kind: "unknown", transcript };
}

/** Short prompts shown in the admin voice panel. */
export const ADMIN_VOICE_EXAMPLES = [
  "Overview",
  "Users",
  "Workspaces",
  "Analytics",
  "Command palette",
  "Audit log",
  "Security",
] as const;

const ADMIN_VOICE_SKIP_SPEECH_KEY = "fp_admin_voice_confirm_off";

export function isAdminVoiceSpeakEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ADMIN_VOICE_SKIP_SPEECH_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setAdminVoiceSpeakEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.removeItem(ADMIN_VOICE_SKIP_SPEECH_KEY);
    else window.localStorage.setItem(ADMIN_VOICE_SKIP_SPEECH_KEY, "1");
  } catch {
    /* ignore */
  }
}
