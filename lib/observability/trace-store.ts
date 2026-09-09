/**
 * M2 Trace Store — 最小持久化层
 * ------------------------------------------------------------
 * 选型决策：Memory (in-process append-only)
 *
 * 为什么选 Memory：
 * 1. 求职项目最轻量方案，demo 模式可工作，不引入外部依赖
 * 2. 复用现有基础设施（与 MemoryLearningRepository 同模式）
 * 3. 满足核心需求：按 trace_id 查询 + append-only event
 * 4. 不引入大型 observability platform（Datadog/LangSmith/OTel）
 * 5. 生产 Supabase migration 已设计（见 supabase/migrations/0009_trace.sql），
 *    但未在远程实例执行，不声称 production verified
 *
 * 限制：
 * - 进程重启后 trace 丢失（demo 可接受）
 * - 不支持跨进程查询
 * - 生产环境需切换到 Supabase Trace Store（接口相同）
 *
 * Retention（Contract §1.7 / §3.7 硬控制④）：
 * - events 30 天 / trace 头 90 天滚动清理
 * - Memory 实现提供 prune() 结构能力（惰性触发于 listTraceIds）；
 *   进程内生命周期通常短于 TTL，生产级滚动清理由持久化后端（Supabase）承载。
 */
import type { TraceEvent, TraceHeader } from "@/lib/observability/trace-contract";

// =============================================================
// In-memory append-only store
// =============================================================

interface TraceRecord {
  header: TraceHeader;
  events: TraceEvent[];
}

export const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30d
export const HEADER_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90d

class MemoryTraceStore {
  private traces = new Map<string, TraceRecord>();

  /** 创建或获取 trace header（幂等） */
  getOrCreateHeader(header: TraceHeader): TraceHeader {
    const existing = this.traces.get(header.trace_id);
    if (existing) return existing.header;
    this.traces.set(header.trace_id, { header, events: [] });
    return header;
  }

  /** 更新 trace header（请求结束时回填 ended_at / http_status 等） */
  updateHeader(traceId: string, patch: Partial<TraceHeader>): TraceHeader | null {
    const record = this.traces.get(traceId);
    if (!record) return null;
    record.header = { ...record.header, ...patch };
    return record.header;
  }

  /** append-only 追加事件（自动分配 per-trace seq） */
  appendEvent(event: TraceEvent): void {
    const record = this.traces.get(event.trace_id);
    if (!record) {
      // 自动创建 header（防止事件先于 header 到达）
      this.traces.set(event.trace_id, {
        header: {
          trace_id: event.trace_id,
          route: "unknown",
          started_at: event.ts,
          ended_at: null,
          latency_ms: null,
          http_status: null,
          app_error_code: null,
          degradation_flag: false,
          event_count: 0,
          user_hash: null,
          client_event_id: null,
        },
        events: [],
      });
    }
    const rec = this.traces.get(event.trace_id)!;
    // 自动分配 per-trace seq（覆盖 emitter 传入的 seq，保证全局一致）
    const seq = rec.events.length + 1;
    rec.events.push({ ...event, seq });
    rec.header.event_count = rec.events.length;
  }

  /** 按 trace_id 查询完整 trace */
  getTrace(traceId: string): { header: TraceHeader; events: TraceEvent[] } | null {
    const record = this.traces.get(traceId);
    if (!record) return null;
    // events 按 seq 排序（append-only 天然有序，但防御性排序）
    const events = [...record.events].sort((a, b) => a.seq - b.seq);
    return { header: record.header, events };
  }

  /**
   * Contract §1.7 保留期：events 30d / trace 头 90d 滚动清理。
   * - 超过 90d 的整条 trace 删除（头+事件）；
   * - 未超 90d 但事件超 30d 的，裁剪过期事件（保留头，header.event_count 同步）。
   * 返回清理的完整 trace 条数。
   */
  prune(now = Date.now(), eventsRetentionMs = EVENT_RETENTION_MS, headerRetentionMs = HEADER_RETENTION_MS): number {
    let removedTraces = 0;
    for (const [traceId, record] of [...this.traces.entries()]) {
      const startedAt = new Date(record.header.started_at).getTime();
      if (Number.isNaN(startedAt)) continue;
      if (now - startedAt > headerRetentionMs) {
        this.traces.delete(traceId);
        removedTraces += 1;
        continue;
      }
      // 事件级 30d 裁剪
      const kept = record.events.filter((e) => now - new Date(e.ts).getTime() <= eventsRetentionMs);
      if (kept.length !== record.events.length) {
        record.events = kept;
        record.header.event_count = kept.length;
      }
    }
    return removedTraces;
  }

  /** 列出所有 trace_id（debug 用；惰性执行一次 retention prune） */
  listTraceIds(limit = 50): string[] {
    this.prune();
    return Array.from(this.traces.keys()).slice(-limit);
  }

  /** 清空（测试用） */
  reset(): void {
    this.traces.clear();
  }
}

// 单例
export const traceStore = new MemoryTraceStore();
