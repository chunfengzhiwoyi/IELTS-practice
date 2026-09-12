/**
 * PRODUCT-LOOP-04B — Validator 单元测试（T06–T14 + gold corpus 结构回归）
 * ------------------------------------------------------------
 * 验证确定性 validator：
 *  - CORRECT/ISSUE 需要 grounded quote；幻觉 quote → UNCERTAIN（降级）
 *  - NOT_USED 必须 quote=null & attempted=false（contract violation → 保守降级）
 *  - unknown itemId → dropped；missing item → UNCERTAIN；duplicate 冲突 → UNCERTAIN
 *  - invalid enum → 保守降级；echo 结构守卫；upgradeCandidate 语义
 *  - 04A frozen gold corpus 作为回归底料（真实 answer 文本；结构性可验证部分）
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  validateTargetExpressionEvidence,
  conservativeEvidenceForTargets,
  normalizeEvidenceText,
  quoteInAnswer,
  MISSING_EVIDENCE_REASON,
  DUPLICATE_CONFLICT_REASON,
  NOT_USED_WITH_QUOTE_REASON,
  ECHO_GUARD_REASON,
  ANALYSIS_FALLBACK_REASON,
} from "@/lib/speaking/target-expression-evidence-validator";
import type { TargetExpressionUsageEvidence } from "@/lib/speaking/types";

const TARGET = "seed-003";
const CANONICAL = "take something for granted";

const TARGETS = [TARGET];
const canonicalOf = (id: string) => (id === TARGET ? CANONICAL : null);

function run(
  raw: TargetExpressionUsageEvidence[],
  answer: string,
  targetItemIds: string[] = TARGETS,
  canOf: ((id: string) => string | null) = canonicalOf,
) {
  return validateTargetExpressionEvidence({ raw, answer, targetItemIds, canonicalOf: canOf });
}

describe("T06: CORRECT + grounded quote → CORRECT", () => {
  it("quote 是 answer 的真实子串 → 保持 CORRECT，upgradeCandidate=true", () => {
    const answer = "I take my health for granted every single day.";
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "natural use" }],
      answer,
    );
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]!.assessment).toBe("CORRECT");
    expect(r.evidence[0]!.attempted).toBe(true);
    expect(r.evidence[0]!.upgradeCandidate).toBe(true);
    expect(r.summary.correctCount).toBe(1);
    expect(r.summary.groundingDowngradeCount).toBe(0);
  });

  it("quote 存在但中间空白差异（常规空白压缩）→ 仍 grounded", () => {
    const answer = "I   take   my health   for granted.";
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" }],
      answer,
    );
    expect(r.evidence[0]!.assessment).toBe("CORRECT");
  });
});

describe("T07: CORRECT + hallucinated quote → UNCERTAIN（安全降级）", () => {
  it("quote 不在 answer → 降级 UNCERTAIN，记录 grounding 失败，upgradeCandidate=false", () => {
    const answer = "I think people often forget about their health.";
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "hallucinated" }],
      answer,
    );
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
    expect(r.evidence[0]!.upgradeCandidate).toBe(false);
    expect(r.evidence[0]!.validatorNotes.some((n) => n.startsWith("grounding"))).toBe(true);
    expect(r.summary.groundingDowngradeCount).toBe(1);
  });

  it("CORRECT + 空 quote → UNCERTAIN（quote_missing）", () => {
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "", assessment: "CORRECT", reason: "no quote" }],
      "anything",
    );
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
    expect(r.evidence[0]!.reason).toContain("quote_missing");
  });
});

describe("T08: ISSUE + grounded quote → ISSUE", () => {
  it("语义误用场景（04A E20）：LLM 判 ISSUE + grounded quote → 保持 ISSUE（validator 不做语义判断）", () => {
    const answer = "I take my exam for granted because it is very hard.";
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "take my exam for granted", assessment: "ISSUE", reason: "semantic misuse" }],
      answer,
    );
    expect(r.evidence[0]!.assessment).toBe("ISSUE");
    expect(r.evidence[0]!.attempted).toBe(true);
    expect(r.evidence[0]!.upgradeCandidate).toBe(false);
    expect(r.summary.issueCount).toBe(1);
  });
});

describe("T09: NOT_USED + quote=null → NOT_USED", () => {
  it("NOT_USED 保留（OPTIONAL 契约，无惩罚）", () => {
    const r = run(
      [{ itemId: TARGET, attempted: false, quote: null, assessment: "NOT_USED", reason: "did not use" }],
      "I think people often forget about their health.",
    );
    expect(r.evidence[0]!.assessment).toBe("NOT_USED");
    expect(r.evidence[0]!.attempted).toBe(false);
    expect(r.evidence[0]!.quote).toBeNull();
    expect(r.evidence[0]!.upgradeCandidate).toBe(false);
    expect(r.summary.notUsedCount).toBe(1);
  });
});

describe("T10: NOT_USED + quote → 保守降级", () => {
  it("NOT_USED 携带 quote → contract violation → UNCERTAIN", () => {
    const r = run(
      [{ itemId: TARGET, attempted: false, quote: "take it for granted", assessment: "NOT_USED", reason: "contradictory" }],
      "I take it for granted.",
    );
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
    expect(r.evidence[0]!.reason).toBe(NOT_USED_WITH_QUOTE_REASON);
  });

  it("NOT_USED + attempted=true → contract violation → UNCERTAIN", () => {
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: null, assessment: "NOT_USED", reason: "contradictory" }],
      "whatever",
    );
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
  });
});

describe("T11: unknown itemId → dropped", () => {
  it("白名单外 itemId 不进 validated；真实 target 不受影响", () => {
    const answer = "I take my health for granted and I always bear in mind to rest.";
    const r = run(
      [
        { itemId: "seed-999", attempted: true, quote: "bear in mind", assessment: "CORRECT", reason: "forged" },
        { itemId: TARGET, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" },
      ],
      answer,
    );
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]!.itemId).toBe(TARGET);
    expect(r.summary.droppedItemIds).toContain("seed-999");
    expect(r.summary.rawEvidenceCount).toBe(2);
  });
});

describe("T12: missing item evidence → UNCERTAIN（不自动解释成 NOT_USED）", () => {
  it("模型漏判 ≠ 用户没用 → 保守 UNCERTAIN", () => {
    const r = run([], "I take my health for granted.");
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
    expect(r.evidence[0]!.reason).toBe(MISSING_EVIDENCE_REASON);
    expect(r.evidence[0]!.upgradeCandidate).toBe(false);
    expect(r.summary.uncertainCount).toBe(1);
  });
});

describe("T13: duplicate conflicting evidence → UNCERTAIN", () => {
  it("同一 itemId 两条不同 assessment → UNCERTAIN（duplicate_conflicting_evidence）", () => {
    const answer = "I take my health for granted.";
    const r = run(
      [
        { itemId: TARGET, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "a" },
        { itemId: TARGET, attempted: true, quote: "take my health for granted", assessment: "ISSUE", reason: "b" },
      ],
      answer,
    );
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
    expect(r.evidence[0]!.reason).toBe(DUPLICATE_CONFLICT_REASON);
  });

  it("同一 itemId 多条但一致（相同 assessment+quote）→ 无歧义合并为一条", () => {
    const answer = "I take my health for granted.";
    const r = run(
      [
        { itemId: TARGET, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "a" },
        { itemId: TARGET, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "b" },
      ],
      answer,
    );
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]!.assessment).toBe("CORRECT");
  });
});

describe("T14: invalid enum → 安全降级", () => {
  it("非法 assessment（如 MASTERED）→ 该条无效 → target 落 UNCERTAIN", () => {
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "take it", assessment: "MASTERED" as never, reason: "bad enum" }],
      "I take it for granted.",
    );
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
    expect(r.evidence[0]!.upgradeCandidate).toBe(false);
  });

  it("CORRECT + attempted=false 矛盾 → 不接受原样 → UNCERTAIN", () => {
    const r = run(
      [{ itemId: TARGET, attempted: false, quote: "take my health for granted", assessment: "CORRECT", reason: "conflict" }],
      "I take my health for granted.",
    );
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
  });
});

describe("0/1/2 targets 完整性（§33）", () => {
  it("0 targets → []", () => {
    const r = run([], "whatever", []);
    expect(r.evidence).toHaveLength(0);
    expect(r.summary.targetCount).toBe(0);
    expect(r.summary.validatedEvidenceCount).toBe(0);
  });

  it("2 targets → exactly 2（每 target 恰好一条）", () => {
    const answer = "I take my health for granted and I bear in mind to rest.";
    const ids = [TARGET, "seed-015"];
    const r = validateTargetExpressionEvidence({
      raw: [
        { itemId: TARGET, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" },
      ],
      answer,
      targetItemIds: ids,
      canonicalOf: (id) => (id === "seed-015" ? "bear in mind" : null),
    });
    expect(r.evidence).toHaveLength(2);
    const byId = new Map(r.evidence.map((e) => [e.itemId, e]));
    expect(byId.get(TARGET)!.assessment).toBe("CORRECT");
    expect(byId.get("seed-015")!.assessment).toBe("UNCERTAIN");
    expect(byId.get("seed-015")!.reason).toBe(MISSING_EVIDENCE_REASON);
  });
});

describe("echo 结构守卫（04A §5）", () => {
  it("quote == 提示原文 且 answer ≤10 词 → UNCERTAIN（即使 LLM 判 CORRECT）", () => {
    const answer = "Take something for granted."; // gold G28, 4 words
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "Take something for granted", assessment: "CORRECT", reason: "echo" }],
      answer,
    );
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
    expect(r.evidence[0]!.reason).toBe(ECHO_GUARD_REASON);
  });

  it("gold G29（8 词，仍 ≤ 阈值）→ 结构守卫也拦截（比 04A 结构规则更保守）", () => {
    const answer = "take something for granted... yes, I think so."; // gold G29: 8 words
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "take something for granted", assessment: "CORRECT", reason: "echo-ish" }],
      answer,
    );
    expect(r.evidence[0]!.assessment).toBe("UNCERTAIN");
    expect(r.evidence[0]!.reason).toBe(ECHO_GUARD_REASON);
  });

  it("长回答（>10 词）且 quote 为提示原文 → 结构守卫放行，由 LLM 语义层负责（04A 结论）", () => {
    const answer = "Well, actually I can say that I take something for granted when I talk about my parents.";
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "take something for granted", assessment: "CORRECT", reason: "echo-ish" }],
      answer,
    );
    // 结构层无法拦（词数超阈值）；LLM 语义层（prompt 规则）必须判 UNCERTAIN——测试如实记录 validator 边界
    expect(r.evidence[0]!.assessment).toBe("CORRECT");
  });
});

describe("normalize / quoteInAnswer 原语", () => {
  it("normalizeEvidenceText 安全变换（大小写/空白/边缘标点）", () => {
    expect(normalizeEvidenceText("  Take my health for granted. ")).toBe("take my health for granted");
    expect(normalizeEvidenceText("“Take it”")).toBe("take it");
  });

  it("quoteInAnswer 大小写/空白不敏感", () => {
    expect(quoteInAnswer("take my health for granted", "I TAKE  my health for granted!")).toBe(true);
    expect(quoteInAnswer("bear in mind", "I always remember that.")).toBe(false);
  });
});

describe("conservativeEvidenceForTargets（fallback 辅助）", () => {
  it("全部 targets → UNCERTAIN + analysis_fallback 语义 reason，无 CORRECT", () => {
    const r = conservativeEvidenceForTargets([TARGET, "seed-015"]);
    expect(r.evidence).toHaveLength(2);
    for (const e of r.evidence) {
      expect(e.assessment).toBe("UNCERTAIN");
      expect(e.reason).toBe(ANALYSIS_FALLBACK_REASON);
      expect(e.upgradeCandidate).toBe(false);
    }
    expect(r.summary.targetCount).toBe(2);
  });

  it("0 targets → []", () => {
    const r = conservativeEvidenceForTargets([]);
    expect(r.evidence).toHaveLength(0);
  });
});

describe("04A gold corpus 结构回归", () => {
  const fixturePath = path.resolve(process.cwd(), "tests/fixtures/loop-04b-gold-cases.json");
  const gold = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
    cases: Array<{ id: string; category: string; answer: string; gold: Array<{ itemId: string; label: string; reason: string }> }>;
  };

  it("53 cases 可加载，labels ∈ 4 枚举", () => {
    expect(gold.cases.length).toBe(53);
    const labels = new Set<string>();
    for (const c of gold.cases) for (const g of c.gold) labels.add(g.label);
    expect([...labels].sort()).toEqual(["CORRECT", "ISSUE", "NOT_USED", "UNCERTAIN"]);
  });

  it("NOT_USED gold（A 类）在 validator 下保持 NOT_USED（当 LLM 正确输出时）", () => {
    const a = gold.cases.find((c) => c.id === "A01")!;
    const r = run(
      [{ itemId: TARGET, attempted: false, quote: null, assessment: "NOT_USED", reason: a.gold[0]!.reason }],
      a.answer,
    );
    expect(r.evidence[0]!.assessment).toBe("NOT_USED");
  });

  it("grounded CORRECT gold（C 类形态变化）→ validator 保持 CORRECT（quote 来自真实 answer）", () => {
    const c = gold.cases.find((x) => x.id === "C14")!;
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "took her kindness for granted", assessment: "CORRECT", reason: c.gold[0]!.reason }],
      c.answer,
    );
    expect(r.evidence[0]!.assessment).toBe("CORRECT");
    expect(r.summary.groundingDowngradeCount).toBe(0);
  });

  it("FALSE_CORRECT 结构性边界如实记录：E20 语义误用 validator 保持 ISSUE（语义由 LLM 层承担）", () => {
    const e = gold.cases.find((x) => x.id === "E20")!;
    const r = run(
      [{ itemId: TARGET, attempted: true, quote: "take my exam for granted", assessment: "ISSUE", reason: e.gold[0]!.reason }],
      e.answer,
    );
    expect(r.evidence[0]!.assessment).toBe("ISSUE");
  });
});
