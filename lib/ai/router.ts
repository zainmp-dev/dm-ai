import {
  DEFAULT_MAX_RETRIES_PER_MODEL,
  DEFAULT_MIN_RESPONSE_CHARS,
  DEFAULT_TIMEOUT_MS,
  ROLE_FALLBACK_MODELS,
  ROLE_PRIMARY_MODEL,
} from "./constants";
import { logAgentDone, logAgentStart } from "./logger";
import { validateTextOutput } from "./validate";
import { fetchChatCompletionStructured, OpenRouterChatError, telemetryFromAttempts } from "./openrouter-client";
import type { AiAttempt, AgentRole, ChatCompletionOpts, OpenRouterMessage, PlanTier, SuccessfulCompletion } from "./types";

export type { AgentRole } from "./types";
export { OpenRouterChatError };

export interface RouterInvocationInput {
  role: AgentRole;
  messages: OpenRouterMessage[];
  /** Manual override wins first slot; must still be validated & retried like any model */
  manualModel?: string | null;
  workspaceId?: string | null;
  plan: PlanTier;
  temperature?: number;
  maxTokens?: number;
  /** Minimum trimmed characters — validation failure triggers retry / fallback model */
  minChars?: number;
  timeoutMs?: number;
}

/** Deduplicates while preserving order */
function uniqModels(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const s = m.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Resolves deterministic model fallback chain — ONLY chat completions model IDs.
 * Free tier: shorter fallback list (cost control).
 */
export function resolveModelChain(
  role: AgentRole,
  input: Pick<RouterInvocationInput, "manualModel" | "plan">,
): readonly string[] {
  const primary = ROLE_PRIMARY_MODEL[role];
  const fallbackList = ROLE_FALLBACK_MODELS[role];
  const freeCap = role === "research" ? 2 : role === "content" ? 2 : 2;

  const core = uniqModels([
    ...(input.manualModel?.trim() ? [input.manualModel.trim()] : []),
    primary,
    ...(input.plan === "free" ? fallbackList.slice(0, freeCap) : fallbackList),
    "openai/gpt-4o-mini",
  ]);

  return core;
}

function isLikelyTransient(err: unknown): boolean {
  if (!(err instanceof OpenRouterChatError)) return false;
  const s = err.status;
  if (s === undefined) return true;
  return s === 408 || s === 429 || (s >= 500 && s <= 599);
}

/**
 * - Per model: up to (DEFAULT_MAX_RETRIES_PER_MODEL + 1) tries on transient errors or validation failure.
 * - Then advance to fallback model until chain exhausted.
 */
export async function invokeRoleChat(input: RouterInvocationInput): Promise<SuccessfulCompletion> {
  const chain = [...resolveModelChain(input.role, input)];
  logAgentStart(input.role, input.workspaceId ?? undefined, chain);

  const attempts: AiAttempt[] = [];
  const minChars = input.minChars ?? DEFAULT_MIN_RESPONSE_CHARS;
  let totalLatencyMs = 0;

  outer: for (const model of chain) {
    const maxTriesPerModel = DEFAULT_MAX_RETRIES_PER_MODEL + 1;

    for (let attemptIdx = 0; attemptIdx < maxTriesPerModel; attemptIdx += 1) {
      const innerStart = Date.now();
      try {
        const completionOpts: ChatCompletionOpts = {
          model,
          messages: input.messages,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
          timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          workspaceId: input.workspaceId,
          role: input.role,
        };

        const { content, latencyMs } = await fetchChatCompletionStructured(completionOpts);
        totalLatencyMs += latencyMs;

        try {
          validateTextOutput(content, minChars);
        } catch (e) {
          attempts.push({
            model,
            attemptNumber: attempts.length + 1,
            ok: false,
            latencyMs,
            error: e instanceof Error ? e.message : String(e),
          });
          continue;
        }

        attempts.push({
          model,
          attemptNumber: attempts.length + 1,
          ok: true,
          latencyMs,
        });

        logAgentDone(input.role, input.workspaceId ?? undefined, model, totalLatencyMs, attempts.length);

        return {
          content,
          modelUsed: model,
          latencyMs: totalLatencyMs,
          attempts,
        };
      } catch (e) {
        const latencyMs = Date.now() - innerStart;
        totalLatencyMs += latencyMs;
        attempts.push({
          model,
          attemptNumber: attempts.length + 1,
          ok: false,
          latencyMs,
          error: e instanceof Error ? e.message : String(e),
        });

        if (isLikelyTransient(e) && attemptIdx + 1 < maxTriesPerModel) {
          continue;
        }

        continue outer;
      }
    }
  }

  void telemetryFromAttempts(input.role, input.workspaceId ?? null, attempts, totalLatencyMs);

  throw new OpenRouterChatError(
    `All models exhausted for role "${input.role}" after ${attempts.length} attempt(s). Last: ${attempts.at(-1)?.error ?? "unknown"}`,
  );
}

/** Tiny utility calls (labels, one-liners) — routes to `short` model chain (e.g. gpt-4.1-nano). */
export async function invokeShortTask(
  userPrompt: string,
  input: Pick<RouterInvocationInput, "plan" | "workspaceId" | "manualModel" | "timeoutMs">,
): Promise<SuccessfulCompletion> {
  return invokeRoleChat({
    role: "short",
    plan: input.plan,
    workspaceId: input.workspaceId,
    manualModel: input.manualModel,
    timeoutMs: input.timeoutMs,
    minChars: 8,
    maxTokens: 512,
    temperature: 0.35,
    messages: [
      { role: "system", content: "Reply with the minimum text needed. No preamble." },
      { role: "user", content: userPrompt },
    ],
  });
}
