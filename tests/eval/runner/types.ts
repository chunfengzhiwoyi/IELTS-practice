/**
 * ELS Eval Runner — Result Schema（M3-P1 扩展）
 * ------------------------------------------------------------
 * 所有 Eval 结果的统一数据结构。
 *
 * 状态语义（反 gaming 设计）：
 *  - PASS          = 全部已执行断言通过，且 coverage=full（gold 全覆盖）
 *  - FAIL          = 任一已执行断言违反 gold（真实 Bad Case，只记录不修复）
 *  - MANUAL_REVIEW = 结构/确定性断言已通过，终审需人工金标复核（B 级 packet 语义）
 *  - UNVERIFIED    = 确定性子断言通过，但覆盖不完整（依赖真实 LLM / UI / M2 Trace / 专用工具）
 *  - BLOCKED       = 产品缺能力 / 专用工具缺失，Case 无法运行（BLOCKED_BY_CAPABILITY）
 *  - NOT_RUN       = 已进入 Registry（39/39）但本轮未执行 / 无 adapter（绝不等于 PASS）
 *
 * M3-P1 纪律：
 *  - 进入 Registry ≠ 已执行 ≠ PASS
 *  - 未执行 Case 只允许 NOT_RUN / UNVERIFIED / BLOCKED / MANUAL_REVIEW，禁止伪造成 PASS
 */

export type EvalRowStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";

export type EvalCaseStatus =
  | "PASS"
  | "FAIL"
  | "MANUAL_REVIEW"
  | "UNVERIFIED"
  | "BLOCKED"
  | "NOT_RUN"
  | "SKIPPED";

export type Severity = "S1" | "S2" | "S3" | "S4";

/** 行级断言结果（表驱动 Case 的一行） */
export interface EvalRow {
  row_id: string;
  description: string;
  status: EvalRowStatus;
  /** gold 期望值 */
  expected: unknown;
  /** 实际观测值 */
  actual: unknown;
  severity: Severity;
  failure_layer?: string;
  /** 断言失败时的简要说明 */
  error?: string;
  /** 附加证据（供人工复核） */
  evidence?: Record<string, unknown>;
  /**
   * 该行计入的指标（EVAL-M4..M9 域指标归因）。
   * 例：["M7"] 表示计入 Answer Judge Accuracy；["M5"] 计入 State Consistency Rate。
   * 未打标的行不计入域指标分母。
   */
  metrics?: string[];
}

/** Case 级结果（§1 Result Schema 最低字段要求全部覆盖） */
export interface EvalCaseResult {
  run_id: string;
  case_id: string;
  category: string;
  status: EvalCaseStatus;
  /** gold 断言覆盖：full = spec pass_criteria 全部可自动断言 */
  coverage: "full" | "partial";
  severity: Severity;
  failure_layer?: string;
  /** spec 的 expected_behavior 摘要 */
  expected: string;
  /** 实际观测摘要 */
  actual: string;
  latency_ms: number;
  error?: string;
  rows: EvalRow[];
  /** 无法自动化的 spec 断言（导致 UNVERIFIED / MANUAL_REVIEW 的原因） */
  uncovered_assertions: string[];
  /** 与 spec gold_audit.current_expected 的对照 */
  spec_current_expected: string;
  notes?: string;
  /** Frozen Contract §5.2 可判性分级：A=AUTO / B=MANUAL/SEMI-AUTO / C=SPECIAL_TOOL */
  automation_level?: "A" | "B" | "C";
  /** C 级 / 能力缺口：需要的专用工具或缺失能力 */
  missing_capability?: string[];
}

/** 运行清单（Run Snapshot） */
export interface RunManifest {
  run_id: string;
  spec: string;
  spec_version: string;
  case_set_version: string;
  spec_case_count: number;
  /** Registry 注册的 case 集合（M3-P1：39/39） */
  subset_case_ids: string[];
  git: {
    commit: string;
    branch: string;
    worktree_path: string;
    dirty: boolean;
  };
  environment: {
    node: string;
    vitest: string;
    data_provider: string;
    auth_mode: string;
    llm_provider: string;
    os: string;
  };
  started_at: string;
}

export interface RunResults {
  manifest: RunManifest;
  metrics: EvalMetrics;
  cases: EvalCaseResult[];
}

/**
 * 指标（§3 Metric Aggregator，仅真实运行 Case 计数）
 * M3-P1 扩展：
 *  - coverage：39 Case Registry 的覆盖统计（TOTAL_GOLD_CASES / REGISTERED / EXECUTED / 各状态数）
 *  - evals：EVAL-M1..M10 显式列表；M4–M9 按行级 metric 归因计算
 */
export interface EvalMetrics {
  /** case 级（分母 = 真实运行的 PASS+FAIL） */
  case_level: {
    executed: number;
    passed: number;
    failed: number;
    manual_review: number;
    unverified: number;
    blocked: number;
    skipped: number;
    /** M1 Eval Pass Rate（case 口径，coverage=full） */
    pass_rate_pct: number | null;
  };
  /** 行级（分母 = 全部已执行行 PASS+FAIL） */
  row_level: {
    executed: number;
    passed: number;
    failed: number;
    /** M1 Eval Pass Rate（行口径） */
    pass_rate_pct: number | null;
    /** M2 Bad Case Rate（行口径） */
    bad_case_rate_pct: number | null;
    /** M3 Critical Failure Rate（S1 失败行 / 已执行行） */
    critical_failure_rate_pct: number | null;
    /** M10 Release-Blocking Failure Rate（S1 + 阻断型 S2 失败行 / 已执行行） */
    release_blocking_failure_rate_pct: number | null;
    /** 阻断型 S2 Registry（M10 说明） */
    blocking_s2_registry_size: number;
  };
  /** M3-P1：39 Case Registry 覆盖统计（禁止用部分执行结果推算总体通过率） */
  coverage: {
    total_gold_cases: number;
    registered_cases: number;
    executed_cases: number;
    auto_pass: number;
    fail: number;
    manual_review: number;
    unverified: number;
    not_run: number;
    blocked: number;
    skipped: number;
    /** 按 Frozen Contract 分级：A 已实现 adapter / B packet / C placeholder 计数 */
    a_level_registered: number;
    b_level_registered: number;
    c_level_registered: number;
    a_level_implemented: number;
    b_level_packets: number;
    c_level_special_requirements: number;
  };
  /** EVAL-M1..M10 显式输出（M4–M9 为域指标，按行 metric 归因） */
  evals: {
    m1_eval_pass_rate_pct: number | null;
    m2_bad_case_rate_pct: number | null;
    m3_critical_failure_rate_pct: number | null;
    m4_intent_accuracy_pct: number | null;
    m5_state_consistency_rate_pct: number | null;
    m6_retrieval_success_rate_pct: number | null;
    m7_answer_judge_accuracy_pct: number | null;
    m8_speaking_feedback_quality_pass_rate_pct: number | null;
    m9_fallback_success_rate_pct: number | null;
    m10_release_blocking_failure_rate_pct: number | null;
  };
}
