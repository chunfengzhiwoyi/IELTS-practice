/**
 * ELS Eval Runner — Master Entry（M3-P1：39/39 Registry 全覆盖）
 * ------------------------------------------------------------
 * 真实运行全部 39 个 Frozen Gold Case（A deterministic + B probe + C placeholder），
 * 结果落盘 docs/eval/runs/<run_id>/results.json。
 *
 * 退出语义：
 *  - 基础设施错误（spec 加载失败、case 未产出结果、10 Case 回归漂移）→ 测试失败
 *  - Gold 违反（FAIL/BLOCKED/UNVERIFIED/MANUAL_REVIEW）→ 只记录，不 fail 测试
 *    （Bad Case 记录进 results.json 与 bad-case-registry.json，由 m3 文档生成器汇总）
 *
 * M3-P1 纪律：
 *  - 进入 Registry ≠ 已执行 ≠ PASS；状态见 metrics.coverage
 *  - 未执行 Case 不得被当作 PASS
 *  - 10 Case 回归：既有 10 个 Case 状态不得因 Runner 扩展发生漂移（FROZEN_10_CASE_BASELINE）
 */
import { afterAll, describe, expect, it } from "vitest";

import { CASES, SUBSET_CASE_IDS, FROZEN_10_CASE_BASELINE } from "./cases";
import { runEvalCase } from "./runner/harness";
import { computeMetrics } from "./runner/metrics";
import { createRunManifest } from "./runner/env-snapshot";
import { writeRunResults } from "./runner/store";
import { getSpecCase, loadSpec } from "./runner/spec-loader";
import type { EvalCaseResult, RunResults } from "./runner/types";

const results: EvalCaseResult[] = [];
let runId = "";

/** case 执行抛出非预期异常 → 合成 BLOCKED 结果（基础设施不可用，非 Gold 判定） */
async function safeRunCase(caseId: string): Promise<EvalCaseResult> {
  const def = CASES.find((c) => c.case_id === caseId);
  if (!def) throw new Error(`case 定义缺失: ${caseId}`);
  try {
    return await runEvalCase(def, runId);
  } catch (err) {
    const spec = getSpecCase(caseId);
    return {
      run_id: runId,
      case_id: caseId,
      category: spec.category,
      status: "BLOCKED",
      coverage: "partial",
      severity: (spec.severity.startsWith("S") ? spec.severity : "S3") as EvalCaseResult["severity"],
      failure_layer: "EVAL_INFRA",
      expected: spec.expected_behavior,
      actual: "case 执行抛出非预期异常",
      latency_ms: 0,
      rows: [],
      uncovered_assertions: [],
      spec_current_expected: spec.current_expected,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      notes: "EVAL_INFRA 错误：runner/产品接口不匹配，需修 runner（不改产品代码）。",
    };
  }
}

describe("ELS Eval Runner M3-P1（39/39）", () => {
  it("§1 spec 加载：39 cases、ID 连续（基础设施校验）", () => {
    const spec = loadSpec();
    expect(spec.cases).toHaveLength(39);
    expect(spec.cases[0]!.case_id).toBe("ELS-EVAL-001");
    expect(spec.cases[38]!.case_id).toBe("ELS-EVAL-039");
    expect(spec.meta.spec_version).toBeTruthy();
  });

  it("§2 Registry：39/39 全部进入 Runner Registry（注册表与 spec 对齐）", () => {
    expect(CASES).toHaveLength(39);
    expect(SUBSET_CASE_IDS).toHaveLength(39);
    const specIds = new Set(loadSpec().cases.map((c) => c.case_id));
    for (const id of SUBSET_CASE_IDS) {
      expect(specIds.has(id)).toBe(true);
    }
    // 无重复注册
    expect(new Set(SUBSET_CASE_IDS).size).toBe(39);
  });

  it("§1 manifest：run_id / git / environment 快照产出", () => {
    const manifest = createRunManifest(SUBSET_CASE_IDS);
    runId = manifest.run_id;
    expect(runId).toMatch(/^m3-\d{8}-\d{6}$/);
    expect(manifest.git.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(manifest.environment.data_provider).toBe("memory");
  });

  for (const def of CASES) {
    it(`${def.case_id} — ${getSpecCase(def.case_id).category}`, async () => {
      const result = await safeRunCase(def.case_id);
      results.push(result);
      // 基础设施断言：必须产出结构化结果（Gold 状态不在此断言）
      expect(result).toBeTruthy();
      expect(result.case_id).toBe(def.case_id);
      expect(["PASS", "FAIL", "SKIPPED", "BLOCKED", "UNVERIFIED", "MANUAL_REVIEW", "NOT_RUN"]).toContain(
        result.status,
      );
      expect(Array.isArray(result.rows)).toBe(true);
      expect(typeof result.latency_ms).toBe("number");
    });
  }

  it("§3 39 个 case 全部执行且状态可汇总（无重复）", () => {
    expect(results).toHaveLength(39);
    const ids = new Set(results.map((r) => r.case_id));
    expect(ids.size).toBe(39);
  });

  it("§3 10 Case 回归：既有 10 个 Case 状态不因 Runner 扩展漂移", () => {
    for (const [caseId, expectedStatus] of Object.entries(FROZEN_10_CASE_BASELINE)) {
      const result = results.find((r) => r.case_id === caseId);
      expect(result, `${caseId} 应已执行`).toBeTruthy();
      expect(
        result!.status,
        `${caseId} 回归漂移：frozen=${expectedStatus}, actual=${result!.status}`,
      ).toBe(expectedStatus);
    }
  });

  afterAll(() => {
    // §1 Result Persistence：落盘（最后一步，供 m3 文档生成器读取）
    const manifest = createRunManifest(SUBSET_CASE_IDS);
    const runResults: RunResults = {
      manifest: { ...manifest, run_id: runId || manifest.run_id },
      metrics: computeMetrics(results),
      cases: results,
    };
    const file = writeRunResults(runResults);
    // eslint-disable-next-line no-console
    console.log(
      `[eval-m3] run=${runResults.manifest.run_id} ` +
        `registered=${runResults.metrics.coverage.registered_cases}/39 ` +
        `executed=${runResults.metrics.coverage.executed_cases} ` +
        `pass=${runResults.metrics.coverage.auto_pass} ` +
        `fail=${runResults.metrics.coverage.fail} ` +
        `manual_review=${runResults.metrics.coverage.manual_review} ` +
        `unverified=${runResults.metrics.coverage.unverified} ` +
        `blocked=${runResults.metrics.coverage.blocked} ` +
        `not_run=${runResults.metrics.coverage.not_run} ` +
        `→ ${file}`,
    );
  });
});
