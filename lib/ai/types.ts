export type AgentRole =
  | "research"
  | "strategy"
  | "content"
  | "distribution"
  | "short"
  | "validator"
  | "brand_review"
  | "trend_analyzer";

/** Free = smaller fallbacks enforced in router (cost control); pro = wider chain */
export type PlanTier = "free" | "pro";

export type OpenRouterMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export interface AiTelemetry {
  workspaceId?: string | null;
  role: AgentRole;
  attempts: AiAttempt[];
  totalLatencyMs: number;
}

export interface AiAttempt {
  model: string;
  attemptNumber: number;
  ok: boolean;
  latencyMs: number;
  error?: string;
  truncated?: boolean;
}

export interface ChatCompletionOpts {
  model: string;
  messages: OpenRouterMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Override default OPENROUTER timeout */
  timeoutMs?: number;
  workspaceId?: string | null;
  role: AgentRole;
}

export interface SuccessfulCompletion {
  content: string;
  modelUsed: string;
  latencyMs: number;
  attempts: AiAttempt[];
}
