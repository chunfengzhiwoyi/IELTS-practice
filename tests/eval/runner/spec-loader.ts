/**
 * ELS Eval Runner Phase 0 — Case Loader（§1 Load Evaluation Dataset）
 * ------------------------------------------------------------
 * 读取冻结的 ELS_EVALUATION_V1_1 JSON，校验 39 个 Case 完整性。
 */
import fs from "node:fs";
import path from "node:path";

export interface SpecCase {
  case_id: string;
  category: string;
  scenario: string;
  precondition: string;
  user_input: string;
  expected_behavior: string;
  must_not_happen: string;
  pass_criteria: string[];
  failure_criteria: string;
  failure_layer: string;
  severity: string;
  required_trace_fields: string[];
  notes: string;
  audit_source: string;
  current_expected: string;
  target_expected: string;
}

export interface EvalSpec {
  meta: {
    spec: string;
    spec_version: string;
    case_count: number;
    case_set_version: string;
    status: string;
  };
  cases: SpecCase[];
}

const SPEC_PATH = "docs/eval/spec/ELS_EVALUATION_V1_1.json";
const EXPECTED_CASE_COUNT = 39;

let cached: EvalSpec | null = null;

export function loadSpec(): EvalSpec {
  if (cached) return cached;
  const filePath = path.resolve(process.cwd(), SPEC_PATH);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as EvalSpec;

  if (!Array.isArray(raw.cases)) {
    throw new Error(`[spec-loader] ${SPEC_PATH} 缺少 cases 数组`);
  }
  if (raw.cases.length !== EXPECTED_CASE_COUNT) {
    throw new Error(
      `[spec-loader] case 数量异常: 期望 ${EXPECTED_CASE_COUNT}, 实际 ${raw.cases.length}`,
    );
  }
  // ID 连续性校验
  raw.cases.forEach((c, i) => {
    const expectedId = `ELS-EVAL-${String(i + 1).padStart(3, "0")}`;
    if (c.case_id !== expectedId) {
      throw new Error(`[spec-loader] case #${i + 1} id 异常: ${c.case_id} (期望 ${expectedId})`);
    }
  });

  cached = raw;
  return raw;
}

export function getSpecCase(caseId: string): SpecCase {
  const spec = loadSpec();
  const found = spec.cases.find((c) => c.case_id === caseId);
  if (!found) {
    throw new Error(`[spec-loader] 找不到 case: ${caseId}`);
  }
  return found;
}
