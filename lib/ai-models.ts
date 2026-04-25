export const DEFAULT_AI_MODEL = "openai/gpt-4o-mini";

export const AI_MODEL_OPTIONS = [
  { value: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B" },
] as const;
