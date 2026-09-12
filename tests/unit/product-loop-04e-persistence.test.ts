/**
 * PRODUCT-LOOP-04E — Persistence 测试（T13–T18）
 * ------------------------------------------------------------
 * Memory 实现：幂等 upsert / (sessionId,itemId) 唯一 / list 历史 / user isolation。
 * Supabase 实现：row↔domain mapping parity（无库环境直接测映射函数）。
 * no evidence → applicationLevel 0。
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
  deriveApplicationLevel,
  type ApplicationEvidenceRecord,
} from "@/lib/learning/application-evidence";
import { MemoryApplicationEvidenceRepository } from "@/lib/learning/repositories/memory-application-evidence-repository";
import {
  mapApplicationEvidenceRowToDomain,
  mapApplicationEvidenceToRow,
} from "@/lib/learning/repositories/supabase-application-evidence-repository";

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
    quote: partial.quote === undefined ? "quote" : partial.quote,
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

let repo: MemoryApplicationEvidenceRepository;

beforeEach(() => {
  repo = new MemoryApplicationEvidenceRepository();
});

describe("T13–T15: Memory upsert / unique / list", () => {
  it("T13: upsert 幂等（同 key 覆盖为同一条）", async () => {
    const r1 = rec({ sessionId: "s1", quote: "first", assessment: "ISSUE", upgradeCandidate: false });
    const r2 = rec({ sessionId: "s1", quote: "second", assessment: "CORRECT" });
    await repo.upsertApplicationEvidence(r1);
    await repo.upsertApplicationEvidence(r2);
    const list = await repo.listApplicationEvidence("u", "i");
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(r2); // 覆盖为最新
  });

  it("T14: (sessionId,itemId) 唯一——同 session 不同 item 各自独立", async () => {
    await repo.upsertApplicationEvidence(rec({ sessionId: "s1", itemId: "A" }));
    await repo.upsertApplicationEvidence(rec({ sessionId: "s1", itemId: "B" }));
    expect(await repo.listApplicationEvidence("u", "A")).toHaveLength(1);
    expect(await repo.listApplicationEvidence("u", "B")).toHaveLength(1);
    expect(await repo.listApplicationEvidence("u", "A")).not.toBe(
      await repo.listApplicationEvidence("u", "B"),
    );
  });

  it("T15: list history 完整且按 recordedAt 排序", async () => {
    await repo.upsertApplicationEvidence(
      rec({ sessionId: "s2", recordedAt: "2026-09-02T00:00:00.000Z" }),
    );
    await repo.upsertApplicationEvidence(
      rec({ sessionId: "s1", recordedAt: "2026-09-01T00:00:00.000Z" }),
    );
    await repo.upsertApplicationEvidence(
      rec({ sessionId: "s3", recordedAt: "2026-09-03T00:00:00.000Z" }),
    );
    const list = await repo.listApplicationEvidence("u", "i");
    expect(list.map((r) => r.sessionId)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("T16: Supabase mapping parity", () => {
  it("row → domain 映射完整", () => {
    const row = {
      id: "uuid-1",
      user_id: "user-1",
      item_id: "seed-003",
      session_id: "s1",
      question_id: "q2",
      part: "P3",
      topic: "work",
      assessment: "CORRECT",
      quote: "I take it for granted",
      reason: "semantic fit ok",
      validator_notes: ["grounded"],
      upgrade_candidate: true,
      recovered_via_retry: true,
      recorded_at: "2026-09-01T10:00:00.000Z",
      pipeline_version: "04B-validator-1",
      provider: "deepseek",
      model: "deepseek-chat",
    };
    const dom = mapApplicationEvidenceRowToDomain(row);
    expect(dom).toEqual({
      evidenceId: "uuid-1",
      userId: "user-1",
      itemId: "seed-003",
      sessionId: "s1",
      questionId: "q2",
      part: "P3",
      topic: "work",
      assessment: "CORRECT",
      quote: "I take it for granted",
      reason: "semantic fit ok",
      validatorNotes: ["grounded"],
      upgradeCandidate: true,
      recoveredViaRetry: true,
      recordedAt: "2026-09-01T10:00:00.000Z",
      pipelineVersion: "04B-validator-1",
      provider: "deepseek",
      model: "deepseek-chat",
    });
    // derive 语义一致：mapped domain 可直接参与 derivation
    expect(deriveApplicationLevel([dom])).toBe(0);
  });

  it("domain → row 映射完整（nullable 字段处理）", () => {
    const dom = rec({
      sessionId: "s1",
      questionId: "q1",
      topic: "health",
      quote: null,
      assessment: "NOT_USED",
      upgradeCandidate: false,
      provider: null,
      model: null,
    });
    const row = mapApplicationEvidenceToRow(dom);
    expect(row).toMatchObject({
      user_id: "u",
      item_id: "i",
      session_id: "s1",
      question_id: "q1",
      topic: "health",
      assessment: "NOT_USED",
      quote: null,
      upgrade_candidate: false,
      recovered_via_retry: false,
      pipeline_version: "04B-validator-1",
      provider: null,
      model: null,
    });
  });

  it("row → domain → row roundtrip 稳定", () => {
    const dom = rec({ sessionId: "s9", quote: "roundtrip" });
    const row = mapApplicationEvidenceToRow(dom);
    const back = mapApplicationEvidenceRowToDomain({
      ...row,
      id: "uuid-x",
    } as Parameters<typeof mapApplicationEvidenceRowToDomain>[0]);
    expect(back).toEqual({ ...dom, evidenceId: "uuid-x" });
  });
});

describe("T17–T18: user isolation / no evidence", () => {
  it("T17: user isolation（A 的 evidence 不影响 B）", async () => {
    await repo.upsertApplicationEvidence(rec({ userId: "userA", sessionId: "s1" }));
    await repo.upsertApplicationEvidence(rec({ userId: "userA", sessionId: "s2" }));
    expect(await repo.listApplicationEvidence("userB", "i")).toHaveLength(0);
    expect(deriveApplicationLevel(await repo.listApplicationEvidence("userB", "i"))).toBe(0);
    expect(deriveApplicationLevel(await repo.listApplicationEvidence("userA", "i"))).toBe(1);
  });

  it("T18: no evidence → applicationLevel 0", async () => {
    expect(await repo.listApplicationEvidence("u", "missing")).toHaveLength(0);
    expect(deriveApplicationLevel(await repo.listApplicationEvidence("u", "missing"))).toBe(0);
  });
});
