/**
 * PRODUCT-LOOP-04E — Derivation 测试（T01–T12 + 04D §9 S01–S20 场景）
 * ------------------------------------------------------------
 * 验证 deriveApplicationLevel 纯函数：C/D/K 规则、去重、pipeline 过滤、
 * order/duplicate insensitive、假阳性韧性、per-item 独立。
 */
import { describe, expect, it } from "vitest";

import {
  deriveApplicationLevel,
  type ApplicationEvidenceRecord,
} from "@/lib/learning/application-evidence";

function rec(
  partial: Partial<ApplicationEvidenceRecord> & { sessionId: string },
): ApplicationEvidenceRecord {
  return {
    evidenceId: `ev:${partial.userId ?? "u"}:${partial.itemId ?? "i"}:${partial.sessionId}`,
    userId: partial.userId ?? "u",
    itemId: partial.itemId ?? "i",
    sessionId: partial.sessionId,
    questionId: partial.questionId ?? "q1",
    part: partial.part ?? "P2",
    topic: partial.topic ?? "t1",
    assessment: partial.assessment ?? "CORRECT",
    quote: partial.quote ?? "quote",
    reason: partial.reason ?? "reason",
    validatorNotes: partial.validatorNotes ?? [],
    upgradeCandidate:
      partial.upgradeCandidate ?? (partial.assessment ?? "CORRECT") === "CORRECT",
    recoveredViaRetry: partial.recoveredViaRetry ?? false,
    recordedAt: partial.recordedAt ?? "2026-09-01T10:00:00.000Z",
    pipelineVersion: partial.pipelineVersion ?? "04B-validator-1",
    provider: partial.provider ?? null,
    model: partial.model ?? null,
  };
}

const D1 = "2026-09-01T10:00:00.000Z";
const D2 = "2026-09-02T10:00:00.000Z";
const D3 = "2026-09-03T10:00:00.000Z";

describe("T01–T07: 晋级规则", () => {
  it("T01: 0 evidence → 0", () => {
    expect(deriveApplicationLevel([])).toBe(0);
  });

  it("T02: 1 CORRECT → 0（单条不晋级）", () => {
    expect(deriveApplicationLevel([rec({ sessionId: "s1", recordedAt: D1 })])).toBe(0);
  });

  it("T03: 2 CORRECT / 2 sessions → 1（同日也允许 L1）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1" }),
      rec({ sessionId: "s2", recordedAt: D1, questionId: "q2" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });

  it("T04: 2 CORRECT 同一 session → 0（去重只算 1）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, quote: "first use" }),
      rec({ sessionId: "s1", recordedAt: D1, quote: "second use" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("T05: 3 CORRECT / 3 sessions / 2 days / 2 contexts → 2", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1", topic: "health" }),
      rec({ sessionId: "s2", recordedAt: D2, questionId: "q2", topic: "health" }),
      rec({ sessionId: "s3", recordedAt: D3, questionId: "q3", topic: "work" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(2);
  });

  it("T06: 3 CORRECT 全同一天 → 1（D<2 不能 L2）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1", topic: "t1" }),
      rec({ sessionId: "s2", recordedAt: D1, questionId: "q2", topic: "t2" }),
      rec({ sessionId: "s3", recordedAt: D1, questionId: "q3", topic: "t3" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });

  it("T07: 3 CORRECT 只有一个 context → 1（K<2 不能 L2）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1", topic: "health" }),
      rec({ sessionId: "s2", recordedAt: D2, questionId: "q1", topic: "health" }),
      rec({ sessionId: "s3", recordedAt: D3, questionId: "q1", topic: "health" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });
});

describe("T08–T10: 非 CORRECT 行为", () => {
  it("T08: ISSUE 不参与正向计数 → 0", () => {
    const h = [rec({ sessionId: "s1", assessment: "ISSUE", upgradeCandidate: false })];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("T09: NOT_USED 是 NO-OP → 0", () => {
    const h = [
      rec({
        sessionId: "s1",
        assessment: "NOT_USED",
        quote: null,
        upgradeCandidate: false,
      }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("T10: UNCERTAIN 是 NO-OP → 0", () => {
    const h = [
      rec({
        sessionId: "s1",
        assessment: "UNCERTAIN",
        quote: null,
        upgradeCandidate: false,
      }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });
});

describe("T11–T12 + S01–S20: 04D 场景表", () => {
  it("T11: order-insensitive（输入顺序不影响结果）", () => {
    const a = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1", topic: "health" }),
      rec({ sessionId: "s2", recordedAt: D2, questionId: "q2", topic: "work" }),
      rec({ sessionId: "s3", recordedAt: D3, questionId: "q3", topic: "travel" }),
    ];
    const b = [a[2]!, a[0]!, a[1]!];
    expect(deriveApplicationLevel(a)).toBe(2);
    expect(deriveApplicationLevel(b)).toBe(2);
  });

  it("T12 / S20: duplicate-insensitive（同 sessionId 重复 analyze 不虚增）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1 }),
      rec({ sessionId: "s1", recordedAt: D2 }), // 同 session 重复 analyze
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("S01: 0 evidence → 0", () => {
    expect(deriveApplicationLevel([])).toBe(0);
  });

  it("S02: 1 CORRECT（1 session）→ 0", () => {
    expect(deriveApplicationLevel([rec({ sessionId: "s1" })])).toBe(0);
  });

  it("S03: first+second 都正确的同 session → C=1 → 0", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, quote: "first" }),
      rec({ sessionId: "s1", recordedAt: D2, quote: "second" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("S04: 2 CORRECT / 2 sessions / 同日 → 1", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1 }),
      rec({ sessionId: "s2", recordedAt: D1 }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });

  it("S05: 2 CORRECT / 2 不同日 → 1", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1 }),
      rec({ sessionId: "s2", recordedAt: D2 }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });

  it("S06: 3 CORRECT / 3 sessions / 同日 / 同题 → 1", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1" }),
      rec({ sessionId: "s2", recordedAt: D1, questionId: "q1" }),
      rec({ sessionId: "s3", recordedAt: D1, questionId: "q1" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });

  it("S07: 3 CORRECT / 3 sessions / 2 天 / 2 语境 → 2", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1", topic: "health" }),
      rec({ sessionId: "s2", recordedAt: D2, questionId: "q2", topic: "health" }),
      rec({ sessionId: "s3", recordedAt: D3, questionId: "q3", topic: "work" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(2);
  });

  it("S08: CORRECT + ISSUE → C=1 → 0", () => {
    const h = [
      rec({ sessionId: "s1", assessment: "CORRECT" }),
      rec({ sessionId: "s2", assessment: "ISSUE", upgradeCandidate: false }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("S09: CORRECT + NOT_USED → 0", () => {
    const h = [
      rec({ sessionId: "s1", assessment: "CORRECT" }),
      rec({ sessionId: "s2", assessment: "NOT_USED", quote: null, upgradeCandidate: false }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("S10: CORRECT + UNCERTAIN → 0", () => {
    const h = [
      rec({ sessionId: "s1", assessment: "CORRECT" }),
      rec({ sessionId: "s2", assessment: "UNCERTAIN", quote: null, upgradeCandidate: false }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("S11: 2 CORRECT + 后置 ISSUE → 1（不降级）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, assessment: "CORRECT" }),
      rec({ sessionId: "s2", recordedAt: D2, assessment: "CORRECT" }),
      rec({ sessionId: "s3", recordedAt: D3, assessment: "ISSUE", upgradeCandidate: false }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });

  it("S12: Level 2 状态 + 1 次 ISSUE → 2（单次 ISSUE 绝不降级）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1", topic: "health" }),
      rec({ sessionId: "s2", recordedAt: D2, questionId: "q2", topic: "work" }),
      rec({ sessionId: "s3", recordedAt: D3, questionId: "q3", topic: "travel" }),
      rec({ sessionId: "s4", recordedAt: D3, assessment: "ISSUE", upgradeCandidate: false }),
    ];
    expect(deriveApplicationLevel(h)).toBe(2);
  });

  it("S13: 重试 ISSUE→CORRECT（同 session）→ C=1 → 0", () => {
    const h = [
      rec({
        sessionId: "s1",
        recordedAt: D1,
        assessment: "CORRECT",
        recoveredViaRetry: true,
      }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("S14: 同一 session 三次重试全 CORRECT → C=1 → 0", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1 }),
      rec({ sessionId: "s1", recordedAt: D2 }),
      rec({ sessionId: "s1", recordedAt: D3 }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("S15: 2 个不同 question / 同日（2 session）→ 1", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1" }),
      rec({ sessionId: "s2", recordedAt: D1, questionId: "q2" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });

  it("S16: 同 question 跨不同日（2 session）→ 1", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1" }),
      rec({ sessionId: "s2", recordedAt: D2, questionId: "q1" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });

  it("S17: per-item 独立（A 晋级不影响 B）", () => {
    const a = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1", topic: "health", itemId: "A" }),
      rec({ sessionId: "s2", recordedAt: D2, questionId: "q2", topic: "work", itemId: "A" }),
      rec({ sessionId: "s3", recordedAt: D3, questionId: "q3", topic: "travel", itemId: "A" }),
    ];
    const b = [rec({ sessionId: "s1", itemId: "B", assessment: "ISSUE", upgradeCandidate: false })];
    expect(deriveApplicationLevel(a)).toBe(2);
    expect(deriveApplicationLevel(b)).toBe(0);
  });

  it("S18: 单条假阳性 CORRECT → 0（无法晋级）", () => {
    const h = [rec({ sessionId: "s1", recordedAt: D1 })];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("S19: 旧 pipeline 证据不参与晋级；新 1 条 → 0", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, pipelineVersion: "" }), // 无 provenance 旧证据
      rec({ sessionId: "s2", recordedAt: D2, pipelineVersion: "04B-validator-1" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("S19b: 旧 pipeline 证据不阻断新证据晋级（2 新 CORRECT → 1）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, pipelineVersion: "old-rule" }),
      rec({ sessionId: "s2", recordedAt: D2, pipelineVersion: "04B-validator-1" }),
      rec({ sessionId: "s3", recordedAt: D3, pipelineVersion: "04B-validator-1" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(1);
  });

  it("S20b: 重复 session evidence（同 sessionId 被重复 analyze）→ C=1 → 0", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, quote: "a" }),
      rec({ sessionId: "s1", recordedAt: D2, quote: "b" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(0);
  });

  it("K 取较大口径：topic 相同但 question 不同 → K=2（distinct question）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1", topic: "health" }),
      rec({ sessionId: "s2", recordedAt: D2, questionId: "q2", topic: "health" }),
      rec({ sessionId: "s3", recordedAt: D3, questionId: "q3", topic: "health" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(2); // D=3, K=max(3,1)=3
  });

  it("K 取较大口径：question 相同但 topic 不同 → K=2（distinct topic）", () => {
    const h = [
      rec({ sessionId: "s1", recordedAt: D1, questionId: "q1", topic: "health" }),
      rec({ sessionId: "s2", recordedAt: D2, questionId: "q1", topic: "work" }),
      rec({ sessionId: "s3", recordedAt: D3, questionId: "q1", topic: "travel" }),
    ];
    expect(deriveApplicationLevel(h)).toBe(2); // D=3, K=max(1,3)=3
  });
});
