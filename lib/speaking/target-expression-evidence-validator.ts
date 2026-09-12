/**
 * PRODUCT-LOOP-04B — Target Expression Usage Evidence Validator
 * ------------------------------------------------------------
 * 确定性证据固化器（纯函数，无 LLM，无副作用）。
 *
 * 职责：把 Speaking analyzer 单次 LLM 调用内输出的原始
 * `TargetExpressionUsageEvidence[]` 固化为 `ValidatedTargetExpressionEvidence[]`，
 * 保证：
 *  1. 每个 frozen session target 恰好一条最终证据（0/1/2 targets 完整性）
 *  2. itemId 白名单（非 session target → drop）
 *  3. assessment 枚举校验（非法 → 该条 invalid → 目标落 UNCERTAIN）
 *  4. CORRECT/ISSUE 必须 quote 非空且 grounding 到用户真实 answer
 *     （normalization 仅做安全变换：大小写/常规空白/边缘标点）
 *  5. NOT_USED 必须 quote=null 且 attempted=false（contract violation → 保守降级 UNCERTAIN）
 *  6. missing evidence → UNCERTAIN（missing_or_invalid_model_evidence，不自动解释成 NOT_USED）
 *  7. duplicate 无歧义可合并，否则 UNCERTAIN（duplicate_conflicting_evidence）
 *  8. 短回声结构守卫（quote == 提示原文 且 answer ≤10 词 → UNCERTAIN）
 *  9. upgradeCandidate 仅当最终 assessment === CORRECT
 *
 * 语义 fit / 定义式回声 / 自我怀疑等 LLM 语义层职责由 prompt 承担
 * （04A 结论：结构性规则无法覆盖 FALSE_CORRECT 的语义类）。
 */
import type {
  TargetExpressionUsageAssessment,
  TargetExpressionUsageEvidence,
  TargetExpressionEvidenceSummary,
  ValidatedTargetExpressionEvidence,
} from "@/lib/speaking/types";

/** 与 04A §4/§7 一致的保守默认 reason 常量 */
export const MISSING_EVIDENCE_REASON = "missing_or_invalid_model_evidence";
export const DUPLICATE_CONFLICT_REASON = "duplicate_conflicting_evidence";
export const NOT_USED_WITH_QUOTE_REASON = "not_used_with_quote_contract_violation";
export const NOT_USED_WITH_ATTEMPT_REASON = "not_used_with_attempted_contract_violation";
export const CONTRADICTORY_ATTEMPTED_REASON = "contradictory_attempted_flag";
export const INVALID_ENUM_REASON = "invalid_assessment_enum";
export const ECHO_GUARD_REASON = "echo_guard_short_answer";
export const ANALYSIS_FALLBACK_REASON = "analysis_fallback_no_reliable_usage_evidence";

const ASSESSMENTS: ReadonlySet<string> = new Set(["CORRECT", "ISSUE", "UNCERTAIN", "NOT_USED"]);

/** 安全归一化：小写 + 常规空白压缩 + 仅去边缘标点/引号。不 rewrite 用户文本。 */
export function normalizeEvidenceText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(
      /^[\s"'“”‘’.,!?。，！？；;:：()（）\-]+|[\s"'“”‘’.,!?。，！？；;:：()（）\-]+$/g,
      "",
    )
    .trim();
}

/** 确定性 quote grounding：规范化后 answer 包含规范化后的 quote。 */
export function quoteInAnswer(quote: string, answer: string): boolean {
  const nq = normalizeEvidenceText(quote);
  if (nq.length === 0) return false;
  return normalizeEvidenceText(answer).includes(nq);
}

/** 词数统计（echo 结构守卫用） */
function wordCount(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export interface ValidateEvidenceInput {
  /** LLM 原始输出（可为空 / 部分 / 含越界项） */
  raw: TargetExpressionUsageEvidence[];
  /** 用户真实回答（quote grounding 的锚） */
  answer: string;
  /** 该 session frozen targets 的 itemId（白名单，顺序即输出顺序） */
  targetItemIds: string[];
  /** itemId → canonicalForm（echo 守卫用；可选） */
  canonicalOf?: (itemId: string) => string | null;
}

export interface ValidateEvidenceResult {
  evidence: ValidatedTargetExpressionEvidence[];
  summary: TargetExpressionEvidenceSummary;
}

/**
 * 固化 evidence。对每一个 frozen target 恰好输出一条最终证据。
 */
export function validateTargetExpressionEvidence(input: ValidateEvidenceInput): ValidateEvidenceResult {
  const { raw, answer, targetItemIds, canonicalOf } = input;
  const normalizedAnswer = normalizeEvidenceText(answer);
  const answerWordCount = wordCount(answer);

  // 按 itemId 分组 raw evidence（只保留白名单内；越界直接 drop）
  const byItem = new Map<string, TargetExpressionUsageEvidence[]>();
  const droppedItemIds: string[] = [];
  for (const e of raw) {
    if (!targetItemIds.includes(e.itemId)) {
      if (!droppedItemIds.includes(e.itemId)) droppedItemIds.push(e.itemId);
      continue;
    }
    const list = byItem.get(e.itemId) ?? [];
    list.push(e);
    byItem.set(e.itemId, list);
  }

  const evidence: ValidatedTargetExpressionEvidence[] = [];
  let groundingDowngradeCount = 0;

  for (const itemId of targetItemIds) {
    const raws = byItem.get(itemId) ?? [];
    const canonical = canonicalOf ? canonicalOf(itemId) : null;

    // --- missing：模型漏判 ≠ NOT_USED → 保守 UNCERTAIN ---
    if (raws.length === 0) {
      evidence.push(conservative(itemId, MISSING_EVIDENCE_REASON, ["missing_model_evidence"]));
      continue;
    }

    // --- duplicate：无歧义合并（assessment+quote 全部一致），否则 UNCERTAIN ---
    const validRaws = raws.filter((r) => ASSESSMENTS.has(r.assessment));
    if (validRaws.length === 0) {
      evidence.push(conservative(itemId, INVALID_ENUM_REASON, ["all_raw_evidence_invalid_enum"]));
      continue;
    }
    const first = validRaws[0] as TargetExpressionUsageEvidence;
    const allConsistent = validRaws.every(
      (r) => r.assessment === first.assessment && (r.quote ?? "") === (first.quote ?? ""),
    );
    if (validRaws.length > 1 && !allConsistent) {
      evidence.push(
        conservative(itemId, DUPLICATE_CONFLICT_REASON, [`duplicate_count=${validRaws.length}`]),
      );
      continue;
    }

    const validated = validateSingle(first, itemId, canonical, normalizedAnswer, answerWordCount);
    if (validated.validatorNotes.some((n) => n.startsWith("grounding"))) {
      groundingDowngradeCount += 1;
    }
    evidence.push(validated);
  }

  const summary = buildSummary(evidence, raw.length, targetItemIds.length, groundingDowngradeCount, droppedItemIds);
  return { evidence, summary };
}

function validateSingle(
  e: TargetExpressionUsageEvidence,
  itemId: string,
  canonical: string | null,
  normalizedAnswer: string,
  answerWordCount: number,
): ValidatedTargetExpressionEvidence {
  const notes: string[] = [];

  // 枚举校验（validRaws 已过滤，此处保险）
  if (!ASSESSMENTS.has(e.assessment)) {
    return conservative(itemId, INVALID_ENUM_REASON, ["invalid_assessment_enum"]);
  }

  // NOT_USED contract：quote 必须 null、attempted 必须 false
  if (e.assessment === "NOT_USED") {
    if (e.quote !== null && e.quote !== "") {
      return conservative(itemId, NOT_USED_WITH_QUOTE_REASON, ["not_used_carried_quote"]);
    }
    if (e.attempted) {
      return conservative(itemId, NOT_USED_WITH_ATTEMPT_REASON, ["not_used_carried_attempted"]);
    }
    return {
      itemId,
      attempted: false,
      quote: null,
      assessment: "NOT_USED",
      reason: e.reason || "not_used",
      upgradeCandidate: false,
      validatorNotes: notes,
    };
  }

  // UNCERTAIN：原样保留（可 attempted true/false），永不 upgradeCandidate
  if (e.assessment === "UNCERTAIN") {
    return {
      itemId,
      attempted: e.attempted,
      quote: e.quote,
      assessment: "UNCERTAIN",
      reason: e.reason || "uncertain",
      upgradeCandidate: false,
      validatorNotes: notes,
    };
  }

  // CORRECT / ISSUE：quote 必须 grounding 到 answer
  if (e.assessment === "CORRECT" || e.assessment === "ISSUE") {
    if (!e.quote || normalizeEvidenceText(e.quote).length === 0) {
      return conservative(itemId, "quote_missing_no_reliable_usage_evidence", ["grounding_missing_quote"]);
    }
    if (!normalizedAnswer.includes(normalizeEvidenceText(e.quote))) {
      return conservative(itemId, "quote_not_grounded_to_answer", ["grounding_failed_quote_not_in_answer"]);
    }
    // attempted 矛盾：CORRECT/ISSUE 要求 attempted=true
    if (e.attempted !== true) {
      return conservative(itemId, CONTRADICTORY_ATTEMPTED_REASON, ["contradictory_attempted_flag"]);
    }
    // 短回声结构守卫（04A §5）：quote == 提示原文 且 answer 很短 → 无法证明是自然应用
    if (canonical && answerWordCount <= 10 && normalizeEvidenceText(e.quote) === normalizeEvidenceText(canonical)) {
      return conservative(itemId, ECHO_GUARD_REASON, ["short_answer_exact_canonical_echo"]);
    }
    return {
      itemId,
      attempted: true,
      quote: e.quote,
      assessment: e.assessment,
      reason: e.reason || (e.assessment === "CORRECT" ? "correct_use" : "usage_issue"),
      upgradeCandidate: e.assessment === "CORRECT",
      validatorNotes: notes,
    };
  }

  // unreachable
  return conservative(itemId, INVALID_ENUM_REASON, ["unreachable"]);
}

function conservative(
  itemId: string,
  reason: string,
  notes: string[],
): ValidatedTargetExpressionEvidence {
  return {
    itemId,
    attempted: false,
    quote: null,
    assessment: "UNCERTAIN",
    reason,
    upgradeCandidate: false,
    validatorNotes: notes,
  };
}

function buildSummary(
  evidence: ValidatedTargetExpressionEvidence[],
  rawCount: number,
  targetCount: number,
  groundingDowngradeCount: number,
  droppedItemIds: string[],
): TargetExpressionEvidenceSummary {
  let correctCount = 0;
  let issueCount = 0;
  let uncertainCount = 0;
  let notUsedCount = 0;
  for (const e of evidence) {
    if (e.assessment === "CORRECT") correctCount += 1;
    else if (e.assessment === "ISSUE") issueCount += 1;
    else if (e.assessment === "UNCERTAIN") uncertainCount += 1;
    else notUsedCount += 1;
  }
  return {
    targetCount,
    rawEvidenceCount: rawCount,
    validatedEvidenceCount: evidence.length,
    correctCount,
    issueCount,
    uncertainCount,
    notUsedCount,
    groundingDowngradeCount,
    droppedItemIds,
  };
}

/** 安全回退辅助：主 LLM 分析被 quality gate / band redline / 异常接管时，全部 targets 保守 UNCERTAIN。 */
export function conservativeEvidenceForTargets(
  targetItemIds: string[],
  reason: string = ANALYSIS_FALLBACK_REASON,
): { evidence: ValidatedTargetExpressionEvidence[]; summary: TargetExpressionEvidenceSummary } {
  const evidence: ValidatedTargetExpressionEvidence[] = targetItemIds.map((itemId) => ({
    itemId,
    attempted: false,
    quote: null,
    assessment: "UNCERTAIN",
    reason,
    upgradeCandidate: false,
    validatorNotes: ["conservative_fallback"],
  }));
  return {
    evidence,
    summary: buildSummary(evidence, 0, targetItemIds.length, 0, []),
  };
}

export type { TargetExpressionUsageAssessment };
