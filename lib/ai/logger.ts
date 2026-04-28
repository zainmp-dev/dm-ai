import type { AgentRole } from "./types";

type Level = "info" | "warn" | "error";

export function aiLog(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const line =
    `[ai] ${msg}` +
    (meta && Object.keys(meta).length ? ` ${JSON.stringify({ ...sanitize(meta) })}` : "");
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

function sanitize(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...meta };
  if (typeof out.promptPreview === "string" && out.promptPreview.length > 200) {
    out.promptPreview = `${String(out.promptPreview).slice(0, 200)}…`;
  }
  return out;
}

/** Safe workspace-scoped log line helper */
export function logAgentStart(role: AgentRole, workspaceId: string | undefined, modelHint: readonly string[]): void {
  aiLog("info", `agent:start`, {
    role,
    workspaceId: workspaceId ?? null,
    modelChainPreview: modelHint.slice(0, 3),
  });
}

export function logAgentDone(
  role: AgentRole,
  workspaceId: string | undefined,
  modelUsed: string,
  totalLatencyMs: number,
  attemptCount: number,
): void {
  aiLog("info", `agent:done`, {
    role,
    workspaceId: workspaceId ?? null,
    modelUsed,
    totalLatencyMs,
    attempts: attemptCount,
  });
}
