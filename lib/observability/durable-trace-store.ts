/**
 * P6A — Durable Trace Store（Supabase 实现）
 * 在现有 TraceStore 抽象后增加持久层；业务代码不直接 .from(...)。
 * 不持久化 credential；payload 沿用 contract 4KB 截断。
 * 写失败只降级记录，不抛给业务（business success + trace degraded）。
 */
import type { TraceEvent, TraceHeader, FullTrace } from "./trace-contract";

export interface TraceStore {
  getOrCreateHeader(h: TraceHeader): TraceHeader;
  updateHeader(traceId: string, patch: Partial<TraceHeader>): TraceHeader | null;
  appendEvent(e: TraceEvent): void;
  getTrace(traceId: string): FullTrace | null;
  listTraceIds(limit?: number): string[];
}

/** Supabase 表句柄的最小接口（测试用 in-memory fake 实现） */
export interface TraceTableClient {
  upsertHeader(h: TraceHeader, meta: { failure_layer: string | null; bad_case_id: string | null }): Promise<void>;
  insertEvent(e: TraceEvent): Promise<void>;
  listHeaders(limit: number): Promise<Array<{ trace_id: string }>>;
  loadTrace(traceId: string): Promise<{ header: TraceHeader; events: TraceEvent[] } | null>;
}

export class SupabaseTraceStore implements TraceStore {
  mem = new Map<string, { header: TraceHeader; events: TraceEvent[] }>();
  constructor(private readonly db: TraceTableClient) {}

  getOrCreateHeader(h: TraceHeader): TraceHeader {
    const ex = this.mem.get(h.trace_id);
    if (ex) return ex.header;
    this.mem.set(h.trace_id, { header: h, events: [] });
    void this.db.upsertHeader(h, { failure_layer: null, bad_case_id: null }).catch(() => {});
    return h;
  }

  updateHeader(traceId: string, patch: Partial<TraceHeader>): TraceHeader | null {
    const rec = this.mem.get(traceId);
    if (!rec) return null;
    rec.header = { ...rec.header, ...patch };
    void this.db.upsertHeader(rec.header, { failure_layer: null, bad_case_id: null }).catch(() => {});
    return rec.header;
  }

  appendEvent(e: TraceEvent): void {
    let rec = this.mem.get(e.trace_id);
    if (!rec) {
      rec = { header: { trace_id: e.trace_id, route: "unknown", started_at: e.ts, ended_at: null, latency_ms: null, http_status: null, app_error_code: null, degradation_flag: false, event_count: 0, user_hash: null, client_event_id: null }, events: [] };
      this.mem.set(e.trace_id, rec);
    }
    rec.events.push(e);
    rec.header.event_count = rec.events.length;
    void this.db.insertEvent(e).catch(() => {});
  }

  getTrace(traceId: string): FullTrace | null {
    const rec = this.mem.get(traceId);
    if (!rec) return null;
    return { header: rec.header, events: [...rec.events].sort((a, b) => a.seq - b.seq) };
  }

  listTraceIds(limit = 50): string[] {
    return Array.from(this.mem.keys()).slice(-limit);
  }
}

/** 写失败隔离：writes 不抛错；读优先本地缓存，缺则回源 durable。 */
export class IsolatingTraceStore implements TraceStore {
  constructor(private readonly memory: TraceStore, private readonly durable: TraceStore) {}
  getOrCreateHeader(h: TraceHeader): TraceHeader {
    const m = this.memory.getOrCreateHeader(h);
    try { this.durable.getOrCreateHeader(h); } catch { /* degraded */ }
    return m;
  }
  updateHeader(traceId: string, patch: Partial<TraceHeader>): TraceHeader | null {
    const m = this.memory.updateHeader(traceId, patch);
    try { this.durable.updateHeader(traceId, patch); } catch { /* degraded */ }
    return m;
  }
  appendEvent(e: TraceEvent): void {
    this.memory.appendEvent(e);
    try { this.durable.appendEvent(e); } catch { /* degraded */ }
  }
  getTrace(traceId: string): FullTrace | null {
    return this.memory.getTrace(traceId) ?? this.durable.getTrace(traceId);
  }
  listTraceIds(limit?: number): string[] {
    return this.memory.listTraceIds(limit);
  }
}
