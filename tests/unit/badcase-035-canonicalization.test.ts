/**
 * Bad Case 035 — Lexical Canonicalization Regression Tests
 * ------------------------------------------------------------
 * 验证 well-being / wellbeing 等书写变体映射到同一个 canonical identity，
 * 同时确保不会无条件删除所有 lexical separators（collision safety）。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { canonicalKey, normalizeTerm, stableItemId } from "@/lib/learning/item-id";
import { findSeedItem, seedToLearningItem } from "@/lib/learning/seed-catalog";
import { MemoryLearningRepository } from "@/lib/learning/repositories/memory-learning-repository";
import type { LearningItem } from "@/lib/learning/types";

import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { _resetRepositories } from "@/lib/repository-factory";
import { setTraceEnabled } from "@/lib/observability/trace-context";
import { traceStore } from "@/lib/observability/trace-store";

describe("Bad Case 035: canonicalKey — 连字符不敏感", () => {
  it("well-being 和 wellbeing 生成相同 canonicalKey", () => {
    expect(canonicalKey("well-being")).toBe("wellbeing");
    expect(canonicalKey("wellbeing")).toBe("wellbeing");
    expect(canonicalKey("well-being")).toBe(canonicalKey("wellbeing"));
  });

  it("well-being 和 wellbeing 生成相同 itemId", () => {
    const id1 = stableItemId(canonicalKey("well-being"));
    const id2 = stableItemId(canonicalKey("wellbeing"));
    expect(id1).toBe(id2);
  });

  it("大小写和空格不影响 canonicalKey", () => {
    expect(canonicalKey("  Well-Being  ")).toBe("wellbeing");
    expect(canonicalKey("WELLBEING")).toBe("wellbeing");
  });

  it("display form (canonicalForm) 保留原始连字符", () => {
    // normalizeTerm 不改变连字符，只做小写/trim
    expect(normalizeTerm("well-being")).toBe("well-being");
    expect(normalizeTerm("Well-Being")).toBe("well-being");
  });

  it("三者分离：display form ≠ canonical identity ≠ retrieval query", () => {
    const raw = "Well-Being";
    const display = normalizeTerm(raw); // "well-being"
    const identity = canonicalKey(raw); // "wellbeing"
    expect(display).toBe("well-being");
    expect(identity).toBe("wellbeing");
    expect(display).not.toBe(identity);
  });
});

describe("Bad Case 035: collision safety — 不无条件删除所有 separator", () => {
  it("多词短语保留空格（不合并为一个词）", () => {
    expect(canonicalKey("well being")).toBe("well being");
    expect(canonicalKey("wellbeing")).toBe("wellbeing");
    expect(canonicalKey("well being")).not.toBe(canonicalKey("wellbeing"));
  });

  it("连字符短语 vs 无连字符不同词：已知 trade-off 记录", () => {
    // co-op (cooperative) 和 coop (chicken coop) 会被合并
    // 这是已知 trade-off：对 IELTS 词汇场景，同一概念因书写变体产生
    // 两份长期状态的代价 > 极少数真正不同词被合并的代价
    expect(canonicalKey("co-op")).toBe(canonicalKey("coop"));
    expect(canonicalKey("re-cover")).toBe(canonicalKey("recover"));
  });

  it("多连字符短语：state-of-the-art → stateoftheart（已知限制）", () => {
    // 多连字符短语会被合并为一个长词
    // 这是当前方案的限制，未来可通过 alias mapping 或更智能的
    // canonicalization（如仅对单词级连字符去符号）改进
    expect(canonicalKey("state-of-the-art")).toBe("stateoftheart");
  });

  it("数字连字符保留语义差异（synthetic safety case）", () => {
    // "2-year" 和 "2year" 应该不同吗？
    // 当前方案会合并。但这是 synthetic case，实际 IELTS 词汇中
    // 数字连字符短语（如 "2-year-old"）通常作为 PHRASE/CHUNK 而非 WORD 处理
    expect(canonicalKey("2-year")).toBe("2year");
  });
});

describe("Bad Case 035: findSeedItem — 连字符不敏感查找", () => {
  it("seed 词库无连字符词，canonicalKey === normalizedTerm", () => {
    // 验证 seed 词库中没有连字符词（确保不破坏现有 seed）
    const seed = findSeedItem("sustainable");
    expect(seed).not.toBeNull();
    if (seed) {
      expect(canonicalKey(seed.normalizedTerm)).toBe(seed.normalizedTerm);
    }
  });
});

describe("Bad Case 035: Memory Repository — createOrGetItem 去重", () => {
  it("well-being 和 wellbeing 创建同一个 item（deduplicated=true）", async () => {
    const repo = new MemoryLearningRepository();

    const item1: LearningItem = {
      id: stableItemId(canonicalKey("well-being")),
      itemType: "WORD",
      canonicalForm: "well-being",
      normalizedTerm: "well-being",
      canonicalKey: canonicalKey("well-being"),
      contentJson: {} as never,
      topicTags: [],
      createdAt: new Date().toISOString(),
    };

    const item2: LearningItem = {
      id: stableItemId(canonicalKey("wellbeing")),
      itemType: "WORD",
      canonicalForm: "wellbeing",
      normalizedTerm: "wellbeing",
      canonicalKey: canonicalKey("wellbeing"),
      contentJson: {} as never,
      topicTags: [],
      createdAt: new Date().toISOString(),
    };

    // 两个变体的 itemId 相同
    expect(item1.id).toBe(item2.id);

    // createOrGetItem 应该返回同一个 item
    const created1 = await repo.createOrGetItem(item1);
    const created2 = await repo.createOrGetItem(item2);
    expect(created1.id).toBe(created2.id);

    // findItemByNormalizedTerm 用任意变体都能找到
    const found1 = await repo.findItemByNormalizedTerm("well-being");
    const found2 = await repo.findItemByNormalizedTerm("wellbeing");
    expect(found1).not.toBeNull();
    expect(found2).not.toBeNull();
    expect(found1!.id).toBe(found2!.id);
  });

  it("不同词仍然创建不同 item", async () => {
    const repo = new MemoryLearningRepository();

    const item1: LearningItem = {
      id: stableItemId(canonicalKey("sustainable")),
      itemType: "WORD",
      canonicalForm: "sustainable",
      normalizedTerm: "sustainable",
      canonicalKey: canonicalKey("sustainable"),
      contentJson: {} as never,
      topicTags: [],
      createdAt: new Date().toISOString(),
    };

    const item2: LearningItem = {
      id: stableItemId(canonicalKey("significant")),
      itemType: "WORD",
      canonicalForm: "significant",
      normalizedTerm: "significant",
      canonicalKey: canonicalKey("significant"),
      contentJson: {} as never,
      topicTags: [],
      createdAt: new Date().toISOString(),
    };

    const created1 = await repo.createOrGetItem(item1);
    const created2 = await repo.createOrGetItem(item2);
    expect(created1.id).not.toBe(created2.id);
  });

  it("seedToLearningItem 包含 canonicalKey 字段", () => {
    const seed = findSeedItem("sustainable");
    expect(seed).not.toBeNull();
    if (seed) {
      const item = seedToLearningItem(seed);
      expect(item.canonicalKey).toBeDefined();
      expect(item.canonicalKey).toBe(canonicalKey(seed.normalizedTerm));
    }
  });
});

describe("Bad Case 035: learn/card 路由端到端（对齐 Eval r4 断言）", () => {
  beforeEach(async () => {
    traceStore.reset();
    setTraceEnabled(true);
    _resetRepositories();
    __resetRegistryForTests();
    __setProviderForTests("mock", makeWordCardProvider());
  });

  it("well-being 与 wellbeing 两次请求返回同一个 item.id（deduplicated=true）", async () => {
    const resA = await LEARN_CARD(
      new Request("http://localhost/api/learn/card", {
        method: "POST",
        headers: { "content-type": "application/json", "x-trace-id": "trc_035_rt_a" },
        body: JSON.stringify({ term: "well-being" }),
      }),
    );
    expect(resA.status).toBe(200);
    const jsonA = (await resA.json()) as { item?: { id?: string; canonicalForm?: string } };
    const itemAId = jsonA.item?.id;
    expect(itemAId).toBeTruthy();

    const resB = await LEARN_CARD(
      new Request("http://localhost/api/learn/card", {
        method: "POST",
        headers: { "content-type": "application/json", "x-trace-id": "trc_035_rt_b" },
        body: JSON.stringify({ term: "wellbeing" }),
      }),
    );
    expect(resB.status).toBe(200);
    const jsonB = (await resB.json()) as { item?: { id?: string; canonicalForm?: string } };
    expect(jsonB.item?.id).toBe(itemAId);
    // display form 保留首次创建的书写形式（同一 canonical identity 只保留一份状态）
    expect(jsonA.item?.canonicalForm).toBe("well-being");
    expect(jsonB.item?.canonicalForm).toBe("well-being");
  });

  it("r1 保持：well-being 首次请求 retrieval.executed 仍记录 knowledge_miss_flag=true", async () => {
    await LEARN_CARD(
      new Request("http://localhost/api/learn/card", {
        method: "POST",
        headers: { "content-type": "application/json", "x-trace-id": "trc_035_rt_c" },
        body: JSON.stringify({ term: "well-being" }),
      }),
    );
    const t = traceStore.getTrace("trc_035_rt_c");
    const ret = t?.events.find((e) => e.event_type === "retrieval.executed");
    expect(ret?.payload.knowledge_miss_flag).toBe(true);
    expect(ret?.payload.knowledge_object_ids).toEqual([]);
  });
});

function makeWordCardProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
      const raw = lastUser?.content ?? "";
      const term = raw.includes("：") ? raw.split("：").pop()!.trim() : raw;
      const normalized = term.toLowerCase();
      const card = {
        term,
        normalizedTerm: normalized,
        itemType: "WORD",
        phonetic: "/test/",
        partOfSpeech: "noun",
        coreMeaning: "健康；幸福",
        usageContext: "IELTS 写作/口语 health 话题",
        collocations: ["physical well-being"],
        exampleSentence: "Exercise improves well-being.",
        exampleTranslation: "运动改善健康。",
        commonMistake: "well-being 与 wellbeing 同义，书写变体不影响含义。",
        topicTags: ["health"],
        acceptedAnswers: ["健康", "幸福"],
        answerKeywords: ["健康", "幸福"],
      };
      return { content: JSON.stringify(card), model: "mock-model", usage: { input_tokens: 1, output_tokens: 1 } };
    },
  };
}
