/**
 * ELS Eval Runner — Case 注册表（M3-P1：39/39 全覆盖 · M3-P3：C 级工具已实现）
 * ------------------------------------------------------------
 * 全部 39 个 Frozen Gold Case 均有 adapter：
 *  - 29 个 A 级 deterministic adapter（真实路由/仓库直驱 + scripted LLM）
 *  - 7 个 B 级 Manual Review Packet probe（结构断言 + 人工终审 → MANUAL_REVIEW）
 *  - 3 个 C 级 special-tool adapter（M3-P3 已实现：013 replay harness / 034 E2E browser / 039 acceptance tool）
 *
 * 纪律：进入 Registry ≠ 已执行 ≠ PASS；状态见 m3-runner-coverage.md。
 */
import type { EvalCaseDefinition } from "../runner/harness";

import { case_001 } from "./els-eval-001.eval";
import { case_002 } from "./els-eval-002.eval";
import { case_003 } from "./els-eval-003.eval";
import { case_004 } from "./els-eval-004.eval";
import { case_005 } from "./els-eval-005.eval";
import { case_006 } from "./els-eval-006.eval";
import { case_007 } from "./els-eval-007.eval";
import { case_008 } from "./els-eval-008.eval";
import { case_009 } from "./els-eval-009.eval";
import { case_010 } from "./els-eval-010.eval";
import { case_011 } from "./els-eval-011.eval";
import { case_012 } from "./els-eval-012.eval";
import { case_013 } from "./els-eval-013.eval";
import { case_014 } from "./els-eval-014.eval";
import { case_015 } from "./els-eval-015.eval";
import { case_016 } from "./els-eval-016.eval";
import { case_017 } from "./els-eval-017.eval";
import { case_018 } from "./els-eval-018.eval";
import { case_019 } from "./els-eval-019.eval";
import { case_020 } from "./els-eval-020.eval";
import { case_021 } from "./els-eval-021.eval";
import { case_022 } from "./els-eval-022.eval";
import { case_023 } from "./els-eval-023.eval";
import { case_024 } from "./els-eval-024.eval";
import { case_025 } from "./els-eval-025.eval";
import { case_026 } from "./els-eval-026.eval";
import { case_027 } from "./els-eval-027.eval";
import { case_028 } from "./els-eval-028.eval";
import { case_029 } from "./els-eval-029.eval";
import { case_030 } from "./els-eval-030.eval";
import { case_031 } from "./els-eval-031.eval";
import { case_032 } from "./els-eval-032.eval";
import { case_033 } from "./els-eval-033.eval";
import { case_034 } from "./els-eval-034.eval";
import { case_035 } from "./els-eval-035.eval";
import { case_036 } from "./els-eval-036.eval";
import { case_037 } from "./els-eval-037.eval";
import { case_038 } from "./els-eval-038.eval";
import { case_039 } from "./els-eval-039.eval";

export const CASES: EvalCaseDefinition[] = [
  case_001, case_002, case_003, case_004, case_005, case_006, case_007,
  case_008, case_009, case_010, case_011, case_012, case_013, case_014,
  case_015, case_016, case_017, case_018, case_019, case_020, case_021,
  case_022, case_023, case_024, case_025, case_026, case_027, case_028,
  case_029, case_030, case_031, case_032, case_033, case_034, case_035,
  case_036, case_037, case_038, case_039,
];

export const SUBSET_CASE_IDS = CASES.map((c) => c.case_id);

/** 既有 10 Case 回归基线（M2 EVAL-RUN-02 冻结状态；扩展不得引起漂移） */
export const FROZEN_10_CASE_BASELINE: Record<string, string> = {
  // M3-P1 基线。M3-P4A 有意重新分类（非漂移，见 m3-p4a-summary.md）：
  // 010 MANUAL_REVIEW→PASS（UI 空态 E2E 闭环）、012 UNVERIFIED→PASS（replay-harness 复用）、
  // 022 MANUAL_REVIEW→PASS（确定性内容一致性 judge）；035 保持 UNVERIFIED（BC-035-R2 缺口）。
  "ELS-EVAL-008": "PASS",
  "ELS-EVAL-009": "PASS",
  "ELS-EVAL-010": "PASS",
  "ELS-EVAL-011": "PASS",
  "ELS-EVAL-012": "PASS",
  "ELS-EVAL-022": "PASS",
  "ELS-EVAL-032": "PASS",
  "ELS-EVAL-035": "UNVERIFIED",
  "ELS-EVAL-037": "PASS",
  "ELS-EVAL-038": "PASS",
};
