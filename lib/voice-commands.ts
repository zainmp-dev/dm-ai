/**
 * Maps spoken phrases (after normalization) to in-app routes or actions.
 * Designed for Web Speech API transcripts — fuzzy, short commands.
 */

export type VoiceCommandResult =
  | { kind: "navigate"; href: string; label: string }
  | { kind: "open-agents-flow" }
  | { kind: "unknown"; transcript: string };

function normalizeTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,!?']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strips common wake-style prefixes so "go to dashboard" matches "dashboard". */
function stripLeadingPhrases(s: string): string {
  return s.replace(
    /^(go to|open|show me|show|navigate to|take me to|switch to|jump to)\s+/i,
    "",
  ).trim();
}

type RouteRule = { href: string; label: string; test: (s: string) => boolean };

const ROUTE_RULES: RouteRule[] = [
  {
    href: "/pipeline?tab=content&contentView=approval",
    label: "Approval queue",
    test: (s) =>
      /\bapproval\b/.test(s) ||
      /\bpending\b.*\bapprov/.test(s) ||
      s.includes("approval queue"),
  },
  {
    href: "/pipeline?tab=content&contentView=library",
    label: "Content library",
    test: (s) => s.includes("library") || /\bcontent\s+library\b/.test(s),
  },
  {
    href: "/pipeline?tab=command",
    label: "Command",
    test: (s) =>
      /\bcommand\b/.test(s) ||
      s.includes("command center") ||
      s.includes("ai tools") ||
      /^ai$/.test(s.trim()),
  },
  {
    href: "/pipeline?tab=scheduling",
    label: "Scheduling",
    test: (s) => /\bschedul/.test(s) || /\bcalendar\b/.test(s),
  },
  {
    href: "/pipeline?tab=publishing",
    label: "Publishing",
    test: (s) => /\bpublish/.test(s) || s.includes("go live"),
  },
  {
    href: "/campaigns?new=1",
    label: "New campaign",
    test: (s) =>
      s.includes("new campaign") || s.includes("create campaign") || s.includes("start campaign"),
  },
  {
    href: "/settings?section=workspace",
    label: "Workspace",
    test: (s) => s.includes("workspace setup") || s.includes("setup workspace") || s.includes("set up workspace"),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    test: (s) => s.includes("dashboard") || s.includes("home screen") || /^\s*home\s*$/.test(s),
  },
  {
    href: "/pipeline",
    label: "Workflow",
    test: (s) => s.includes("workflow") || s.includes("pipeline"),
  },
  {
    href: "/strategy",
    label: "Strategy",
    test: (s) => s.includes("strategy") || /\bstrateg/.test(s),
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    test: (s) => /\bcampaigns?\b/.test(s),
  },
  {
    href: "/notifications",
    label: "Notifications",
    test: (s) => s.includes("notification") || s.includes("alerts"),
  },
  {
    href: "/analytics",
    label: "Performance insights",
    test: (s) => s.includes("analytics") || s.includes("reports") || s.includes("performance insights"),
  },
  {
    href: "/settings",
    label: "Settings",
    test: (s) => s.includes("settings") || s.includes("preferences"),
  },
  {
    href: "/media",
    label: "Media setup",
    test: (s) => s.includes("media") && (s.includes("setup") || s.includes("library") || s.includes("upload")),
  },
  {
    href: "/media",
    label: "Media",
    test: (s) => /^\s*media\s*$/.test(s) || s === "media setup",
  },
  {
    href: "/profile",
    label: "Profile",
    test: (s) => s.includes("profile") || s.includes("my account"),
  },
  {
    href: "/pipeline?tab=content&contentView=library",
    label: "Content",
    test: (s) => /^\s*content\s*$/.test(s) || s.includes("content tab"),
  },
];

function isAgentsFlowIntent(s: string): boolean {
  return (
    s.includes("agent flow") ||
    s.includes("agents flow") ||
    s.includes("ai agents") ||
    s.includes("how agents") ||
    s.includes("how ai works") ||
    s.includes("ai pipeline") ||
    s.includes("explain agents")
  );
}

/**
 * Interpret a final speech recognition transcript.
 */
export function interpretVoiceCommand(transcript: string): VoiceCommandResult {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) {
    return { kind: "unknown", transcript };
  }
  const s = stripLeadingPhrases(normalized);

  if (isAgentsFlowIntent(s)) {
    return { kind: "open-agents-flow" };
  }

  for (const rule of ROUTE_RULES) {
    if (rule.test(s)) {
      return { kind: "navigate", href: rule.href, label: rule.label };
    }
  }

  return { kind: "unknown", transcript };
}

/** Short examples shown in the voice overlay help. */
export const VOICE_COMMAND_EXAMPLES = [
  "Open dashboard",
  "What is our content strategy",
  "Go to workflow",
  "Command",
  "Approval queue",
  "Scheduling",
  "Publishing",
  "New campaign",
  "Settings",
  "How agents work",
] as const;
