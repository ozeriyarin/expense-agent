import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { CoreError, type CallRequest, type CallResult, type Provider } from "../core/types.js";

const DEFAULT_MAX_TOKENS = 1024;

/** Ladder rungs use the logical name `gemini-flash`; the real model id is configured here (verify at first call). */
export const GEMINI_MODELS: Record<string, string> = {
  "gemini-flash": process.env["GEMINI_FLASH_MODEL"] ?? "gemini-2.5-flash",
};

function toCoreError(error: unknown): CoreError {
  if (error instanceof Error && error.name === "AbortError") return new CoreError("gemini call aborted", "aborted", { cause: error });
  if (error instanceof Error && error.name === "TimeoutError") return new CoreError("gemini timeout", "retryable", { cause: error });
  const status = (error as { status?: number }).status;
  const retryable = status === 429 || status === 408 || (typeof status === "number" && status >= 500);
  return new CoreError(error instanceof Error ? error.message : String(error), retryable ? "retryable" : "fatal", { cause: error });
}

/** Thin adapter over @google/genai; JSON output constrained by the zod schema converted to JSON Schema. */
export class GeminiProvider implements Provider {
  readonly name = "gemini" as const;
  private readonly ai: GoogleGenAI;

  constructor(ai?: GoogleGenAI) {
    this.ai = ai ?? new GoogleGenAI({ apiKey: process.env["GEMINI_API_KEY"] ?? "" });
  }

  async complete<T>(model: string, request: CallRequest<T>, signal: AbortSignal): Promise<CallResult<T>> {
    const realModel = GEMINI_MODELS[model] ?? model;
    const systemInstruction = [request.system, request.cached].filter(Boolean).join("\n\n");
    const started = Date.now();
    try {
      const r = await this.ai.models.generateContent({
        model: realModel,
        contents: request.user,
        config: {
          abortSignal: signal,
          maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(systemInstruction && { systemInstruction }),
          ...(request.schema && { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(request.schema) }),
        },
      });
      const text = r.text ?? "";
      const output = (request.schema ? request.schema.parse(JSON.parse(text)) : text) as T;
      const u = r.usageMetadata;
      return {
        output,
        text,
        usage: {
          inputTokens: u?.promptTokenCount ?? 0,
          outputTokens: u?.candidatesTokenCount ?? 0,
          cacheReadTokens: u?.cachedContentTokenCount ?? 0,
          cacheWriteTokens: 0,
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
