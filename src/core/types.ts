import type { ZodType } from "zod";

export type ProviderName = "anthropic" | "gemini" | "fake";

/** Every LLM-backed step in the product. Deterministic steps (parsers, dedup, export) never appear here. */
export type Step = "guard" | "categorize" | "escalate" | "ask" | "report";

export interface Rung {
  provider: ProviderName;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  backoffMs: number;
}

export type Ladder = readonly Rung[];

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CallRequest<T = string> {
  /** Stable instructions; placed first so prompt caching can reuse them. */
  system?: string;
  /** Stable few-shot or reference block, cached after `system`. */
  cached?: string;
  user: string;
  schema?: ZodType<T>;
  maxTokens?: number;
  /** Free-form metadata for traces; passes through redaction. */
  meta?: Record<string, unknown>;
}

export interface CallResult<T = string> {
  output: T;
  text: string;
  usage: Usage;
  provider: ProviderName;
  model: string;
  latencyMs: number;
}

export interface Provider {
  readonly name: ProviderName;
  complete<T>(model: string, request: CallRequest<T>, signal: AbortSignal): Promise<CallResult<T>>;
}

export type ErrorKind = "retryable" | "fatal" | "aborted";

export class CoreError extends Error {
  constructor(message: string, public readonly kind: ErrorKind, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class GuardRejectedError extends CoreError {
  constructor(public readonly reason: string) {
    super(`guard rejected: ${reason}`, "fatal");
  }
}

export class BudgetExceededError extends CoreError {
  constructor(public readonly spentUsd: number, public readonly hardUsd: number) {
    super(`budget exceeded: ${spentUsd.toFixed(4)} USD of ${hardUsd} USD`, "fatal");
  }
}

export interface Attempt {
  rung: Rung;
  tries: number;
  error: unknown;
}

export class LadderExhaustedError extends CoreError {
  constructor(public readonly step: Step, public readonly attempts: Attempt[]) {
    super(`ladder exhausted for ${step} after ${attempts.length} rung(s)`, "fatal", { cause: attempts.at(-1)?.error });
  }
}

export interface HookContext<T = unknown> {
  step: Step;
  rung: Rung;
  request: CallRequest<T>;
  attempt: number;
}

export type FailureDecision = "retry" | "next" | "abort";

export interface Hooks {
  preCall: Array<(ctx: HookContext) => void | Promise<void>>;
  postCall: Array<(ctx: HookContext & { result: CallResult<unknown>; costUsd: number }) => void | Promise<void>>;
  onFailure: Array<(ctx: HookContext & { error: unknown }) => FailureDecision | undefined>;
}

export interface SpanLike {
  setAttributes(attrs: Record<string, unknown>): void;
}

export interface Tracer {
  span<R>(name: string, attrs: Record<string, unknown>, fn: (span: SpanLike) => Promise<R>): Promise<R>;
}
