/**
 * Bad Case 026 — Retrieval Conflict Detection & Resolution Regression Tests
 * ------------------------------------------------------------------------
 * Frozen Gold ELS-EVAL-026（capability-oriented，无优先级规则 [FIX-06]）：
 *   1. 检索层/prompt 层检测到冲突并处理（conflict_resolution 非空、可追踪）；
 *   2. 最终 guidance 不并列互斥断言（双源并陈必须携带差异提示）；
 *   3. 不把未冻结的优先级规则当作既定事实输出。
 *
 * 实现决策：
 *   - deterministic detector（lib/knowledge/conflict.ts）：同 guidanceType +
 *     同 appliesTo.contexts 组内，两对象存在极性相反（positive/negative）且指向
 *     同一 register target（或均为词级总括）的指令 → semantic_conflict；
 *     同内容 → duplicate（冗余，非冲突）；其余 → complementary / none。
 *   - Resolution：双源并陈 + 差异提示（Gold pass_criteria 3 允许），
 *     conflict_resolution = "dual_source_with_conflict_note"；不自动取舍（无优先级）。
 *   - retrieveKnowledge 结果携带 conflict_detected / conflict_resolution /
 *     conflict_object_ids；generationMeta 与 learn/card 路由 trace 同步记录。
 *
 * 假阳性回归（任务 §9）：
 *   B. 多对象互补 → 不误判；C. 同源重复 → duplicate（非语义冲突）；
 *   D. retrieval miss → 不误判；E. 单条命中 → no conflict；F. BC-035 不回归。
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { retrieveKnowledge, __resetKnowledgeCacheForTests } from "@/lib/knowledge/retrieval";
import { detectKnowledgeConflict, buildConflictNote } from "@/lib/knowledge/conflict";
import type { RetrievalMatch } from "@/lib/knowledge/types";
import { canonicalKey, stableItemId } from "@/lib/learning/item-id";

import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { _resetRepositories } from "@/lib/repository-factory";
import { setTraceEnabled } from "@/lib/observability/trace-context";
import { traceStore } from "@/lib/observability/trace-store";

const KB_PATH = path.resolve(process.cwd(), "data/knowledge/knowledge-objects-v1.json");

// =============================================================
// Fixtures（provenance=fake-fixture，Gold 026 许可；测试层注入，finally 恢复原字节）
// =============================================================

/** Gold 冲突对：同一语境（writing-task2）+ 同一 register target（正式）极性相反 */
const FIX_CONFLICT_A = {
  id: "fx-026-register-conflict-a",
  type: "lexical_guidance",
  sourceType: "eval_fixture",
  title: "Fixture 语域指引 A",
  tags: ["writing"],
  content: {
    guidanceType: "register_note",
    appliesTo: { contexts: ["writing-task2"], topics: ["environment"], itemTypes: ["WORD", "PHRASE", "CHUNK"] },
    guidance: "该词在正式学术写作中必须使用（fixture 冲突对 A）。",
    examples: [],
    antiExamples: [],
  },
};

const FIX_CONFLICT_B = {
  id: "fx-026-register-conflict-b",
  type: "lexical_guidance",
  sourceType: "eval_fixture",
  title: "Fixture 语域指引 B",
  tags: ["writing"],
  content: {
    guidanceType: "register_note",
    appliesTo: { contexts: ["writing-task2"], topics: ["environment"], itemTypes: ["WORD", "PHRASE", "CHUNK"] },
    guidance: "该词在正式写作中应避免使用（fixture 冲突对 B）。",
    examples: [],
    antiExamples: [],
  },
};

/** 互补对：同一语境但不同 register target（正式 vs 口语）→ 不得误判 */
const FIX_COMPLEMENTARY_C = {
  id: "fx-026-complementary-c",
  type: "lexical_guidance",
  sourceType: "eval_fixture",
  title: "Fixture 互补指引 C",
  tags: ["writing"],
  content: {
    guidanceType: "register_note",
    appliesTo: { contexts: ["writing-task2"], topics: ["environment"], itemTypes: ["WORD", "PHRASE", "CHUNK"] },
    guidance: "在正式学术写作中应使用该词（fixture 互补 C）。",
    examples: [],
    antiExamples: [],
  },
};

const FIX_COMPLEMENTARY_D = {
  id: "fx-026-complementary-d",
  type: "lexical_guidance",
  sourceType: "eval_fixture",
  title: "Fixture 互补指引 D",
  tags: ["writing"],
  content: {
    guidanceType: "register_note",
    appliesTo: { contexts: ["writing-task2"], topics: ["environment"], itemTypes: ["WORD", "PHRASE", "CHUNK"] },
    guidance: "该词在口语交流中应避免使用（fixture 互补 D）。",
    examples: [],
    antiExamples: [],
  },
};

/** 同源重复对：同内容（冗余，非语义冲突） */
const FIX_DUPLICATE_E = {
  id: "fx-026-duplicate-e",
  type: "lexical_guidance",
  sourceType: "eval_fixture",
  title: "Fixture 重复指引 E",
  tags: ["writing"],
  content: {
    guidanceType: "register_note",
    appliesTo: { contexts: ["writing-task2"], itemTypes: ["WORD", "PHRASE", "CHUNK"] },
    guidance: "该词在正式学术写作中必须使用。",
    examples: [],
    antiExamples: [],
  },
};

const FIX_DUPLICATE_F = {
  id: "fx-026-duplicate-f",
  type: "lexical_guidance",
  sourceType: "eval_fixture",
  title: "Fixture 重复指引 F",
  tags: ["writing"],
  content: {
    guidanceType: "register_note",
    appliesTo: { contexts: ["writing-task2"], itemTypes: ["WORD", "PHRASE", "CHUNK"] },
    guidance: "该词在正式学术写作中必须使用。",
    examples: [],
    antiExamples: [],
  },
};

/** 测试层注入 fixture KB；finally 恢复原字节 + 清缓存 */
async function withFixtureKb(fixtures: unknown[], fn: () => Promise<void> | void): Promise<void> {
  const backup = fs.readFileSync(KB_PATH, "utf8");
  const original = JSON.parse(backup);
  try {
    fs.writeFileSync(KB_PATH, JSON.stringify([...fixtures, ...original], null, 2));
    __resetKnowledgeCacheForTests();
    await fn();
  } finally {
    fs.writeFileSync(KB_PATH, backup);
    __resetKnowledgeCacheForTests();
  }
}

function matchOf(obj: unknown, reason: string): RetrievalMatch {
  return { object: obj as never, matchReason: reason };
}

// =============================================================
// 1) detectKnowledgeConflict —— helper 纯函数
// =============================================================

describe("BC-026: detectKnowledgeConflict — Gold 冲突对", () => {
  it("同 guidanceType + 同语境 + 同一 register target 极性相反 → semantic_conflict", () => {
    const result = detectKnowledgeConflict([
      matchOf(FIX_CONFLICT_A, "context matches"),
      matchOf(FIX_CONFLICT_B, "context matches"),
    ]);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictType).toBe("semantic_conflict");
    expect(result.conflictingObjectIds).toEqual(
      expect.arrayContaining(["fx-026-register-conflict-a", "fx-026-register-conflict-b"]),
    );
    expect(result.conflictDimension).toContain("register_note");
    expect(result.conflictDimension).toContain("writing-task2");
  });

  it("词级总括正/负指令（无 register target）同样判冲突", () => {
    const pos = {
      ...FIX_CONFLICT_A,
      id: "fx-026-gen-pos",
      content: { ...FIX_CONFLICT_A.content, guidance: "该词必须使用。" },
    };
    const neg = {
      ...FIX_CONFLICT_B,
      id: "fx-026-gen-neg",
      content: { ...FIX_CONFLICT_B.content, guidance: "该词应避免使用。" },
    };
    const result = detectKnowledgeConflict([matchOf(pos, "a"), matchOf(neg, "b")]);
    expect(result.hasConflict).toBe(true);
  });

  it("buildConflictNote 携带差异提示（Gold pass_criteria 3：双源并陈必须带说明）", () => {
    const result = detectKnowledgeConflict([
      matchOf(FIX_CONFLICT_A, "context matches"),
      matchOf(FIX_CONFLICT_B, "context matches"),
    ]);
    const note = buildConflictNote(result);
    expect(note).toContain("冲突");
    expect(note).toContain("不能同时成立");
    expect(note).toContain("fx-026-register-conflict-a");
    expect(note).not.toContain("conflict_resolution"); // 结构化字段不进入 prompt 文本
  });
});

describe("BC-026: detectKnowledgeConflict — 假阳性回归", () => {
  it("B. 多对象互补（同组同极性）→ 不判冲突", () => {
    const c = {
      ...FIX_COMPLEMENTARY_C,
      id: "fx-026-comp-c2",
      content: { ...FIX_COMPLEMENTARY_C.content, guidance: "正式学术写作中应优先使用该词。" },
    };
    const result = detectKnowledgeConflict([
      matchOf(FIX_COMPLEMENTARY_C, "context matches"),
      matchOf(c, "context matches"),
    ]);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictType).toBe("complementary");
  });

  it("B. 多对象互补（极性相反但 register target 不同）→ 不误判", () => {
    const result = detectKnowledgeConflict([
      matchOf(FIX_COMPLEMENTARY_C, "context matches"),
      matchOf(FIX_COMPLEMENTARY_D, "context matches"),
    ]);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictType).toBe("complementary");
  });

  it("C. 同源重复（同内容）→ duplicate，非语义冲突", () => {
    const result = detectKnowledgeConflict([
      matchOf(FIX_DUPLICATE_E, "context matches"),
      matchOf(FIX_DUPLICATE_F, "context matches"),
    ]);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictType).toBe("duplicate");
    expect(result.duplicateObjectIds).toEqual(
      expect.arrayContaining(["fx-026-duplicate-e", "fx-026-duplicate-f"]),
    );
  });

  it("E. 单条命中 → none", () => {
    const result = detectKnowledgeConflict([matchOf(FIX_CONFLICT_A, "context matches")]);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictType).toBe("none");
    expect(result.conflictingObjectIds).toEqual([]);
  });

  it("冲突只收集涉及对象；无关对象不进入 conflictingObjectIds", () => {
    const result = detectKnowledgeConflict([
      matchOf(FIX_CONFLICT_A, "context matches"),
      matchOf(FIX_CONFLICT_B, "context matches"),
      matchOf(FIX_COMPLEMENTARY_C, "context matches"),
    ]);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictingObjectIds).toHaveLength(2);
    expect(result.conflictingObjectIds).not.toContain("fx-026-complementary-c");
  });
});

// =============================================================
// 2) retrieveKnowledge —— 冲突检测集成（fixture KB，adapter 等价）
// =============================================================

describe("BC-026: retrieveKnowledge — Gold 冲突场景（fixture KB）", () => {
  it("冲突对命中 → conflict_detected=true + conflict_resolution 非空 + prompt 带差异提示", async () => {
    await withFixtureKb([FIX_CONFLICT_A, FIX_CONFLICT_B], () => {
      const result = retrieveKnowledge({ term: "deteriorate", currentContext: "writing-task2" });
      expect(result.conflict_detected).toBe(true);
      expect(result.conflict_resolution).toBe("dual_source_with_conflict_note");
      expect(result.conflict_object_ids).toEqual(
        expect.arrayContaining(["fx-026-register-conflict-a", "fx-026-register-conflict-b"]),
      );
      expect(result.knowledgeObjectIds).toEqual(
        expect.arrayContaining(["fx-026-register-conflict-a", "fx-026-register-conflict-b"]),
      );
      // 双源并陈 + 差异提示（Gold pass_criteria 3）
      expect(result.promptContext).toContain("必须使用");
      expect(result.promptContext).toContain("应避免使用");
      expect(result.promptContext).toContain("冲突提示");
      expect(result.promptContext).toContain("不能同时成立");
    });
  });

  it("互补多命中（同语境、target 不同）→ 不误判冲突（假阳性回归 B）", async () => {
    await withFixtureKb([FIX_COMPLEMENTARY_C, FIX_COMPLEMENTARY_D], () => {
      const result = retrieveKnowledge({ term: "deteriorate", currentContext: "writing-task2" });
      expect(result.knowledgeObjectIds.length).toBeGreaterThan(1);
      expect(result.conflict_detected).toBe(false);
      expect(result.conflict_resolution).toBeNull();
      expect(result.conflict_object_ids).toEqual([]);
      expect(result.promptContext).not.toContain("冲突提示");
    });
  });

  it("D. retrieval miss → 不误判冲突", () => {
    const result = retrieveKnowledge({ term: "zzzzzz-not-a-word", currentContext: "general" });
    expect(result.knowledgeObjectIds).toEqual([]);
    expect(result.conflict_detected).toBe(false);
    expect(result.conflict_resolution).toBeNull();
    expect(result.promptContext).toBeNull();
  });
});

describe("BC-026: retrieveKnowledge — 真实 KB（无 fixture）", () => {
  it("真实 KB 互补多命中（register + paraphrase + collocation）→ 不误判冲突", () => {
    const result = retrieveKnowledge({ term: "biodiversity", currentContext: "general" });
    expect(result.knowledgeObjectIds.length).toBeGreaterThan(1);
    expect(result.conflict_detected).toBe(false);
    expect(result.conflict_resolution).toBeNull();
  });
});

// =============================================================
// 3) learn/card 路由 e2e —— 冲突 trace（第二条 retrieval.executed）
// =============================================================

describe("BC-026: learn/card 路由 e2e — 冲突 trace 可追踪", () => {
  beforeEach(async () => {
    traceStore.reset();
    setTraceEnabled(true);
    _resetRepositories();
    __resetRegistryForTests();
    __setProviderForTests("mock", makeWordCardProvider());
  });

  it("fixture 冲突 → 第二条 retrieval.executed 携带 conflict_detected=true + resolution 非空", async () => {
    await withFixtureKb([FIX_CONFLICT_A, FIX_CONFLICT_B], async () => {
      const res = await LEARN_CARD(
        new Request("http://localhost/api/learn/card", {
          method: "POST",
          headers: { "content-type": "application/json", "x-trace-id": "trc_026_conflict" },
          body: JSON.stringify({ term: "biodiversity" }),
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        item?: { contentJson?: { generationMeta?: { conflictDetected?: boolean; conflictResolution?: string | null } } };
      };
      // generationMeta 记录冲突检测结果（Gold pass_criteria 2）
      expect(json.item?.contentJson?.generationMeta?.conflictDetected).toBe(true);
      expect(json.item?.contentJson?.generationMeta?.conflictResolution).toBe("dual_source_with_conflict_note");

      const t = traceStore.getTrace("trc_026_conflict");
      const rets = t?.events.filter((e) => e.event_type === "retrieval.executed") ?? [];
      expect(rets.length).toBe(2);
      // [0] seed lookup 保持原契约（miss + capability_missing，不被改动）
      expect(rets[0]!.payload.knowledge_miss_flag).toBe(true);
      expect(rets[0]!.payload.conflict_resolution).toBe("capability_missing");
      // [1] 知识层检索：冲突被检出并记录消解动作
      const kb = rets[1]!.payload as {
        conflict_detected?: boolean;
        conflict_resolution?: string;
        knowledge_object_ids?: string[];
      };
      expect(kb.conflict_detected).toBe(true);
      expect(kb.conflict_resolution).toBe("dual_source_with_conflict_note");
      expect(kb.knowledge_object_ids).toEqual(
        expect.arrayContaining(["fx-026-register-conflict-a", "fx-026-register-conflict-b"]),
      );
    });
  });

  it("真实 KB（无冲突）→ 第二条 retrieval.executed 记录 conflict_detected=false / resolution=none", async () => {
    const res = await LEARN_CARD(
      new Request("http://localhost/api/learn/card", {
        method: "POST",
        headers: { "content-type": "application/json", "x-trace-id": "trc_026_noconflict" },
        body: JSON.stringify({ term: "biodiversity" }),
      }),
    );
    expect(res.status).toBe(200);
    const t = traceStore.getTrace("trc_026_noconflict");
    const rets = t?.events.filter((e) => e.event_type === "retrieval.executed") ?? [];
    expect(rets.length).toBe(2);
    const kb = rets[1]!.payload as {
      conflict_detected?: boolean;
      conflict_resolution?: string;
      knowledge_object_ids?: string[];
    };
    expect(kb.conflict_detected).toBe(false);
    expect(kb.conflict_resolution).toBe("none");
    expect(kb.knowledge_object_ids?.length ?? 0).toBeGreaterThan(0);
  });
});

// =============================================================
// 4) BC-035 回归（F）：well-being / wellbeing canonical 行为不回归
// =============================================================

describe("BC-026: BC-035 回归 — canonical 行为不变", () => {
  it("well-being == wellbeing（同一 lexical identity）", () => {
    expect(canonicalKey("well-being")).toBe(canonicalKey("wellbeing"));
    expect(stableItemId(canonicalKey("well-being"))).toBe(stableItemId(canonicalKey("wellbeing")));
  });

  it("re-cover != recover（不同词，禁止无条件去连字符合并）", () => {
    expect(canonicalKey("re-cover")).not.toBe(canonicalKey("recover"));
  });
});

function makeWordCardProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
      const raw = lastUser?.content ?? "";
      const term = raw.includes("：") ? raw.split("：").pop()!.trim() : raw;
      const card = {
        term,
        normalizedTerm: term.toLowerCase(),
        itemType: "WORD",
        phonetic: "/test/",
        partOfSpeech: "noun",
        coreMeaning: "生物多样性",
        usageContext: "IELTS 写作/口语 environment 话题",
        collocations: ["marine biodiversity"],
        exampleSentence: "Biodiversity is essential to a healthy ecosystem.",
        exampleTranslation: "生物多样性对健康的生态系统至关重要。",
        commonMistake: "不要混淆 biodiversity 与 ecosystem。",
        topicTags: ["environment"],
        acceptedAnswers: ["生物多样性"],
        answerKeywords: ["生物多样性"],
      };
      return { content: JSON.stringify(card), model: "mock-model", usage: { input_tokens: 1, output_tokens: 1 } };
    },
  };
}
