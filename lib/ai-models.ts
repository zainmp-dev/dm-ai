/**
 * OpenRouter model IDs (text/chat). Tight set of current, supported slugs.
 * @see https://openrouter.ai/models
 */
export const DEFAULT_AI_MODEL = "openai/gpt-5-mini";

const LEGACY_MODEL_IDS: ReadonlySet<string> = new Set([
  "mistralai/mixtral-8x7b",
  "openai/mixtral-8x7b",
  "meta-llama/llama-3.1-70b-instruct",
]);

export const AI_MODEL_GROUPS: readonly {
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}[] = [
  {
    label: "OpenAI",
    options: [
      { value: "openai/gpt-5.5", label: "GPT-5.5" },
      { value: "openai/gpt-5.2", label: "GPT-5.2" },
      { value: "openai/gpt-5-mini", label: "GPT-5 mini" },
      { value: "openai/gpt-4o", label: "GPT-4o" },
    ],
  },
  {
    label: "Anthropic",
    options: [
      { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
      { value: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7" },
    ],
  },
  {
    label: "Google",
    options: [
      { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
  },
  {
    label: "DeepSeek",
    options: [
      { value: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { value: "deepseek/deepseek-chat-v3.1", label: "DeepSeek Chat 3.1" },
    ],
  },
] as const;

export const AI_MODEL_OPTIONS = AI_MODEL_GROUPS.flatMap((g) => [...g.options]);

const VALID_IDS = new Set(AI_MODEL_OPTIONS.map((o) => o.value));

export function labelForAiModel(id: string): string {
  return AI_MODEL_OPTIONS.find((o) => o.value === id)?.label ?? id;
}

/** Reject removed slugs; keep known curated ids and plausible OpenRouter slugs from API fallback. */
export function normalizeStoredAiModel(stored: string | null | undefined): string {
  const s = (stored ?? "").trim();
  if (!s || LEGACY_MODEL_IDS.has(s)) {
    return DEFAULT_AI_MODEL;
  }
  if (VALID_IDS.has(s)) {
    return s;
  }
  if (s.includes("/") && !s.includes(" ") && s.length < 160) {
    return s;
  }
  return DEFAULT_AI_MODEL;
}
