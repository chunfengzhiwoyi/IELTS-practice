/**
 * ELS Eval Runner Phase 0 — Baseline 生成器
 * ------------------------------------------------------------
 * 读取最近一次 run 的 results.json，渲染 docs/eval/baseline-phase0.md。
 *
 * 硬性口径（§5）：
 *  - 只报告 deterministic subset 的真实结果，不推算 39 Case 总体分数
 *  - SKIPPED / UNVERIFIED / BLOCKED 不当 PASS
 *  - 发现的 Bad Case 只记录，不修复
 */
import fs from "node:fs";
import path from "node:path";

import { latestRunResults } from "../../tests/eval/runner/store";
import type { EvalCaseResult, RunResults } from "../../tests/eval/runner/types";

const OUTPUT_PATH = "docs/eval/baseline-current.md";

function statusBadge(status: string): string {
  switch (status) {
    case "PASS":
      return "✅ PASS";
    case "FAIL":
      return "❌ FAIL";
    case "BLOCKED":
      return "⛔ BLOCKED";
    case "UNVERIFIED":
      return "◐ UNVERIFIED";
    case "MANUAL_REVIEW":
      return "🔎 MANUAL_REVIEW";
    default:
      return status;
  }
}

function renderCaseTable(cases: EvalCaseResult[]): string {
  const header =
    "| Case | Category | 状态 | Severity | Failure Layer | Rows (P/F) | 延迟 ms | Spec current_expected |";
  const sep = "|---|---|---|---|---|---|---|---|";
  const rows = cases.map((c) => {
    const passRows = c.rows.filter((r) => r.status === "PASS").length;
    const failRows = c.rows.filter((r) => r.status === "FAIL").length;
    const blockedRows = c.rows.filter((r) => r.status === "BLOCKED").length;
    const rowStat = failRows > 0 || blockedRows > 0
      ? `${passRows}/${failRows}${blockedRows > 0 ? ` (+${blockedRows}B)` : ""}`
      : `${passRows}/0`;
    return `| ${c.case_id} | ${c.category} | ${statusBadge(c.status)} | ${c.severity.split("（")[0]} | ${c.failure_layer ?? "—"} | ${rowStat} | ${c.latency_ms} | ${c.spec_current_expected} |`;
  });
  return [header, sep, ...rows].join("\n");
}

function renderBadCases(cases: EvalCaseResult[]): string {
  const failed = cases.filter((c) => c.status === "FAIL");
  const blocked = cases.filter((c) => c.status === "BLOCKED");
  if (failed.length === 0 && blocked.length === 0) return "_本次 run 无 FAIL / BLOCKED case。_";

  const sections: string[] = [];
  for (const c of failed) {
    const failRows = c.rows.filter((r) => r.status === "FAIL");
    const blockedRows = c.rows.filter((r) => r.status === "BLOCKED");
    sections.push(`#### ${c.case_id}（${c.severity.split("（")[0]} · ${c.failure_layer}）\n`);
    sections.push(`- 实况：${c.actual}`);
    if (failRows.length > 0) {
      sections.push("- 违反行：");
      for (const r of failRows) {
        sections.push(`  - \`${r.row_id}\` ${r.description} — ${r.error ?? ""}`);
      }
    }
    if (blockedRows.length > 0) {
      sections.push("- 缺能力行（BLOCKED_BY_CAPABILITY）：");
      for (const r of blockedRows) {
        sections.push(`  - \`${r.row_id}\` ${r.description}`);
      }
    }
    if (c.notes) sections.push(`- 备注：${c.notes}`);
    sections.push("");
  }
  for (const c of blocked) {
    sections.push(`#### ${c.case_id}（BLOCKED）\n`);
    sections.push(`- 实况：${c.actual}`);
    if (c.error) sections.push(`- 错误：\`${c.error}\``);
    if (c.notes) sections.push(`- 备注：${c.notes}`);
    sections.push("");
  }
  return sections.join("\n");
}

function render(results: RunResults): string {
  const { manifest, metrics, cases } = results;
  const cl = metrics.case_level;
  const rl = metrics.row_level;

  return `# ELS Eval Runner — Current Baseline（M1 + M2 Phase 1 + Phase 2）

> Deterministic Phase-0 subset: ${cl.passed + cl.failed}/${manifest.subset_case_ids.length}（另有 ${cl.manual_review} 个 MANUAL_REVIEW、${cl.unverified} 个 UNVERIFIED、${cl.blocked} 个 BLOCKED 不计入判定；spec 全集 ${manifest.spec_case_count} cases，本 baseline 不推算总分）

## Run Snapshot

| 字段 | 值 |
|---|---|
| run_id | \`${manifest.run_id}\` |
| spec | ${manifest.spec} v${manifest.spec_version}（case_set ${manifest.case_set_version}） |
| git | \`${manifest.git.commit.slice(0, 8)}\` @ \`${manifest.git.branch}\`${manifest.git.dirty ? "（dirty）" : ""} |
| worktree | \`${manifest.git.worktree_path}\` |
| node / vitest | ${manifest.environment.node} / v${manifest.environment.vitest} |
| data provider | ${manifest.environment.data_provider}（memory 实现，非 Supabase） |
| auth | ${manifest.environment.auth_mode}（demo user） |
| llm | scripted mock（${manifest.environment.llm_provider}，无真实 LLM 调用） |
| started_at | ${manifest.started_at} |

## 结果总览

| 状态 | 数量（case 级） |
|---|---|
| 执行（PASS+FAIL） | ${cl.executed} |
| ✅ PASS | ${cl.passed} |
| ❌ FAIL | ${cl.failed} |
| 🔎 MANUAL_REVIEW（结构自动通过，语义需人工） | ${cl.manual_review} |
| ◐ UNVERIFIED（覆盖不完整，不当 PASS） | ${cl.unverified} |
| ⛔ BLOCKED（含基础设施/缺能力） | ${cl.blocked} |
| SKIPPED | ${cl.skipped} |

## Metrics（§3 口径）

| 指标 | 定义 | 值 |
|---|---|---|
| EVAL-M1 Eval Pass Rate | case 级 PASS / (PASS+FAIL) | ${cl.pass_rate_pct === null ? "N/A" : `${cl.pass_rate_pct}%`} |
| EVAL-M2 Bad Case Rate | 行级 FAIL / 已执行行 | ${rl.bad_case_rate_pct === null ? "N/A" : `${rl.bad_case_rate_pct}%`} |
| EVAL-M3 Critical Failure Rate | S1 FAIL 行 / 已执行行 | ${rl.critical_failure_rate_pct === null ? "N/A" : `${rl.critical_failure_rate_pct}%`} |
| EVAL-M10 Release-Blocking Rate | (S1 + 阻断型 S2) FAIL 行 / 已执行行 | ${rl.release_blocking_failure_rate_pct === null ? "N/A" : `${rl.release_blocking_failure_rate_pct}%`} |

> 行级分母：已执行 ${rl.executed} 行（PASS ${rl.passed} / FAIL ${rl.failed}）。
> Phase 0 阻断型 S2 Registry 为空（size=${rl.blocking_s2_registry_size}）→ **EVAL-M10 == EVAL-M3**。
> SKIPPED / UNVERIFIED / MANUAL_REVIEW / BLOCKED 均不计入任何分母，不允许被当 PASS。

## Case 明细

${renderCaseTable(cases)}

## 发现的 Bad Case（只记录，不修复）

${renderBadCases(cases)}

## 未覆盖断言（依赖下一阶段能力）

- **M2 Trace 字段级 schema 断言**：当前 checkpoint 已实现 M2 Phase 1+2 Trace（008/035/037/038 已记录 trace 证据至 evidence），逐字段 schema 校验（event_type/layer/status 枚举）留待 Trace Conformance Case。
- **真实 LLM 内容质量**：词卡/判题解释的内容一致性（022 等）需真实 LLM 或人工金标 → MANUAL_REVIEW。
- **事件重放重建（012）**：runner 侧无 replay==snapshot 重建能力 → capability_missing（非产品缺陷）。
- **Supabase 仓库路径（037/038）**：Phase 0 仅 memory provider。
- **未选入 subset 的 29 个 case**：含需真实 LLM / 浏览器 / M2 Trace 的场景，Phase 1+ 逐步接入。

## 复现

\`\`\`bash
npm run eval:phase0   # vitest run --config tests/eval/vitest.config.ts && tsx scripts/eval/generate-baseline.ts
\`\`\`

原始数据：\`docs/eval/runs/${manifest.run_id}/results.json\`
`;
}

function main(): void {
  const results = latestRunResults();
  const markdown = render(results);
  const out = path.resolve(process.cwd(), OUTPUT_PATH);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, markdown, "utf-8");
  process.stdout.write(`[baseline] ${OUTPUT_PATH} 已生成（run=${results.manifest.run_id}）\n`);
}

main();
