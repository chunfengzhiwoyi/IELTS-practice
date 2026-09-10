/**
 * Lingxi Dashboard — 唯一数据契约
 * ------------------------------------------------------------
 * 来源：Implementation Kit `05_data_contract/dashboard.types.ts`。
 *
 * C3 Integration Correction（Human 已冻结，2026-09-10）：
 * 原 Kit 5 值 FailureLayer 作废；以真实仓库
 * `lib/observability/trace-contract.ts` 的 13 层为权威 taxonomy，完整保留。
 * BadCase / Trace / FailureSummary 一律携带 exact canonical layer，不做有损归并。
 * UNKNOWN 独立表示“待归因”。中文 label 只在 presentation 层（layer-labels.ts）。
 */

export type DashboardRange = "7d" | "30d" | "all";
export type DashboardSectionId = "health" | "lifecycle" | "impact" | "diagnosis" | "system";

export type Metric<T> =
  | { status: "ready"; value: T; sampleSize?: number; delta?: number; deltaUnit?: "pct" | "pp" | "count"; updatedAt?: string }
  | { status: "zero"; value: 0; sampleSize?: number; updatedAt?: string }
  | { status: "insufficient"; sampleSize: number; minimumSample: number; reason?: string }
  | { status: "not_instrumented"; reason: string; instrumentationKey?: string }
  | { status: "not_connected"; reason: string }
  | { status: "error"; errorCode?: string; message: string }
  | { status: "stale"; value: T; lastSuccessfulSync: string; sampleSize?: number };

export interface Point { label: string; value: number; }
export interface TrendSeries { points: Point[]; unit: "count" | "pct" | "pp" | "ms"; label: string; }

export type HealthMetricId = "closed_loop_learners" | "active_learners" | "activation_rate" | "d7_retention_rate";
export interface HealthMetric {
  id: HealthMetricId;
  label: string;
  value: Metric<number>;
  trend: TrendSeries | null;
  description: string;
  iconKey: "loop" | "activity" | "activate" | "retention";
}
export interface ProductHealthData { metrics: HealthMetric[]; }

export type LifecycleStageId = "first_use" | "activation" | "return" | "d7_retention" | "habit";
export interface LifecycleStage {
  id: LifecycleStageId;
  label: string;
  count: Metric<number>;
  rate: Metric<number> | null;
  rateLabel: string;
  description: string;
}
export type RetentionCell =
  | { status: "ready"; value: number }
  | { status: "immature"; reason: string }
  | { status: "insufficient"; sampleSize: number; minimumSample: number };
export interface RetentionCohortRow {
  cohortLabel: string;
  activatedN: number;
  d1: RetentionCell;
  d3: RetentionCell;
  d7: RetentionCell;
  habit: RetentionCell;
}
export interface LifecycleInsight { title: string; value: Metric<number>; explanation: string; stageFrom: LifecycleStageId; stageTo: LifecycleStageId; }
export interface LifecycleData { stages: LifecycleStage[]; cohorts: RetentionCohortRow[]; insight: LifecycleInsight; }

export type ImpactMetricId = "speaking_feedback_improvement" | "independent_recall" | "delayed_recall_72h" | "context_transfer";
export interface LearningImpactMetric {
  id: ImpactMetricId;
  label: string;
  evidenceLabel: "即时改善" | "无提示验证" | "跨时间验证" | "跨情境验证";
  value: Metric<number>;
  definition: string;
  sourceLabel: string;
  trend: TrendSeries | null;
}
export interface LearningImpactData { metrics: LearningImpactMetric[]; }

export type ModuleId = "learn" | "review" | "speaking" | "report";
export interface FeatureMetric {
  moduleId: ModuleId;
  moduleLabel: string;
  metricLabel: string;
  value: Metric<number>;
  trend: TrendSeries | null;
  description: string;
}

export interface OfflineEvalData {
  passRate: Metric<number>;
  criticalFailureRate: Metric<number>;
  secondary: Array<{ id: string; label: string; value: Metric<number> }>;
}

/**
 * C3 修正：完整 13 层 FailureLayer，与
 * `lib/observability/trace-contract.ts` FailureLayer 一字不差。
 * 首页按 count 降序只渲染 Top 5 + “其他 N 类”汇总；Drawer 展示全部原始层。
 */
export type FailureLayer =
  | "INPUT"
  | "ROUTING"
  | "STATE_READ"
  | "RETRIEVAL"
  | "PROMPT"
  | "MODEL"
  | "OUTPUT_VALIDATION"
  | "BUSINESS_RULE"
  | "STATE_WRITE"
  | "REPORT_AGGREGATION"
  | "FALLBACK"
  | "UI_PRESENTATION"
  | "UNKNOWN";

export interface FailureSummary { layer: FailureLayer; label: string; count: Metric<number>; }
export interface RuntimeReliabilityData {
  persistence: "ready" | "partial" | "not_connected";
  persistenceNote: string;
  failures: FailureSummary[];
}
export interface AIQualityData { offline: OfflineEvalData; runtime: RuntimeReliabilityData; }
export interface ProductDiagnosisData { features: FeatureMetric[]; aiQuality: AIQualityData; }

export type CapabilityStatus = "ready" | "traceable" | "partial" | "not_instrumented" | "not_connected";
export interface SystemCapability { id: string; label: string; status: CapabilityStatus; statusLabel: string; detail: string; }
export interface SystemKnowledgeData { capabilities: SystemCapability[]; }

export interface DashboardMeta {
  generatedAt: string;
  range: DashboardRange;
  sourceMode: "mock" | "real";
  dataStatus: "ready" | "empty" | "partial_error" | "stale";
  lastSuccessfulSync?: string;
  failedSections?: DashboardSectionId[];
}
export interface DashboardData {
  meta: DashboardMeta;
  health: ProductHealthData;
  lifecycle: LifecycleData;
  learningImpact: LearningImpactData;
  diagnosis: ProductDiagnosisData;
  system: SystemKnowledgeData;
}

export interface LifecycleDetail {
  stageId: LifecycleStageId;
  title: string;
  definition: string;
  metrics: Array<{ label: string; value: Metric<number> }>;
  notes: string[];
}
export interface ModuleDetail {
  moduleId: ModuleId;
  title: string;
  metricLabel: string;
  definition: string;
  funnel?: Array<{ label: string; count: number }>;
  notes: string[];
}
export type BadCaseOutcome = "resolved" | "fallback" | "blocked";
export interface BadCase {
  id: string;
  occurredAt: string;
  layer: FailureLayer;
  moduleId: ModuleId;
  title: string;
  outcome: BadCaseOutcome;
  resolution: string;
  traceId: string;
}
export type TraceStageName = "INPUT" | "ROUTING" | "STATE_READ" | "RETRIEVAL" | "PROMPT" | "MODEL" | "OUTPUT_VALIDATION" | "BUSINESS_RULE" | "STATE_WRITE";
export interface TraceStage { name: TraceStageName; status: "pass" | "fail" | "fallback"; detail?: string; }
export interface TraceDetail { traceId: string; badCaseId: string; stages: TraceStage[]; failureReason?: string; finalResult: string; }
