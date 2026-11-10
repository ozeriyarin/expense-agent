import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { context, SpanStatusCode, trace, type Tracer as OtelTracer } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { SimpleSpanProcessor, TracerProvider, type ReadableSpan, type SpanExporter } from "@opentelemetry/sdk-trace";
import { redact } from "./redact.js";
import type { SpanLike, Tracer } from "./types.js";

export interface ExportedSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | undefined;
  name: string;
  durationMs: number;
  status: "ok" | "error" | "unset";
  attributes: Record<string, string | number | boolean>;
}

function toExported(span: ReadableSpan): ExportedSpan {
  const ctx = span.spanContext();
  const [s, ns] = span.duration;
  const status = span.status.code === SpanStatusCode.ERROR ? "error" : span.status.code === SpanStatusCode.OK ? "ok" : "unset";
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: span.parentSpanContext?.spanId,
    name: span.name,
    durationMs: Math.round((s * 1e3 + ns / 1e6) * 100) / 100,
    status,
    attributes: redact(span.attributes as Record<string, unknown>),
  };
}

/** Collects redacted spans in memory; used by tests and the status panel. */
export class InMemoryRedactingExporter implements SpanExporter {
  readonly spans: ExportedSpan[] = [];
  export(spans: ReadableSpan[], done: (result: { code: number }) => void): void {
    for (const s of spans) this.spans.push(toExported(s));
    done({ code: 0 });
  }
  async shutdown(): Promise<void> {}
  reset(): void {
    this.spans.length = 0;
  }
}

/** Appends one redacted JSON line per span to `<dir>/<yyyy-mm-dd>.jsonl` (dir lives under EXPENSE_DATA_DIR). */
export class JsonlRedactingExporter implements SpanExporter {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  export(spans: ReadableSpan[], done: (result: { code: number }) => void): void {
    const file = join(this.dir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    const lines = spans.map((s) => JSON.stringify(toExported(s))).join("\n") + "\n";
    appendFileSync(file, lines, "utf8");
    done({ code: 0 });
  }
  async shutdown(): Promise<void> {}
}

export interface TracerHandle extends Tracer {
  provider: TracerProvider;
  flush(): Promise<void>;
}

/** One tracer, one span per hook, call and batch. Attributes are redacted before they reach a span. */
let contextManagerInstalled = false;

export function createTracer(exporter: SpanExporter, serviceName = "expense-agent"): TracerHandle {
  if (!contextManagerInstalled) {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    contextManagerInstalled = true;
  }
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  const otel: OtelTracer = provider.getTracer(serviceName);

  async function span<R>(name: string, attrs: Record<string, unknown>, fn: (span: SpanLike) => Promise<R>): Promise<R> {
    return otel.startActiveSpan(name, { attributes: redact(attrs) }, async (s) => {
      const like: SpanLike = { setAttributes: (a) => s.setAttributes(redact(a)) };
      try {
        const result = await fn(like);
        s.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        s.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.name : "error" });
        s.setAttribute("error.type", err instanceof Error ? err.name : typeof err);
        throw err;
      } finally {
        s.end();
      }
    });
  }

  return { span, provider, flush: () => provider.forceFlush() };
}

export const noopTracer: Tracer = {
  span: (_name, _attrs, fn) => fn({ setAttributes: () => {} }),
};

export { trace };
