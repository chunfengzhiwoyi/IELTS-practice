/**
 * Bad Case 035 Final — Lexical Canonicalization Regression Tests
 * ------------------------------------------------------------
 * Final Contract（Closure Blocker A）：
 *   canonicalKey(raw) = normalizeTerm(raw) 命中 LEXICAL_VARIANTS 注册表 → 解析为规范形；
 *                        未命中 → 保持原样（连字符、空格均保留）。
 *
 * 必须同时满足（确定性断言）：
 *   1. well-being == wellbeing（同一 lexical identity，注册表解析）
 *   2. re-cover != recover（不同词，禁止无条件去连字符合并）
 *
 * Safety fixtures 分两类：
 *   MERGE     —— 已登记的同词变体（well-being/wellbeing、e-mail/email、co-operate/cooperate）
 *   NON-MERGE —— 未登记的书写差异（re-cover/recover、co-op/coop、state-of-the-art 等）
 *
 * 不引入 LLM lexical identity judge；不做大型词典；注册表冻结且可审计。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { LEXICAL_VARIANTS, canonicalKey, normalizeTerm, stableItemId } from "@/lib/learning/item-id";
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

describe("Bad Case 035 Final: canonicalKey — 词法变体注册表", () => {
  it("MERGE: well-being 和 wellbeing 生成相同 canonicalKey（解析为规范形 well-being）", () => {
    expect(canonicalKey("well-being")).toBe("well-being");
    expect(canonicalKey("wellbeing")).toBe("well-being");
    expect(canonicalKey("well-being")).toBe(canonicalKey("wellbeing"));
  });

  it("MERGE: well-being 和 wellbeing 生成相同 itemId", () => {
    const id1 = stableItemId(canonicalKey("well-being"));
    const id2 = stableItemId(canonicalKey("wellbeing"));
    expect(id1).toBe(id2);
  });

  it("大小写和空格不影响 canonicalKey（先 normalize 再查注册表）", () => {
    expect(canonicalKey("  Well-Being  ")).toBe("well-being");
    expect(canonicalKey("WELLBEING")).toBe("well-being");
    expect(canonicalKey("  E-Mail ")).toBe("email");
  });

  it("display form (canonicalForm) 保留原始连字符", () => {
    expect(normalizeTerm("well-being")).toBe("well-being");
    expect(normalizeTerm("Well-Being")).toBe("well-being");
  });

  it("变体输入：identity（规范形）≠ retrieval query（原始变体）", () => {
    // canonicalKey 把 "wellbeing" 解析为规范形 "well-being"，
    // 而 query 层仍保留用户输入 "wellbeing" —— 三者分离依然成立
    expect(canonicalKey("wellbeing")).toBe("well-being");
    expect(normalizeTerm("wellbeing")).toBe("wellbeing");
    expect(canonicalKey("wellbeing")).not.toBe(normalizeTerm("wellbeing"));
  });
});

describe("Bad Case 035 Final: MERGE / NON-MERGE safety fixtures", () => {
  it("MERGE fixture #2: e-mail == email（已登记同词变体）", () => {
    expect(canonicalKey("e-mail")).toBe("email");
    expect(canonicalKey("email")).toBe("email");
    expect(canonicalKey("e-mail")).toBe(canonicalKey("email"));
    expect(stableItemId(canonicalKey("e-mail"))).toBe(stableItemId(canonicalKey("email")));
  });

  it("MERGE fixture #3: co-operate == cooperate（已登记同词变体）", () => {
    expect(canonicalKey("co-operate")).toBe("cooperate");
    expect(canonicalKey("cooperate")).toBe("cooperate");
    expect(canonicalKey("co-operate")).toBe(canonicalKey("cooperate"));
  });

  it("NON-MERGE fixture #1: re-cover != recover（不同词，禁止合并）", () => {
    expect(canonicalKey("re-cover")).toBe("re-cover");
    expect(canonicalKey("recover")).toBe("recover");
    expect(canonicalKey("re-cover")).not.toBe(canonicalKey("recover"));
    expect(stableItemId(canonicalKey("re-cover"))).not.toBe(stableItemId(canonicalKey("recover")));
  });

  it("NON-MERGE fixture #2: co-op != coop（cooperative vs chicken coop）", () => {
    expect(canonicalKey("co-op")).toBe("co-op");
    expect(canonicalKey("coop")).toBe("coop");
    expect(canonicalKey("co-op")).not.toBe(canonicalKey("coop"));
  });

  it("NON-MERGE fixture #3: state-of-the-art 不塌缩为 stateoftheart", () => {
    expect(canonicalKey("state-of-the-art")).toBe("state-of-the-art");
    expect(canonicalKey("stateoftheart")).toBe("stateoftheart");
    expect(canonicalKey("state-of-the-art")).not.toBe(canonicalKey("stateoftheart"));
  });

  it("NON-MERGE fixture #4: 空格分隔的 well being ≠ wellbeing（未登记，fail-safe 独立）", () => {
    expect(canonicalKey("well being")).toBe("well being");
    expect(canonicalKey("well being")).not.toBe(canonicalKey("wellbeing"));
    expect(canonicalKey("well being")).not.toBe(canonicalKey("well-being"));
  });

  it("NON-MERGE fixture #5: 数字连字符 2-year != 2year（未登记）", () => {
    expect(canonicalKey("2-year")).toBe("2-year");
    expect(canonicalKey("2year")).toBe("2year");
    expect(canonicalKey("2-year")).not.toBe(canonicalKey("2year"));
  });

  it("fail-safe：任意未登记连字符词保持独立（hello-world != helloworld）", () => {
    expect(canonicalKey("hello-world")).toBe("hello-world");
    expect(canonicalKey("helloworld")).toBe("helloworld");
    expect(canonicalKey("hello-world")).not.toBe(canonicalKey("helloworld"));
  });

  it("注册表完整性：变体 key 已 normalize；value 是其自身的固定点", () => {
    for (const [variant, canonical] of Object.entries(LEXICAL_VARIANTS)) {
      expect(normalizeTerm(variant)).toBe(variant); // key 已是规范化输入
      expect(canonicalKey(variant)).toBe(canonical); // 变体解析到代表形
      expect(canonicalKey(canonical)).toBe(canonical); // 代表形是固定点
      expect(variant).not.toBe(canonical); // 变体与代表形确实不同（否则无需登记）
    }
  });
});

describe("Bad Case 035 Final: findSeedItem — 注册表一致性", () => {
  it("seed 词库无连字符/变体词，canonicalKey === normalizedTerm", () => {
    const seed = findSeedItem("sustainable");
    expect(seed).not.toBeNull();
    if (seed) {
      expect(canonicalKey(seed.normalizedTerm)).toBe(seed.normalizedTerm);
    }
  });
});

describe("Bad Case 035 Final: Memory Repository — createOrGetItem 去重", () => {
  it("MERGE: well-being 和 wellbeing 创建同一个 item（deduplicated=true）", async () => {
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

    expect(item1.id).toBe(item2.id);

    const created1 = await repo.createOrGetItem(item1);
    const created2 = await repo.createOrGetItem(item2);
    expect(created1.id).toBe(created2.id);

    const found1 = await repo.findItemByNormalizedTerm("well-being");
    const found2 = await repo.findItemByNormalizedTerm("wellbeing");
    expect(found1).not.toBeNull();
    expect(found2).not.toBeNull();
    expect(found1!.id).toBe(found2!.id);
  });

  it("NON-MERGE: re-cover 和 recover 创建不同的 item", async () => {
    const repo = new MemoryLearningRepository();

    const item1: LearningItem = {
      id: stableItemId(canonicalKey("re-cover")),
      itemType: "WORD",
      canonicalForm: "re-cover",
      normalizedTerm: "re-cover",
      canonicalKey: canonicalKey("re-cover"),
      contentJson: {} as never,
      topicTags: [],
      createdAt: new Date().toISOString(),
    };

    const item2: LearningItem = {
      id: stableItemId(canonicalKey("recover")),
      itemType: "WORD",
      canonicalForm: "recover",
      normalizedTerm: "recover",
      canonicalKey: canonicalKey("recover"),
      contentJson: {} as never,
      topicTags: [],
      createdAt: new Date().toISOString(),
    };

    const created1 = await repo.createOrGetItem(item1);
    const created2 = await repo.createOrGetItem(item2);
    expect(created1.id).not.toBe(created2.id);

    // 各自独立可查
    const found1 = await repo.findItemByNormalizedTerm("re-cover");
    const found2 = await repo.findItemByNormalizedTerm("recover");
    expect(found1!.id).toBe(created1.id);
    expect(found2!.id).toBe(created2.id);
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

describe("Bad Case 035 Final: learn/card 路由端到端（对齐 Eval r4 断言）", () => {
  beforeEach(async () => {
    traceStore.reset();
    setTraceEnabled(true);
    _resetRepositories();
    __resetRegistryForTests();
    __setProviderForTests("mock", makeWordCardProvider());
  });

  it("MERGE: well-being 与 wellbeing 两次请求返回同一个 item.id（deduplicated=true）", async () => {
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
