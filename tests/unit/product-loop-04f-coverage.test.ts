/**
 * PRODUCT-LOOP-04F — Speaking Cross-Context Coverage 确定性测试
 * ------------------------------------------------------------
 * 目的：证明 Level 2 的 distinctContexts>=2 在真实题库中可达。
 *  - 每个 Speaking-eligible PHRASE/CHUNK 都有 >=2 个语义有效的可匹配 question context；
 *  - seed-003 take something for granted 至少能在真实匹配路径中选择两个不同 context；
 *  - 匹配保持确定性、questionId 唯一、suggested expression 仍为 OPTIONAL。
 *
 * 冻结边界：本测试只读 seed 数据 + 确定性匹配函数；不触碰
 * deriveApplicationLevel / evidence validator / Planner / Supabase。
 */
import { describe, it, expect } from "vitest";

process.env.AUTH_MODE = "demo";
process.env.DATA_PROVIDER = "memory";
process.env.LLM_PRIMARY_PROVIDER = "mock";
process.env.LLM_FALLBACK_ENABLED = "false";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { getAllQuestions, getQuestionsByPart } from "@/lib/speaking/question-bank";
import { matchQuestionForTargets } from "@/lib/speaking/question-matching";
import { getAllSeedItems } from "@/lib/learning/seed-catalog";
import type { SeedLearningItem } from "@/lib/learning/types";
import { SPEAKING_TOPIC_TAGS } from "@/lib/speaking/target-selection";

const SPEAKING_TAG_SET = new Set<string>(SPEAKING_TOPIC_TAGS);

/** target-selection 同款 eligibility（isSpeakable && hasSpeakingTag） */
function isSpeakingEligible(item: SeedLearningItem): boolean {
  const speakable = item.itemType === "PHRASE" || item.itemType === "CHUNK"
    ? true
    : item.itemType === "WORD"
      ? (item.collocations?.length ?? 0) > 0
      : false;
  if (!speakable) return false;
  return (item.topicTags ?? []).some((t) => SPEAKING_TAG_SET.has(t));
}

/** question-matching 同款 textHits（子串重叠，大小写不敏感） */
function textHits(tag: string, haystacks: string[]): boolean {
  const tagLower = tag.toLowerCase();
  return haystacks.some((h) => {
    const hLower = h.toLowerCase();
    return hLower.includes(tagLower) || tagLower.includes(hLower);
  });
}

/** 某 item 在全题库中可匹配的 questionId 列表（与 matchQuestionForTargets 同口径） */
function matchingQuestionIds(item: SeedLearningItem): string[] {
  const questions = getAllQuestions();
  const tags = item.topicTags ?? [];
  return questions
    .filter((q) => {
      const haystacks = [q.topic, ...(q.keyTopicWords ?? [])];
      return tags.some((tag) => textHits(tag, haystacks));
    })
    .map((q) => q.questionId);
}

describe("PRODUCT-LOOP-04F speaking cross-context coverage", () => {
  const allItems = getAllSeedItems();
  const eligible = allItems.filter(isSpeakingEligible);

  it("T03: 题库无重复 questionId，且每道题 schema 完整", () => {
    const questions = getAllQuestions();
    const ids = questions.map((q) => q.questionId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(questions.length).toBeGreaterThanOrEqual(13);
    for (const q of questions) {
      expect(q.part).toMatch(/^P[123]$/);
      expect(q.topic.length).toBeGreaterThan(0);
      expect(q.question.length).toBeGreaterThan(10);
      expect((q.keyTopicWords ?? []).length).toBeGreaterThan(0);
    }
  });

  it("T02/T04: 所有 Speaking-eligible PHRASE/CHUNK 有 coverage 条目，且 tags 合法", () => {
    expect(eligible.length).toBeGreaterThanOrEqual(8);
    for (const item of eligible) {
      expect(item.topicTags?.length ?? 0).toBeGreaterThan(0);
      // 至少含一个口语标记（hasSpeakingTag）
      expect(item.topicTags!.some((t) => SPEAKING_TAG_SET.has(t))).toBe(true);
      // 每个非口语 tag 也非空字符串
      for (const tag of item.topicTags!) {
        expect(tag.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("T07: 每个 Speaking-eligible PHRASE/CHUNK 都有 >=2 个可匹配 context（无 CONTENT_EXCEPTION）", () => {
    const failing: string[] = [];
    for (const item of eligible) {
      const ids = matchingQuestionIds(item);
      if (ids.length < 2) {
        failing.push(`${item.itemId}(${item.term}): ${ids.length}`);
      }
    }
    expect(failing).toEqual([]);
  });

  it("T05: 匹配确定性（同一输入两次结果一致）", () => {
    const q = getAllQuestions();
    const seed003 = allItems.find((i) => i.itemId === "seed-003")!;
    const targets = [
      { itemId: seed003.itemId, canonicalForm: seed003.term, meaning: seed003.coreMeaning, reason: "r", score: 1 },
    ];
    const tagsOf = (id: string) => allItems.find((s) => s.itemId === id)?.topicTags ?? [];
    const a = matchQuestionForTargets(q, targets, tagsOf);
    const b = matchQuestionForTargets(q, targets, tagsOf);
    expect(a.question?.questionId).toBe(b.question?.questionId);
    expect(a.matchedTargets.map((t) => t.itemId)).toEqual(b.matchedTargets.map((t) => t.itemId));
  });

  it("T01: seed-003 至少有 2 个 distinct contexts（questionId 与 topic 均不同）", () => {
    const seed003 = allItems.find((i) => i.itemId === "seed-003")!;
    const ids = matchingQuestionIds(seed003);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    // distinct context 判定（04D：K = max(distinct questionId, distinct topic)）
    const questions = getAllQuestions();
    const matchedQs = questions.filter((q) => ids.includes(q.questionId));
    const distinctTopics = new Set(matchedQs.map((q) => q.topic));
    expect(new Set(ids).size).toBeGreaterThanOrEqual(2);
    expect(distinctTopics.size).toBeGreaterThanOrEqual(2);
  });

  it("seed-003 真实匹配路径：P1/P2/P3 池中至少两个不同 context 可达", () => {
    const seed003 = allItems.find((i) => i.itemId === "seed-003")!;
    const tagsOf = (id: string) => allItems.find((s) => s.itemId === id)?.topicTags ?? [];
    const targets = [
      { itemId: seed003.itemId, canonicalForm: seed003.term, meaning: seed003.coreMeaning, reason: "r", score: 1 },
    ];
    const hits: string[] = [];
    for (const part of ["P1", "P2", "P3"] as const) {
      const res = matchQuestionForTargets(getQuestionsByPart(part), targets, tagsOf);
      if (res.question) hits.push(`${res.question.questionId}/${res.question.topic}`);
    }
    expect(new Set(hits).size).toBeGreaterThanOrEqual(2);
    // Context A / Context B 记录
    console.log("SEED_003_HITS:", hits.join(" | "));
  });

  it("T06: optional suggestion contract 保持 —— 无匹配时 targets=[] 且匹配不报错", () => {
    // 一个没有任何口语 tag 的 item（seed-004）不应被选为目标，也绝不报错
    const seed004 = allItems.find((i) => i.itemId === "seed-004")!;
    expect(isSpeakingEligible(seed004)).toBe(false);
    const res = matchQuestionForTargets(getQuestionsByPart("P1"), [], () => []);
    expect(res.question).toBeNull();
    expect(res.matchedTargets).toEqual([]);
  });
});
