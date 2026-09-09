/**
 * ELS-EVAL-037 / ELS-EVAL-038 — M1 Closeout Integration Tests
 * ------------------------------------------------------------
 * ELS-EVAL-037: 重复 Review Submit 幂等验证（同一 clientEventId 连续提交两次）
 * ELS-EVAL-038: Learn → Review → Report 跨模块确定性探测
 *
 * 运行路径: Memory Repository（DATA_PROVIDER=memory 等价）
 * Supabase 路径: 见 m1-closeout.md 中的 UNVERIFIED 标注
 */
import { describe, expect, it } from "vitest";

import { MemoryLearningRepository } from "@/lib/learning/repositories/memory-learning-repository";
import { MemorySpeakingRepository } from "@/lib/speaking/repository";
import { findSeedItem, seedToLearningItem, getAllSeedItems } from "@/lib/learning/seed-catalog";
import type { LearningItem, UserItemState } from "@/lib/learning/types";
import { judgeReviewAnswer, type ReviewResult } from "@/lib/review/answer-judge";
import { isAnswerContentEmpty } from "@/lib/learning/answer-content";
import { computeReviewNextAt } from "@/lib/review/review-schedule";
import { aggregateReportData } from "@/lib/report/aggregator";

// ========== Helpers ==========

const USER_ID = "els-eval-user";

function makeSeedItem(seedId = "seed-001"): LearningItem {
  const seed = findSeedItem(getAllSeedItems().find((s) => s.itemId === seedId)!.normalizedTerm)!;
  return seedToLearningItem(seed);
}

/**
 * 模拟 /api/review/submit 的完整业务逻辑（确定性判题，不调用 LLM）。
 * 精确复刻 route.ts 中的序列: judge → computeNextAt → createEvent → readState → upsertState
 */
async function simulateReviewSubmit(
  repo: MemoryLearningRepository,
  params: {
    itemId: string;
    answer: string;
    usedHint: boolean;
    skipped: boolean;
    clientEventId: string;
    traceId?: string;
  },
): Promise<{
  eventId: string;
  result: ReviewResult;
  feedback: string;
  status: string;
  nextReviewAt: string;
  recallLevelAfter: number;
  stateBefore: UserItemState | null;
  stateAfter: UserItemState;
}> {
  const seed = getAllSeedItems().find((s) => s.itemId === params.itemId);
  const item = await repo.getItemById(params.itemId);
  const term = seed?.term ?? item?.canonicalForm ?? params.itemId;
  const coreMeaning = seed?.coreMeaning ?? item?.contentJson?.coreMeaning ?? "";
  const acceptedAnswers = seed?.acceptedAnswers ?? [coreMeaning];
  const answerKeywords = seed?.answerKeywords ?? [];

  // 1. 判题
  let result: ReviewResult;
  if (params.skipped) {
    result = "SKIPPED";
  } else if (isAnswerContentEmpty(params.answer)) {
    result = "INCORRECT";
  } else {
    const judged = judgeReviewAnswer({
      answer: params.answer,
      usedHint: params.usedHint,
      skipped: params.skipped,
      acceptedAnswers,
      answerKeywords,
    });
    result = judged;
  }

  // 2. 调度
  const nextReviewAt = computeReviewNextAt(result);

  // 3. 映射状态
  const { status, correctness, feedback } = mapResult(result, term, coreMeaning);

  const requestTraceId = params.traceId ?? `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 4. 创建事件（显式幂等 Contract: 返回 { event, created }）
  const { event, created } = await repo.createLearningEvent({
    userId: USER_ID,
    itemId: params.itemId,
    eventType: "REVIEW",
    taskType: "MEANING_RECALL",
    answer: params.answer || null,
    correctness,
    hintLevel: params.usedHint ? 1 : 0,
    resultJson: { reviewResult: result, feedback },
    clientEventId: params.clientEventId,
    traceId: requestTraceId,
  });

  // M1 FINAL: 显式幂等 Contract — created=false 时跳过状态更新
  if (!created) {
    const currentState = await repo.getUserItemState(USER_ID, params.itemId);
    const prevResult = (event.resultJson?.reviewResult as ReviewResult) ?? result;
    const prevFeedback = (event.resultJson?.feedback as string) ?? feedback;
    return {
      eventId: event.id,
      result: prevResult,
      feedback: prevFeedback,
      status: currentState?.status ?? status,
      nextReviewAt: currentState?.nextReviewAt ?? nextReviewAt,
      recallLevelAfter: currentState?.recallLevel ?? 0,
      stateBefore: null,
      stateAfter: currentState!,
    };
  }

  // 5. 读取当前状态
  const stateBefore = await repo.getUserItemState(USER_ID, params.itemId);

  // 6. 计算新状态
  const consecutiveCorrect =
    result === "CORRECT_INDEPENDENT" || result === "CORRECT_WITH_HINT"
      ? (stateBefore?.consecutiveCorrect ?? 0) + 1
      : 0;

  const newRecallLevel =
    result === "CORRECT_INDEPENDENT"
      ? Math.min((stateBefore?.recallLevel ?? 0) + 1, 2)
      : (stateBefore?.recallLevel ?? 0);

  // 7. 更新状态（总是执行）
  const stateAfter = await repo.upsertUserItemState({
    userId: USER_ID,
    itemId: params.itemId,
    status,
    recognitionLevel: stateBefore?.recognitionLevel ?? 1,
    recallLevel: newRecallLevel,
    applicationLevel: stateBefore?.applicationLevel ?? 0,
    consecutiveCorrect,
    currentIntervalDays: result === "CORRECT_INDEPENDENT" ? 3 : result === "CORRECT_WITH_HINT" ? 1 : result === "INCORRECT" ? 4 / 24 : 2 / 24,
    nextReviewAt,
  });

  return {
    eventId: event.id,
    result,
    feedback,
    status,
    nextReviewAt,
    recallLevelAfter: stateAfter.recallLevel,
    stateBefore,
    stateAfter,
  };
}

function mapResult(result: ReviewResult, term: string, coreMeaning: string) {
  switch (result) {
    case "CORRECT_INDEPENDENT":
      return { status: "RECALLED_INDEPENDENTLY" as const, correctness: "INDEPENDENT" as const, feedback: `完美！无提示独立回忆「${term}」= ${coreMeaning}` };
    case "CORRECT_WITH_HINT":
      return { status: "RECALLED_WITH_HELP" as const, correctness: "HINTED" as const, feedback: `正确！借助提示回忆出「${term}」= ${coreMeaning}` };
    case "INCORRECT":
      return { status: "EXPOSED" as const, correctness: "FAIL" as const, feedback: `还需加强。「${term}」的含义是：${coreMeaning}` };
    case "SKIPPED":
      return { status: "EXPOSED" as const, correctness: "SKIPPED" as const, feedback: `已跳过。「${term}」= ${coreMeaning}` };
  }
}

/** 模拟 /api/learn/submit 的确定性版本 */
async function simulateLearnSubmit(
  repo: MemoryLearningRepository,
  params: { itemId: string; answer: string; usedHint: boolean; clientEventId: string },
) {
  const seed = getAllSeedItems().find((s) => s.itemId === params.itemId)!;
  const correctness = params.usedHint ? "HINTED" : isAnswerContentEmpty(params.answer) ? "FAIL" : "INDEPENDENT";
  const status = correctness === "INDEPENDENT" ? "RECALLED_INDEPENDENTLY" : correctness === "HINTED" ? "RECALLED_WITH_HELP" : "EXPOSED";

  const { event } = await repo.createLearningEvent({
    userId: USER_ID,
    itemId: params.itemId,
    eventType: "NEW",
    taskType: "MEANING_RECALL",
    answer: params.answer || null,
    correctness,
    hintLevel: params.usedHint ? 1 : 0,
    resultJson: {},
    clientEventId: params.clientEventId,
    traceId: "els-eval-038",
  });

  const stateAfter = await repo.upsertUserItemState({
    userId: USER_ID,
    itemId: params.itemId,
    status,
    recognitionLevel: correctness === "INDEPENDENT" ? 1 : 0,
    recallLevel: correctness === "INDEPENDENT" ? 1 : correctness === "HINTED" ? 1 : 0,
    applicationLevel: 0,
    consecutiveCorrect: correctness === "INDEPENDENT" ? 1 : 0,
    currentIntervalDays: 1,
    nextReviewAt: new Date(Date.now() + 86400000).toISOString(),
  });

  return { event, stateAfter };
}

// =============================================================
// ELS-EVAL-037: 重复 Review Submit 幂等验证
// =============================================================

describe("ELS-EVAL-037: 重复 Review Submit 幂等验证 (Memory Repository)", () => {
  it("同一 clientEventId 连续提交两次 → event count=1, recall_level 只推进一次, nextReviewAt 只推进一次", async () => {
    const repo = new MemoryLearningRepository();
    const item = makeSeedItem("seed-001");
    await repo.createOrGetItem(item);

    // 预置状态: recallLevel=1, nextReviewAt 已过期
    const initialNextReviewAt = "2026-01-01T00:00:00.000Z";
    await repo.upsertUserItemState({
      userId: USER_ID,
      itemId: item.id,
      status: "RECALLED_INDEPENDENTLY",
      recognitionLevel: 1,
      recallLevel: 1,
      applicationLevel: 0,
      consecutiveCorrect: 1,
      currentIntervalDays: 1,
      nextReviewAt: initialNextReviewAt,
    });

    const clientEventId = "els-eval-037-dup-001";
    const submitParams = {
      itemId: item.id,
      answer: "可持续的",
      usedHint: false,
      skipped: false,
      clientEventId,
    };

    // 第一次提交
    const first = await simulateReviewSubmit(repo, submitParams);
    const eventsAfterFirst = repo._getAllEvents().filter((e) => e.clientEventId === clientEventId);

    // 第二次提交（同一 clientEventId）
    const second = await simulateReviewSubmit(repo, submitParams);
    const eventsAfterSecond = repo._getAllEvents().filter((e) => e.clientEventId === clientEventId);

    // === 断言 ===

    // 1. event count = 1（幂等）
    expect(eventsAfterFirst.length).toBe(1);
    expect(eventsAfterSecond.length).toBe(1);
    expect(first.eventId).toBe(second.eventId);

    // 2. recall level 只推进一次
    //    初始=1, CORRECT_INDEPENDENT → +1 = 2
    //    如果状态双推，第二次会变成 3
    expect(first.recallLevelAfter).toBe(2);
    expect(second.recallLevelAfter).toBe(2); // BUG: 当前实现会变成 3

    // 3. nextReviewAt 只推进一次
    //    两次 response 的 nextReviewAt 应该相同
    expect(first.nextReviewAt).toBe(second.nextReviewAt);

    // 4. 两次 response 业务语义一致
    expect(first.result).toBe(second.result);
    expect(first.status).toBe(second.status);
    expect(first.feedback).toBe(second.feedback);

    // 5. 无 5xx（函数未抛异常即通过）
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    // 6. 最终状态验证
    const finalState = await repo.getUserItemState(USER_ID, item.id);
    expect(finalState?.recallLevel).toBe(2); // 不应是 3
  });

  it("不同 clientEventId 的两次提交 → event count=2, recall_level 推进但不超过 mastery max=2", async () => {
    const repo = new MemoryLearningRepository();
    const item = makeSeedItem("seed-002");
    await repo.createOrGetItem(item);

    await repo.upsertUserItemState({
      userId: USER_ID,
      itemId: item.id,
      status: "RECALLED_INDEPENDENTLY",
      recognitionLevel: 1,
      recallLevel: 1,
      applicationLevel: 0,
      consecutiveCorrect: 1,
      currentIntervalDays: 1,
      nextReviewAt: "2026-01-01T00:00:00.000Z",
    });

    const first = await simulateReviewSubmit(repo, {
      itemId: item.id, answer: "重大的", usedHint: false, skipped: false,
      clientEventId: "els-eval-037-uniq-1",
    });
    const second = await simulateReviewSubmit(repo, {
      itemId: item.id, answer: "重大的", usedHint: false, skipped: false,
      clientEventId: "els-eval-037-uniq-2",
    });

    // 不同 clientEventId → 两个事件
    expect(first.eventId).not.toBe(second.eventId);
    // recall_level mastery 0-2: 1 → 2 → 2（达到 max 后不再增长）
    expect(first.recallLevelAfter).toBe(2);
    expect(second.recallLevelAfter).toBe(2);
  });
});

// =============================================================
// ELS-EVAL-038: Learn → Review → Report 跨模块确定性探测
// =============================================================

describe("ELS-EVAL-038: Learn → Review → Report 跨模块探测 (Memory Repository)", () => {
  it("完整链路: Learn submit → server state → Review read → Review submit → Report aggregate", async () => {
    const learningRepo = new MemoryLearningRepository();
    const speakingRepo = new MemorySpeakingRepository();

    const item = makeSeedItem("seed-001");
    await learningRepo.createOrGetItem(item);

    // === Step 1: Learn submit ===
    const learnResult = await simulateLearnSubmit(learningRepo, {
      itemId: item.id,
      answer: "可持续的",
      usedHint: false,
      clientEventId: "els-eval-038-learn-1",
    });

    // === Step 2: Server authoritative state 验证 ===
    const stateAfterLearn = await learningRepo.getUserItemState(USER_ID, item.id);
    expect(stateAfterLearn).not.toBeNull();
    expect(stateAfterLearn!.status).toBe("RECALLED_INDEPENDENTLY");
    expect(stateAfterLearn!.recallLevel).toBe(1);
    expect(learnResult.stateAfter.recallLevel).toBe(stateAfterLearn!.recallLevel);

    // 事件已持久化
    const learnEvents = learningRepo._getAllEvents().filter((e) => e.eventType === "NEW");
    expect(learnEvents.length).toBe(1);
    expect(learnEvents[0]!.correctness).toBe("INDEPENDENT");

    // === Step 3: Review read (到期队列) ===
    // 将 nextReviewAt 设为已过期，模拟进入复习队列
    await learningRepo.upsertUserItemState({
      ...stateAfterLearn!,
      nextReviewAt: "2026-01-01T00:00:00.000Z",
    });

    const dueItems = await learningRepo.getDueReviewItems(
      USER_ID,
      new Date().toISOString(),
      10,
    );
    expect(dueItems.length).toBe(1);
    expect(dueItems[0]!.item.id).toBe(item.id);
    expect(dueItems[0]!.state.recallLevel).toBe(1);

    // === Step 4: Review submit ===
    const reviewResult = await simulateReviewSubmit(learningRepo, {
      itemId: item.id,
      answer: "可持续的",
      usedHint: false,
      skipped: false,
      clientEventId: "els-eval-038-review-1",
    });

    expect(reviewResult.result).toBe("CORRECT_INDEPENDENT");
    expect(reviewResult.recallLevelAfter).toBe(2); // 1 → 2

    const stateAfterReview = await learningRepo.getUserItemState(USER_ID, item.id);
    expect(stateAfterReview!.recallLevel).toBe(2);
    expect(stateAfterReview!.status).toBe("RECALLED_INDEPENDENTLY");

    // === Step 5: Report aggregate ===
    const aggregated = await aggregateReportData(learningRepo, speakingRepo, {
      userId: USER_ID,
      period: "7d",
    });

    // 报告数据来自服务端 Repository
    expect(aggregated.states.length).toBe(1);
    expect(aggregated.states[0]!.recallLevel).toBe(2);
    expect(aggregated.events.length).toBe(2); // 1 NEW + 1 REVIEW
    expect(aggregated.memory.totalItems).toBe(1);
    expect(aggregated.review.totalReviews).toBe(1);
    expect(aggregated.review.correctIndependent).toBe(1);

    // === Step 6: 一致性验证 ===
    // Report 中的状态与直接从 Repository 读取的状态一致
    expect(aggregated.states[0]!.nextReviewAt).toBe(stateAfterReview!.nextReviewAt);
    expect(aggregated.states[0]!.status).toBe(stateAfterReview!.status);
  });

  it("Report 聚合不依赖客户端 localStorage — 纯服务端数据", async () => {
    const learningRepo = new MemoryLearningRepository();
    const speakingRepo = new MemorySpeakingRepository();

    // 空状态 → 报告应返回空，不报错
    const aggregated = await aggregateReportData(learningRepo, speakingRepo, {
      userId: USER_ID,
      period: "7d",
    });

    expect(aggregated.states.length).toBe(0);
    expect(aggregated.events.length).toBe(0);
    expect(aggregated.memory.totalItems).toBe(0);
    expect(aggregated.review.totalReviews).toBe(0);
    expect(aggregated.sessions.length).toBe(0);
  });
});

// =============================================================
// recall_level Boundary Tests (mastery 0-2)
// =============================================================

describe("recall_level Contract: mastery 0-2 boundary tests", () => {
  async function seedWithRecallLevel(repo: MemoryLearningRepository, itemId: string, level: number) {
    await repo.upsertUserItemState({
      userId: USER_ID,
      itemId,
      status: "RECALLED_INDEPENDENTLY",
      recognitionLevel: 1,
      recallLevel: level,
      applicationLevel: 0,
      consecutiveCorrect: 1,
      currentIntervalDays: 1,
      nextReviewAt: "2026-01-01T00:00:00.000Z",
    });
  }

  it("Review CORRECT_INDEPENDENT: recall_level 0 → 1", async () => {
    const repo = new MemoryLearningRepository();
    const item = makeSeedItem("seed-001");
    await repo.createOrGetItem(item);
    await seedWithRecallLevel(repo, item.id, 0);

    const result = await simulateReviewSubmit(repo, {
      itemId: item.id, answer: "可持续的", usedHint: false, skipped: false,
      clientEventId: "boundary-0-1",
    });
    expect(result.recallLevelAfter).toBe(1);
  });

  it("Review CORRECT_INDEPENDENT: recall_level 1 → 2", async () => {
    const repo = new MemoryLearningRepository();
    const item = makeSeedItem("seed-001");
    await repo.createOrGetItem(item);
    await seedWithRecallLevel(repo, item.id, 1);

    const result = await simulateReviewSubmit(repo, {
      itemId: item.id, answer: "可持续的", usedHint: false, skipped: false,
      clientEventId: "boundary-1-2",
    });
    expect(result.recallLevelAfter).toBe(2);
  });

  it("Review CORRECT_INDEPENDENT: recall_level 2 → 2 (capped at mastery max)", async () => {
    const repo = new MemoryLearningRepository();
    const item = makeSeedItem("seed-001");
    await repo.createOrGetItem(item);
    await seedWithRecallLevel(repo, item.id, 2);

    const result = await simulateReviewSubmit(repo, {
      itemId: item.id, answer: "可持续的", usedHint: false, skipped: false,
      clientEventId: "boundary-2-2",
    });
    expect(result.recallLevelAfter).toBe(2);
  });

  it("Review CORRECT_WITH_HINT: recall_level 不变", async () => {
    const repo = new MemoryLearningRepository();
    const item = makeSeedItem("seed-001");
    await repo.createOrGetItem(item);
    await seedWithRecallLevel(repo, item.id, 1);

    const result = await simulateReviewSubmit(repo, {
      itemId: item.id, answer: "可持续的", usedHint: true, skipped: false,
      clientEventId: "boundary-hint",
    });
    expect(result.recallLevelAfter).toBe(1);
  });

  it("Review INCORRECT: recall_level 不变", async () => {
    const repo = new MemoryLearningRepository();
    const item = makeSeedItem("seed-001");
    await repo.createOrGetItem(item);
    await seedWithRecallLevel(repo, item.id, 2);

    const result = await simulateReviewSubmit(repo, {
      itemId: item.id, answer: "完全错误的答案", usedHint: false, skipped: false,
      clientEventId: "boundary-incorrect",
    });
    expect(result.recallLevelAfter).toBe(2);
  });

  it("Review SKIPPED: recall_level 不变", async () => {
    const repo = new MemoryLearningRepository();
    const item = makeSeedItem("seed-001");
    await repo.createOrGetItem(item);
    await seedWithRecallLevel(repo, item.id, 1);

    const result = await simulateReviewSubmit(repo, {
      itemId: item.id, answer: "", usedHint: false, skipped: true,
      clientEventId: "boundary-skip",
    });
    expect(result.recallLevelAfter).toBe(1);
  });

  it("createLearningEvent 返回显式 { event, created } 结构", async () => {
    const repo = new MemoryLearningRepository();
    const item = makeSeedItem("seed-001");
    await repo.createOrGetItem(item);

    const first = await repo.createLearningEvent({
      userId: USER_ID, itemId: item.id, eventType: "REVIEW",
      taskType: "MEANING_RECALL", answer: "test", correctness: "INDEPENDENT",
      hintLevel: 0, resultJson: {}, clientEventId: "contract-test-1", traceId: "t1",
    });
    expect(first.created).toBe(true);
    expect(first.event).toBeDefined();
    expect(first.event.clientEventId).toBe("contract-test-1");

    const second = await repo.createLearningEvent({
      userId: USER_ID, itemId: item.id, eventType: "REVIEW",
      taskType: "MEANING_RECALL", answer: "different", correctness: "FAIL",
      hintLevel: 0, resultJson: {}, clientEventId: "contract-test-1", traceId: "t2",
    });
    expect(second.created).toBe(false);
    expect(second.event.id).toBe(first.event.id);
    expect(second.event.correctness).toBe("INDEPENDENT"); // 既有事件，不覆盖
  });
});
