import { CoreError, type CallRequest, type CallResult, type ErrorKind, type Provider, type Usage } from "../core/types.js";

export interface FakeReply {
  text?: string;
  output?: unknown;
  usage?: Partial<Usage>;
  delayMs?: number;
}

export type FakeScriptItem = FakeReply | { fail: ErrorKind; message?: string };

export interface FakeCall {
  model: string;
  request: CallRequest<unknown>;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError(signal));
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(abortError(signal)); }, { once: true });
  });

function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

/** Scripted provider for offline tests: replies are consumed in order; the last one repeats. */
export class FakeProvider implements Provider {
  readonly calls: FakeCall[] = [];
  private cursor = 0;

  constructor(readonly name: Provider["name"], private readonly script: FakeScriptItem[]) {
    if (script.length === 0) throw new Error("fake script must not be empty");
  }

  async complete<T>(model: string, request: CallRequest<T>, signal: AbortSignal): Promise<CallResult<T>> {
    this.calls.push({ model, request: request as CallRequest<unknown> });
    const item = this.script[Math.min(this.cursor, this.script.length - 1)]!;
    this.cursor += 1;
    const started = Date.now();
    if ("delayMs" in item && item.delayMs) await sleep(item.delayMs, signal);
    if (signal.aborted) throw abortError(signal);
    if ("fail" in item) throw new CoreError(item.message ?? `fake ${item.fail} failure`, item.fail);
    const text = item.text ?? "";
    const output = (item.output ?? (request.schema ? request.schema.parse(JSON.parse(text)) : text)) as T;
    return {
      output,
      text,
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, ...item.usage },
      provider: this.name,
      model,
      latencyMs: Date.now() - started,
    };
  }
}
