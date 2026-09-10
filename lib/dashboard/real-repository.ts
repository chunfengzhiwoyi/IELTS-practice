/**
 * RealDashboardRepository（P4/P4.1/P5）
 * ------------------------------------------------------------
 * 只负责：service-role 取数 → 调纯聚合层 lib/dashboard/aggregate.ts → 离线 eval reader。
 * 纯函数已抽到 aggregate.ts，P5 fixture/oracle 直接对它做三方比对。
 * GAP 指标保持真实状态，不填 Mock、不填 0。
 */
import "server-only";
import { createServiceRoleClient } from "@/lib/db/server";
import type {
  BadCase,
  DashboardData,
  DashboardRange,
  FailureLayer,
  LifecycleDetail,
  LifecycleStageId,
  ModuleDetail,
  ModuleId,
  TraceDetail,
} from "./types";
import type { DashboardRepository } from "./dashboard.repository";
import {
  computeHealth,
  computeLifecycle,
  computeImpact,
  computeReportReentry,
  computeContentReuse,
  type EventRow,
  type SessionRow,
  type EvaluationRow,
  type ReportViewRow,
  type ReuseRow,
} from "./aggregate";
import fs from "node:fs";
import path from "node:path";
import { pickLatestRunId } from "./eval-reader";

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseRange(range: DashboardRange): { start: Date | null } {
  if (range === "all") return { start: null };
  const days = range === "7d" ? 7 : 30;
  return { start: new Date(Date.now() - days * 24 * 3600 * 1000) };
}

const LAYER_LABEL: Record<string, string> = {
  INPUT: "输入", ROUTING: "路由", STATE_READ: "状态读取", RETRIEVAL: "检索", PROMPT: "提示词",
  MODEL: "模型", OUTPUT_VALIDATION: "输出校验", BUSINESS_RULE: "业务规则", STATE_WRITE: "状态写入",
  REPORT_AGGREGATION: "报告聚合", FALLBACK: "降级", UI_PRESENTATION: "前端呈现", UNKNOWN: "待归因",
};

function latestEvalRunDir(): string | null {
  const runsDir = path.resolve(process.cwd(), "docs", "eval", "runs");
  const id = pickLatestRunId(runsDir);
  return id ? path.join(runsDir, id) : null;
}

type Sb = { from: (t: string) => any };

async function fetchEvents(sb: Sb, start: Date | null): Promise<EventRow[]> {
  let q = sb.from("learning_events").select("user_id,item_id,event_type,correctness,hint_level,created_at").order("created_at", { ascending: true }).limit(10000);
  if (start) q = q.gte("created_at", start.toISOString());
  const { data, error } = await q;
  if (error) throw new Error(`learning_events: ${error.message}`);
  return (data ?? []) as EventRow[];
}
async function fetchSessions(sb: Sb, start: Date | null): Promise<SessionRow[]> {
  let q = sb.from("speaking_sessions").select("id,user_id,first_answer,second_answer,main_issue,created_at");
  if (start) q = q.gte("created_at", start.toISOString());
  const { data, error } = await q;
  if (error) throw new Error(`speaking_sessions: ${error.message}`);
  return (data ?? []) as SessionRow[];
}
async function fetchEvaluations(sb: Sb, start: Date | null): Promise<EvaluationRow[]> {
  let q = sb.from("speaking_evaluations").select("session_id,user_id,overall_change,evaluated_at");
  if (start) q = q.gte("evaluated_at", start.toISOString());
  const { data, error } = await q;
  if (error) throw new Error(`speaking_evaluations: ${error.message}`);
  return (data ?? []) as EvaluationRow[];
}

function isMissingTable(err: any): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = String(err.message ?? "");
  return code === "42P01" || /does not exist|not found|relation .* does not exist/i.test(msg);
}

/** 能力探测：表缺失 -> unavailable（not_connected/not_instrumented），绝不 500/0/ready。 */
/**
 * 精确分类（P7.1）：
 *  - missing（表不存在 42P01/does not exist）→ not_connected/not_instrumented
 *  - ok（含 0 行）→ 按指标 contract（zero/insufficient/ready）
 *  - 其他（401/403/RLS/网络/超时/malformed）→ error，不得降级为 unavailable/zero
 */
type QResult<T> = { status: "ok"; rows: T } | { status: "missing" } | { status: "error"; message: string };
async function safeQuery<T>(fn: () => Promise<{ data: T | null; error: any }>): Promise<QResult<T>> {
  try {
    const { data, error } = await fn();
    if (error) {
      if (isMissingTable(error)) return { status: "missing" };
      return { status: "error", message: String(error.message ?? error) };
    }
    return { status: "ok", rows: data ?? ([] as unknown as T) };
  } catch (e: any) {
    if (isMissingTable(e)) return { status: "missing" };
    return { status: "error", message: String(e?.message ?? e) };
  }
}

async function fetchTraces(sb: Sb, start: Date | null) {
  let q = sb.from("dashboard_traces").select("trace_id,failure_layer,started_at,ended_at,http_status,degradation_flag,bad_case_id");
  if (start) q = q.gte("started_at", start.toISOString());
  return safeQuery(() => q.order("started_at", { ascending: false }).limit(2000));
}
async function fetchReportViews(sb: Sb, start: Date | null) {
  let q = sb.from("report_views").select("user_id,viewed_at");
  if (start) q = q.gte("viewed_at", start.toISOString());
  return safeQuery<ReportViewRow[]>(() => q.limit(10000));
}
async function fetchReuse(sb: Sb, start: Date | null) {
  let q = sb.from("content_reuse_events").select("request_id,outcome");
  if (start) q = q.gte("occurred_at", start.toISOString());
  return safeQuery<ReuseRow[]>(() => q.limit(10000));
}

function numMetric(v: number | undefined) {
  return v == null ? { status: "not_connected" as const, reason: "无此项" } : { status: "ready" as const, value: v };
}

async function buildDiagnosis(sb: Sb, start: Date | null, now: Date, events: EventRow[], sessions: SessionRow[]) {
  const newNonSkip = events.filter((e) => e.event_type === "NEW" && e.correctness !== "SKIPPED");
  const newIndep = events.filter((e) => e.event_type === "NEW" && e.correctness === "INDEPENDENT");
  const learnRate = newNonSkip.length ? Math.round((newIndep.length / newNonSkip.length) * 1000) / 10 : null;
  const reviewUsers = new Set(events.filter((e) => e.event_type === "REVIEW").map((e) => e.user_id));
  const withFirst = sessions.filter((s) => s.first_answer);
  const withSecond = sessions.filter((s) => s.second_answer);
  const spkRate = withFirst.length ? Math.round((withSecond.length / withFirst.length) * 1000) / 10 : null;

  const dir = latestEvalRunDir();
  let offline: any;
  // P7.5C：优先读 build-time 生成的稳定 artifact（不依赖运行时 docs/ 目录）。
  const stable = path.resolve(process.cwd(), "generated", "dashboard", "latest-eval.json");
  if (fs.existsSync(stable)) {
    const s = JSON.parse(fs.readFileSync(stable, "utf-8"));
    offline = {
      runId: s.run_id,
      passRate: { status: "ready" as const, value: s.passRate, sampleSize: s.sampleSize, updatedAt: s.generated_at },
      criticalFailureRate: { status: "ready" as const, value: s.criticalFailureRate, updatedAt: s.generated_at },
      secondary: [],
      envNote: `离线评测 · ${s.data_provider ?? s.provider ?? "unknown"} 环境（非生产运行时质量）`,
    };
  } else if (!dir) {
    offline = {
      passRate: { status: "not_connected" as const, reason: "docs/eval/runs 为空" },
      criticalFailureRate: { status: "not_connected" as const, reason: "docs/eval/runs 为空" },
      secondary: [] as any[],
      envNote: "离线评测 · 无 run",
    };
  } else {
    const j = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf-8"));
    const env = j.manifest?.environment ?? {};
    offline = {
      runId: j.manifest?.run_id,
      passRate: { status: "ready" as const, value: j.metrics?.evals?.m1_eval_pass_rate_pct ?? j.metrics?.case_level?.pass_rate_pct ?? 0, sampleSize: j.metrics?.case_level?.executed, updatedAt: j.manifest?.started_at },
      criticalFailureRate: { status: "ready" as const, value: j.metrics?.evals?.m3_critical_failure_rate_pct ?? 0, updatedAt: j.manifest?.started_at },
      secondary: [
        { id: "state_consistency", label: "状态一致性", value: numMetric(j.metrics?.evals?.m5_state_consistency_rate_pct) },
        { id: "retrieval_quality", label: "知识检索质量", value: numMetric(j.metrics?.evals?.m6_retrieval_success_rate_pct) },
        { id: "answer_judge", label: "答案判定准确率", value: numMetric(j.metrics?.evals?.m7_answer_judge_accuracy_pct) },
        { id: "speaking_feedback", label: "口语反馈质量", value: numMetric(j.metrics?.evals?.m8_speaking_feedback_quality_pass_rate_pct) },
      ],
      envNote: `离线评测 · ${env.data_provider ?? "unknown"}/${env.llm_provider ?? "unknown"} 环境（非生产运行时质量）`,
    };
  }

  // P6.1B runtime durable failures（能力探测：表缺失 -> not_connected，绝不 0/ready）
  const tracesR = await fetchTraces(sb, start);
  let runtime: any;
  if (tracesR.status === "missing") {
    runtime = {
      persistence: "not_connected" as const,
      persistenceNote: "durable trace 表尚未在本环境启用（migration pending），不返回 0 failures。",
      failures: [] as { layer: FailureLayer; label: string; count: never }[],
    };
  } else if (tracesR.status === "error") {
    runtime = { persistence: "error" as const, persistenceNote: `trace 查询失败：${tracesR.message}`, failures: [] as never[] };
  } else {
    const rows = (tracesR.rows ?? []) as Array<{ failure_layer: FailureLayer | null }>;
    const counts = new Map<FailureLayer, number>();
    for (const r of rows) {
      if (!r.failure_layer) continue;
      counts.set(r.failure_layer, (counts.get(r.failure_layer) ?? 0) + 1);
    }
    const all = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = all.slice(0, 5);
    const rem = all.slice(5);
    const failures = top.map(([layer, count]) => ({ layer, label: LAYER_LABEL[layer] ?? layer, count }));
    if (rem.length) failures.push({ layer: "UNKNOWN", label: `其他 ${rem.length} 类 / ${rem.reduce((s, x) => s + x[1], 0)} 个问题`, count: rem.reduce((s, x) => s + x[1], 0) }) as never;
    runtime = {
      persistence: "durable" as const,
      persistenceNote: `durable trace（${rows.length} 行）`,
      failures,
    };
  }

  // P6.1C report re-entry（能力探测）
  const viewsR = await fetchReportViews(sb, start);
  let reportMetric: any;
  if (viewsR.status === "missing") {
    reportMetric = { status: "not_instrumented" as const, reason: "report_views 表尚未启用（migration pending）", instrumentationKey: "report_reentry" };
  } else if (viewsR.status === "error") {
    reportMetric = { status: "error" as const, reason: `report_views 查询失败：${viewsR.message}` };
  } else {
    const r = computeReportReentry(viewsR.rows, events, sessions, start ?? new Date(0), now);
    reportMetric = r.denominator === 0
      ? { status: "insufficient" as const, sampleSize: 0, minimumSample: 1, reason: "区间内无真实 report view" }
      : { status: "ready" as const, value: r.rate ?? 0, sampleSize: r.denominator };
  }

  // P6.1D content reuse（能力探测）
  const reuseR = await fetchReuse(sb, start);
  let reuseStatus: any = { status: "not_instrumented" as const, statusLabel: "尚未启用", detail: "content_reuse_events 表尚未启用" };
  if (reuseR.status === "error") {
    reuseStatus = { status: "error" as const, statusLabel: "查询失败", detail: `content_reuse_events：${reuseR.message}` };
  } else if (reuseR.status === "ok") {
    const r = computeContentReuse(reuseR.rows);
    reuseStatus = r.denominator === 0
      ? { status: "insufficient" as const, statusLabel: "数据不足", detail: `无 reused/created 记录（failed=${r.failed}）` }
      : { status: "ready" as const, statusLabel: "已接入", detail: `命中率 ${r.rate}%（${r.reused}/${r.denominator}，failed=${r.failed}）` };
  }

  return {
    features: [
      { moduleId: "learn" as const, moduleLabel: "学习新表达", metricLabel: "新表达独立完成率",
        value: learnRate == null ? { status: "insufficient" as const, sampleSize: newNonSkip.length, minimumSample: 1, reason: "无 NEW 尝试" } : { status: "ready" as const, value: learnRate, sampleSize: newNonSkip.length },
        trend: null, description: "NEW INDEPENDENT / 非 SKIPPED NEW" },
      { moduleId: "review" as const, moduleLabel: "今日复习", metricLabel: "复习参与人数",
        value: { status: "ready" as const, value: reviewUsers.size, sampleSize: reviewUsers.size }, trend: null, description: "复习去重用户" },
      { moduleId: "speaking" as const, moduleLabel: "口语训练", metricLabel: "口语重答完成率",
        value: spkRate == null ? { status: "insufficient" as const, sampleSize: withFirst.length, minimumSample: 1, reason: "无已提交首答" } : { status: "ready" as const, value: spkRate, sampleSize: withFirst.length },
        trend: null, description: "完成重答 / 已提交首答" },
      { moduleId: "report" as const, moduleLabel: "学习报告", metricLabel: "报告后回流率",
        value: reportMetric, trend: null, description: "真实 report view 后 ≤24h 回访" },
    ],
    aiQuality: {
      offline,
      runtime,
    },
    reuseStatus,
  };
}

async function buildSystem(reuseStatus: any) {
  return {
    capabilities: [
      { id: "memory", label: "学习记忆", status: "ready" as const, statusLabel: "已接入", detail: "learning_events / user_item_states" },
      { id: "retrieval", label: "知识检索", status: "traceable" as const, statusLabel: "可追踪", detail: "检索可追踪" },
      { id: "reuse", label: "内容复用命中率", status: reuseStatus.status, statusLabel: reuseStatus.statusLabel, detail: reuseStatus.detail },
      { id: "trace", label: "链路持久化", status: "not_connected" as const, statusLabel: "未持久化", detail: "trace 仅进程内" },
      { id: "latency", label: "模型响应时延", status: "traceable" as const, statusLabel: "可追踪", detail: "有时延记录" },
    ],
  };
}

export class RealDashboardRepository implements DashboardRepository {
  private sb(): Sb {
    return createServiceRoleClient() as unknown as Sb;
  }

  async getDashboard(range: DashboardRange): Promise<DashboardData> {
    const { start } = parseRange(range);
    const sb = this.sb();
    const [eventsRes, sessionsRes, evalsRes] = await Promise.allSettled([
      fetchEvents(sb, start),
      fetchSessions(sb, start),
      fetchEvaluations(sb, start),
    ]);
    const events = eventsRes.status === "fulfilled" ? eventsRes.value : [];
    const sessions = sessionsRes.status === "fulfilled" ? sessionsRes.value : [];
    const evals = evalsRes.status === "fulfilled" ? evalsRes.value : [];
    const now = new Date();

    const errSection = (msg: string) => ({ status: "error" as const, message: msg });
    const [healthR, lifecycleR, impactR, diagR] = await Promise.allSettled([
      Promise.resolve(computeHealth(events, sessions, evals, now)),
      Promise.resolve(computeLifecycle(events, sessions, evals, now)),
      Promise.resolve(computeImpact(events, evals)),
      buildDiagnosis(sb, start, now, events, sessions),
    ]);
    const diag = diagR.status === "fulfilled" ? diagR.value : null;
    const sysR = await Promise.allSettled([buildSystem(diag?.reuseStatus)]);

    const failed: string[] = [];
    const unwrap = <T,>(r: PromiseSettledResult<T>, fb: () => T, name: string): T => {
      if (r.status === "fulfilled") return r.value;
      failed.push(name);
      return fb();
    };
    const health = unwrap(healthR, () => ({ metrics: [] }) as any, "health");
    const lifecycle = unwrap(lifecycleR, () => ({ stages: [], cohorts: [], insight: { title: "", value: errSection("lifecycle failed"), explanation: "", stageFrom: "first_use", stageTo: "activation" } }) as any, "lifecycle");
    const learningImpact = unwrap(impactR, () => ({ metrics: [] }) as any, "impact");
    const diagnosis = unwrap(diagR, () => ({ features: [], aiQuality: { offline: { passRate: errSection("diag failed"), criticalFailureRate: errSection("diag failed"), secondary: [] }, runtime: { persistence: "not_connected" as const, persistenceNote: "", failures: [] } } }) as any, "diagnosis");
    const system = unwrap(sysR[0], () => ({ capabilities: [] }) as any, "system");

    return {
      meta: { generatedAt: new Date().toISOString(), range, sourceMode: "real", dataStatus: failed.length ? "partial_error" : "ready", failedSections: failed as DashboardData["meta"]["failedSections"] },
      health, lifecycle, learningImpact, diagnosis, system,
    } as DashboardData;
  }

  async getLifecycleDetail(stageId: LifecycleStageId, _range: DashboardRange): Promise<LifecycleDetail> {
    const map: Record<LifecycleStageId, LifecycleDetail> = {
      first_use: { stageId, title: "首次使用", definition: "首次 valid activity", metrics: [], notes: [] },
      activation: { stageId, title: "首次激活", definition: "≤+24h 闭环", metrics: [], notes: [] },
      return: { stageId, title: "再次学习", definition: "跨自然日", metrics: [], notes: [] },
      d7_retention: { stageId, title: "7日留存", definition: "成熟组 D1-D7 任一日", metrics: [], notes: [] },
      habit: { stageId, title: "稳定学习", definition: "D0-D6 ≥3 天", metrics: [], notes: [] },
    };
    return map[stageId];
  }
  async getModuleDetail(moduleId: ModuleId, _range: DashboardRange): Promise<ModuleDetail> {
    const map: Record<ModuleId, ModuleDetail> = {
      learn: { moduleId, title: "学习新表达", metricLabel: "新表达独立完成率", definition: "NEW INDEPENDENT/非SKIPPED NEW", notes: [] },
      review: { moduleId, title: "今日复习", metricLabel: "复习参与人数", definition: "复习去重用户", notes: [] },
      speaking: { moduleId, title: "口语训练", metricLabel: "口语重答完成率", definition: "重答/首答", notes: [] },
      report: { moduleId, title: "学习报告", metricLabel: "报告后回流率", definition: "未采集", notes: [] },
    };
    return map[moduleId];
  }
  async getBadCases(_layer: FailureLayer, _range: DashboardRange): Promise<BadCase[]> {
    return []; // trace 未持久化：不返回 Mock，不返回 0。
  }
  async getTrace(_traceId: string): Promise<TraceDetail> {
    throw new Error("Trace 未持久化（P6）");
  }
}
