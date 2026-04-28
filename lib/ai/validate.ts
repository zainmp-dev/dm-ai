import { DEFAULT_MIN_RESPONSE_CHARS } from "./constants";
import { OpenRouterChatError } from "./openrouter-client";

export function validateTextOutput(text: string, minChars: number = DEFAULT_MIN_RESPONSE_CHARS): void {
  const t = text.trim();
  if (!t) {
    throw new OpenRouterChatError("Output validation failed: empty assistant message.");
  }
  if (t.length < minChars) {
    throw new OpenRouterChatError(`Output validation failed: response shorter than ${minChars} chars.`);
  }
}

/**
 * For JSON agents — parses after coarse length check (parser does JSON.parse + guards).
 */
export function validateJsonEnvelope<T>(raw: string, parser: (s: string) => T): T {
  const t = raw.trim();
  validateTextOutput(t, 24);
  try {
    return parser(t);
  } catch {
    throw new OpenRouterChatError("Output validation failed: JSON parse error.");
  }
}
