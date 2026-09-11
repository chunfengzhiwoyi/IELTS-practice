/**
 * ELS Eval Runner — 39 Case Registry（M3-P1 · M3-P3 更新）
 * ------------------------------------------------------------
 * 目标：39/39 Case 全部进入 Runner Registry。
 * 纪律：进入 Registry ≠ 已执行 ≠ PASS。
 *
 * adapter_kind：
 *  - deterministic  = A 级 deterministic adapter（真实执行）
 *  - manual_packet  = B 级 Manual Review Packet（probe 执行 → MANUAL_REVIEW，人工终审）
 *  - special_tool   = C 级 special-tool adapter（M3-P3 已实现：replay/E2E/acceptance 工具真实执行）
 *  - placeholder    = 无工具可执行的 C 级占位（不执行，UNVERIFIED/BLOCKED）
 *
 * missing_capability：该 Case 当前无法完整执行的能力缺口（非产品缺陷即如实标注）。
 * M3-P3：013/034/039 三个 C 级 special tool 已实现（tests/eval/tools/），从缺口表移除。
 */
import { loadSpec } from "./spec-loader";
import { frozenAutomationLevel } from "./metrics";
import type { Severity } from "./types";

export type AutomationLevel = "A" | "B" | "C";
export type AdapterKind = "deterministic" | "manual_packet" | "special_tool" | "placeholder";

export interface RegistryEntry {
  case_id: string;
  category: string;
  severity: Severity;
  automation_level: AutomationLevel;
  adapter_kind: AdapterKind;
  missing_capability: string[];
  required_trace_fields: string[];
}

/** M3-P1 能力缺口 / 工具需求（按 Frozen Contract 与产品现状逐案标注；M3-P3 移除已实现项；M3-P4A 按真实执行刷新） */
const MISSING_CAPABILITY: Record<string, string[]> = {
  "ELS-EVAL-016": ["human/LLM-as-judge 终审（actionability 语义）"],
  "ELS-EVAL-018": ["human 抽检（改善显著性）"],
  "ELS-EVAL-019": ["human 仲裁（S1 红线不冒自动判风险）"],
  "ELS-EVAL-020": ["PRODUCT_CAPABILITY_GAP：trace 埋点 band_leakage_flag / analysis_path / final_response_redacted（候选 BC-020-R1）"],
  "ELS-EVAL-023": ["PRODUCT_CAPABILITY_GAP：generationMeta.knowledge_miss 字段（与 035 同根因，候选 BC-035-R2 覆盖）", "semantic retrieval（行 1，FUTURE_TARGET / P0-4）"],
  "ELS-EVAL-025": ["PRODUCT_CAPABILITY_GAP：retrieval precision warning（候选 BC-025-R1）"],
  "ELS-EVAL-035": ["PRODUCT_CAPABILITY_GAP：generationMeta.knowledge_miss 字段（候选 BC-035-R2）", "连字符规范化（FUTURE_TARGET / P0-4）"],
};

export function buildRegistry(): RegistryEntry[] {
  const spec = loadSpec();
  return spec.cases.map((c) => {
    const level = frozenAutomationLevel(c.case_id);
    const adapterKind: AdapterKind =
      level === "C"
        ? c.case_id === "ELS-EVAL-013" || c.case_id === "ELS-EVAL-034" || c.case_id === "ELS-EVAL-039"
          ? "special_tool"
          : "placeholder"
        : level === "B"
          ? "manual_packet"
          : "deterministic";
    return {
      case_id: c.case_id,
      category: c.category,
      severity: (c.severity.startsWith("S") ? c.severity : "S3") as Severity,
      automation_level: level,
      adapter_kind: adapterKind,
      missing_capability: MISSING_CAPABILITY[c.case_id] ?? [],
      required_trace_fields: c.required_trace_fields,
    };
  });
}

export const REGISTRY: RegistryEntry[] = buildRegistry();
