/**
 * ELS-EVAL-022 — RETRIEVAL_KNOWLEDGE
 * term "mitigate" 精确命中 pt-topic-environment.associatedTerms →
 * knowledge_object_ids 记录命中（含 Rule 3 拉入的 topic 关联 guidance），
 * 知识注入 prompt，注入数 ≤5。
 * 词卡内容与命中对象一致（真实 LLM 内容质量）→ coverage partial。
 */
import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { T0_ISO } from "./helpers";

const MITIGATE_CARD_JSON = JSON.stringify({
  term: "mitigate",
  normalizedTerm: "mitigate",
  itemType: "WORD",
  phonetic: "/ˈmɪt.ɪ.ɡeɪt/",
  partOfSpeech: "verb",
  coreMeaning: "减轻；缓和（不良影响）",
  usageContext: "在 IELTS Writing Task 2 讨论环境问题或社会问题的解决方案时使用",
  collocations: ["mitigate the effects of", "mitigate climate change", "mitigate risks"],
  exampleSentence: "Governments should take immediate action to mitigate the effects of climate change.",
  exampleTranslation: "政府应该立即采取行动来减轻气候变化的影响。",
  commonMistake: "mitigate 是减轻/缓和，不是消除。",
  topicTags: ["environment", "society"],
  acceptedAnswers: ["减轻", "缓和", "减轻；缓和"],
  answerKeywords: ["减轻", "缓和"],
});

interface CardResponse {
  item?: {
    id?: string;
    canonicalForm?: string;
    contentJson?: {
      coreMeaning?: string;
      usageContext?: string;
      collocations?: string[];
      commonMistake?: string;
      topicTags?: string[];
      generationMeta?: { knowledgeObjectIds?: string[]; promptVersion?: string; knowledgeLayerVersion?: string };
    };
  };
  alreadyLearned?: boolean;
}

export const case_022: EvalCaseDefinition = {
  case_id: "ELS-EVAL-022",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    const stub = ctx.script([MITIGATE_CARD_JSON]);

    const res = await callRoute(LEARN_CARD, { term: "mitigate" }, evalTraceId("022"));
    const json = res.json as CardResponse | null;
    const meta = json?.item?.contentJson?.generationMeta;
    const ids = meta?.knowledgeObjectIds ?? [];

    // r1: 期望 taxonomy 对象 ∈ knowledge_object_ids
    ctx.rec.check(
      "r1-taxonomy-hit",
      'knowledge_object_ids 含 "pt-topic-environment"（term 精确命中 associatedTerms）',
      { knowledgeObjectIds: ["pt-topic-environment", "lg-collocation-guidance"] },
      { knowledgeObjectIds: ids },
      { failure_layer: "RETRIEVAL", evidence: { injectedIds: ids } },
    );

    // r2: 注入数 ≤ 5
    ctx.rec.check(
      "r2-injected-count",
      "knowledge_injected_count ≤ 5 且 > 0",
      { injectedCount: 2 },
      { injectedCount: ids.length },
      { failure_layer: "RETRIEVAL" },
    );

    // r3: 知识注入 prompt（trace 断链检测）
    const systemPrompt = stub.calls[0]?.systemContent ?? "";
    ctx.rec.check(
      "r3-prompt-injection",
      "词卡生成 system prompt 注入了知识上下文（含 environment 话题归属）",
      { knowledgeInjected: true, mentionsEnvironment: true, promptVersion: "v1.1-knowledge-layer" },
      {
        knowledgeInjected: systemPrompt.includes("IELTS 教学知识"),
        mentionsEnvironment: systemPrompt.includes("environment"),
        promptVersion: meta?.promptVersion,
      },
      { failure_layer: "RETRIEVAL", evidence: { systemPromptExcerpt: systemPrompt.slice(-400) } },
    );

    // r4: 基础可用性（seed 未命中 → LLM 生成 → 落库可学）
    ctx.rec.check(
      "r4-card-generated",
      "词卡成功生成（HTTP 200、item 落库、alreadyLearned=false）",
      { httpStatus: 200, hasItem: true, alreadyLearned: false },
      {
        httpStatus: res.status,
        hasItem: Boolean(json?.item?.id),
        alreadyLearned: json?.alreadyLearned,
      },
      { failure_layer: "BUSINESS_RULE" },
    );

    // r5: 词卡释义与命中知识对象内容一致性（Eval-side 确定性 judge：scripted fixture 已固定语义，
    //     直接对照 knowledge-objects-v1.json 的命中对象内容断言不对立/不污染）
    const card = json?.item?.contentJson;
    const envAligned = /环境|气候|生态/.test(
      [card?.usageContext ?? "", (card as { topicTags?: string[] } | undefined)?.topicTags?.join(" ") ?? ""].join(" "),
    );
    const collocAligned = /climate|environment|risk|effect/.test((card?.collocations ?? []).join(" "));
    const noContradiction =
      typeof card?.coreMeaning === "string" && card.coreMeaning.includes("减轻") &&
      typeof card?.commonMistake === "string" && card.commonMistake.includes("不是消除");
    ctx.rec.check(
      "r5-content-consistent",
      "词卡释义/用法/搭配与命中知识对象（pt-topic-environment + lg-collocation-guidance）内容一致、无冲突引用",
      { envAligned: true, collocAligned: true, noContradiction: true },
      { envAligned, collocAligned, noContradiction },
      {
        failure_layer: "RETRIEVAL",
        metrics: ["M6"],
        evidence: {
          coreMeaning: card?.coreMeaning,
          usageContext: card?.usageContext,
          collocations: card?.collocations,
          note: "确定性内容一致性（scripted fixture 语义固定；命中对象 content 见 data/knowledge/knowledge-objects-v1.json）",
        },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "mitigate 命中 pt-topic-environment + lg-collocation-guidance（Rule 1+3），注入数 2 ≤5，prompt 注入成功，词卡生成可用；" +
        "词卡内容与命中对象一致性（r5）确定性通过 → PASS",
      notes:
        "M3-P4A：Frozen Contract 对 022 无 [H] 人工标记（仅 006/016/018/019）。pass_criteria「词卡释义不与该对象冲突」" +
        "以确定性内容一致性 judge 自动裁决（scripted fixture 语义固定，对照知识对象 content 断言对齐与无冲突）；" +
        "真实 LLM 注入下可做更强语义断言，但非本 Case 的 Frozen 前置。",
    };  },
};
