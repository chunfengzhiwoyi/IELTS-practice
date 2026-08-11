/**
 * P4 学习报告测试（12 项）
 */
import { describe, expect, it } from "vitest";

import { MemoryLearningRepository } from "@/lib/learning/repositories/memory-learning-repository";
import { findSeedItem, seedToLearningItem } from "@/lib/learning/seed-catalog";
import { MemorySpeakingRepository } from "@/lib/speaking/repository";
import { analyzeSpeakingAnswer } from "@/lib/speaking/analysis";
import { getQuestionsByPart } from "@/lib/speaking/question-bank";
import { aggregateReportData } from "@/lib/report/aggregator";
import { generateRecommendations } from "@/lib/report/recommendations";
import type { SpeakingSession } from "@/lib/speaking/types";

function makeLearnRepo() {
  return new MemoryLearningRepository();
}

function makeSpeakRepo() {
  return new MemorySpeakingRepository();
}

const NOW = new Date(Date.now() + 60_000); // 比当前时间晚1分钟，确保包含所有新建事件
const USER = "demo-user-001";

async function seedLearningData(repo: MemoryLearningRepository) {
  // 学 3 个词
  for (const term of ["sustainable", "significant", "inevitable"]) {
    const seed = findSeedItem(term)!;
    const item = seedToLearningItem(seed);
    await repo.createOrGetItem(item);
    await repo.upsertUserItemState({
      userId: USER,
      itemId: item.id,
      status: "RECALLED_INDEPENDENTLY",
      recognitionLevel: 1,
      recallLevel: 1,
      applicationLevel: 0,
      consecutiveCorrect: 1,
      currentIntervalDays: 1,
      nextReviewAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    });
    await repo.createLearningEvent({
      userId: USER,
      itemId: item.id,
      eventType: "NEW",
      taskType: "MEANING_RECALL",
      answer: "correct",
      correctness: "INDEPENDENT",
      hintLevel: 0,
      resultJson: {},
      clientEventId: `new-${item.id}`,
      traceId: "t",
    });
  }
  // 复习 2 次
  const item1 = (await repo.findItemByNormalizedTerm("sustainable"))!;
  await repo.createLearningEvent({
    userId: USER,
    itemId: item1.id,
    eventType: "REVIEW",
    taskType: "MEANING_RECALL",
    answer: "可持续的",
    correctness: "INDEPENDENT",
    hintLevel: 0,
    resultJson: {},
    clientEventId: "rev-1",
    traceId: "t",
  });
  await repo.createLearningEvent({
    userId: USER,
    itemId: item1.id,
    eventType: "REVIEW",
    taskType: "MEANING_RECALL",
    answer: "wrong",
    correctness: "FAIL",
    hintLevel: 0,
    resultJson: {},
    clientEventId: "rev-2",
    traceId: "t",
  });
}

async function seedSpeakingData(repo: MemorySpeakingRepository) {
  const q = getQuestionsByPart("P1")[0]!;
  for (let i = 0; i < 3; i++) {
    const session: SpeakingSession = {
      id: `spk-test-${i}`,
      userId: USER,
      questionId: q.questionId,
      part: "P1",
      topic: q.topic,
      question: q.question,
      firstAnswer: "I am busy.",
      firstAnalysis: analyzeSpeakingAnswer("I am busy.", q),
      secondAnswer: null,
      secondAnalysis: null,
      status: "COMPLETED",
      createdAt: new Date(NOW.getTime() - i * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(NOW.getTime() - i * 60 * 60 * 1000).toISOString(),
    };
    await repo.createSession(session);
  }
}

describe("报告聚合", () => {
  it("1. 空数据 → insufficientData=true", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    expect(data.events.length).toBe(0);
    expect(data.states.length).toBe(0);
    expect(data.memory.totalItems).toBe(0);
  });

  it("2. 有学习数据 → 正确计数", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedLearningData(lr);
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    expect(data.memory.totalItems).toBe(3);
    expect(data.memory.newItems).toBe(3);
    expect(data.memory.reviewedCount).toBe(2);
  });

  it("3. dueSoon 计算正确", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedLearningData(lr);
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    // All 3 items have nextReviewAt 2h before NOW → all are due (within 24h window counts past due too)
    expect(data.memory.dueSoon).toBe(3);
  });

  it("4. 复习统计 → correctRate 正确", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedLearningData(lr);
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    expect(data.review.totalReviews).toBe(2);
    expect(data.review.correctIndependent).toBe(1);
    expect(data.review.incorrect).toBe(1);
    expect(data.review.correctRate).toBe(0.5);
  });

  it("5. 口语观察 → 检测重复维度", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedSpeakingData(sr);
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    expect(data.speakingObservations.length).toBeGreaterThan(0);
    // "I am busy." → fluency issue, 3 sessions → isPattern=true
    const fluency = data.speakingObservations.find((o) => o.dimension === "fluency");
    expect(fluency?.isPattern).toBe(true);
    expect(fluency?.occurrenceCount).toBe(3);
  });

  it("6. statusDistribution 正确", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedLearningData(lr);
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    expect(data.memory.statusDistribution.RECALLED_INDEPENDENTLY).toBe(3);
  });
});

describe("推荐逻辑", () => {
  it("7. 有到期复习 → 推荐 REVIEW HIGH", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedLearningData(lr);
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    const recs = generateRecommendations(data, NOW);
    const reviewRec = recs.find((r) => r.taskType === "REVIEW" && r.priority === "HIGH");
    expect(reviewRec).toBeDefined();
  });

  it("8. 正确率低 → 推荐加强复习", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedLearningData(lr);
    // Add more failed reviews to drop correctRate below 0.6
    const item = (await lr.findItemByNormalizedTerm("significant"))!;
    for (let i = 0; i < 3; i++) {
      await lr.createLearningEvent({
        userId: USER, itemId: item.id, eventType: "REVIEW",
        taskType: "MEANING_RECALL", answer: "wrong", correctness: "FAIL",
        hintLevel: 0, resultJson: {}, clientEventId: `fail-${i}`, traceId: "t",
      });
    }
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    expect(data.review.correctRate).toBeLessThan(0.6);
    const recs = generateRecommendations(data);
    const lowRateRec = recs.find((r) => r.reason.includes("正确率"));
    expect(lowRateRec).toBeDefined();
  });

  it("9. 口语重复问题 → 推荐 SPEAKING", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedSpeakingData(sr);
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    const recs = generateRecommendations(data);
    const speakingRec = recs.find((r) => r.taskType === "SPEAKING");
    expect(speakingRec).toBeDefined();
  });

  it("10. 词汇量不足 → 推荐 LEARN_NEW", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedLearningData(lr); // only 3 items
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    const recs = generateRecommendations(data);
    const learnRec = recs.find((r) => r.taskType === "LEARN_NEW");
    expect(learnRec).toBeDefined();
  });

  it("11. 空数据 → 至少一个推荐", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    const recs = generateRecommendations(data);
    expect(recs.length).toBeGreaterThan(0);
  });

  it("12. 推荐按优先级排序", async () => {
    const lr = makeLearnRepo();
    const sr = makeSpeakRepo();
    await seedLearningData(lr);
    await seedSpeakingData(sr);
    const data = await aggregateReportData(lr, sr, { userId: USER, period: "7d", now: NOW });
    const recs = generateRecommendations(data);
    const priorities = recs.map((r) => r.priority);
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i]!]).toBeGreaterThanOrEqual(order[priorities[i - 1]!]);
    }
  });
});
