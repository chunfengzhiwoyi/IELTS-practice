/**
 * PRODUCT-LOOP-04-FINAL-E2E — Deterministic 状态链路（Layer B）与下游行为（Layer C）
 * ------------------------------------------------------------
 * 在确定性（mock/内存仓库）环境下，验证：
 *   - 完整 0→1→2 产品故事（跨 session / 跨日 / 跨语境；第 3 条跨语境证据按任务 §21
 *     使用 CONTROLLED_EVIDENCE_FIXTURE——当前 12 题题库下 seed-003 仅自然匹配 sp-p1-001，
 *     真实出题路径跨语境结构性不可达，见报告 P2 发现）。
 *   - 负例：3 sessions 同日 → 1；3 sessions 同语境 → 1（防 OR 误实现）。
 *   - 单条假阳性 → Level 0（04D §45 安全不变量）。
 *   - ISSUE / NOT_USED / UNCERTAIN 全部 NO-OP。
 *   - 重算（recompute）恢复 Level 2（Evidence History 为 SSOT）。
 *   - 下游：target-selection 对 applicationLevel 0→2 的 counterfactual；
 *           Planner 对 applicationLevel 不敏感（PlannerInput 无该字段）。
 *
 * 复用生产函数（非 mock 逻辑）：
 *   recordApplicationEvidenceFromAnalysis / recomputeAndWriteApplicationLevel /
 *   deriveApplicationLevel / selectTargetExpressions / planToday
 */
// ---- env：memory + demo + mock（确定性）----
process.env.AUTH_MODE = "demo";
process.env.DATA_PROVIDER = "memory";
process.env.LLM_PRIMARY_PROVIDER = "mock";
process.env.LLM_FALLBACK_ENABLED = "false";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { describe, expect, it, beforeAll, beforeEach } from "vitest";

import {
  recordApplicationEvidenceFromAnalysis,
  recomputeAndWriteApplicationLevel,
} from "@/lib/learning/application-evidence";
import { _resetRepositories, getLearningRepository, getApplicationEvidenceRepository } from "@/lib/repository-factory";
import { selectTargetExpressions, MAX_TARGET_EXPRESSIONS } from "@/lib/speaking/target-selection";
import type { TargetCandidate } from "@/lib/speaking/target-selection";
import { getAllSeedItems } from "@/lib/learning/seed-catalog";
import { planToday } from "@/lib/planner/planner-v1";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goal/types";
import type { UserItemState } from "@/lib/learning/types";
import type {
  SpeakingSession,
  SpeakingAnalysisResult,
  ValidatedTargetExpressionEvidence,
} from "@/lib/speaking/types";

const USER = "demo-user-001";
const ITEM = "seed-003";
const NOW = "2026-09-01T10:00:00.000Z";

// ---- helpers（与 04E writeback 测试同范式）----

function makeSession(sessionId: string, questionId: string, topic: string, part: "P1" | "P2" | "P3" = "P2"): SpeakingSession {
  return {
    id: sessionId,
    userId: USER,
    questionId,
    part,
    topic,
    question: "Do you usually have a busy day?",
    firstAnswer: null,
    firstAnalysis: null,
    secondAnswer: null,
    secondAnalysis: null,
    status: "IN_PROGRESS",
    createdAt: NOW,
    updatedAt: NOW,
    suggestedExpressions: [
      { itemId: ITEM, canonicalForm: "take something for granted", meaning: "把…视为理所当然" },
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
    mainIssue: { dimension: "fluency", severity: "minor", description: "ok", suggestion: "keep going" },
    microDrill: { prompt: "p", exampleImprovement: "e", targetDimension: "fluency" },
    metrics: { wordCount: 30, sentenceCount: 3, connectorCount: 1, uniqueWordRatio: 0.8, paraphraseScore: 0.5 },
    summary: "fine",
    targetExpressionEvidence: evidence,
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

async function record(sessionId: string, questionId: string, topic: string, assessment: ValidatedTargetExpressionEvidence["assessment"], quote: string | null, now: string) {
  const learningRepo = getLearningRepository();
  const evidenceRepo = getApplicationEvidenceRepository();
  await recordApplicationEvidenceFromAnalysis({
    userId: USER,
    session: makeSession(sessionId, questionId, topic),
    analysis: makeAnalysis([makeEvidence(assessment, quote)]),
    isSecondAnswer: false,
    learningRepo,
    evidenceRepo,
    now,
  });
}

function snapshot(s: UserItemState | null) {
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
});

describe("04-FINAL-E2E Layer B: 0→1→2 产品故事 + 安全不变量", () => {
  it("E01/E07/E13–E15: 初始 Level 0，第一 CORRECT 后仅 applicationLevel 可变，其余状态不变", async () => {
    const initial = await makeLearnedState();
    expect(initial.applicationLevel).toBe(0);
    const before = snapshot(initial);

    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "take their health for granted", "2026-09-01T10:00:00.000Z");
    const after = snapshot(await learningRepo.getUserItemState(USER, ITEM));
    expect(after.applicationLevel).toBe(0); // E07
    expect(after.recallLevel).toBe(before.recallLevel);
    expect(after.status).toBe(before.status);
    expect(after.nextReviewAt).toBe(before.nextReviewAt);
    expect(after.currentIntervalDays).toBe(before.currentIntervalDays);
    expect(after.consecutiveCorrect).toBe(before.consecutiveCorrect);
    expect(after.recognitionLevel).toBe(before.recognitionLevel);
  });

  it("E08: 同 session 重复 evidence 幂等（不产生第 2 条独立证据）", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "take their health for granted", "2026-09-01T10:00:00.000Z");
    // 同 session 再次落库（模拟 retry / 重复 analyze）
    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "take their health for granted", "2026-09-01T11:00:00.000Z");
    const history = await evidenceRepo.listApplicationEvidence(USER, ITEM);
    expect(history).toHaveLength(1); // 幂等键 (userId,itemId,sessionId)
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(0);
  });

  it("E09: 第二个独立 session CORRECT → Level 1（跨 session 要求）", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "take their health for granted", "2026-09-01T10:00:00.000Z");
    await record("s2", "sp-p1-001", "Daily Routine", "CORRECT", "take my free time for granted", "2026-09-02T10:00:00.000Z");
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(1);
  });

  it("E10–E12: 第三个跨日跨语境 CORRECT → Level 2（跨语境证据=CONTROLLED_EVIDENCE_FIXTURE）", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "take their health for granted", "2026-09-01T10:00:00.000Z");
    await record("s2", "sp-p1-001", "Daily Routine", "CORRECT", "take my free time for granted", "2026-09-02T10:00:00.000Z");
    await record("s3", "sp-p3-003", "Work-Life Balance", "CORRECT", "take a healthy routine for granted", "2026-09-05T10:00:00.000Z");

    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(2); // C=3, D=3, K=2 → Level 2

    // E26: 可审计性——为什么是 Level 2
    const history = await evidenceRepo.listApplicationEvidence(USER, ITEM);
    expect(history).toHaveLength(3);
    const sessions = new Set(history.map((h) => h.sessionId));
    const days = new Set(history.map((h) => h.recordedAt.slice(0, 10)));
    const contexts = new Set(history.map((h) => h.questionId));
    expect(sessions.size).toBe(3);
    expect(days.size).toBeGreaterThanOrEqual(2);
    expect(contexts.size).toBeGreaterThanOrEqual(2);
  });

  it("E16: recompute 从 evidence history 恢复 Level 2（Evidence History = SSOT）", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "q1", "2026-09-01T10:00:00.000Z");
    await record("s2", "sp-p1-001", "Daily Routine", "CORRECT", "q1b", "2026-09-02T10:00:00.000Z");
    await record("s3", "sp-p3-003", "Work-Life Balance", "CORRECT", "q3", "2026-09-05T10:00:00.000Z");
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(2);

    // 人为破坏 applicationLevel → recompute 应恢复
    await makeLearnedState({ applicationLevel: 0 });
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(0);
    await recomputeAndWriteApplicationLevel(learningRepo, evidenceRepo, USER, ITEM);
    const restored = await learningRepo.getUserItemState(USER, ITEM);
    expect(restored?.applicationLevel).toBe(2);
  });

  it("E17: Level 2 之后 ISSUE 不降级（只记录 evidence）", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "q1", "2026-09-01T10:00:00.000Z");
    await record("s2", "sp-p1-001", "Daily Routine", "CORRECT", "q1b", "2026-09-02T10:00:00.000Z");
    await record("s3", "sp-p3-003", "Work-Life Balance", "CORRECT", "q3", "2026-09-05T10:00:00.000Z");
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(2);

    await record("s4", "sp-p1-001", "Daily Routine", "ISSUE", "take something as granted", "2026-09-08T10:00:00.000Z");
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(2);
    expect((await evidenceRepo.listApplicationEvidence(USER, ITEM)).some((h) => h.assessment === "ISSUE")).toBe(true);
  });

  it("E18: NOT_USED 完全 NO-OP", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "NOT_USED", null, "2026-09-01T10:00:00.000Z");
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(0);
    expect(state?.recallLevel).toBe(1);
    expect(state?.nextReviewAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("E19: UNCERTAIN 完全 NO-OP", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "UNCERTAIN", null, "2026-09-01T10:00:00.000Z");
    const state = await learningRepo.getUserItemState(USER, ITEM);
    expect(state?.applicationLevel).toBe(0);
    expect(state?.recallLevel).toBe(1);
  });

  it("E45-1: 3 sessions / 3 CORRECT / 同日 / 跨语境 → 仍 Level 1", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "q1", "2026-09-01T09:00:00.000Z");
    await record("s2", "sp-p3-003", "Work-Life Balance", "CORRECT", "q2", "2026-09-01T10:00:00.000Z");
    await record("s3", "sp-p3-001", "Education and Technology", "CORRECT", "q3", "2026-09-01T11:00:00.000Z");
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(1);
  });

  it("E45-2: 3 sessions / 3 CORRECT / 跨日 / 同语境 → 仍 Level 1", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "q1", "2026-09-01T10:00:00.000Z");
    await record("s2", "sp-p1-001", "Daily Routine", "CORRECT", "q1b", "2026-09-02T10:00:00.000Z");
    await record("s3", "sp-p1-001", "Daily Routine", "CORRECT", "q1c", "2026-09-03T10:00:00.000Z");
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(1);
  });

  it("E46: 单条假阳性 CORRECT → 仍 Level 0（最重要安全不变量）", async () => {
    await makeLearnedState();
    await record("s1", "sp-p1-001", "Daily Routine", "CORRECT", "q1", "2026-09-01T10:00:00.000Z");
    expect((await learningRepo.getUserItemState(USER, ITEM))?.applicationLevel).toBe(0);
  });
});

describe("04-FINAL-E2E Layer C: 下游行为", () => {
  const itemOf = (itemId: string) => getAllSeedItems().find((s) => s.itemId === itemId) ?? null;

  function makeState(applicationLevel: number): UserItemState {
    return {
      userId: USER,
      itemId: ITEM,
      status: "RECALLED_WITH_HELP",
      recognitionLevel: 1,
      recallLevel: 1,
      applicationLevel,
      consecutiveCorrect: 2,
      currentIntervalDays: 3,
      nextReviewAt: "2026-10-01T00:00:00.000Z",
      updatedAt: NOW,
    };
  }

  function runTargetSelection(appLevel: number) {
    return selectTargetExpressions(
      [makeState(appLevel)],
      itemOf,
      { recentlyLearned: new Set(), recentlyIncorrect: new Set() },
    );
  }

  it("E20: target-selection 对 applicationLevel 0→2 有确定性响应，且不永久排除", () => {
    const at0 = runTargetSelection(0);
    const at2 = runTargetSelection(2);
    const find = (list: TargetCandidate[]) => list.find((t) => t.itemId === ITEM);
    const t0 = find(at0);
    const t2 = find(at2);
    // Level 0：应用练习需求更高 → 入选且分数更高（+1 applicationLevel==0）
    expect(t0).toBeTruthy();
    expect(t2).toBeTruthy(); // 不永久排除
    expect((t0?.score ?? 0)).toBeGreaterThan(t2?.score ?? 0);
    // 排序：Level 0 应在 Level 2 之前（分数降序取前 MAX_TARGET_EXPRESSIONS）
    const rank0 = at0.findIndex((t) => t.itemId === ITEM);
    const rank2 = at2.findIndex((t) => t.itemId === ITEM);
    expect(rank0).toBeLessThanOrEqual(rank2);
  });

  it("E21: Planner 对 applicationLevel 不敏感（PlannerInput 无该字段，相同输入→相同计划）", () => {
    const goal = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 20 };
    const base = {
      goal,
      dueCount: 3,
      speakingIdleDays: 1,
      abilityNextFocusDimension: "fluency",
      recurringIssueCount: 0,
      learnedThisWeek: 5,
      daysElapsedThisWeek: 3,
      feasibility: "comfortable" as const,
    };
    const p1 = planToday(base);
    const p2 = planToday({ ...base });
    expect(p1).toEqual(p2);
    // PlannerInput 结构上不包含 applicationLevel（04D §40 / 04E 文档明示）
    expect(Object.keys(base)).not.toContain("applicationLevel");
  });
});
