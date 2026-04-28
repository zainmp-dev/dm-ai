import { OPENROUTER_CHAT_COMPLETIONS_URL } from "./constants";
import type { AiAttempt, AiTelemetry, ChatCompletionOpts } from "./types";

export type { ChatCompletionOpts } from "./types";

/** Thrown only for chat completions — distinguish from misuse of /api/v1/key */
export class OpenRouterChatError extends Error {
  readonly status?: number;
  readonly endpoint = OPENROUTER_CHAT_COMPLETIONS_URL;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenRouterChatError";
    this.status = status;
  }
}

/**
 * Single supported integration path: POST chat completions.
 * Never parses balance/key payloads as model output — only `choices[].message.content`.
 */
export async function fetchChatCompletionStructured(
  opts: ChatCompletionOpts,
): Promise<{ content: string; latencyMs: number }> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new OpenRouterChatError("OPENROUTER_API_KEY is not set server-side.", undefined);
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.65,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const rawText = await response.text();

    if (!response.ok) {
      throw new OpenRouterChatError(`OpenRouter HTTP ${response.status}: ${rawText.slice(0, 500)}`, response.status);
    }

    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new OpenRouterChatError("OpenRouter returned non-JSON body for chat completions.", response.status);
    }

    const content = extractAssistantContentOnly(data);

    return {
      content,
      latencyMs,
    };
  } catch (e) {
    if (e instanceof OpenRouterChatError) {
      throw e;
    }
    if (e instanceof Error && e.name === "AbortError") {
      throw new OpenRouterChatError(`Chat completion aborted after ${timeoutMs}ms (timeout).`, 408);
    }
    throw new OpenRouterChatError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Validates OpenRouter Chat Completions shape and returns ONLY the assistant text.
 * Explicitly rejects `data` blobs that look like `/v1/key` (label, usage_daily, limit_remaining keys).
 */
function extractAssistantContentOnly(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new OpenRouterChatError("Chat response: invalid JSON envelope.");
  }
  const obj = data as Record<string, unknown>;

  const keyLike =
    typeof obj.label === "string" &&
    "usage" in obj &&
    "limit_remaining" in obj &&
    !("choices" in obj);

  if (keyLike) {
    throw new OpenRouterChatError(
      "Misrouted payload: looks like `/api/v1/key` metadata, not chat completions. Caller must never use key endpoint as model output.",
    );
  }

  if (typeof obj.error === "object" && obj.error !== null) {
    const err = obj.error as Record<string, unknown>;
    const msg =
      typeof err.message === "string"
        ? err.message
        : typeof err.metadata === "string"
          ? err.metadata
          : "OpenRouter error object.";
    throw new OpenRouterChatError(msg, typeof err.code === "number" ? Number(err.code) : undefined);
  }

  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new OpenRouterChatError("Chat response: missing choices[]");
  }

  const first = choices[0];
  if (!first || typeof first !== "object") {
    throw new OpenRouterChatError("Chat response: choices[0] invalid.");
  }

  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    throw new OpenRouterChatError("Chat response: missing choices[0].message");
  }

  const content = (message as { content?: unknown }).content;

  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => (typeof part === "object" && part && "text" in part ? String((part as { text: unknown }).text) : "")).join("")
        : "";

  const trimmed = text.trim();

  return trimmed;
}

export function telemetryFromAttempts(
  role: AiTelemetry["role"],
  workspaceId: string | null | undefined,
  attempts: AiAttempt[],
  totalLatencyMs: number,
): AiTelemetry {
  return {
    role,
    workspaceId: workspaceId ?? null,
    attempts,
    totalLatencyMs,
  };
}
