// LangFuse observability client for Deno Edge Functions.
// Uses the ingestion REST API directly — avoids Node.js SDK compatibility issues.
// Fire-and-forget: flush() never throws so LangFuse downtime never fails a function.

export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  host?: string;
}

interface BatchItem {
  id: string;
  type: string;
  timestamp: string;
  body: Record<string, unknown>;
}

export class LangfuseClient {
  private host: string;
  private credentials: string; // base64(pk:sk)
  private batch: BatchItem[] = [];
  private enabled: boolean;

  constructor(cfg: LangfuseConfig) {
    this.host = cfg.host ?? 'https://cloud.langfuse.com';
    this.enabled = Boolean(cfg.publicKey && cfg.secretKey);
    this.credentials = this.enabled
      ? btoa(`${cfg.publicKey}:${cfg.secretKey}`)
      : '';
  }

  // ── Trace ──────────────────────────────────────────────────────────────────

  trace(params: {
    id: string;
    name: string;
    userId?: string;
    sessionId?: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): string {
    if (!this.enabled) return params.id;
    this.push('trace-create', params.id, {
      id: params.id,
      name: params.name,
      userId: params.userId,
      sessionId: params.sessionId,
      input: params.input,
      metadata: params.metadata,
      tags: params.tags,
    });
    return params.id;
  }

  // ── Generation (LLM call) ──────────────────────────────────────────────────

  generation(params: {
    id: string;
    traceId: string;
    parentSpanId?: string;
    name: string;
    model: string;
    input: unknown;
    output?: unknown;
    startTime: Date;
    endTime?: Date;
    usage?: { input: number; output: number };
    metadata?: Record<string, unknown>;
    level?: 'DEFAULT' | 'WARNING' | 'ERROR';
  }): void {
    if (!this.enabled) return;
    this.push('generation-create', params.id, {
      id: params.id,
      traceId: params.traceId,
      parentObservationId: params.parentSpanId,
      name: params.name,
      model: params.model,
      input: params.input,
      output: params.output,
      startTime: params.startTime.toISOString(),
      endTime: params.endTime?.toISOString(),
      usage: params.usage
        ? { input: params.usage.input, output: params.usage.output, unit: 'TOKENS' }
        : undefined,
      metadata: params.metadata,
      level: params.level ?? 'DEFAULT',
    });
  }

  // ── Span (non-LLM step) ────────────────────────────────────────────────────

  span(params: {
    id: string;
    traceId: string;
    parentSpanId?: string;
    name: string;
    input?: unknown;
    output?: unknown;
    startTime: Date;
    endTime?: Date;
    metadata?: Record<string, unknown>;
    level?: 'DEFAULT' | 'WARNING' | 'ERROR';
    statusMessage?: string;
  }): void {
    if (!this.enabled) return;
    this.push('span-create', params.id, {
      id: params.id,
      traceId: params.traceId,
      parentObservationId: params.parentSpanId,
      name: params.name,
      input: params.input,
      output: params.output,
      startTime: params.startTime.toISOString(),
      endTime: params.endTime?.toISOString(),
      metadata: params.metadata,
      level: params.level ?? 'DEFAULT',
      statusMessage: params.statusMessage,
    });
  }

  // ── Score ──────────────────────────────────────────────────────────────────

  score(params: {
    traceId: string;
    observationId?: string;
    name: string;
    value: number;
    comment?: string;
  }): void {
    if (!this.enabled) return;
    this.push('score-create', crypto.randomUUID(), {
      id: crypto.randomUUID(),
      traceId: params.traceId,
      observationId: params.observationId,
      name: params.name,
      value: params.value,
      comment: params.comment,
      dataType: 'NUMERIC',
    });
  }

  // ── Flush ──────────────────────────────────────────────────────────────────

  async flush(): Promise<void> {
    if (!this.enabled || this.batch.length === 0) return;
    const payload = { batch: this.batch };
    this.batch = [];
    try {
      const res = await fetch(`${this.host}/api/public/ingestion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.credentials}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`[langfuse] flush failed: HTTP ${res.status} — ${await res.text()}`);
      }
    } catch (err) {
      console.error(`[langfuse] flush error: ${err}`);
    }
  }

  private push(type: string, id: string, body: Record<string, unknown>): void {
    this.batch.push({ id: crypto.randomUUID(), type, timestamp: new Date().toISOString(), body });
  }
}

export function createLangfuseClient(): LangfuseClient {
  const publicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY') ?? '';
  const secretKey = Deno.env.get('LANGFUSE_SECRET_KEY') ?? '';
  const host = Deno.env.get('LANGFUSE_HOST');
  if (!publicKey || !secretKey) {
    console.warn('[langfuse] disabled — LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set');
  }
  return new LangfuseClient({ publicKey, secretKey, host });
}
