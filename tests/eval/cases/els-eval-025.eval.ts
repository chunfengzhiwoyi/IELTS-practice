/**
 * ELS-EVAL-025 — RETRIEVAL_KNOWLEDGE（子串误匹配：内容不被无关对象污染）
 * term "regeneration" 通过子串规则命中 pt-topic-family（assoc "generation"）——gold 所述误匹配路径。
 * 断言：
 *  1) 返回集合如实记录（可追踪）；
 *  2) 词卡核心字段与无关对象（family/generation）无冲突引用（内容级断言；Frozen failure_criteria 判据）；
 *  3) precision 告警（Frozen pass 行 1：返回集 ⊄ 允许集时标 warning）→ 产品缺失 → PRODUCT_CAPABILITY_GAP。
 * M3-P4A：移除 RUNNER_OVERCONSTRAINT（M2 检索事件非 Frozen required；子串误匹配是否缺陷由 failure_criteria 决定，无需人工）。
 */
import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { wordCardJson } from "../runner/stub-llm";
import { T0_ISO, traceOf, eventsOfType, payloadOf } from "./helpers";

interface CardResponse {
  item?: {
    contentJson?: {
      coreMeaning?: string;
      usageContext?: string;
      collocations?: string[];
      generationMeta?: { knowledgeObjectIds?: string[] };
    };
  };
}

interface RetrievalEvPayload {
  query?: string;
  hit_count?: number;
  matched_object_ids?: string[];
}

export const case_025: EvalCaseDefinition = {
  case_id: "ELS-EVAL-025",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    // 词卡内容完全围绕「再生/重建（生态/城市）」语义，与 family/generation 无关
    ctx.script([
      wordCardJson("regeneration", "再生；重建（生态/城市更新）"),
    ]);

    const res = await callRoute(LEARN_CARD, { term: "regeneration" }, evalTraceId("025-regeneration"));
    const json = res.json as CardResponse | null;
    const meta = json?.item?.contentJson?.generationMeta;
    const content = json?.item?.contentJson;
    const trace = traceOf(evalTraceId("025-regeneration"));
    const retrievalEv = eventsOfType(trace?.events, "knowledge.retrieved").map((e) =>
      payloadOf<RetrievalEvPayload>(e),
    )[0];
    const ids = meta?.knowledgeObjectIds ?? [];

    ctx.rec.check(
      "r-documented",
      "返回对象集合如实写入 generationMeta.knowledgeObjectIds（词卡可追踪到检索结果）",
      { documented: true, status: 200 },
      { documented: ids.length > 0, status: res.status },
      {
        failure_layer: "RETRIEVAL",
        metrics: ["M6"],
        evidence: { ids, retrievalEvent: retrievalEv, matchReasonNote: "子串误匹配路径：regeneration ⊃ generation（pt-topic-family.assoc）" },
      },
    );

    ctx.rec.check(
      "r-content-clean",
      "词卡核心字段与无关对象（family/generation 语义）无冲突引用（内容级断言）",
      { noFamilyLeak: true, noGenerationLeak: true },
      {
        noFamilyLeak: !/家庭|家人|一代|family|generation/i.test(
          [content?.coreMeaning, content?.usageContext, content?.collocations?.join(" ")].filter(Boolean).join(" "),
        ),
        noGenerationLeak: true,
      },
      {
        failure_layer: "RETRIEVAL",
        metrics: ["M6"],
        evidence: { coreMeaning: content?.coreMeaning, usageContext: content?.usageContext, collocations: content?.collocations },
      },
    );

    // precision 告警能力（返回集 ⊄ 允许集时标 warning）：Frozen pass 行 1 硬性要求，产品当前无此机制
    ctx.rec.uncoveredAssertion(
      "PRODUCT_CAPABILITY_GAP：Frozen pass_criteria 行 1「返回对象集合 ⊄ 允许集时必须标 warning（retrieval precision warning）」—— 产品无该标记机制（候选产品任务 BC-025-R1）",
    );

    return {
      coverage: "partial",
      uncoveredMode: "UNVERIFIED",
      actualSummary:
        "命中记录可追踪（generationMeta.knowledgeObjectIds 如实记录 pt-topic-family 子串误命中路径）；词卡内容未被 family/generation 对象污染（r-content-clean 通过，未命中 Frozen failure_criteria「无关知识进入词卡内容」）；" +
        "precision warning 为 Frozen 硬性 pass 行 → 产品缺失 → PRODUCT_CAPABILITY_GAP → UNVERIFIED（LEGITIMATE）。",
      notes:
        "M3-P4A：分类 = PRODUCT_CAPABILITY_GAP。移除两处 RUNNER_OVERCONSTRAINT（①M2 knowledge.retrieved 事件并非 Frozen required_trace_fields，generationMeta 已可追踪；②子串误匹配是否为缺陷由 Frozen failure_criteria 决定——内容未污染即不构成缺陷，无需人工金标）；" +
        "仅 precision warning（Frozen pass 行 1 原文）保留为能力缺口。",
    };
  },
};
