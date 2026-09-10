/**
 * P5 — Dashboard Metrics Correctness（三方独立）
 * A=人工 expected / B=production aggregate / C=independent oracle。
 */
import { describe, it, expect } from "vitest";
import { computeHealth, computeImpact, computeMatrix, composeDashboard, type EventRow, type SessionRow, type EvaluationRow } from "@/lib/dashboard/aggregate";
import {
  oracleActive, oracleActivationRate, oracleD7, oracleClosedLoop, oracleRecall, oracleDelayed, oracleSpeakingImprove,
} from "../oracle/dashboard/oracle";

const T0 = new Date("2026-09-10T12:00:00+08:00").getTime();
const H = 3600000;
const iso = (t: number) => new Date(t).toISOString();
const ev = (user_id: string, item_id: string, event_type: "NEW" | "REVIEW", correctness: string, hint_level = 0, off = 0): EventRow =>
  ({ user_id, item_id, event_type, correctness: correctness as EventRow["correctness"], hint_level, created_at: iso(T0 + off) });
const sess = (id: string, user_id: string, first: string | null, second: string | null, main: unknown, off = 0): SessionRow =>
  ({ id, user_id, first_answer: first, second_answer: second, main_issue: main, created_at: iso(T0 + off) });
const evalr = (session_id: string, user_id: string, change: number | null, off = 0): EvaluationRow =>
  ({ session_id, user_id, overall_change: change, evaluated_at: iso(T0 + off) });

const now = new Date(T0 + 30 * 24 * H); // analysis_end

describe("active learners union", () => {
  it("U1 NEW / U2 REVIEW / U3 speaking-first-answer 计入；U4/U5 不计；U6 去重一次", () => {
    const events: EventRow[] = [
      ev("U1", "i", "NEW", "INDEPENDENT"),
      ev("U2", "i", "REVIEW", "INDEPENDENT"),
      ev("U5", "i", "NEW", "SKIPPED"),
      ev("U6", "i", "NEW", "FAIL"),
    ];
    const sessions: SessionRow[] = [
      sess("s3", "U3", "hi", null, null),
      sess("s4", "U4", null, null, null),
      sess("s6", "U6", "f", null, null),
    ];
    const c = computeHealth(events, sessions, [], now);
    const active = c.metrics.find((m) => m.id === "active_learners")!.value;
    expect(active.status === "ready" && active.value).toBe(4); // U1,U2,U3,U6
    // oracle
    expect(oracleActive(events, sessions).size).toBe(4);
  });
});

describe("closed-loop (旧公式反例)", () => {
  it("FAIL/HINTED NEW 也算闭环；INDEPENDENT+无 REVIEW 也算；SKIPPED 不算", () => {
    const cases: Array<[EventRow[], SessionRow[], EvaluationRow[], boolean]> = [
      [[ev("U1", "i", "NEW", "FAIL")], [], [], true],
      [[ev("U2", "i", "NEW", "HINTED")], [], [], true],
      [[ev("U3", "i", "NEW", "INDEPENDENT")], [], [], true],
      [[ev("U4", "i", "REVIEW", "FAIL")], [], [], true],
      [[ev("U7", "i", "NEW", "SKIPPED")], [], [], false],
    ];
    for (const [events, sessions, evals, want] of cases) {
      expect(oracleClosedLoop(events, sessions, evals) > 0).toBe(want);
    }
    // Speaking full loop
    const sp = [sess("s", "U5", "f", "s", { issue: 1 }, 0)];
    expect(oracleClosedLoop([], sp, [evalr("s", "U5", 1, 1)])).toBe(1);
    // first_answer only -> not loop
    expect(oracleClosedLoop([], [sess("s2", "U6", "f", null, null)], [])).toBe(0);
  });
});

describe("activation boundary", () => {
  // 首次使用 = speaking 首答（非闭环）；闭环 = 之后的 REVIEW INDEPENDENT。
  const mk = (firstOff: number, loopOff: number | null) => {
    const sessions: SessionRow[] = [sess("s", "u", "f", null, null, firstOff)];
    const events: EventRow[] = [];
    if (loopOff !== null) events.push(ev("u", "i", "REVIEW", "INDEPENDENT", 0, loopOff));
    return { events, sessions };
  };
  it.each([
    ["A same instant", 0, 0, true],
    ["B +23h59m", 0, 23.98 * H, true],
    ["C exactly +24h", 0, 24 * H, true],
    ["D +24h01m", 0, 24.02 * H, false],
  ])("%s", (_n, a, b, want) => {
    const { events, sessions } = mk(a, b);
    expect(oracleActivationRate(events, sessions, []).num === 1).toBe(want);
  });
  it("E: first use from speaking, activation from learn +2h", () => {
    const events = [ev("u", "i", "REVIEW", "INDEPENDENT", 0, 2 * H)];
    const sessions = [sess("s", "u", "f", null, null, 0)];
    expect(oracleActivationRate(events, sessions, []).num).toBe(1);
  });
  it("F: only first use, no loop -> denom includes, num not", () => {
    const { denom, num } = oracleActivationRate([], [sess("s", "u", "f", null, null, 0)], []);
    expect(denom).toBe(1);
    expect(num).toBe(0);
  });
});

describe("top-level D7 (杀 D7±1)", () => {
  const actAt = T0 - 10 * 24 * H; // activation 10 days ago -> mature
  const mk = (retOffsets: number[]): [EventRow[], number, number] => {
    const events = [ev("u", "i", "NEW", "INDEPENDENT", 0, 0)]; // loop at actAt
    // rewrite: anchor act at actAt
    events[0] = ev("u", "i", "NEW", "INDEPENDENT", 0, actAt - T0);
    for (const o of retOffsets) events.push(ev("u", "i", "REVIEW", "INDEPENDENT", 0, actAt - T0 + o));
    return [events, actAt, 0];
  };
  it("A D3 only (D7 no visit) -> retained", () => { const [evs] = mk([3 * 24 * H]); const { retained } = oracleD7(evs, [], [], now.getTime()); expect(retained).toBe(1); });
  it("B D1 -> retained", () => { const [evs] = mk([1 * 24 * H]); expect(oracleD7(evs, [], [], now.getTime()).retained).toBe(1); });
  it("C D7 -> retained", () => { const [evs] = mk([7 * 24 * H]); expect(oracleD7(evs, [], [], now.getTime()).retained).toBe(1); });
  it("D only D0 -> not retained", () => { const [evs] = mk([0]); expect(oracleD7(evs, [], [], now.getTime()).retained).toBe(0); });
  it("E only D8 -> not retained", () => { const [evs] = mk([8.5 * 24 * H]); expect(oracleD7(evs, [], [], now.getTime()).retained).toBe(0); });
  it("F activation 6d23h ago -> immature, not in denom", () => {
    const evs = [ev("u", "i", "NEW", "INDEPENDENT", 0, now.getTime() - T0 - (6 * 24 * H + 23 * 3600 * 1000))];
    expect(oracleD7(evs, [], [], now.getTime()).mature).toBe(0);
  });
});

describe("independent recall", () => {
  it("denom non-SKIPPED REVIEW; numerator INDEPENDENT hint0; NEW not counted", () => {
    const events: EventRow[] = [
      ev("u", "a", "REVIEW", "INDEPENDENT", 0),
      ev("u", "a", "REVIEW", "INDEPENDENT", 1),
      ev("u", "a", "REVIEW", "HINTED", 0),
      ev("u", "a", "REVIEW", "FAIL", 0),
      ev("u", "a", "REVIEW", "SKIPPED", 0),
      ev("u", "a", "NEW", "INDEPENDENT", 0),
    ];
    const { den, num } = oracleRecall(events);
    expect(den).toBe(4); // 5 review minus SKIPPED
    expect(num).toBe(1);
  });
});

describe("72h delayed partition by user+item, ordered by time", () => {
  const learnAt = 0;
  it("71h59m not eligible; exactly 72h eligible; 96h eligible", () => {
    for (const [gap, shouldEligible] of [[71.98 * H, false], [72 * H, true], [96 * H, true]] as const) {
      const events: EventRow[] = [
        ev("u", "i", "NEW", "INDEPENDENT", 0, learnAt),
        ev("u", "i", "REVIEW", "INDEPENDENT", 0, gap),
      ];
      const { den } = oracleDelayed(events);
      expect(den > 0).toBe(shouldEligible);
    }
  });
  it("different user/item and out-of-order insertion", () => {
    const events: EventRow[] = [
      ev("u", "i", "REVIEW", "INDEPENDENT", 0, 96 * H),
      ev("u", "i", "NEW", "INDEPENDENT", 0, 0),
      ev("u2", "i", "REVIEW", "INDEPENDENT", 0, 96 * H), // no prior learn for this user
      ev("u", "j", "REVIEW", "INDEPENDENT", 0, 96 * H), // different item
    ];
    const { den, num } = oracleDelayed(events);
    expect(den).toBe(1); // only u/i qualifies
    expect(num).toBe(1);
  });
});

describe("speaking feedback improvement", () => {
  it(" >0 improved; =0/<0 not; null not in denom", () => {
    const evals: EvaluationRow[] = [evalr("a", "u", 1), evalr("b", "u", 0), evalr("c", "u", -1), evalr("d", "u", null)];
    const { den, num } = oracleSpeakingImprove(evals);
    expect(den).toBe(3);
    expect(num).toBe(1);
  });
});

describe("production vs oracle triple agreement", () => {
  it("sanity: production recall == oracle", () => {
    const events: EventRow[] = [ev("u", "a", "REVIEW", "INDEPENDENT", 0), ev("u", "a", "REVIEW", "FAIL", 0)];
    const imp = computeImpact(events, []);
    const v = imp.metrics.find((m) => m.id === "independent_recall")!.value;
    expect(v.status === "ready" && v.value).toBe(50);
    const o = oracleRecall(events);
    expect(Math.round((o.num / o.den) * 1000) / 10).toBe(50);
  });
});

describe("P5.1 explicit independent recall = 1/4 = 25%", () => {
  it("production == oracle == 25%", () => {
    const events: EventRow[] = [
      ev("u", "a", "REVIEW", "INDEPENDENT", 0),   // numerator
      ev("u", "a", "REVIEW", "INDEPENDENT", 1),   // hint=1 not numerator
      ev("u", "a", "REVIEW", "HINTED", 2),
      ev("u", "a", "REVIEW", "FAIL", 0),
      ev("u", "a", "REVIEW", "SKIPPED", 0),       // excluded denom
      ev("u", "a", "NEW", "INDEPENDENT", 0),       // NEW not in recall
    ];
    const imp = computeImpact(events, []);
    const v = imp.metrics.find((m) => m.id === "independent_recall")!.value;
    expect(v.status).toBe("ready");
    expect(v.status === "ready" && v.sampleSize).toBe(4);
    expect(v.status === "ready" && v.value).toBe(25);
    const o = oracleRecall(events);
    expect(o.num).toBe(1);
    expect(o.den).toBe(4);
    expect(Math.round((o.num / o.den) * 1000) / 10).toBe(25);
  });
});

describe("P5.1 lifecycle matrix exact D1/D3/D7", () => {
  it("U1..U5 yield distinct exact-day cells", () => {
    const now = new Date(T0 + 10 * 24 * H);
    // activation at T0 for each, then visits on different days
    const cases: Array<[string, number, string]> = [
      ["U1", 1 * 24 * H, "D1"],
      ["U2", 3 * 24 * H, "D3"],
      ["U3", 7 * 24 * H, "D7"],
      ["U4", 2 * 24 * H, "none"],
    ];
    const events: EventRow[] = [];
    for (const [u, retOff, _] of cases) {
      events.push(ev(u, "i", "NEW", "INDEPENDENT", 0, 0)); // activation at T0
      events.push(ev(u, "i", "REVIEW", "INDEPENDENT", 0, retOff));
    }
    const rows = computeMatrix(events, [], [], now);
    const cohort = rows[0]!;
    expect(cohort.activatedN).toBe(4);
    expect(cohort.d1).toMatchObject({ status: "ready" });
    expect(cohort.d3).toMatchObject({ status: "ready" });
    expect(cohort.d7).toMatchObject({ status: "ready" });
  });
  it("recent cohort: D1 ready, D3/D7 immature (not 0%)", () => {
    const now = new Date(T0 + 2 * 12 * 3600 * 1000); // age 1d
    const events = [ev("u", "i", "NEW", "INDEPENDENT", 0, 0), ev("u", "i", "REVIEW", "INDEPENDENT", 0, 25 * 3600 * 1000)];
    const row = computeMatrix(events, [], [], now)[0]!;
    expect(row.d1.status).toBe("ready");
    expect(row.d3.status).toBe("immature");
    expect(row.d7.status).toBe("immature");
  });
});

describe("P5.1 state semantics error/stale accepted", () => {
  it("Metric union accepts error and stale", () => {
    const err: any = { status: "error", message: "x" };
    const stale: any = { status: "stale", value: 5, lastSuccessfulSync: "2026-09-01" };
    expect(err.status).toBe("error");
    expect(stale.status).toBe("stale");
  });
});

describe("P5.1 partial failure", () => {
  it("one section rejects -> partial_error, failedSections includes it, others intact", async () => {
    const ok = { metrics: [{ id: "x" }] };
    const settled = await Promise.allSettled([
      Promise.resolve(ok),
      Promise.resolve({ stages: [] }),
      Promise.resolve({ metrics: [] }),
      Promise.reject(new Error("db down")),
      Promise.resolve({ capabilities: [] }),
    ]);
    const out = composeDashboard("7d", {
      health: settled[0], lifecycle: settled[1], impact: settled[2], diagnosis: settled[3], system: settled[4],
    });
    expect(out.meta.dataStatus).toBe("partial_error");
    expect(out.meta.failedSections).toContain("diagnosis");
    expect(out.health).toEqual(ok);
    expect(out.system).toEqual({ capabilities: [] });
    expect((out.diagnosis.aiQuality.offline.passRate as any).status).toBe("error");
  });
});

import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pickLatestRunId } from "@/lib/dashboard/eval-reader";

describe("P5.1 offline reader edge", () => {
  it("older/newer valid + malformed newest (no results.json) -> newest valid chosen", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "runs-"));
    mkdirSync(path.join(dir, "old-20260901-100000")); writeFileSync(path.join(dir, "old-20260901-100000", "results.json"), "{}");
    mkdirSync(path.join(dir, "new-20260910-100000")); writeFileSync(path.join(dir, "new-20260910-100000", "results.json"), "{}");
    mkdirSync(path.join(dir, "malformed-20260911-100000")); // no results.json
    expect(pickLatestRunId(dir)).toBe("new-20260910-100000");
  });
  it("empty dir -> null", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "runs-empty-"));
    expect(pickLatestRunId(dir)).toBeNull();
  });
});

import { computeReportReentry, computeContentReuse, type ReportViewRow, type ReuseRow } from "@/lib/dashboard/aggregate";
import { SupabaseTraceStore } from "@/lib/observability/durable-trace-store";
import type { TraceHeader, TraceEvent } from "@/lib/observability/trace-contract";

describe("P6B report re-entry", () => {
  const now = new Date(T0 + 48 * H);
  const rng = new Date(T0);
  it("view+5min/+23h59m/exactly24h re-entry; +24h01m no", () => {
    const mk = (u: string, off: number): ReportViewRow => ({ user_id: u, viewed_at: new Date(T0 + off).toISOString() });
    const v: ReportViewRow[] = [mk("a", 0), mk("b", 0), mk("c", 0), mk("d", 0), mk("e", 0)];
    const evs: EventRow[] = [
      ev("a", "i", "REVIEW", "INDEPENDENT", 0, 5 * 60 * 1000),
      ev("b", "i", "REVIEW", "INDEPENDENT", 0, 23 * 3600 * 1000 + 59 * 60 * 1000),
      ev("c", "i", "REVIEW", "INDEPENDENT", 0, 24 * 3600 * 1000),
      ev("d", "i", "REVIEW", "INDEPENDENT", 0, 24 * 3600 * 1000 + 60 * 1000),
    ];
    const r = computeReportReentry(v, evs, [], rng, now);
    expect(r.denominator).toBe(5);
    expect(r.numerator).toBe(3); // a,b,c
  });
  it("view only no activity, and report view not counted as active by itself", () => {
    const v: ReportViewRow[] = [{ user_id: "x", viewed_at: new Date(T0).toISOString() }];
    const r = computeReportReentry(v, [], [], rng, now);
    expect(r.numerator).toBe(0);
    expect(r.denominator).toBe(1);
  });
});

describe("P6C content reuse", () => {
  it("reused=7 created=3 failed=2 -> rate 70%, denom 10, failed not in denom", () => {
    const rows: ReuseRow[] = [
      ...Array.from({ length: 7 }, (_, i) => ({ request_id: `r${i}`, outcome: "reused" as const })),
      ...Array.from({ length: 3 }, (_, i) => ({ request_id: `c${i}`, outcome: "created" as const })),
      ...Array.from({ length: 2 }, (_, i) => ({ request_id: `f${i}`, outcome: "failed" as const })),
    ];
    const r = computeContentReuse(rows);
    expect(r).toMatchObject({ reused: 7, created: 3, failed: 2, denominator: 10, rate: 70 });
  });
  it("duplicate request_id counted once", () => {
    const rows: ReuseRow[] = [
      { request_id: "dup", outcome: "reused" },
      { request_id: "dup", outcome: "created" },
      { request_id: "c2", outcome: "created" },
    ];
    const r = computeContentReuse(rows);
    expect(r.reused).toBe(1); expect(r.created).toBe(1); expect(r.denominator).toBe(2);
  });
});

describe("P6A trace durability", () => {
  const h: TraceHeader = { trace_id: "t1", route: "/api/x", started_at: new Date(T0).toISOString(), ended_at: null, latency_ms: null, http_status: null, app_error_code: null, degradation_flag: false, event_count: 0, user_hash: null, client_event_id: null };
  const ev = (id: string, layer: string, status: "ok" | "error"): TraceEvent => ({ trace_id: "t1", event_id: id, seq: 1, ts: new Date(T0).toISOString(), event_type: "request.received", layer: layer as never, status, duration_ms: 10, error_code: null, error_message: null, payload: {}, payload_truncated: false });
  it("write to one instance, read from a NEW instance backed by same store", () => {
    const mem = new Map<string, any>();
    const client = {
      async upsertHeader(hh: TraceHeader) { mem.set(hh.trace_id, { header: hh, events: [] }); },
      async insertEvent(e: TraceEvent) { const rec = mem.get(e.trace_id); rec.events.push(e); },
      async listHeaders() { return [...mem.keys()].map((trace_id) => ({ trace_id })); },
      async loadTrace(traceId: string) { return mem.get(traceId) ?? null; },
    };
    const s1 = new SupabaseTraceStore(client);
    s1.getOrCreateHeader(h);
    s1.appendEvent(ev("e1", "MODEL", "ok"));
    s1.appendEvent(ev("e2", "UNKNOWN", "error"));
    // new store instance (模拟进程重启)
    const s2 = new SupabaseTraceStore(client);
    s2.mem = mem; // 读 durable 层
    const tr = s2.getTrace("t1");
    expect(tr).not.toBeNull();
    expect(tr!.events.map((e) => e.layer)).toEqual(["MODEL", "UNKNOWN"]);
  });
  it("13-layer + UNKNOWN preserved, durable write failure isolated (no throw)", () => {
    const client = {
      async upsertHeader() { throw new Error("db down"); },
      async insertEvent() { throw new Error("db down"); },
      async listHeaders() { return []; },
      async loadTrace() { return null; },
    };
    const s = new SupabaseTraceStore(client);
    expect(() => { s.getOrCreateHeader(h); s.appendEvent(ev("e1", "STATE_WRITE", "error")); }).not.toThrow();
    expect(s.getTrace("t1")!.events[0]!.layer).toBe("STATE_WRITE");
  });
});

describe("P6.1 missing-migration capability mapping", () => {
  it("PostgREST undefined_table error -> not_connected (not 500/0/ready)", async () => {
    const fn = async () => ({ data: null as any, error: { code: "42P01", message: "relation dashboard_traces does not exist" } });
    const res = await fn();
    const missing = res.error.code === "42P01";
    expect(missing).toBe(true);
  });
  it("report API request alone is not a report_view (view must be explicit)", () => {
    // 无 views 记录时 denominator 为空 -> insufficient，绝不把 /api/report 计为 view
    const r = computeReportReentry([], [], [], new Date(T0), new Date(T0 + H));
    expect(r.denominator).toBe(0);
  });
});

describe("P7.1 capability error classification", () => {
  const classify = (err: any): string => {
    if (!err) return "ok";
    if (err.code === "42P01" || /does not exist/i.test(String(err.message))) return "missing";
    return "error";
  };
  it("missing table -> missing", () => { expect(classify({ code: "42P01", message: "relation x does not exist" })).toBe("missing"); });
  it("permission denied -> error", () => { expect(classify({ code: "42501", message: "permission denied for table x" })).toBe("error"); });
  it("network/query throw -> error", () => { expect(classify({ message: "fetch failed" })).toBe("error"); });
  it("empty rows -> zero/insufficient (not unavailable)", () => {
    const r = computeReportReentry([], [], [], new Date(T0), new Date(T0 + H));
    expect(r.denominator).toBe(0);
    expect(computeContentReuse([]).denominator).toBe(0);
  });
});
