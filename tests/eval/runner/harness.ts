/**
 * ELS Eval Runner — Harness（M3-P1 扩展）
 * ------------------------------------------------------------
 * 每个 Case 的执行环境：
 *  - resetCase(): 环境变量 + 所有单例/缓存重置（每 Case 或每行调用）
 *  - clock: 冻结/推进系统时钟（vi fake timers, toFake=["Date"]）
 *  - rec: 行级断言记录器（gold 违反只记录，不抛异常）
 *  - script(): 注册脚本化 LLM Provider（mock kind）
 *
 * 状态语义：
 *  FAIL > BLOCKED > (PASS if coverage=full else UNVERIFIED/MANUAL_REVIEW)
 *
 * M3-P1 补充：
 *  - EvalCaseDefinition 携带 Frozen Contract 可判性分级（A/B/C）与能力缺口
 *  - runEvalCase 结果写入 automation_level / missing_capability
 */

import { vi } from "vitest";

import { __setProviderForTests, __resetRegistryForTests } from "@/lib/llm/provider-registry";
import { _resetRepositories } from "@/lib/repository-factory";
import { traceStore } from "@/lib/observability/trace-store";
import { __resetKnowledgeCacheForTests } from "@/lib/knowledge/retrieval";
import { __resetCatalogForTests } from "@/lib/learning/seed-catalog";
import { resetServerEnvCacheForTests } from "@/lib/env";

import { getSpecCase, type SpecCase } from "./spec-loader";
import { createScriptedProvider, type ScriptStep, type ScriptedProvider } from "./stub-llm";
import { frozenAutomationLevel } from "./metrics";
import type {
  EvalCaseResult,
  EvalCaseStatus,
  EvalRow,
  Severity,
} from "./types";

// =============================================================
// 环境重置
// =============================================================

export function applyEvalEnv(): void {
  process.env.DATA_PROVIDER = "memory";
  process.env.AUTH_MODE = "demo";
  process.env.DEMO_REVIEW_SEED_ENABLED = "false";
  process.env.LLM_PRIMARY_PROVIDER = "mock";
  process.env.LLM_FALLBACK_ENABLED = "false";
  process.env.LLM_MOCK_ENABLED = "true";
  // 非 mock primary（bailian/deepseek）测试所需的最小占位配置：
  // 仅当 adapter 把 primary 切到对应 kind 时被 env 校验消费（scripted provider 会覆盖真实调用）
  process.env.BAILIAN_API_KEY = "eval-test-key";
  process.env.BAILIAN_BASE_URL = "http://localhost:3001";
  process.env.BAILIAN_FAST_MODEL = "eval-fast";
  process.env.BAILIAN_MAIN_MODEL = "eval-main";
  process.env.DEEPSEEK_API_KEY = "eval-test-key";
  process.env.DEEPSEEK_BASE_URL = "http://localhost:3001";
  process.env.DEEPSEEK_FAST_MODEL = "eval-fast";
  process.env.DEEPSEEK_MAIN_MODEL = "eval-main";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function resetCase(): void {
  applyEvalEnv();
  resetServerEnvCacheForTests();
  __resetRegistryForTests();
  _resetRepositories();
  traceStore.reset();
  __resetKnowledgeCacheForTests();
  __resetCatalogForTests();
}

// =============================================================
// 时钟控制
// =============================================================

export interface ClockController {
  freeze(iso: string): void;
  advance(ms: number): void;
  now(): Date;
  restore(): void;
}

function createClock(): ClockController {
  return {
    freeze(iso: string) {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(iso));
    },
    advance(ms: number) {
      vi.setSystemTime(new Date(Date.now() + ms));
    },
    now() {
      return new Date();
    },
    restore() {
      vi.useRealTimers();
    },
  };
}

// =============================================================
// 行级断言记录器
// =============================================================

export interface CheckOptions {
  severity?: Severity;
  failure_layer?: string;
  evidence?: Record<string, unknown>;
  /** 该行计入的域指标（M4..M9） */
  metrics?: string[];
}

export class CaseRecorder {
  readonly rows: EvalRow[] = [];
  readonly uncovered: string[] = [];

  constructor(private readonly caseSeverity: Severity) {}

  /** 记录一条 deepEqual 断言（gold 违反只记录） */
  check(
    row_id: string,
    description: string,
    expected: unknown,
    actual: unknown,
    options: CheckOptions = {},
  ): EvalRow {
    const ok = deepEqual(expected, actual);
    const row: EvalRow = {
      row_id,
      description,
      status: ok ? "PASS" : "FAIL",
      expected,
      actual,
      severity: options.severity ?? this.caseSeverity,
      failure_layer: options.failure_layer,
      evidence: options.evidence,
      metrics: options.metrics,
      error: ok ? undefined : describeDifference(expected, actual),
    };
    this.rows.push(row);
    return row;
  }

  /** 产品缺能力 → BLOCKED_BY_CAPABILITY */
  blocked(
    row_id: string,
    description: string,
    expected: unknown,
    actual: unknown,
    options: CheckOptions = {},
  ): EvalRow {
    const row: EvalRow = {
      row_id,
      description,
      status: "BLOCKED",
      expected,
      actual,
      severity: options.severity ?? this.caseSeverity,
      failure_layer: options.failure_layer,
      error: "BLOCKED_BY_CAPABILITY",
      evidence: options.evidence,
      metrics: options.metrics,
    };
    this.rows.push(row);
    return row;
  }

  /** 覆盖不完整的 spec 断言（依赖真实 LLM / UI / M2 Trace / 专用工具） */
  uncoveredAssertion(description: string): void {
    this.uncovered.push(description);
  }
}

// =============================================================
// Case 上下文与执行
// =============================================================

export interface EvalCaseContext {
  run_id: string;
  case_id: string;
  spec: SpecCase;
  rec: CaseRecorder;
  clock: ClockController;
  /** 完整环境重置（每行隔离时调用） */
  reset(): void;
  /** 注册脚本化 LLM provider（覆盖 mock kind；可指定其它 kind 用于非 mock primary 场景） */
  script(steps: ScriptStep[], kind?: "mock" | "bailian" | "deepseek"): ScriptedProvider;
}

export interface EvalCaseDefinition {
  case_id: string;
  /**
   * Frozen Contract §5.2 可判性分级：A=AUTO / B=MANUAL/SEMI-AUTO / C=SPECIAL_TOOL。
   * 不填写时由 frozenAutomationLevel(case_id) 推导（29A/7B/3C 冻结表）。
   */
  automation_level?: "A" | "B" | "C";
  /** 能力缺口 / 需要的专用工具（C 级与 BLOCKED 场景） */
  missing_capability?: string[];
  run(ctx: EvalCaseContext): Promise<EvalCaseOutcome>;
}

export interface EvalCaseOutcome {
  coverage: "full" | "partial";
  /** 实际观测摘要（写入 EvalCaseResult.actual） */
  actualSummary: string;
  notes?: string;
  /**
   * coverage 不完整时的 Case 状态（默认 UNVERIFIED）。
   * MANUAL_REVIEW：确定性结构断言已通过，剩余需人工金标复核（如 UI copy / 语义内容质量）。
   */
  uncoveredMode?: "UNVERIFIED" | "MANUAL_REVIEW";
}

export async function runEvalCase(
  def: EvalCaseDefinition,
  run_id: string,
): Promise<EvalCaseResult> {
  resetCase();
  const spec = getSpecCase(def.case_id);
  const severity = (spec.severity.startsWith("S") ? spec.severity : "S3") as Severity;
  const rec = new CaseRecorder(severity);
  const clock = createClock();

  const ctx: EvalCaseContext = {
    run_id,
    case_id: def.case_id,
    spec,
    rec,
    clock,
    reset: resetCase,
    script(steps: ScriptStep[], kind: "mock" | "bailian" | "deepseek" = "mock") {
      const scripted = createScriptedProvider(steps);
      __setProviderForTests(kind, scripted.provider);
      return scripted;
    },
  };

  const started = performance.now();
  let outcome: EvalCaseOutcome;
  try {
    outcome = await def.run(ctx);
  } finally {
    clock.restore();
  }
  const latencyMs = Math.round((performance.now() - started) * 100) / 100;

  // ---- 状态推导：FAIL > BLOCKED > (PASS if full else UNVERIFIED/MANUAL_REVIEW) ----
  const executedRows = rec.rows.filter((r) => r.status === "PASS" || r.status === "FAIL");
  const failRows = rec.rows.filter((r) => r.status === "FAIL");

  let status: EvalCaseStatus;
  if (failRows.length > 0) {
    status = "FAIL";
  } else if (executedRows.length === 0) {
    status = "BLOCKED";
  } else if (outcome.coverage === "full" && rec.uncovered.length === 0) {
    status = "PASS";
  } else {
    status = outcome.uncoveredMode ?? "UNVERIFIED";
  }

  const firstFail = failRows[0];

  return {
    run_id,
    case_id: def.case_id,
    category: spec.category,
    status,
    coverage: outcome.coverage,
    severity,
    automation_level: def.automation_level ?? frozenAutomationLevel(def.case_id),
    missing_capability: def.missing_capability,
    failure_layer: firstFail?.failure_layer ?? parseFailureLayer(spec.failure_layer),
    expected: spec.expected_behavior,
    actual: outcome.actualSummary,
    latency_ms: latencyMs,
    rows: rec.rows,
    uncovered_assertions: rec.uncovered,
    spec_current_expected: spec.current_expected,
    notes: outcome.notes,
  };
}

function parseFailureLayer(raw: string): string {
  // spec 里 failure_layer 可能带括号说明，如 "BUSINESS_RULE（确定性短路缺失）"
  const m = raw.match(/^([A-Z_]+)/);
  return m?.[1] ?? raw;
}

// =============================================================
// 深比较工具（gold 违反不抛异常，只记录）
// =============================================================

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-9;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function describeDifference(expected: unknown, actual: unknown): string {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e === a) return "不等（结构差异）";
  return `expected=${e?.slice(0, 300)} | actual=${a?.slice(0, 300)}`;
}
