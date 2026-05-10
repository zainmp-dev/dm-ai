/** Only OpenRouter Chat Completions URL — balance/key live on different paths on purpose */
export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions" as const;

/**
 * Smart model routing — primary model per role.
 *
 * Routing philosophy:
 *   Research      → Gemini Flash (fast, large context, good web awareness via prompting)
 *   Strategy      → Claude Sonnet 4 (best reasoning + structured JSON output)
 *   Content       → GPT-4o-mini (reliable, cost-effective creative)
 *   Distribution  → GPT-4o-mini (structured scheduling)
 *   Validator     → GPT-4o-mini (fast JSON scoring)
 *   Brand Review  → GPT-4o-mini (pattern detection)
 *   Trend Analyzer→ Gemini Flash (large context for trend signals)
 *   Short tasks   → GPT-4.1-nano (cheapest for micro-tasks)
 */
export const ROLE_PRIMARY_MODEL = {
  research: "google/gemini-2.5-flash",
  strategy: "anthropic/claude-sonnet-4",
  content: "openai/gpt-4o-mini",
  distribution: "openai/gpt-4o-mini",
  short: "openai/gpt-4.1-nano",
  validator: "openai/gpt-4o-mini",
  brand_review: "openai/gpt-4o-mini",
  trend_analyzer: "google/gemini-2.5-flash",
} as const;

/**
 * Fallback chain per role — exhausted after primary retries fail.
 * Cost optimisation: prefer Gemini Flash and DeepSeek over Claude/GPT-5.
 * GPT-5-mini is the final safe fallback (most available, cheap).
 */
export const ROLE_FALLBACK_MODELS = {
  research: ["deepseek/deepseek-v3.2", "deepseek/deepseek-chat-v3.1", "openai/gpt-4o-mini"],
  strategy: ["openai/gpt-4o-mini", "google/gemini-2.5-flash", "openai/gpt-5-mini"],
  content: ["openai/gpt-5-mini", "deepseek/deepseek-v3.2"],
  distribution: ["openai/gpt-5-mini"],
  short: ["openai/gpt-4o-mini", "deepseek/deepseek-chat-v3.1"],
  validator: ["openai/gpt-5-mini", "deepseek/deepseek-v3.2"],
  brand_review: ["openai/gpt-5-mini", "deepseek/deepseek-v3.2"],
  trend_analyzer: ["deepseek/deepseek-v3.2", "openai/gpt-4o-mini"],
} as const;

export const DEFAULT_MAX_RETRIES_PER_MODEL = 2;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MIN_RESPONSE_CHARS = 32;

/** Strategy validation threshold — below this, escalate model or regenerate */
export const STRATEGY_QUALITY_THRESHOLD = 0.65;
/** Content quality threshold — below this, trigger brand reviewer suggestions */
export const CONTENT_QUALITY_THRESHOLD = 0.60;
