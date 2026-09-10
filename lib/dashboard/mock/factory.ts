/**
 * Mock 数据工厂（P2）。来源：Implementation Kit `06_mock_data/factory.ts`。
 * C3：runtime.failures 使用完整 13 层，仅返回非零层以驱动“Top5 + 其他 N 类”路径；
 * BadCase / Trace 始终携带 exact canonical layer，UNKNOWN 独立为“待归因”。
 */
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
} from "../types";
import { failureLayerLabel } from "../layer-labels";

const dates7 = ["09/04", "09/05", "09/06", "09/07", "09/08", "09/09", "09/10"];
const trend = (values: number[], unit: "count" | "pct" | "pp" | "ms", label: string) => ({
  points: values.map((value, i) => ({ label: dates7[i] ?? `P${i + 1}`, value })),
  unit,
  label,
});
const ready = (value: number, delta?: number, deltaUnit?: "pct" | "pp" | "count", sampleSize?: number) =>
  ({ status: "ready" as const, value, delta, deltaUnit, sampleSize });
const notInstrumented = (reason: string, instrumentationKey?: string) =>
  ({ status: "not_instrumented" as const, reason, instrumentationKey });

const rangeBase = {
  "7d": { closed: 86, active: 126, activation: 68, retention: 31, firstUse: 66, activated: 45, returned: 23, retained: 14, habit: 7, speakingImprove: 67, speakingN: 38, recall: 63, recallN: 112, delayed: 52, delayedN: 41, learnIndependent: 72, reviewUsers: 11, speakingReanswer: 61 },
  "30d": { closed: 214, active: 352, activation: 65, retention: 29, firstUse: 202, activated: 131, returned: 70, retained: 38, habit: 22, speakingImprove: 64, speakingN: 121, recall: 61, recallN: 336, delayed: 49, delayedN: 118, learnIndependent: 70, reviewUsers: 34, speakingReanswer: 58 },
  all: { closed: 508, active: 711, activation: 62, retention: 27, firstUse: 493, activated: 306, returned: 151, retained: 83, habit: 44, speakingImprove: 62, speakingN: 288, recall: 59, recallN: 781, delayed: 47, delayedN: 301, learnIndependent: 68, reviewUsers: 79, speakingReanswer: 56 },
} as const;

export function makeReadyDataset(range: DashboardRange): DashboardData {
  const b = rangeBase[range];
  return {
    meta: { generatedAt: "2026-09-10T19:42:00+08:00", range, sourceMode: "mock", dataStatus: "ready" },
    health: {
      metrics: [
        { id: "closed_loop_learners", label: "有效闭环学习人数", value: ready(b.closed, 12.4, "pct"), trend: trend([8, 10, 9, 12, 14, 15, 18], "count", "每日完成有效闭环的学习人数"), description: "当前周期至少完成一次有效学习闭环的去重学习者", iconKey: "loop" },
        { id: "active_learners", label: "活跃学习人数", value: ready(b.active, 8.1, "pct"), trend: trend([17, 22, 19, 25, 23, 28, 26], "count", "每日活跃学习人数"), description: "当前周期至少发生一次有效学习行为的去重学习者", iconKey: "activity" },
        { id: "activation_rate", label: "首次激活率", value: ready(b.activation, 4.2, "pp"), trend: trend([60, 62, 64, 63, 66, 67, 68], "pct", "首次使用用户组激活率"), description: "首次使用后24小时内完成首个有效学习闭环", iconKey: "activate" },
        { id: "d7_retention_rate", label: "7日留存率", value: ready(b.retention, 2.6, "pp"), trend: trend([28, 30, 29, 31], "pct", "成熟用户组7日留存率"), description: "仅统计已满7日观察窗口的激活用户", iconKey: "retention" },
      ],
    },
    lifecycle: {
      stages: [
        { id: "first_use", label: "首次使用", count: ready(b.firstUse), rate: null, rateLabel: "用户组起点", description: "首次真实学习" },
        { id: "activation", label: "首次激活", count: ready(b.activated), rate: ready(b.activation), rateLabel: "激活率", description: "24小时内激活" },
        { id: "return", label: "再次学习", count: ready(b.returned), rate: ready(51), rateLabel: "跨日回访率", description: "跨日再次学习" },
        { id: "d7_retention", label: "7日留存", count: ready(b.retained), rate: ready(b.retention), rateLabel: "7日留存率", description: "成熟用户7日留存" },
        { id: "habit", label: "稳定学习", count: ready(b.habit), rate: ready(16), rateLabel: "稳定学习率", description: "首周至少3学习日" },
      ],
      cohorts: [
        { cohortLabel: "08/10–16", activatedN: 34, d1: { status: "ready", value: 62 }, d3: { status: "ready", value: 48 }, d7: { status: "ready", value: 30 }, habit: { status: "ready", value: 16 } },
        { cohortLabel: "08/17–23", activatedN: 41, d1: { status: "ready", value: 68 }, d3: { status: "ready", value: 51 }, d7: { status: "ready", value: 32 }, habit: { status: "ready", value: 18 } },
        { cohortLabel: "08/24–30", activatedN: 46, d1: { status: "ready", value: 65 }, d3: { status: "ready", value: 50 }, d7: { status: "ready", value: 31 }, habit: { status: "ready", value: 15 } },
        { cohortLabel: "08/31–09/06", activatedN: 39, d1: { status: "ready", value: 64 }, d3: { status: "ready", value: 49 }, d7: { status: "immature", reason: "尚未拥有完整7日观察窗" }, habit: { status: "immature", reason: "尚未拥有完整7日观察窗" } },
      ],
      insight: { title: "首次激活 → 再次学习", value: ready(51), explanation: "首次激活后，仅51%的用户在后续自然日再次学习。", stageFrom: "activation", stageTo: "return" },
    },
    learningImpact: {
      metrics: [
        { id: "speaking_feedback_improvement", label: "口语反馈后改善率", evidenceLabel: "即时改善", value: ready(b.speakingImprove, undefined, undefined, b.speakingN), definition: "首答获得反馈后，重答表现出现可验证改善。", sourceLabel: "口语会话评估", trend: trend([57, 59, 61, 63, 64, 66, 67], "pct", "口语反馈后改善率") },
        { id: "independent_recall", label: "无提示独立回忆率", evidenceLabel: "无提示验证", value: ready(b.recall, undefined, undefined, b.recallN), definition: "复习时无需提示即可独立正确回忆目标内容。", sourceLabel: "复习事件", trend: trend([58, 62, 60, 64, 61, 65, 63], "pct", "无提示独立回忆率") },
        { id: "delayed_recall_72h", label: "72小时后独立回忆率", evidenceLabel: "跨时间验证", value: ready(b.delayed, undefined, undefined, b.delayedN), definition: "距上一次成功学习至少72小时后，仍能无提示独立回忆。", sourceLabel: "复习事件", trend: trend([45, 47, 46, 50, 48, 51, 52], "pct", "72小时后独立回忆率") },
        { id: "context_transfer", label: "新情境迁移", evidenceLabel: "跨情境验证", value: notInstrumented("缺少 source_context → target_context 独立验证事件", "transfer_validation"), definition: "必须在不同于原学习情境的新任务中独立正确使用。", sourceLabel: "待新增埋点", trend: null },
      ],
    },
    diagnosis: {
      features: [
        { moduleId: "learn", moduleLabel: "学习新表达", metricLabel: "新表达独立完成率", value: ready(b.learnIndependent), trend: trend([64, 67, 69, 68, 71, 70, 72], "pct", "新表达独立完成率"), description: "NEW 独立正确 / 非跳过 NEW 尝试" },
        { moduleId: "review", moduleLabel: "今日复习", metricLabel: "复习参与人数", value: ready(b.reviewUsers), trend: trend([6, 9, 7, 11, 8, 10, 11], "count", "每日参与复习的学习人数"), description: "当前周期完成至少一次复习作答的去重学习者" },
        { moduleId: "speaking", moduleLabel: "口语训练", metricLabel: "口语重答完成率", value: ready(b.speakingReanswer), trend: trend([52, 65, 54, 63, 58, 68, 61], "pct", "口语重答完成率"), description: "完成重答会话 / 已提交首答并获得反馈的会话" },
        { moduleId: "report", moduleLabel: "学习报告", metricLabel: "报告后回流率", value: notInstrumented("缺少 report_viewed + attributed_reentry 事件", "report_reentry"), trend: null, description: "报告查看后再次进入真实学习的比例" },
      ],
      aiQuality: {
        offline: {
          passRate: { status: "not_connected", reason: "待读取最新冻结评测结果" },
          criticalFailureRate: { status: "not_connected", reason: "待读取最新冻结评测结果" },
          secondary: [
            { id: "state_consistency", label: "状态一致性", value: { status: "not_connected", reason: "待接 Evaluation run" } },
            { id: "retrieval_quality", label: "知识检索质量", value: { status: "not_connected", reason: "待接 Evaluation run" } },
            { id: "answer_judge", label: "答案判定准确率", value: { status: "not_connected", reason: "待接 Evaluation run" } },
            { id: "speaking_feedback", label: "口语反馈质量", value: { status: "not_connected", reason: "待接 Evaluation run" } },
          ],
        },
        runtime: {
          persistence: "partial",
          persistenceNote: "开发环境可追踪，生产持久化仍需验证。",
          failures: runtimeFailureSummaries(),
        },
      },
    },
    system: {
      capabilities: [
        { id: "memory", label: "学习记忆", status: "ready", statusLabel: "已接入", detail: "学习事件与学习状态由服务端统一管理。" },
        { id: "retrieval", label: "知识检索", status: "traceable", statusLabel: "可追踪", detail: "可记录检索对象、注入数量与未命中状态。" },
        { id: "reuse", label: "内容复用命中", status: "not_instrumented", statusLabel: "尚未采集", detail: "复用能力存在，但缺请求级命中/未命中埋点。" },
        { id: "trace", label: "链路持久化", status: "partial", statusLabel: "部分完成", detail: "开发环境可追踪，生产持久化仍需验证。" },
        { id: "latency", label: "模型响应时延", status: "traceable", statusLabel: "可追踪", detail: "运行链路已有响应时延记录能力。" },
      ],
    },
  };
}

export const lifecycleDetails: Record<LifecycleStageId, LifecycleDetail> = {
  first_use: { stageId: "first_use", title: "首次使用", definition: "用户第一次发生真实有效学习事件。", metrics: [{ label: "首次使用人数", value: ready(66) }], notes: ["pageview 不计首次使用", "它是生命周期 cohort anchor"] },
  activation: { stageId: "activation", title: "首次激活", definition: "首次使用后24小时内完成首个有效学习闭环。", metrics: [{ label: "激活率", value: ready(68) }, { label: "激活人数", value: ready(45) }], notes: ["下钻重点：time-to-value", "未激活路径用于产品诊断"] },
  return: { stageId: "return", title: "再次学习", definition: "激活后跨自然日再次发生有效学习。", metrics: [{ label: "跨日回访率", value: ready(51) }], notes: ["同日连续学习不计 Return"] },
  d7_retention: { stageId: "d7_retention", title: "7日留存", definition: "成熟激活用户组在D1–D7至少再次发生一次有效学习。", metrics: [{ label: "7日留存率", value: ready(31) }], notes: ["未成熟用户组不能计为失败"] },
  habit: { stageId: "habit", title: "稳定学习", definition: "激活后首周至少3个不同有效学习日。", metrics: [{ label: "稳定学习率", value: ready(16) }], notes: ["3天是V1产品规则，后续可校准"] },
};

export const moduleDetails: Record<ModuleId, ModuleDetail> = {
  learn: { moduleId: "learn", title: "学习新表达", metricLabel: "新表达独立完成率", definition: "NEW 独立正确 / 非跳过 NEW 尝试", notes: ["不伪造未持久化的 started denominator"] },
  review: { moduleId: "review", title: "今日复习", metricLabel: "复习参与人数", definition: "当前周期完成至少一次复习作答的去重学习者", notes: ["学习质量由无提示独立回忆率负责"] },
  speaking: { moduleId: "speaking", title: "口语训练", metricLabel: "口语重答完成率", definition: "完成重答会话 / 已提交首答并获得反馈的会话", notes: ["效果另由 speaking_evaluations 衡量"] },
  report: { moduleId: "report", title: "学习报告", metricLabel: "报告后回流率", definition: "当前尚未采集", notes: ["需要 report_viewed + attributed_reentry"] },
};

/** C3：非零层分布（含 UNKNOWN=待归因），用于驱动 Top5 + “其他 N 类”展示路径。 */
const layerCounts: Record<FailureLayer, number> = {
  INPUT: 0,
  ROUTING: 0,
  STATE_READ: 1,
  RETRIEVAL: 2,
  PROMPT: 4,
  MODEL: 8,
  OUTPUT_VALIDATION: 5,
  BUSINESS_RULE: 0,
  STATE_WRITE: 0,
  REPORT_AGGREGATION: 0,
  FALLBACK: 1,
  UI_PRESENTATION: 0,
  UNKNOWN: 2,
};

function runtimeFailureSummaries() {
  return (Object.entries(layerCounts) as [FailureLayer, number][])
    .filter(([, n]) => n > 0)
    .map(([layer, n]) => ({ layer, label: failureLayerLabel(layer), count: ready(n) }));
}

const STAGE_NAMES = ["INPUT", "ROUTING", "STATE_READ", "RETRIEVAL", "PROMPT", "MODEL", "OUTPUT_VALIDATION", "BUSINESS_RULE", "STATE_WRITE"] as const;
const MOCK_MODULES: ModuleId[] = ["learn", "review", "speaking"];

export const badCases: BadCase[] = (Object.entries(layerCounts) as [FailureLayer, number][])
  .filter(([, n]) => n > 0)
  .flatMap(([layer, n]) =>
    Array.from({ length: n }, (_, i) => ({
      id: `bc_${layer}_${i + 1}`,
      occurredAt: `2026-09-${String(9 - (i % 3)).padStart(2, "0")}T${String(18 - i).padStart(2, "0")}:20:00+08:00`,
      layer,
      moduleId: MOCK_MODULES[i % 3]!,
      title: `${failureLayerLabel(layer)} 问题样例 ${i + 1}`,
      outcome: (i % 4 === 3 ? "blocked" : i % 2 ? "fallback" : "resolved") as BadCase["outcome"],
      resolution: i % 2 ? "触发确定性降级并继续业务流程" : "自动修复后正常完成",
      traceId: `trc_${layer}_${i + 1}`,
    })),
  );

export const traces: Record<string, TraceDetail> = Object.fromEntries(
  badCases.map((bc) => [
    bc.traceId,
    {
      traceId: bc.traceId,
      badCaseId: bc.id,
      stages: STAGE_NAMES.map((name) => ({
        name,
        status: name === bc.layer ? "fail" : name === "BUSINESS_RULE" && bc.outcome === "fallback" ? "fallback" : "pass",
      })),
      failureReason: `${failureLayerLabel(bc.layer)} 阶段失败`,
      finalResult: bc.resolution,
    },
  ]),
) as Record<string, TraceDetail>;
