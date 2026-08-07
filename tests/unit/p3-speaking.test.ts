/**
 * P3 口语训练测试
 */
import { describe, expect, it } from "vitest";

import { analyzeSpeakingAnswer } from "@/lib/speaking/analysis";
import { getAllQuestions, getQuestionById, getQuestionsByPart, pickQuestion } from "@/lib/speaking/question-bank";
import { MemorySpeakingRepository } from "@/lib/speaking/repository";
import type { SpeakingQuestion, SpeakingSession } from "@/lib/speaking/types";

function getP1Question(): SpeakingQuestion {
  return getQuestionsByPart("P1")[0]!;
}

function getP2Question(): SpeakingQuestion {
  return getQuestionsByPart("P2")[0]!;
}

function getP3Question(): SpeakingQuestion {
  return getQuestionsByPart("P3")[0]!;
}

describe("题库加载", () => {
  it("1. 加载全部题目（12 题）", () => {
    const all = getAllQuestions();
    expect(all.length).toBe(12);
  });

  it("2. 按 Part 筛选", () => {
    expect(getQuestionsByPart("P1").length).toBe(4);
    expect(getQuestionsByPart("P2").length).toBe(4);
    expect(getQuestionsByPart("P3").length).toBe(4);
  });

  it("3. 按 ID 查找", () => {
    const q = getQuestionById("sp-p1-001");
    expect(q).not.toBeNull();
    expect(q!.part).toBe("P1");
  });

  it("4. pickQuestion 返回指定 part", () => {
    const q = pickQuestion("P2");
    expect(q.part).toBe("P2");
  });
});

describe("分析引擎", () => {
  it("5. 过短回答 → fluency major issue", () => {
    const q = getP1Question();
    const result = analyzeSpeakingAnswer("I am busy.", q);
    expect(result.mainIssue.dimension).toBe("fluency");
    expect(result.mainIssue.severity).toBe("major");
    expect(result.metrics.wordCount).toBeLessThan(q.expectedLength.min);
  });

  it("6. 无连接词 → coherence issue", () => {
    const q = getP1Question();
    // Answer long enough but no connectors
    const answer = "I wake up early. I go to work. I eat lunch. I come home. I sleep late. I do many things every day. My schedule is full.";
    const result = analyzeSpeakingAnswer(answer, q);
    const coherenceIssue = result.candidateIssues.find((i) => i.dimension === "coherence");
    expect(coherenceIssue).toBeDefined();
  });

  it("7. 大量重复题目原词 → vocabulary issue", () => {
    const q = getP1Question();
    // Use all keyTopicWords repeatedly
    const answer = "I have a busy day, yes a very busy day. My typical day is very busy. I typically do busy things on a busy day. My day is always busy from morning to night.";
    const result = analyzeSpeakingAnswer(answer, q);
    const vocabIssue = result.candidateIssues.find((i) => i.dimension === "vocabulary");
    expect(vocabIssue).toBeDefined();
  });

  it("8. 每轮只有一个 mainIssue", () => {
    const q = getP2Question();
    const result = analyzeSpeakingAnswer("Short.", q);
    expect(result.mainIssue).toBeDefined();
    // mainIssue 是一个对象，不是数组
    expect(result.mainIssue.dimension).toBeDefined();
    expect(result.mainIssue.description).toBeDefined();
  });

  it("9. 良好回答 → minor 或 fallback issue", () => {
    const q = getP1Question();
    const answer = "To be honest, I usually have a fairly busy day. Firstly, I wake up at around 7am and go for a quick jog. Then, I head to the office where I spend most of my time on meetings and projects. After that, I try to unwind by reading or watching something light. In addition, I make sure to spend some quality time with my family in the evening.";
    const result = analyzeSpeakingAnswer(answer, q);
    expect(result.mainIssue.severity).toBe("minor");
  });

  it("10. microDrill 始终存在", () => {
    const q = getP3Question();
    const result = analyzeSpeakingAnswer("Technology changed learning.", q);
    expect(result.microDrill).toBeDefined();
    expect(result.microDrill.prompt.length).toBeGreaterThan(0);
    expect(result.microDrill.targetDimension).toBeDefined();
  });

  it("11. metrics 结构完整", () => {
    const q = getP1Question();
    const result = analyzeSpeakingAnswer("I am busy every day because I have work.", q);
    expect(result.metrics).toHaveProperty("wordCount");
    expect(result.metrics).toHaveProperty("sentenceCount");
    expect(result.metrics).toHaveProperty("connectorCount");
    expect(result.metrics).toHaveProperty("uniqueWordRatio");
    expect(result.metrics).toHaveProperty("paraphraseScore");
  });

  it("12. Part 2 长回答分析正常", () => {
    const q = getP2Question();
    const answer = "I'd like to talk about learning to play the guitar. I started about three years ago when my friend invited me to join a band. What happened was that I practiced every single day for at least thirty minutes. Looking back, I think the most challenging part was building calluses on my fingers. The reason I'm proud is that I went from knowing nothing to being able to perform in front of an audience. To sum up, this skill taught me the value of persistence and daily practice.";
    const result = analyzeSpeakingAnswer(answer, q);
    expect(result.metrics.wordCount).toBeGreaterThan(80);
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

describe("SpeakingRepository", () => {
  it("13. 创建会话并获取", async () => {
    const repo = new MemorySpeakingRepository();
    const session: SpeakingSession = {
      id: "test-1",
      userId: "u1",
      questionId: "sp-p1-001",
      part: "P1",
      topic: "Daily Routine",
      question: "test?",
      firstAnswer: null,
      firstAnalysis: null,
      secondAnswer: null,
      secondAnalysis: null,
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repo.createSession(session);
    const found = await repo.getSession("test-1");
    expect(found?.id).toBe("test-1");
  });

  it("14. 更新首答", async () => {
    const repo = new MemorySpeakingRepository();
    const session: SpeakingSession = {
      id: "test-2",
      userId: "u1",
      questionId: "sp-p1-001",
      part: "P1",
      topic: "test",
      question: "test?",
      firstAnswer: null,
      firstAnalysis: null,
      secondAnswer: null,
      secondAnalysis: null,
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repo.createSession(session);
    const q = getP1Question();
    const analysis = analyzeSpeakingAnswer("I am busy.", q);
    const updated = await repo.updateFirstAnswer("test-2", "I am busy.", analysis);
    expect(updated.firstAnswer).toBe("I am busy.");
    expect(updated.firstAnalysis).not.toBeNull();
  });

  it("15. 更新重答后状态变 COMPLETED", async () => {
    const repo = new MemorySpeakingRepository();
    const session: SpeakingSession = {
      id: "test-3",
      userId: "u1",
      questionId: "sp-p1-001",
      part: "P1",
      topic: "test",
      question: "test?",
      firstAnswer: "first",
      firstAnalysis: null,
      secondAnswer: null,
      secondAnalysis: null,
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repo.createSession(session);
    const q = getP1Question();
    const analysis = analyzeSpeakingAnswer("My second improved answer with more detail.", q);
    const updated = await repo.updateSecondAnswer("test-3", "second answer", analysis);
    expect(updated.status).toBe("COMPLETED");
    expect(updated.secondAnswer).toBe("second answer");
  });

  it("16. getRecentSessions 过滤用户", async () => {
    const repo = new MemorySpeakingRepository();
    const base: SpeakingSession = {
      id: "",
      userId: "",
      questionId: "sp-p1-001",
      part: "P1",
      topic: "t",
      question: "q",
      firstAnswer: null,
      firstAnalysis: null,
      secondAnswer: null,
      secondAnalysis: null,
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repo.createSession({ ...base, id: "s1", userId: "u1" });
    await repo.createSession({ ...base, id: "s2", userId: "u2" });
    await repo.createSession({ ...base, id: "s3", userId: "u1" });
    const u1Sessions = await repo.getRecentSessions("u1");
    expect(u1Sessions.length).toBe(2);
  });
});
