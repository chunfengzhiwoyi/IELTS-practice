/**
 * GET /api/debug/traces
 * ------------------------------------------------------------
 * M2 Phase 3A: trace 列表查询（Console D 区 — Relevant Correlations 最小版）。
 * 查询现有 Memory Trace Store（不复制 Store），支持可选过滤：
 *   ?client_event_id=   同业务幂等键的关联 trace（Case 037 双请求对比）
 *   ?user_hash=         同用户近期 trace
 *   ?prompt_version=    同 prompt 版本的 trace（PROMPT 层判据）
 *   ?limit=             返回条数上限（默认 20，最大 200）
 * 同时返回全部 trace 的 prompt_version 统计分布。
 * 内部 debug 端点，不做鉴权（demo 项目）；生产环境应限制访问。
 */
import { NextResponse } from "next/server";

import { traceStore } from "@/lib/observability/trace-store";
import type { TraceEvent, TraceHeader } from "@/lib/observability/trace-contract";

export const runtime = "nodejs";

interface TraceSummary {
  trace_id: string;
  route: string;
  http_status: number | null;
  started_at: string;
  latency_ms: number | null;
  degradation_flag: boolean;
  app_error_code: string | null;
  event_count: number;
  client_event_id: string | null;
  user_hash: string | null;
  llm_attempts: Array<{
    seq: number;
    attempt_purpose: string;
    provider: string;
    model_name: string;
    prompt_key: string;
    prompt_version: string;
    status: string;
    error_code: string | null;
  }>;
}

function summarize(header: TraceHeader, events: TraceEvent[]): TraceSummary {
  return {
    trace_id: header.trace_id,
    route: header.route,
    http_status: header.http_status,
    started_at: header.started_at,
    latency_ms: header.latency_ms,
    degradation_flag: header.degradation_flag,
    app_error_code: header.app_error_code,
    event_count: header.event_count,
    client_event_id: header.client_event_id,
    user_hash: header.user_hash,
    llm_attempts: events
      .filter((e) => e.event_type === "llm.attempt")
      .map((e) => ({
        seq: e.seq,
        attempt_purpose: String(e.payload.attempt_purpose ?? ""),
        provider: String(e.payload.provider ?? ""),
        model_name: String(e.payload.model_name ?? ""),
        prompt_key: String(e.payload.prompt_key ?? ""),
        prompt_version: String(e.payload.prompt_version ?? ""),
        status: e.status,
        error_code: e.error_code,
      })),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientEventId = url.searchParams.get("client_event_id")?.trim() || null;
  const userHash = url.searchParams.get("user_hash")?.trim() || null;
  const promptVersion = url.searchParams.get("prompt_version")?.trim() || null;
  const limitRaw = Number(url.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 20;

  const traceIds = traceStore.listTraceIds(500);
  const matched: TraceSummary[] = [];
  const promptVersionStats = new Map<
    string,
    { total: number; ok: number; error: number; degraded: number }
  >();

  for (const traceId of traceIds) {
    const t = traceStore.getTrace(traceId);
    if (!t) continue;

    // prompt_version 全量统计（所有 trace）
    for (const e of t.events) {
      if (e.event_type !== "llm.attempt") continue;
      const version = String(e.payload.prompt_version ?? "?");
      const s = promptVersionStats.get(version) ?? { total: 0, ok: 0, error: 0, degraded: 0 };
      s.total += 1;
      if (e.status === "error") s.error += 1;
      else if (e.status === "degraded") s.degraded += 1;
      else s.ok += 1;
      promptVersionStats.set(version, s);
    }

    if (clientEventId && t.header.client_event_id !== clientEventId) continue;
    if (userHash && t.header.user_hash !== userHash) continue;
    if (promptVersion) {
      const hasVersion = t.events.some(
        (e) => e.event_type === "llm.attempt" && String(e.payload.prompt_version ?? "") === promptVersion,
      );
      if (!hasVersion) continue;
    }
    matched.push(summarize(t.header, t.events));
  }

  // 按 started_at 倒序（最近优先）
  matched.sort((a, b) => b.started_at.localeCompare(a.started_at));

  return NextResponse.json(
    {
      traces: matched.slice(0, limit),
      total: matched.length,
      limit,
      filters: { client_event_id: clientEventId, user_hash: userHash, prompt_version: promptVersion },
      prompt_version_stats: Object.fromEntries(
        [...promptVersionStats.entries()].sort((a, b) => b[1].total - a[1].total),
      ),
    },
    { status: 200 },
  );
}
