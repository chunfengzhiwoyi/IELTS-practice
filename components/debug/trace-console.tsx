"use client";
/**
 * M2 Phase 3A — Minimal Debug Console（客户端交互）
 * ------------------------------------------------------------
 * 输入 trace_id → 调用现有 GET /api/debug/traces/[traceId] → 渲染 A/B/C/D 四区。
 * 判层逻辑复用 lib/debug/console/diagnosis.ts（与服务端同一份确定性实现）。
 * 刻意不做视觉美化：只保证信息可读、状态可区分（ok / degraded / error）。
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { runDiagnosis, type DiagnosisResult } from "@/lib/debug/console/diagnosis";
import type { DebugFixtureMeta } from "@/lib/debug/console/fixtures";
import type { FullTrace, TraceEvent } from "@/lib/observability/trace-contract";

// =============================================================
// Types
// =============================================================

interface TraceSummaryRow {
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

interface ListResponse {
  traces: TraceSummaryRow[];
  total: number;
  prompt_version_stats: Record<string, { total: number; ok: number; error: number; degraded: number }>;
}

// =============================================================
// Small style helpers（minimal）
// =============================================================

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--pos)",
  degraded: "var(--warn)",
  error: "var(--neg)",
  skipped: "var(--ink-meta)",
};

const CHECK_GLYPH: Record<string, string> = {
  pass: "✅ 通过",
  fail: "❌ 命中",
  evidence_missing: "⚠️ 证据缺失",
  not_applicable: "– 不适用",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0 6px",
        borderRadius: 3,
        fontSize: "12px",
        fontWeight: 600,
        color: STATUS_COLOR[status] ?? "var(--ink)",
        border: `1px solid ${STATUS_COLOR[status] ?? "var(--line-strong)"}`,
        backgroundColor: "transparent",
      }}
    >
      {status}
    </span>
  );
}

// =============================================================
// Key payload summary（Special Diagnostic Visibility，按事件类型）
// =============================================================

function keyPayloadSummary(e: TraceEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.event_type) {
    case "request.received":
      return String(p.input_summary ?? "").slice(0, 120);
    case "routing.decided":
      return `intent=${String(p.intent_decision ?? "?")}${p.reject_reason ? ` reject=${String(p.reject_reason)}` : ""}`;
    case "state.read":
      return `entity=${String(p.entity ?? "?")}${p.state_not_found ? " state_not_found=true" : ""}`;
    case "retrieval.executed":
      return `query_raw=${String(p.query_raw ?? "?")} → normalized=${String(p.query_normalized ?? "?")} | ids=${Array.isArray(p.knowledge_object_ids) ? (p.knowledge_object_ids as unknown[]).length : "?"}${
        p.knowledge_miss_flag ? " miss=true" : ""
      }${p.conflict_detected ? " conflict=true" : ""}`;
    case "llm.attempt":
      return `${String(p.attempt_purpose ?? "?")} | ${String(p.provider ?? "?")}/${String(p.model_name ?? "?")} | ${String(p.prompt_key ?? "?")}@${String(p.prompt_version ?? "?")}${
        e.error_code ? ` | error=${e.error_code}` : ""
      }`;
    case "validation.result":
      return `validator=${String(p.validator ?? "?")} outcome=${String(p.outcome ?? "?")} repair_attempts=${String(p.repair_attempts ?? 0)}${
        p.quality_gate_scores ? ` gates=${JSON.stringify(p.quality_gate_scores)}` : ""
      }${p.band_leakage_flag ? " band_leakage=true" : ""}`;
    case "fallback.triggered":
      return `trigger=${String(p.trigger_error_code ?? "?")} to_kind=${String(p.to_kind ?? "?")} chain=${Array.isArray(p.chain_snapshot)
        ? (p.chain_snapshot as Array<{ step: string; status: string }>).map((s) => `${s.step}:${s.status}`).join(",")
        : "?"}`;
    case "rule.applied":
      return `rule_key=${String(p.rule_key ?? "?")}${p.llm_call_count !== undefined ? ` llm_call_count=${String(p.llm_call_count)}` : ""}${
        p.outputs ? ` outputs=${JSON.stringify(p.outputs).slice(0, 80)}` : ""
      }`;
    case "state.write":
      return `entity=${String(p.entity ?? "?")} idempotency_outcome=${String(p.idempotency_outcome ?? "?")}${
        p.client_event_id ? ` client_event_id=${String(p.client_event_id)}` : ""
      }`;
    case "report.aggregated":
      return `insufficient_data=${String(p.insufficient_data_flag ?? "?")} summary_generated=${String(p.summary_generated ?? "?")} checksum=${String(p.aggregate_checksum ?? "?").slice(0, 16)}`;
    case "response.sent":
      return `http=${String(p.http_status ?? "?")} app_error_code=${String(p.app_error_code ?? "<null>")} fallback_used=${String(p.fallback_used_flag ?? false)}`;
    default:
      return JSON.stringify(p).slice(0, 120);
  }
}

// =============================================================
// A. Trace Summary
// =============================================================

function TraceSummary({ trace }: { trace: FullTrace }) {
  const h = trace.header;
  const rows: Array<[string, string]> = [
    ["route", h.route],
    ["http_status", String(h.http_status ?? "?")],
    ["app_error_code", h.app_error_code ?? "<null>"],
    ["latency_ms", String(h.latency_ms ?? "?")],
    ["degradation_flag", String(h.degradation_flag)],
    ["started_at", h.started_at],
    ["event_count", String(h.event_count)],
    ["client_event_id", h.client_event_id ?? "<null>"],
    ["user_hash", h.user_hash ?? "<null>"],
  ];
  return (
    <section aria-label="Trace Summary">
      <h2 style={{ fontSize: "16px", marginBottom: 8 }}>A. Trace Summary</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "3px 8px", color: "var(--ink-meta)", width: 180 }}>{k}</td>
              <td style={{ padding: "3px 8px", fontFamily: "ui-monospace, monospace" }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// =============================================================
// B. Event Timeline
// =============================================================

function EventTimeline({
  trace,
  expandedSeqs,
  onToggle,
}: {
  trace: FullTrace;
  expandedSeqs: Set<number>;
  onToggle: (seq: number) => void;
}) {
  const llmCount = trace.events.filter((e) => e.event_type === "llm.attempt").length;
  return (
    <section aria-label="Event Timeline">
      <h2 style={{ fontSize: "16px", marginBottom: 8 }}>
        B. Event Timeline <span style={{ color: "var(--ink-meta)", fontSize: 12 }}>（llm_call_count={llmCount}）</span>
      </h2>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--ink-meta)", borderBottom: "1px solid var(--line-strong)" }}>
            <th style={{ padding: "4px 8px" }}>seq</th>
            <th style={{ padding: "4px 8px" }}>event_type</th>
            <th style={{ padding: "4px 8px" }}>layer</th>
            <th style={{ padding: "4px 8px" }}>status</th>
            <th style={{ padding: "4px 8px" }}>duration_ms</th>
            <th style={{ padding: "4px 8px" }}>关键 payload 摘要</th>
            <th style={{ padding: "4px 8px" }}></th>
          </tr>
        </thead>
        <tbody>
          {trace.events.map((e) => {
            const expanded = expandedSeqs.has(e.seq);
            return (
              <Fragment key={e.seq}>
                <tr
                  onClick={() => onToggle(e.seq)}
                  style={{
                    borderBottom: "1px solid var(--line)",
                    cursor: "pointer",
                    backgroundColor: expanded ? "var(--accent-wash)" : undefined,
                  }}
                >
                  <td style={{ padding: "4px 8px", color: "var(--ink-meta)" }}>{e.seq}</td>
                  <td style={{ padding: "4px 8px", fontFamily: "ui-monospace, monospace" }}>{e.event_type}</td>
                  <td style={{ padding: "4px 8px", color: "var(--ink-meta)" }}>{e.layer}</td>
                  <td style={{ padding: "4px 8px" }}>
                    <StatusBadge status={e.status} />
                  </td>
                  <td style={{ padding: "4px 8px" }}>{e.duration_ms ?? "–"}</td>
                  <td style={{ padding: "4px 8px", maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {keyPayloadSummary(e)}
                  </td>
                  <td style={{ padding: "4px 8px", color: "var(--ink-meta)" }}>{expanded ? "▲ 收起" : "▼ 展开"}</td>
                </tr>
                {expanded && (
                  <tr key={`${e.seq}-payload`}>
                    <td colSpan={7} style={{ padding: "8px", backgroundColor: "var(--paper-2)" }}>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "12px",
                          maxHeight: 320,
                          overflow: "auto",
                        }}
                      >
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                      <p style={{ fontSize: 11, color: "var(--ink-meta)", marginTop: 4 }}>
                        payload 已按 M2 Contract §3 脱敏策略存储（input_summary 截断 / raw_output head+tail / 不存 API Key）
                        {e.error_code ? ` · error_code=${e.error_code}` : ""}
                        {e.error_message ? ` · error_message=${e.error_message}` : ""}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// =============================================================
// C. Failure Layer Diagnosis
// =============================================================

function DiagnosisPanel({ diagnosis }: { diagnosis: DiagnosisResult }) {
  const primary = diagnosis.primary_suspect_layer;
  const isUnknown = primary === "UNKNOWN";
  return (
    <section aria-label="Failure Layer Diagnosis">
      <h2 style={{ fontSize: "16px", marginBottom: 8 }}>C. Failure Layer Diagnosis（§4.4 瀑布，确定性规则，无 LLM 猜测）</h2>
      <div
        style={{
          border: `1px solid ${isUnknown ? "var(--line-strong)" : "var(--neg)"}`,
          borderRadius: 6,
          padding: "10px 12px",
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "15px" }}>
          PRIMARY_SUSPECT_LAYER = <span style={{ color: isUnknown ? "var(--ink)" : "var(--neg)" }}>{primary}</span>
        </div>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "13px" }}>
          {diagnosis.evidence.map((line, i) => (
            <li key={i} style={{ fontFamily: "ui-monospace, monospace", marginBottom: 2 }}>
              {line}
            </li>
          ))}
        </ul>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12.5px" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--ink-meta)", borderBottom: "1px solid var(--line-strong)" }}>
            <th style={{ padding: "3px 6px" }}>#</th>
            <th style={{ padding: "3px 6px" }}>Layer</th>
            <th style={{ padding: "3px 6px" }}>§4.4 证据规则</th>
            <th style={{ padding: "3px 6px" }}>结果</th>
            <th style={{ padding: "3px 6px" }}>证据</th>
          </tr>
        </thead>
        <tbody>
          {diagnosis.checks.map((c) => (
            <tr key={c.checkId} style={{ borderBottom: "1px solid var(--line)", verticalAlign: "top" }}>
              <td style={{ padding: "3px 6px", color: "var(--ink-meta)" }}>{c.checkId}</td>
              <td style={{ padding: "3px 6px", fontWeight: 600 }}>{c.layer}</td>
              <td style={{ padding: "3px 6px", color: "var(--ink-meta)" }}>{c.evidenceRule}</td>
              <td style={{ padding: "3px 6px" }}>{CHECK_GLYPH[c.status] ?? c.status}</td>
              <td style={{ padding: "3px 6px", fontFamily: "ui-monospace, monospace", maxWidth: 460 }}>
                {c.evidence.map((s, i) => (
                  <div key={i} style={{ wordBreak: "break-all" }}>
                    {s}
                    {c.status === "fail" && c.eventSeqs[i] !== undefined ? ` → seq${c.eventSeqs[i]}` : ""}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// =============================================================
// D. Relevant Correlations（最小版）
// =============================================================

function Correlations({
  trace,
  onLoad,
}: {
  trace: FullTrace;
  onLoad: (traceId: string) => void;
}) {
  const [related, setRelated] = useState<ListResponse | null>(null);
  const [byEvent, setByEvent] = useState<TraceSummaryRow[]>([]);
  const [byUser, setByUser] = useState<TraceSummaryRow[]>([]);

  const h = trace.header;
  const clientEventId = h.client_event_id;
  const userHash = h.user_hash;
  const promptVersions = useMemo(() => {
    const s = new Set<string>();
    for (const e of trace.events) {
      if (e.event_type === "llm.attempt") {
        const v = String(e.payload.prompt_version ?? "");
        if (v) s.add(v);
      }
    }
    return [...s];
  }, [trace]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRelated(null);
      setByEvent([]);
      setByUser([]);
      const [listRes, byEventRes, byUserRes] = await Promise.all([
        fetch("/api/debug/traces?limit=50").then((r) => r.json() as Promise<ListResponse>),
        clientEventId
          ? fetch(`/api/debug/traces?client_event_id=${encodeURIComponent(clientEventId)}&limit=50`).then(
              (r) => r.json() as Promise<ListResponse>,
            )
          : Promise.resolve(null),
        userHash
          ? fetch(`/api/debug/traces?user_hash=${encodeURIComponent(userHash)}&limit=50`).then(
              (r) => r.json() as Promise<ListResponse>,
            )
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setRelated(listRes);
      setByEvent(byEventRes?.traces ?? []);
      setByUser(byUserRes?.traces ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientEventId, userHash, trace.header.trace_id]);

  const statsRows = related
    ? Object.entries(related.prompt_version_stats).map(([version, s]) => (
        <tr key={version} style={{ borderBottom: "1px solid var(--line)" }}>
          <td style={{ padding: "3px 8px", fontFamily: "ui-monospace, monospace" }}>{version}</td>
          <td style={{ padding: "3px 8px" }}>{s.total}</td>
          <td style={{ padding: "3px 8px", color: "var(--pos)" }}>{s.ok}</td>
          <td style={{ padding: "3px 8px", color: "var(--warn)" }}>{s.degraded}</td>
          <td style={{ padding: "3px 8px", color: "var(--neg)" }}>{s.error}</td>
        </tr>
      ))
    : [];

  const renderTraceList = (rows: TraceSummaryRow[], title: string) =>
    rows.length > 0 ? (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: "13px" }}>{title}</div>
        {rows.map((r) => (
          <div
            key={r.trace_id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "3px 0",
              borderBottom: "1px solid var(--line)",
              fontSize: "12.5px",
            }}
          >
            <span style={{ fontFamily: "ui-monospace, monospace" }}>{r.trace_id}</span>
            <span style={{ color: "var(--ink-meta)" }}>{r.route}</span>
            <span>http={r.http_status ?? "?"}</span>
            {r.degradation_flag ? <span style={{ color: "var(--warn)" }}>degraded</span> : null}
            <button
              onClick={() => onLoad(r.trace_id)}
              style={{ marginLeft: "auto", cursor: "pointer", fontSize: "12px" }}
            >
              查看
            </button>
          </div>
        ))}
      </div>
    ) : null;

  return (
    <section aria-label="Relevant Correlations">
      <h2 style={{ fontSize: "16px", marginBottom: 8 }}>D. Relevant Correlations（最小版）</h2>
      {renderTraceList(byEvent, `同 client_event_id（${clientEventId ?? "<null>"}）的关联 trace`)}
      {renderTraceList(byUser, `同 user_hash（${userHash ?? "<null>"}）的近期 trace`)}
      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: "13px" }}>
        prompt_version 分布（store 内全部 trace）
      </div>
      <table style={{ borderCollapse: "collapse", fontSize: "12.5px", marginBottom: 8 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--ink-meta)" }}>
            <th style={{ padding: "3px 8px" }}>prompt_version</th>
            <th style={{ padding: "3px 8px" }}>total</th>
            <th style={{ padding: "3px 8px" }}>ok</th>
            <th style={{ padding: "3px 8px" }}>degraded</th>
            <th style={{ padding: "3px 8px" }}>error</th>
          </tr>
        </thead>
        <tbody>
          {statsRows.length > 0 ? (
            statsRows
          ) : (
            <tr>
              <td colSpan={5} style={{ padding: "3px 8px", color: "var(--ink-meta)" }}>
                暂无 llm.attempt 事件
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {promptVersions.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-meta)" }}>
          本 trace 使用的 prompt_version：{promptVersions.join(", ")}
        </p>
      )}
    </section>
  );
}

// =============================================================
// Main client
// =============================================================

export function TraceConsoleClient({
  initialTraceId,
  fixtures,
}: {
  initialTraceId: string;
  fixtures: DebugFixtureMeta[];
}) {
  const [inputValue, setInputValue] = useState(initialTraceId);
  const [trace, setTrace] = useState<FullTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSeqs, setExpandedSeqs] = useState<Set<number>>(new Set());

  const loadTrace = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/debug/traces/${encodeURIComponent(trimmed)}`);
      const body = await res.json();
      if (!res.ok) {
        setTrace(null);
        setError(`获取失败 (${res.status})：${body.error ?? JSON.stringify(body)}`);
      } else {
        setTrace(body as FullTrace);
      }
    } catch (e) {
      setTrace(null);
      setError(`请求异常：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialTraceId) void loadTrace(initialTraceId);
  }, [initialTraceId, loadTrace]);

  const diagnosis = useMemo(() => (trace ? runDiagnosis(trace) : null), [trace]);

  const toggleSeq = useCallback((seq: number) => {
    setExpandedSeqs((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  }, []);

  const loadFixture = useCallback(
    (id: string) => {
      setInputValue(id);
      void loadTrace(id);
    },
    [loadTrace],
  );

  return (
    <div>
      {/* 查询入口 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const id = inputValue.trim();
          void loadTrace(id);
        }}
        style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}
      >
        <label htmlFor="trace_id" style={{ fontWeight: 600 }}>
          trace_id
        </label>
        <input
          id="trace_id"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="例如 trc_m2a_normal"
          style={{
            minWidth: 260,
            padding: "6px 8px",
            border: "1px solid var(--line-strong)",
            borderRadius: 4,
            fontFamily: "ui-monospace, monospace",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: "6px 14px", cursor: "pointer", borderRadius: 4, border: "1px solid var(--line-strong)", fontWeight: 600 }}
        >
          {loading ? "加载中…" : "查询"}
        </button>
      </form>

      {/* Fixture 快捷加载（内部便利） */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ color: "var(--ink-meta)", fontSize: 12, marginRight: 8 }}>Fixtures：</span>
        {fixtures.map((f) => (
          <button
            key={f.traceId}
            onClick={() => loadFixture(f.traceId)}
            title={f.description}
            style={{
              marginRight: 6,
              marginBottom: 4,
              padding: "3px 8px",
              fontSize: 12,
              cursor: "pointer",
              borderRadius: 4,
              border: "1px solid var(--line-strong)",
              backgroundColor: "transparent",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: "var(--neg)", border: "1px solid var(--neg)", padding: "8px 10px", borderRadius: 4, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {trace && diagnosis && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <TraceSummary trace={trace} />
          <EventTimeline trace={trace} expandedSeqs={expandedSeqs} onToggle={toggleSeq} />
          <DiagnosisPanel diagnosis={diagnosis} />
          <Correlations trace={trace} onLoad={loadFixture} />
        </div>
      )}

      {!trace && !error && (
        <p style={{ color: "var(--ink-meta)" }}>
          输入 trace_id 或点击上方 Fixture 快捷加载。trace_id 可从 API 响应头 x-trace-id 获取。
        </p>
      )}
    </div>
  );
}
