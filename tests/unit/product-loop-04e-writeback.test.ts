/**
 * PRODUCT-LOOP-04E — Writeback / State Integrity / Rebuild 测试（T19–T31）
 * ------------------------------------------------------------
 * T19–T23: 落库后 applicationLevel 写回（1 CORRECT→0 / 2 cross-session→1 /
 *           3 qualifying→2 / same-session repeat 不升级 / ISSUE 不降级）
 * T24–T29: 其他状态字段完全不变（recallLevel/status/nextReviewAt/
 *           currentIntervalDays/consecutiveCorrect/recognitionLevel/review schedule）
 * T30–T31: 从 evidence history 重算恢复（rebuild）
 * Route 级：真实 analyze route 落库钩子端到端 + retry 合并语义
 */
import { describe, expect, it, beforeAll, beforeEach } from "vitest";

// ---- env：memory + demo + mock（惰性读取，首次 route 调用前生效）----
process.env.AUTH_MODE = "demo";
process.env.DATA_PROVIDER = "memory";
process.env.LLM_PRIMARY_PROVIDER = "mock";
process.env.LLM_FALLBACK_ENABLED = "false";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { POST as SPK_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPK_ANALYZE } from "@/app/api/speaking/analyze/route";
import { getLearningRepository, getSpeakingRepository, getApplicationEvidenceRepository, _resetRepositories } from "@/lib/repository-factory";
import { _resetGoalRepositoryForTests } from "@/lib/goal/repository";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import {
  recordApplicationEvidenceFromAnalysis,
  recomputeAndWriteApplicationLevel,
} from "@/lib/learning/application-evidence";
import type {
  SpeakingAnalysisResult,
  SpeakingSession,
  TargetExpressionUsageEvidence,
  ValidatedTargetExpressionEvidence,
} from "@/lib/speaking/types";

const USER = "demo-user-001";
const ITEM = "seed-003";

// ---- helpers ----

function makeSession(
  sessionId: string,
  questionId: string,
  topic: string,
  part: "P1" | "P2" | "P3" = "P2",
): SpeakingSession {
  const now = new Date().toISOString();
  return {
    id: sessionId,
    userId: USER,
    questionId,
    part,
    topic,
    question: "Do you usually plan your day in advance?",
    firstAnswer: null,
    firstAnalysis: null,
    secondAnswer: null,
    secondAnalysis: null,
    status: "IN_PROGRESS",
    createdAt: now,
    updatedAt: now,
    suggestedExpressions: [
      {
        itemId: ITEM,
        canonicalForm: "take something for granted",
        meaning: "把…视为理所当然",
      },
    ],
  };
}

function makeEvidence(
  assessment: ValidatedTargetExpressionEvidence["assessment"],
  quote: string | null,
  extra?: Partial<ValidatedTargetExpressionEvidence>,
): ValidatedTargetExpressionEvidence {
  return {
    itemId: ITEM,
    attempted: assessment === "CORRECT" || assessment === "ISSUE",
    quote,
    assessment,
    reason: `test: ${assessment}`,
    upgradeCandidate: assessment === "CORRECT",
    validatorNotes: [],
    ...extra,
  };
}

function makeAnalysis(evidence: ValidatedTargetExpressionEvidence[]): SpeakingAnalysisResult {
  return {
    candidateIssues: [],
    mainIssue: {
      dimension: "fluency",
      severity: "minor",
      description: "ok",
      suggestion: "keep going",
    },
    microDrill: { prompt: "p", exampleImprovement: "e", targetDimension: "fluency" },
    metrics: { wordCount: 30, sentenceCount: 3, connectorCount: 1, uniqueWordRatio: 0.8, paraphraseScore: 0.5 },
    summary: "fine",
    targetExpressionEvidence: evidence,
  };
}

async function makeLearnedState(
  repo: ReturnType<typeof getLearningRepository>,
  itemId: string,
  overrides?: Partial<{
    recallLevel: number;
    status: string;
    nextReviewAt: string;
    currentIntervalDays: number;
    consecutiveCorrect: number;
    applicationLevel: number;
    recognitionLevel: number;
  }>,
) {
  return repo.upsertUserItemState({
    userId: USER,
    itemId,
    status: overrides?.status ?? "RECALLED_WITH_HELP",
    recognitionLevel: overrides?.recognitionLevel ?? 1,
    recallLevel: overrides?.recallLevel ?? 1,
    applicationLevel: overrides?.applicationLevel ?? 0,
    consecutiveCorrect: overrides?.consecutiveCorrect ?? 2,
    currentIntervalDays: overrides?.currentIntervalDays ?? 3,
    nextReviewAt: overrides?.nextReviewAt ?? "2026-10-01T00:00:00.000Z",
  });
}

// ---- state ----

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

describe("T19–T23: writeback（service 层）", () => {
  it("T19: first CORRECT → applicationLevel 保持 0", async () => {
    await makeLearnedState(learningRepo, ITEM);
    const session = makeSession("s1", "q1", "health");
    await recordApplicationEvidenceFromAnalysis({
      userId: USER,
      session,
      analysis: makeAnalysis([makeEvidence("CORRECT", "I take my health for granted")]),
      isSecondAnswer: false,
      learningRepo,
      evidenceRepo,
      now: "2026-09-01T10:00:00.000Z",
    });
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(0);
    expect(await evidenceRepo.listApplicationEvidence(USER, ITEM)).toHaveLength(1);
  });

  it("T20: second cross-session CORRECT → 1", async () => {
    await makeLearnedState(learningRepo, ITEM);
    const s1 = makeSession("s1", "q1", "health");
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: s1, analysis: makeAnalysis([makeEvidence("CORRECT", "q1")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-01T10:00:00.000Z",
    });
    const s2 = makeSession("s2", "q2", "work");
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: s2, analysis: makeAnalysis([makeEvidence("CORRECT", "q2")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-02T10:00:00.000Z",
    });
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(1);
  });

  it("T21: third qualifying CORRECT（3 sessions / 3 days / 3 contexts）→ 2", async () => {
    await makeLearnedState(learningRepo, ITEM);
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s1", "q1", "health"), analysis: makeAnalysis([makeEvidence("CORRECT", "q1")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-01T10:00:00.000Z",
    });
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s2", "q2", "work"), analysis: makeAnalysis([makeEvidence("CORRECT", "q2")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-02T10:00:00.000Z",
    });
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s3", "q3", "travel"), analysis: makeAnalysis([makeEvidence("CORRECT", "q3")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-03T10:00:00.000Z",
    });
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(2);
  });

  it("T22: repeated same-session analyze 不升级", async () => {
    await makeLearnedState(learningRepo, ITEM);
    const s1 = makeSession("s1", "q1", "health");
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: s1, analysis: makeAnalysis([makeEvidence("CORRECT", "q1a")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-01T10:00:00.000Z",
    });
    const s2 = makeSession("s2", "q2", "work");
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: s2, analysis: makeAnalysis([makeEvidence("CORRECT", "q2")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-02T10:00:00.000Z",
    });
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(1);
    // 同 session1 重复 analyze（页面刷新/重复调用）
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: s1, analysis: makeAnalysis([makeEvidence("CORRECT", "q1b")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-03T10:00:00.000Z",
    });
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(1);
    expect(await evidenceRepo.listApplicationEvidence(USER, ITEM)).toHaveLength(2); // s1 + s2 各一条
  });

  it("T23: later ISSUE 不降级（L1 保持）", async () => {
    await makeLearnedState(learningRepo, ITEM);
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s1", "q1", "health"), analysis: makeAnalysis([makeEvidence("CORRECT", "q1")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-01T10:00:00.000Z",
    });
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s2", "q2", "work"), analysis: makeAnalysis([makeEvidence("CORRECT", "q2")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-02T10:00:00.000Z",
    });
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(1);
    // 第三次 ISSUE：只记录不降级
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s3", "q3", "travel"), analysis: makeAnalysis([makeEvidence("ISSUE", "q3-wrong", { upgradeCandidate: false })]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-03T10:00:00.000Z",
    });
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(1);
  });
});

describe("T24–T29: 其他状态完整性（writeback 只动 applicationLevel）", () => {
  it("所有学习/记忆/复习字段在 3 次 CORRECT 写回后完全不变", async () => {
    await makeLearnedState(learningRepo, ITEM, {
      recallLevel: 1,
      status: "RECALLED_WITH_HELP",
      recognitionLevel: 1,
      consecutiveCorrect: 2,
      currentIntervalDays: 3,
      nextReviewAt: "2026-10-01T00:00:00.000Z",
    });
    const before = await learningRepo.getUserItemState(USER, ITEM);
    expect(before).not.toBeNull();

    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s1", "q1", "health"), analysis: makeAnalysis([makeEvidence("CORRECT", "q1")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-01T10:00:00.000Z",
    });
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s2", "q2", "work"), analysis: makeAnalysis([makeEvidence("CORRECT", "q2")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-02T10:00:00.000Z",
    });
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s3", "q3", "travel"), analysis: makeAnalysis([makeEvidence("CORRECT", "q3")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-03T10:00:00.000Z",
    });

    const after = await learningRepo.getUserItemState(USER, ITEM);
    expect(after?.applicationLevel).toBe(2); // T24-28 的"变化"只有 applicationLevel
    expect(after?.recallLevel).toBe(before!.recallLevel);          // T24
    expect(after?.status).toBe(before!.status);                    // T25
    expect(after?.nextReviewAt).toBe(before!.nextReviewAt);        // T26
    expect(after?.currentIntervalDays).toBe(before!.currentIntervalDays); // T27
    expect(after?.consecutiveCorrect).toBe(before!.consecutiveCorrect);   // T28
    expect(after?.recognitionLevel).toBe(before!.recognitionLevel);       // review schedule 关联字段
    // T29: review schedule（nextReviewAt 即调度输出）不变
    expect(after?.nextReviewAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("ISSUE evidence 也不触碰其他字段", async () => {
    await makeLearnedState(learningRepo, ITEM, { recallLevel: 2, status: "RECALLED_INDEPENDENTLY" });
    const before = await learningRepo.getUserItemState(USER, ITEM);
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s1", "q1", "health"), analysis: makeAnalysis([makeEvidence("ISSUE", "wrong", { upgradeCandidate: false })]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-01T10:00:00.000Z",
    });
    const after = await learningRepo.getUserItemState(USER, ITEM);
    expect(after?.recallLevel).toBe(before!.recallLevel);
    expect(after?.status).toBe(before!.status);
    expect(after?.nextReviewAt).toBe(before!.nextReviewAt);
    expect(after?.currentIntervalDays).toBe(before!.currentIntervalDays);
    expect(after?.consecutiveCorrect).toBe(before!.consecutiveCorrect);
    expect(after?.applicationLevel).toBe(0); // 无 CORRECT 证据 → 0
  });
});

describe("T30–T31: rebuild（recomputeApplicationLevelFromEvidence）", () => {
  it("T30: cache wrong → 从 evidence history 重算恢复正确 level", async () => {
    await makeLearnedState(learningRepo, ITEM);
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s1", "q1", "health"), analysis: makeAnalysis([makeEvidence("CORRECT", "q1")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-01T10:00:00.000Z",
    });
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s2", "q2", "work"), analysis: makeAnalysis([makeEvidence("CORRECT", "q2")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-02T10:00:00.000Z",
    });
    await recordApplicationEvidenceFromAnalysis({
      userId: USER, session: makeSession("s3", "q3", "travel"), analysis: makeAnalysis([makeEvidence("CORRECT", "q3")]),
      isSecondAnswer: false, learningRepo, evidenceRepo, now: "2026-09-03T10:00:00.000Z",
    });
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(2);
    // 手动把 cache 设错
    await makeLearnedState(learningRepo, ITEM, { applicationLevel: 0 });
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(0);
    // 重算恢复
    const level = await recomputeAndWriteApplicationLevel(learningRepo, evidenceRepo, USER, ITEM);
    expect(level).toBe(2);
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(2);
  });

  it("T31: empty history → rebuild 到 0", async () => {
    await makeLearnedState(learningRepo, ITEM, { applicationLevel: 1 }); // 错误的 cache
    const level = await recomputeAndWriteApplicationLevel(learningRepo, evidenceRepo, USER, ITEM);
    expect(level).toBe(0);
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(0);
  });
});

// ---- route 级端到端 ----

function cleanAnalysisJson(evidence?: TargetExpressionUsageEvidence[]): string {
  return JSON.stringify({
    mainIssue: { dimension: "fluency", severity: "minor", description: "整体流畅。", suggestion: "继续练习。" },
    microDrill: { prompt: "p", exampleImprovement: "e" },
    summary: "内容清楚。",
    fluency: { label: "流利度", level: "adequate", evidence: ["ok"], issues: [], suggestions: [] },
    lexicalResource: { label: "词汇", level: "adequate", evidence: ["ok"], issues: [], suggestions: [] },
    grammaticalRange: { label: "语法", level: "adequate", evidence: ["ok"], issues: [], suggestions: [] },
    overallDiagnosis: "表现良好。",
    prioritizedSuggestions: ["继续练习"],
    ...(evidence ? { targetExpressionUsageEvidence: evidence } : {}),
  });
}

function installProvider(evidence?: TargetExpressionUsageEvidence[]): void {
  const provider: LlmProvider = {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      return { model: "mock-04e", content: cleanAnalysisJson(evidence) };
    },
  };
  __setProviderForTests("mock", provider);
}

function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function post(handler: (r: Request) => Promise<Response>, url: string, body: unknown) {
  const res = await handler(jsonReq(url, "POST", body));
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

async function createSession() {
  // 04B 已验证：P1 daily 自动选题 → suggestedExpressions 含 seed-003
  const { json } = await post(SPK_SESSION, "http://test/api/speaking/session", {
    part: "P1",
    topic: "daily",
  });
  return json.session as SpeakingSession;
}

describe("Route 级：analyze 落库钩子端到端", () => {
  it("1 条 CORRECT 经真实 analyze route → evidence 落库且 applicationLevel=0", async () => {
    _resetRepositories();
    __resetRegistryForTests();
    installProvider([
      { itemId: ITEM, attempted: true, quote: "I take my health for granted", assessment: "CORRECT", reason: "natural use" },
    ]);
    await makeLearnedState(getLearningRepository(), ITEM);

    const session = await createSession();
    expect(session.suggestedExpressions?.some((s) => s.itemId === ITEM)).toBe(true);

    const { status, json } = await post(SPK_ANALYZE, "http://test/api/speaking/analyze", {
      sessionId: session.id,
      answer: "I take my health for granted every day.",
      isSecondAnswer: false,
    });
    expect(status).toBe(200);
    const state = await getLearningRepository().getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(0);
    const list = await getApplicationEvidenceRepository().listApplicationEvidence(USER, ITEM);
    expect(list).toHaveLength(1);
    expect(list[0]!.assessment).toBe("CORRECT");
    expect(list[0]!.sessionId).toBe(session.id);
    // 非目标字段不变
    expect(state?.recallLevel).toBe(1);
    expect(state?.nextReviewAt).toBe("2026-10-01T00:00:00.000Z");
    void json;
  });

  it("second CORRECT 覆盖 first ISSUE → recoveredViaRetry=true、同 session 一条、level 0", async () => {
    _resetRepositories();
    __resetRegistryForTests();
    installProvider([
      { itemId: ITEM, attempted: true, quote: "I take my health for granted", assessment: "ISSUE", reason: "semantic misuse" },
    ]);
    await makeLearnedState(getLearningRepository(), ITEM);
    const session = await createSession();
    await post(SPK_ANALYZE, "http://test/api/speaking/analyze", {
      sessionId: session.id,
      answer: "I take my health for granted.",
      isSecondAnswer: false,
    });
    // second answer 用 CORRECT mock
    installProvider([
      { itemId: ITEM, attempted: true, quote: "I finally take my health for granted seriously", assessment: "CORRECT", reason: "fixed" },
    ]);
    const { status } = await post(SPK_ANALYZE, "http://test/api/speaking/analyze", {
      sessionId: session.id,
      answer: "I finally take my health for granted seriously.",
      isSecondAnswer: true,
    });
    expect(status).toBe(200);
    const list = await getApplicationEvidenceRepository().listApplicationEvidence(USER, ITEM);
    expect(list).toHaveLength(1); // 同 session 合并为一条
    expect(list[0]!.assessment).toBe("CORRECT");
    expect(list[0]!.recoveredViaRetry).toBe(true);
    expect((await getLearningRepository().getUserItemState(USER, ITEM))?.applicationLevel).toBe(0);
  });

  it("2 个真实 session CORRECT → applicationLevel=1", async () => {
    _resetRepositories();
    __resetRegistryForTests();
    installProvider([
      { itemId: ITEM, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" },
    ]);
    await makeLearnedState(getLearningRepository(), ITEM);

    const s1 = await createSession();
    await post(SPK_ANALYZE, "http://test/api/speaking/analyze", {
      sessionId: s1.id, answer: "I take my health for granted.", isSecondAnswer: false,
    });
    // 第二个 session（重复 P1 daily 自动选题；L1 只要求 2 个不同 session）
    // 注意：quote 必须是 answer 的连续子串（validator grounding 要求）
    installProvider([
      { itemId: ITEM, attempted: true, quote: "take their parents for granted", assessment: "CORRECT", reason: "ok" },
    ]);
    const s2 = await createSession();
    await post(SPK_ANALYZE, "http://test/api/speaking/analyze", {
      sessionId: s2.id, answer: "People take their parents for granted.", isSecondAnswer: false,
    });
    const state = await getLearningRepository().getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(1);
    expect((await getApplicationEvidenceRepository().listApplicationEvidence(USER, ITEM)).length).toBe(2);
  });
});
