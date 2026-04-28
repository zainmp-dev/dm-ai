/** Only OpenRouter Chat Completions URL — balance/key live on different paths on purpose */
export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions" as const;

/**
 * Mandatory role → primary model IDs (override per request or plan in router).
 * @see https://openrouter.ai/models
 */
export const ROLE_PRIMARY_MODEL = {
  research: "deepseek/deepseek-v3.2",
  strategy: "openai/gpt-4o-mini",
  content: "openai/gpt-4o-mini",
  distribution: "openai/gpt-4o-mini",
  short: "openai/gpt-4.1-nano",
} as const;

/** When primary exhausted (retries) or transient failure — never key/balance endpoints */
export const ROLE_FALLBACK_MODELS = {
  research: ["deepseek/deepseek-chat-v3.1", "openai/gpt-4o-mini"],
  strategy: ["openai/gpt-5-mini", "google/gemini-2.5-flash"],
  content: ["openai/gpt-5-mini", "deepseek/deepseek-chat-v3.1"],
  distribution: ["openai/gpt-5-mini"],
  short: ["openai/gpt-4o-mini", "deepseek/deepseek-chat-v3.1"],
} as const;

export const DEFAULT_MAX_RETRIES_PER_MODEL = 2;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MIN_RESPONSE_CHARS = 32;
