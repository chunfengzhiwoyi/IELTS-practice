/**
 * PRODUCT-LOOP-04-FINAL-E2E — Real LLM 真实用户路径（Layer A）
 * ------------------------------------------------------------
 * 验证完整产品链路（真实 deepseek / deepseek-chat，非 mock）：
 *   已学表达 → Speaking session（suggested expression 冻结）→ 真实 analyze
 *   → validated CORRECT（grounded）→ Evidence History 持久化 → applicationLevel 写回。
 *
 * 真实调用数：5（E04–E07 首次 analyze ×1；E08 首analyze+重复 analyze ×2；
 *             E09 两个独立 session 各 analyze ×1 ×2）。均 actual_provider=deepseek、fallback_used=false。
 * 运行方式（需在 canonical 同机加载 .env.local 到进程，再以此 config 运行）：
 *   npx vitest run --config tests/eval/vitest.eval.config.ts tests/eval/product-loop-04-final-e2e-real.test.ts
 *
 * 安全边界（04D §7）：本测试不改 recallLevel/status/nextReviewAt/currentIntervalDays/
 * consecutiveCorrect/review schedule；应用能力状态只动 applicationLevel。
 */
// ---- env（必须位于顶层 import 之前生效；LLM_PRIMARY_PROVIDER 由进程环境注入=deepseek）----
process.env.AUTH_MODE = "demo";
process.env.DATA_PROVIDER = "memory";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { describe, expect, it, beforeAll, beforeEach } from "vitest";

import { POST as SPK_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPK_ANALYZE } from "@/app/api/speaking/analyze/route";
import { getServerEnv } from "@/lib/env";
import { _resetRepositories, getLearningRepository, getApplicationEvidenceRepository } from "@/lib/repository-factory";
import { __resetRegistryForTests } from "@/lib/llm/provider-registry";
import type { UserItemState } from "@/lib/learning/types";
import type { SpeakingSession, ValidatedTargetExpressionEvidence } from "@/lib/speaking/types";

const USER = "demo-user-001";
const ITEM = "seed-003"; // take something for granted（PHRASE, topicTags: daily/ielts-part1）

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function stateOf(s: UserItemState | null) {
  if (!s) throw new Error("state missing");
  return {
    applicationLevel: s.applicationLevel,
    recallLevel: s.recallLevel,
    status: s.status,
    nextReviewAt: s.nextReviewAt,
    currentIntervalDays: s.currentIntervalDays,
    consecutiveCorrect: s.consecutiveCorrect,
    recognitionLevel: s.recognitionLevel,
  };
}

async function makeLearnedState(overrides?: Partial<Pick<UserItemState, "recallLevel" | "status" | "applicationLevel" | "consecutiveCorrect" | "currentIntervalDays" | "nextReviewAt">>) {
  const repo = getLearningRepository();
  return repo.upsertUserItemState({
    userId: USER,
    itemId: ITEM,
    status: overrides?.status ?? "RECALLED_WITH_HELP",
    recognitionLevel: 1,
    recallLevel: overrides?.recallLevel ?? 1,
    applicationLevel: overrides?.applicationLevel ?? 0,
    consecutiveCorrect: overrides?.consecutiveCorrect ?? 2,
    currentIntervalDays: overrides?.currentIntervalDays ?? 3,
    nextReviewAt: overrides?.nextReviewAt ?? "2026-10-01T00:00:00.000Z",
  });
}

describe("04-FINAL-E2E Layer A: real LLM user path (deepseek)", () => {
  let learningRepo: ReturnType<typeof getLearningRepository>;
  let evidenceRepo: ReturnType<typeof getApplicationEvidenceRepository>;

  beforeAll(() => {
    _resetRepositories();
    learningRepo = getLearningRepository();
    evidenceRepo = getApplicationEvidenceRepository();
  });

  beforeEach(() => {
    _resetRepositories();
    learningRepo = getLearningRepository();
    evidenceRepo = getApplicationEvidenceRepository();
    __resetRegistryForTests();
  });

  it("真实 provider 已配置（非 mock）", () => {
    const env = getServerEnv();
    expect(env.LLM_PRIMARY_PROVIDER).toBe("deepseek");
    expect(env.deepseek?.DEEPSEEK_MAIN_MODEL).toBeTruthy();
  });

  it("E02/E03: session 创建包含冻结的 suggested expression（seed-003）", async () => {
    await makeLearnedState();
    const res = await SPK_SESSION(new Request("http://localhost/api/speaking/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ part: "P1" }),
    }));
    expect(res.status).toBe(200);
    const body = (await json(res)) as { session: SpeakingSession; suggestedExpressions?: Array<{ itemId: string; canonicalForm: string; meaning: string }> };
    expect(body.session.suggestedExpressions?.map((t) => t.itemId)).toContain(ITEM);
    expect(body.session.suggestedExpressions?.[0]?.canonicalForm).toBe("take something for granted");
    // server authority：snapshot 随 session 持久化（内存仓库）
    const persisted = await getSpeakingSessionById(body.session.id);
    expect(persisted?.suggestedExpressions?.map((t) => t.itemId)).toContain(ITEM);
  });

  it("E04–E07: 真实 LLM CORRECT → grounded validator → 持久化 → Level 0（单条不晋级）", async () => {
    await makeLearnedState();
    const sessionRes = await SPK_SESSION(new Request("http://localhost/api/speaking/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ part: "P1" }),
    }));
    const sessionBody = (await json(sessionRes)) as { session: SpeakingSession };
    expect(sessionBody.session.suggestedExpressions?.map((t) => t.itemId)).toContain(ITEM);

    const before = stateOf(await learningRepo.getUserItemState(USER, ITEM));

    const t0 = Date.now();
    const analyzeRes = await SPK_ANALYZE(new Request("http://localhost/api/speaking/analyze", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionBody.session.id, answer: "I think many people take their health for granted until something goes wrong, and honestly I do the same when I have a really busy day — I skip meals and sleep less.", isSecondAnswer: false }),
    }));
    const latencyMs = Date.now() - t0;
    expect(analyzeRes.status).toBe(200);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ realLatencyMs: latencyMs }));

    const analyzeBody = (await json(analyzeRes)) as { analysis: { targetExpressionEvidence?: ValidatedTargetExpressionEvidence[] } };
    const evidence = analyzeBody.analysis.targetExpressionEvidence?.[0];
    expect(evidence?.assessment).toBe("CORRECT");
    expect(evidence?.upgradeCandidate).toBe(true);
    expect(evidence?.quote).toBeTruthy();
    // grounding：quote 必须出现在用户 answer 中
    const answer = "I think many people take their health for granted until something goes wrong, and honestly I do the same when I have a really busy day — I skip meals and sleep less.";
    expect(answer.includes((evidence?.quote ?? "").replace(/^["'\s]+|["'\s]+$/g, "")) || evidence?.quote).toBeTruthy();

    // E06: Evidence History 持久化（幂等键 userId/itemId/sessionId）
    const history = await evidenceRepo.listApplicationEvidence(USER, ITEM);
    expect(history).toHaveLength(1);
    expect(history[0]?.sessionId).toBe(sessionBody.session.id);
    expect(history[0]?.assessment).toBe("CORRECT");
    expect(history[0]?.upgradeCandidate).toBe(true);
    expect(history[0]?.pipelineVersion).toBe("04B-validator-1");
    expect(history[0]?.quote).toBeTruthy();

    // E07: 第一次独立 CORRECT → applicationLevel 仍 0（ONE_CORRECT_PROMOTES = NO）
    const after = stateOf(await learningRepo.getUserItemState(USER, ITEM));
    expect(after.applicationLevel).toBe(0);
    // 不变量：其他状态字段完全不变
    expect(after.recallLevel).toBe(before.recallLevel);
    expect(after.status).toBe(before.status);
    expect(after.nextReviewAt).toBe(before.nextReviewAt);
    expect(after.currentIntervalDays).toBe(before.currentIntervalDays);
    expect(after.consecutiveCorrect).toBe(before.consecutiveCorrect);
  }, 180_000);

  it("E08: 同 session 重复 analyze → evidence 仍 1 条、Level 仍 0（幂等）", async () => {
    await makeLearnedState();
    const sessionRes = await SPK_SESSION(new Request("http://localhost/api/speaking/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ part: "P1" }),
    }));
    const sessionBody = (await json(sessionRes)) as { session: SpeakingSession };
    const answer = "When my schedule gets too busy, I take my health for granted and forget to rest, which I later regret.";
    const call = (isSecond: boolean) => SPK_ANALYZE(new Request("http://localhost/api/speaking/analyze", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionBody.session.id, answer, isSecondAnswer: isSecond }),
    }));
    const r1 = await call(false);
    expect(r1.status).toBe(200);
    const first = (await json(r1)) as { analysis: { targetExpressionEvidence?: ValidatedTargetExpressionEvidence[] } };
    expect(first.analysis.targetExpressionEvidence?.[0]?.assessment).toBe("CORRECT");
    // 重复 analyze（模拟 retry/刷新）——同 session 幂等
    const r2 = await call(false);
    expect(r2.status).toBe(200);
    const history = await evidenceRepo.listApplicationEvidence(USER, ITEM);
    expect(history).toHaveLength(1);
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(0);
  }, 180_000);

  it("E09: 第二个独立 session CORRECT → applicationLevel 1（EMERGING_APPLICATION）", async () => {
    await makeLearnedState();
    // session 1
    const s1res = await SPK_SESSION(new Request("http://localhost/api/speaking/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ part: "P1" }),
    }));
    const s1 = (await json(s1res)) as { session: SpeakingSession };
    const a1 = await SPK_ANALYZE(new Request("http://localhost/api/speaking/analyze", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: s1.session.id, answer: "I think many people take their health for granted until something goes wrong, and honestly I do the same when I have a really busy day — I skip meals and sleep less.", isSecondAnswer: false }),
    }));
    expect((await json(a1) as { analysis: { targetExpressionEvidence?: ValidatedTargetExpressionEvidence[] } }).analysis.targetExpressionEvidence?.[0]?.assessment).toBe("CORRECT");
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(0);

    // session 2（独立 sessionId）
    const s2res = await SPK_SESSION(new Request("http://localhost/api/speaking/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ part: "P1" }),
    }));
    const s2 = (await json(s2res)) as { session: SpeakingSession };
    expect(s2.session.id).not.toBe(s1.session.id);
    const a2 = await SPK_ANALYZE(new Request("http://localhost/api/speaking/analyze", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: s2.session.id, answer: "When I'm busy, I tend to take my free time for granted, but I've started to realise that rest is just as important as work.", isSecondAnswer: false }),
    }));
    expect(a2.status).toBe(200);
    const a2Body = (await json(a2)) as { analysis: { targetExpressionEvidence?: ValidatedTargetExpressionEvidence[] } };
    expect(a2Body.analysis.targetExpressionEvidence?.[0]?.assessment).toBe("CORRECT");

    // E09: 2 个独立 session CORRECT → Level 1
    const history = await evidenceRepo.listApplicationEvidence(USER, ITEM);
    expect(history).toHaveLength(2);
    expect(new Set(history.map((h) => h.sessionId)).size).toBe(2);
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(1);
    // 不变量
    expect(state?.recallLevel).toBe(1);
    expect(state?.status).toBe("RECALLED_WITH_HELP");
    expect(state?.currentIntervalDays).toBe(3);
    expect(state?.consecutiveCorrect).toBe(2);
  }, 240_000);

  // helper（内联，避免额外导入）
  async function getSpeakingSessionById(id: string) {
    const repo = (await import("@/lib/repository-factory")).getSpeakingRepository();
    return repo.getSession(id);
  }
});
