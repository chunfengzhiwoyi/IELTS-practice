/**
 * Dashboard 纯聚合层（P5）
 * ------------------------------------------------------------
 * 所有指标计算不依赖 Supabase/fs，只吃 rows + now，便于 fixture 单测与 oracle 三方比对。
 * 冻结 Metric Contract：
 * - valid activity = learning_events ∪ 已首答 speaking_sessions
 * - closed-loop = 任一 Module Success Loop
 * - activation = first_use_at→activation_at ≤ +24h
 * - top-level D7 = mature cohort 中 D1-D7 任一自然日活跃
 */
import type {
  DashboardRange,
  FailureLayer,
  HealthMetric,
  LearningImpactMetric,
  LifecycleData,
  ProductHealthData,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type EventRow = {
  user_id: string;
  item_id: string;
  event_type: "NEW" | "REVIEW";
  correctness: "FAIL" | "HINTED" | "INDEPENDENT" | "SKIPPED";
  hint_level: number;
  created_at: string;
};
export type SessionRow = {
  id: string;
  user_id: string;
  first_answer: string | null;
  second_answer: string | null;
  main_issue: unknown;
  created_at: string;
};
export type EvaluationRow = {
  session_id: string;
  user_id: string;
  overall_change: number | null;
  evaluated_at: string;
};

const DAY = 24 * 3600 * 1000;
export const dayKey = (d: Date): string => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
export const pct = (numer: number, denom: number): number | null => (denom <= 0 ? null : Math.round((numer / denom) * 1000) / 10);

export interface ActivityModel {
  firstUseAt: Map<string, Date>;
  activationAt: Map<string, Date>;
  activityTimes: Map<string, Date[]>;
}

export function buildActivityModel(events: EventRow[], sessions: SessionRow[], evals: EvaluationRow[]): ActivityModel {
  const firstUseAt = new Map<string, Date>();
  const activationAt = new Map<string, Date>();
  const activityTimes = new Map<string, Date[]>();
  const bump = (m: Map<string, Date>, u: string, d: Date) => {
    const cur = m.get(u);
    if (!cur || d < cur) m.set(u, d);
  };
  const pushAct = (u: string, d: Date) => {
    const arr = activityTimes.get(u) ?? [];
    arr.push(d);
    activityTimes.set(u, arr);
  };
  const hasEval = new Set(evals.map((e) => e.session_id));

  for (const e of events) {
    if (e.correctness === "SKIPPED") continue; // qualifying learning_event：SKIPPED 不计为 valid activity
    const d = new Date(e.created_at);
    bump(firstUseAt, e.user_id, d);
    pushAct(e.user_id, d);
    bump(activationAt, e.user_id, d); // Learn/Review loop（非 SKIPPED 即完成一次有效闭环）
  }
  for (const s of sessions) {
    if (!s.first_answer) continue; // qualifying speaking activity
    const d = new Date(s.created_at);
    bump(firstUseAt, s.user_id, d);
    pushAct(s.user_id, d);
    if (s.second_answer && s.main_issue != null && hasEval.has(s.id)) bump(activationAt, s.user_id, d); // Speaking loop
  }
  return { firstUseAt, activationAt, activityTimes };
}

const insuf = (sampleSize: number, reason: string) => ({ status: "insufficient" as const, sampleSize, minimumSample: 1, reason });

export function computeHealth(events: EventRow[], sessions: SessionRow[], evals: EvaluationRow[], now: Date): ProductHealthData {
  const m = buildActivityModel(events, sessions, evals);
  const activeUsers = new Set(m.activityTimes.keys());
  const closedLoop = new Set(m.activationAt.keys());

  let firstUse = 0, activated = 0;
  for (const [u, first] of m.firstUseAt) {
    firstUse++;
    const act = m.activationAt.get(u);
    if (act && act.getTime() <= first.getTime() + DAY) activated++;
  }
  const activationRate = pct(activated, firstUse);

  let mature = 0, retained = 0;
  for (const [u, act] of m.activationAt) {
    if (now.getTime() - act.getTime() < 7 * DAY) continue;
    mature++;
    const lo = act.getTime() + DAY, hi = act.getTime() + 8 * DAY;
    const days = new Set((m.activityTimes.get(u) ?? []).filter((d) => d.getTime() >= lo && d.getTime() <= hi).map((d) => dayKey(d)));
    if (days.size > 0) retained++;
  }
  const d7 = pct(retained, mature);

  const ready = (v: number, s?: number) => ({ status: "ready" as const, value: v, sampleSize: s });
  return {
    metrics: [
      { id: "closed_loop_learners", label: "有效闭环学习人数", value: ready(closedLoop.size, closedLoop.size), trend: null, description: "任一 Module Success Loop", iconKey: "loop" },
      { id: "active_learners", label: "活跃学习人数", value: ready(activeUsers.size, activeUsers.size), trend: null, description: "valid activity 去重", iconKey: "activity" },
      { id: "activation_rate", label: "首次激活率", value: activationRate == null ? insuf(firstUse, "尚无首次使用 cohort") : ready(activationRate, firstUse), trend: null, description: "≤+24h 闭环", iconKey: "activate" },
      { id: "d7_retention_rate", label: "7日留存率", value: d7 == null ? insuf(mature, "成熟 cohort 不足") : ready(d7, mature), trend: null, description: "D1-D7 任一自然日", iconKey: "retention" },
    ] satisfies HealthMetric[],
  };
}

/**
 * Lifecycle Matrix（Human 冻结）：
 * 次日=exact D1，第3日=exact D3，第7日=exact D7；分母=该 activation cohort 原始 N。
 * maturity：cohort age<1d→D1 immature；<3d→D3 immature；<7d→D7 immature。
 * 已成熟 cell 才算比例，不允许用 0% 代替 immature。
 */
export function computeMatrix(events: EventRow[], sessions: SessionRow[], evals: EvaluationRow[], now: Date) {
  const m = buildActivityModel(events, sessions, evals);
  const cohorts = new Map<string, { actAt: Date; users: string[] }>();
  for (const [u, act] of m.activationAt) {
    const key = dayKey(act);
    const c = cohorts.get(key) ?? { actAt: act, users: [] };
    c.users.push(u);
    cohorts.set(key, c);
  }
  const cell = (userIds: string[], act: Date, k: number, nowMs: number) => {
    const age = nowMs - act.getTime();
    if (age < k * DAY) return { status: "immature" as const, reason: `cohort age < ${k}d` };
    const lo = act.getTime() + (k - 1) * DAY;
    const hi = act.getTime() + k * DAY;
    let hit = 0;
    for (const u of userIds) {
      const hitDay = (m.activityTimes.get(u) ?? []).some((d) => d.getTime() >= lo && d.getTime() <= hi);
      if (hitDay) hit++;
    }
    return { status: "ready" as const, value: Math.round((hit / userIds.length) * 1000) / 10 };
  };
  return [...cohorts.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([label, c]) => ({
      cohortLabel: label,
      activatedN: c.users.length,
      d1: cell(c.users, c.actAt, 1, now.getTime()),
      d3: cell(c.users, c.actAt, 3, now.getTime()),
      d7: cell(c.users, c.actAt, 7, now.getTime()),
      habit: { status: "immature" as const, reason: "habit cell 另计" },
    }));
}

export function computeLifecycle(events: EventRow[], sessions: SessionRow[], evals: EvaluationRow[], now: Date): LifecycleData {
  const m = buildActivityModel(events, sessions, evals);
  let firstUse = 0, activated = 0, returned = 0, retained = 0, habit = 0;
  for (const [u, first] of m.firstUseAt) {
    firstUse++;
    const act = m.activationAt.get(u);
    if (!act || act.getTime() > first.getTime() + DAY) continue;
    activated++;
    const acts = act.getTime();
    const all = m.activityTimes.get(u) ?? [];
    if (all.some((d) => dayKey(d) !== dayKey(act) && d.getTime() > acts)) returned++;
    if (now.getTime() - acts >= 7 * DAY) {
      const days = new Set(all.filter((d) => d.getTime() >= acts + DAY && d.getTime() <= acts + 8 * DAY).map((d) => dayKey(d)));
      if (days.size > 0) retained++;
    }
    const hdays = new Set(all.filter((d) => d.getTime() >= acts && d.getTime() <= acts + 7 * DAY).map((d) => dayKey(d)));
    if (hdays.size >= 3) habit++;
  }
  const ready = (v: number, n?: number) => ({ status: "ready" as const, value: v, sampleSize: n });
  return {
    stages: [
      { id: "first_use", label: "首次使用", count: ready(firstUse), rate: null, rateLabel: "用户组起点", description: "首次 valid activity" },
      { id: "activation", label: "首次激活", count: ready(activated, firstUse), rate: ready(pct(activated, firstUse) ?? 0), rateLabel: "激活率", description: "≤+24h 闭环" },
      { id: "return", label: "再次学习", count: ready(returned, activated), rate: ready(pct(returned, activated) ?? 0), rateLabel: "跨日回访率", description: "跨日" },
      { id: "d7_retention", label: "7日留存", count: ready(retained), rate: ready(pct(retained, activated) ?? 0), rateLabel: "成熟 D1-D7", description: "成熟组 D1-D7" },
      { id: "habit", label: "稳定学习", count: ready(habit), rate: ready(pct(habit, activated) ?? 0), rateLabel: "≥3 天", description: "D0-D6 ≥3 天" },
    ],
    cohorts: computeMatrix(events, sessions, evals, now),
    insight: { title: "首次激活 → 再次学习", value: ready(pct(returned, activated) ?? 0), explanation: "跨自然日回访", stageFrom: "activation", stageTo: "return" },
  };
}

export function computeImpact(events: EventRow[], evals: EvaluationRow[]): { metrics: LearningImpactMetric[] } {
  const review = events.filter((e) => e.event_type === "REVIEW");
  const nonSkip = review.filter((e) => e.correctness !== "SKIPPED");
  const indep = review.filter((e) => e.correctness === "INDEPENDENT" && e.hint_level === 0);
  const recallRate = pct(indep.length, nonSkip.length);

  const byUI = new Map<string, EventRow[]>();
  for (const e of events) {
    const k = `${e.user_id}|${e.item_id}`;
    (byUI.get(k) ?? byUI.set(k, []).get(k)!).push(e);
  }
  let elig = 0, correct = 0;
  for (const arr of byUI.values()) {
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const lastLearn = arr.filter((e) => e.event_type === "NEW" && e.correctness === "INDEPENDENT").pop();
    if (!lastLearn) continue;
    for (const r of arr.filter((e) => e.event_type === "REVIEW" && new Date(e.created_at).getTime() - new Date(lastLearn.created_at).getTime() >= 72 * 3600 * 1000)) {
      if (r.correctness === "SKIPPED") continue;
      elig++;
      if (r.correctness === "INDEPENDENT" && r.hint_level === 0) correct++;
    }
  }
  const delayed = pct(correct, elig);

  const imp = evals.filter((e) => typeof e.overall_change === "number");
  const improved = imp.filter((e) => (e.overall_change ?? 0) > 0);
  const spk = pct(improved.length, imp.length);

  const notInst = (reason: string, key: string) => ({ status: "not_instrumented" as const, reason, instrumentationKey: key });
  return {
    metrics: [
      { id: "speaking_feedback_improvement", label: "口语反馈后改善率", evidenceLabel: "即时改善", value: spk == null ? insuf(imp.length, "尚无口语评估") : { status: "ready" as const, value: spk, sampleSize: imp.length }, definition: "overall_change>0 / 有数值评估", sourceLabel: "speaking_evaluations", trend: null },
      { id: "independent_recall", label: "无提示独立回忆率", evidenceLabel: "无提示验证", value: recallRate == null ? insuf(nonSkip.length, "尚无非跳过复习") : { status: "ready" as const, value: recallRate, sampleSize: nonSkip.length }, definition: "REVIEW INDEPENDENT hint0 / 非 SKIPPED REVIEW", sourceLabel: "learning_events", trend: null },
      { id: "delayed_recall_72h", label: "72小时后独立回忆率", evidenceLabel: "跨时间验证", value: delayed == null ? insuf(elig, "尚无72h后复习") : { status: "ready" as const, value: delayed, sampleSize: elig }, definition: "按 user+item 序，≥72h", sourceLabel: "learning_events", trend: null },
      { id: "context_transfer", label: "新情境迁移", evidenceLabel: "跨情境验证", value: notInst("缺 source→target 验证事件", "transfer_validation"), definition: "跨情境独立使用", sourceLabel: "待埋点", trend: null },
    ],
  };
}

export type { FailureLayer, DashboardRange };
/**
 * Partial-failure 合成（P5.1）：section promise 失败不拖垮整页。
 * 入参为 allSettled 结果；失败 section 标 error，其他保留。
 */
export function composeDashboard(
  range: DashboardRange,
  settled: { health: any; lifecycle: any; impact: any; diagnosis: any; system: any },
) {
  const failed: string[] = [];
  const err = (msg: string) => ({ status: "error" as const, message: msg });
  const unwrap = <T,>(r: PromiseSettledResult<T>, fb: () => T, name: string): T => {
    if (r.status === "fulfilled") return r.value;
    failed.push(name);
    return fb();
  };
  const health = unwrap(settled.health, () => ({ metrics: [] }), "health");
  const lifecycle = unwrap(settled.lifecycle, () => ({ stages: [], cohorts: [], insight: { title: "", value: err("lifecycle"), explanation: "", stageFrom: "first_use", stageTo: "activation" } }), "lifecycle");
  const impact = unwrap(settled.impact, () => ({ metrics: [] }), "impact");
  const diagnosis = unwrap(settled.diagnosis, () => ({ features: [], aiQuality: { offline: { passRate: err("d"), criticalFailureRate: err("d"), secondary: [] }, runtime: { persistence: "not_connected" as const, persistenceNote: "", failures: [] } } }), "diagnosis");
  const system = unwrap(settled.system, () => ({ capabilities: [] }), "system");
  return {
    meta: { generatedAt: new Date(0).toISOString(), range, sourceMode: "real" as const, dataStatus: failed.length ? ("partial_error" as const) : ("ready" as const), failedSections: failed },
    health, lifecycle, learningImpact: impact, diagnosis, system,
  };
}

// =============================================================
// P6B — Report Re-entry（纯函数）
// =============================================================
export interface ReportViewRow { user_id: string; viewed_at: string; }
/**
 * denominator = range 内至少真实查看一次报告的去重用户
 * numerator   = 存在某次 view 之后 0 < delta <= 24h 内发生 valid learning activity 的去重用户
 * report view 本身不计 active learning。
 */
export function computeReportReentry(views: ReportViewRow[], events: EventRow[], sessions: SessionRow[], rangeStart: Date, now: Date) {
  const DAY = 24 * 3600 * 1000;
  const act = new Map<string, number[]>();
  for (const e of events) {
    if (e.correctness === "SKIPPED") continue;
    act.set(e.user_id, [...(act.get(e.user_id) ?? []), new Date(e.created_at).getTime()]);
  }
  for (const s of sessions) {
    if (s.first_answer) act.set(s.user_id, [...(act.get(s.user_id) ?? []), new Date(s.created_at).getTime()]);
  }
  const inRange = views.filter((v) => { const t = new Date(v.viewed_at).getTime(); return t >= rangeStart.getTime() && t <= now.getTime(); });
  const denom = new Set(inRange.map((v) => v.user_id));
  const num = new Set<string>();
  for (const v of inRange) {
    const vt = new Date(v.viewed_at).getTime();
    const ts = act.get(v.user_id) ?? [];
    if (ts.some((t) => t > vt && t <= vt + DAY)) num.add(v.user_id);
  }
  const rate = denom.size ? Math.round((num.size / denom.size) * 1000) / 10 : null;
  return { numerator: num.size, denominator: denom.size, rate };
}

// =============================================================
// P6C — Content Reuse Hit/Miss（纯函数，按 request_id 去重）
// =============================================================
export interface ReuseRow { request_id: string; outcome: "reused" | "created" | "failed"; }
export function computeContentReuse(rows: ReuseRow[]) {
  const seen = new Set<string>();
  let reused = 0, created = 0, failed = 0;
  for (const r of rows) {
    if (seen.has(r.request_id)) continue;
    seen.add(r.request_id);
    if (r.outcome === "reused") reused++;
    else if (r.outcome === "created") created++;
    else failed++;
  }
  const denom = reused + created;
  const rate = denom ? Math.round((reused / denom) * 1000) / 10 : null;
  return { reused, created, failed, denominator: denom, rate };
}
