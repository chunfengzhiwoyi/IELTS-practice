/**
 * ELS-EVAL-023 — RETRIEVAL_KNOWLEDGE（语义召回 miss：记录 + 生成不被污染）
 * term "ecofriendly"（概念属于 environment 但字面不同）→ 关键词引擎按设计漏召回：
 *  断言 (1) miss 被明确记录（knowledge_miss_flag / generationMeta）；
 *  断言 (2) 词卡仍生成成功且内容与知识库不冲突（环境话题卡片）。
 *  行 1 语义覆盖（P0-4 检索升级后）→ UNVERIFIED 能力缺口。
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
      generationMeta?: { knowledgeObjectIds?: string[] };
    };
  };
}

interface RetrievalEvPayload {
  query?: string;
  hit_count?: number;
  knowledge_miss_flag?: boolean;
  matched_object_ids?: string[];
}

export const case_023: EvalCaseDefinition = {
  case_id: "ELS-EVAL-023",
  automation_level: "B",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    // 语义相关但字面不匹配环境话题 assoc（sustainable/conservation/…）
    ctx.script([wordCardJson("ecofriendly", "环保的；对环境友好的")]);

    const res = await callRoute(LEARN_CARD, { term: "ecofriendly" }, evalTraceId("023-ecofriendly"));
    const json = res.json as CardResponse | null;
    const meta = json?.item?.contentJson?.generationMeta;
    const content = json?.item?.contentJson;
    const trace = traceOf(evalTraceId("023-ecofriendly"));
    const retrievalEv = eventsOfType(trace?.events, "knowledge.retrieved").map((e) =>
      payloadOf<RetrievalEvPayload>(e),
    )[0];

    const missRecorded =
      retrievalEv?.knowledge_miss_flag === true || (meta?.knowledgeObjectIds?.length ?? 0) === 0;

    ctx.rec.check(
      "r-miss-recorded",
      "语义召回 miss 被明确记录（knowledge_miss_flag 或 generationMeta 空注入）",
      { recorded: true },
      { recorded: missRecorded },
      {
        failure_layer: "RETRIEVAL",
        metrics: ["M6"],
        evidence: { retrievalEvent: retrievalEv, generationMeta: meta, traceEvents: trace?.events.map((e) => e.event_type) },
      },
    );

    ctx.rec.check(
      "r-unpolluted",
      "miss 时词卡仍生成成功且内容与知识库不冲突（环境话题卡片，无污染注入）",
      { status: 200, hasCard: true, environmentAligned: true },
      {
        status: res.status,
        hasCard: Boolean(content?.coreMeaning),
        environmentAligned: /环保|环境/.test(content?.coreMeaning ?? "") && !/家庭|家人|generation/.test((content?.usageContext ?? "") + content?.coreMeaning),
      },
      {
        failure_layer: "RETRIEVAL",
        metrics: ["M6"],
        evidence: { coreMeaning: content?.coreMeaning, usageContext: content?.usageContext },
      },
    );

    ctx.rec.uncoveredAssertion(
      "行 1 语义覆盖（FUTURE_TARGET / P0-4 检索升级后）——当前非 Gold 门槛，仅作未来目标注释，不作为本 Case 阻塞项",
    );

    ctx.rec.uncoveredAssertion(
      "PRODUCT_CAPABILITY_GAP：Frozen pass 行 2 要求 generationMeta 标记 knowledge_miss=true —— 产品 generationMeta 仅含 knowledgeLayerVersion/knowledgeObjectIds/promptVersion/conflictDetected/conflictResolution，缺 knowledge_miss 字段（与 035 同根因，候选 BC-035-R2 一并覆盖）",
    );

    return {
      coverage: "partial",
      uncoveredMode: "UNVERIFIED",
      actualSummary:
        "probe：ecofriendly 语义相关但字面未命中 → trace 层 knowledge_miss_flag=true、注入为空、词卡仍生成且内容与知识库无冲突（行为行全部通过）；" +
        "但 generationMeta 缺 knowledge_miss 标记（Frozen pass 行 2 硬性要求）→ PRODUCT_CAPABILITY_GAP → UNVERIFIED。",
      notes:
        "M3-P4A：分类 = PRODUCT_CAPABILITY_GAP（非 MANUAL）。safe-miss 行为（miss 记录于 trace / 生成成功 / 不污染）确定性通过；" +
        "generationMeta.knowledge_miss 字段属 Frozen 硬性 required 口径（与 035 同根因，BC-035-R2 候选覆盖）；行 1 语义召回为 FUTURE_TARGET，不入本 Case 状态。",
    };
  },
};
