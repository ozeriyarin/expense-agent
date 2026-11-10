import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CoreError, type CallRequest, type CallResult, type Provider } from "../core/types.js";

const DEFAULT_MAX_TOKENS = 1024;

function toCoreError(error: unknown): CoreError {
  if (error instanceof Anthropic.APIUserAbortError) return new CoreError("anthropic call aborted", "aborted", { cause: error });
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
    return new CoreError(`anthropic retryable: ${error.message}`, "retryable", { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    const retryable = error.status === 408 || error.status === 409;
    return new CoreError(`anthropic ${error.status}: ${error.message}`, retryable ? "retryable" : "fatal", { cause: error });
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new CoreError(error.message, error.name === "TimeoutError" ? "retryable" : "aborted", { cause: error });
  }
  return new CoreError(error instanceof Error ? error.message : String(error), "fatal", { cause: error });
}

/** Thin adapter: stable `system` + `cached` blocks carry cache_control; structured output via zod. */
export class AnthropicProvider implements Provider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic();
  }

  async complete<T>(model: string, request: CallRequest<T>, signal: AbortSignal): Promise<CallResult<T>> {
    const system: Anthropic.TextBlockParam[] = [];
    if (request.system) system.push({ type: "text", text: request.system, cache_control: { type: "ephemeral" } });
    if (request.cached) system.push({ type: "text", text: request.cached, cache_control: { type: "ephemeral" } });
    const base = {
      model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: "user" as const, content: request.user }],
      ...(system.length > 0 && { system }),
    };
    const started = Date.now();
    try {
      let text = "";
      let output: T;
      let usage: Anthropic.Usage;
      if (request.schema) {
        const r = await this.client.messages.parse(
          { ...base, output_config: { format: zodOutputFormat(request.schema) } },
          { signal },
        );
        if (r.stop_reason === "refusal") throw new CoreError("anthropic refusal", "fatal");
        if (r.parsed_output === null || r.parsed_output === undefined) throw new CoreError("anthropic: unparseable structured output", "fatal");
        output = r.parsed_output as T;
        text = r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
        usage = r.usage;
      } else {
        const r = await this.client.messages.create(base, { signal });
        if (r.stop_reason === "refusal") throw new CoreError("anthropic refusal", "fatal");
        text = r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
        output = text as T;
        usage = r.usage;
      }
      return {
        output,
        text,
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        },
        provider: this.name,
        model,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      throw error instanceof CoreError ? error : toCoreError(error);
    }
  }
}
