import { OpenRouterChatError } from "@/lib/ai/openrouter-client";
import { validateJsonEnvelope } from "@/lib/ai/validate";

/**
 * Parses JSON returned by models; supports optional ```json fences.
 * Never treats key/balance payloads as JSON — upstream client already rejects those.
 */
export function parseAssistantJson<T>(raw: string, guard: (v: unknown) => v is T): T {
  return validateJsonEnvelope(raw, (s) => {
    const text = stripJsonFence(s.trim());
    const data: unknown = JSON.parse(text);
    if (!guard(data)) {
      throw new OpenRouterChatError("JSON schema guard failed for agent output.");
    }
    return data;
  });
}

export function stripJsonFence(s: string): string {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (m?.[1]) return m[1].trim();
  return s.trim();
}

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}
