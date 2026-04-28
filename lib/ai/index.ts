/** OpenRouter-only AI SDK surface (chat completions — never `/v1/key` as completions). */

export {
  ROLE_FALLBACK_MODELS,
  ROLE_PRIMARY_MODEL,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  DEFAULT_TIMEOUT_MS,
} from "./constants";
export type { ChatCompletionOpts, AgentRole, PlanTier, AiTelemetry } from "./types";
export { OpenRouterChatError, fetchChatCompletionStructured } from "./openrouter-client";
export {
  invokeRoleChat,
  invokeShortTask,
  resolveModelChain,
} from "./router";
export { validateTextOutput, validateJsonEnvelope } from "./validate";
