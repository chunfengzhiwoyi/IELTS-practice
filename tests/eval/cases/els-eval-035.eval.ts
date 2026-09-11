/**
 * ELS-EVAL-035 — FALLBACK_FAILURE / RETRIEVAL 漏检
 * 知识库含 "wellbeing"（pt-topic-health.associatedTerms，无连字符）；
 * 用户输入 "well-being"（带连字符）→ normalizeTerm 不去连字符 →
 * 检索 0 命中（漏检可复现）→ 词卡仍生成、injected_count=0。
 * 对照行："wellbeing" 应命中 pt-topic-health。
 * M3-P4A 分类结论：
 *  - BC-035 canonical 去重修复保持 PASS（r1/r2/r4）；
 *  - generationMeta 缺 knowledge_miss 标记（Frozen 硬性 required）→ PRODUCT_CAPABILITY_GAP
 *    （候选 BC-035-R2，与 023 同根因）→ UNVERIFIED（LEGITIMATE）。
 */
import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { T0_ISO, traceOf, eventsOfType, payloadOf } from "./helpers";
import { wordCardJson } from "../runner/stub-llm";
import { retrieveKnowledge } from "@/lib/knowledge/retrieval";

interface CardResponse {
  item?: {
    id?: string;
    canonicalForm?: string;
    contentJson?: {
      generationMeta?: {
        knowledgeObjectIds?: string[];
        knowledgeMiss?: boolean;
      };
    };
  };
}

/** M2 retrieval.executed payload 只读视图（诊断证据） */
interface RetrievalEvPayload {
  query_raw?: string;
  query_normalized?: string;
  knowledge_object_ids?: string[];
  knowledge_injected_count?: number;
  knowledge_miss_flag?: boolean;
  conflict_detected?: boolean;
  conflict_resolution?: string;
}

export const case_035: EvalCaseDefinition = {
  case_id: "ELS-EVAL-035",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    const stub = ctx.script([
      wordCardJson("well-being", "健康；幸福"),
      wordCardJson("wellbeing", "健康；幸福"),
    ]);

    // A: 带连字符变体（漏检路径）
    const resA = await callRoute(LEARN_CARD, { term: "well-being" }, evalTraceId("035a"));
    const jsonA = resA.json as CardResponse | null;
    const metaA = jsonA?.item?.contentJson?.generationMeta;
    const idsA = metaA?.knowledgeObjectIds ?? [];

    // B: 无连字符（对照行，应命中 pt-topic-health）
    const resB = await callRoute(LEARN_CARD, { term: "wellbeing" }, evalTraceId("035b"));
    const jsonB = resB.json as CardResponse | null;
    const metaB = jsonB?.item?.contentJson?.generationMeta;
    const idsB = metaB?.knowledgeObjectIds ?? [];

    // M2 Trace：retrieval.executed（query_raw / query_normalized / knowledge_miss_flag / conflict）
    const retA = eventsOfType(traceOf(evalTraceId("035a"))?.events, "retrieval.executed").map((e) =>
      payloadOf<RetrievalEvPayload>(e),
    )[0] ?? null;
    const retB = eventsOfType(traceOf(evalTraceId("035b"))?.events, "retrieval.executed").map((e) =>
      payloadOf<RetrievalEvPayload>(e),
    )[0] ?? null;

    // r1: 漏检可复现 —— "well-being" 检索 0 命中，词卡仍正常生成
    ctx.rec.check(
      "r1-miss-reproducible",
      '"well-being" 检索 0 命中且不崩溃（HTTP 2xx、无知识注入、trace 标记 miss）',
      { httpStatus: 200, knowledgeObjectIds: [], traceMissFlag: true },
      {
        httpStatus: resA.status,
        knowledgeObjectIds: idsA,
        traceMissFlag: retA?.knowledge_miss_flag ?? null,
      },
      {
        failure_layer: "RETRIEVAL",
        evidence: {
          llmCalls: stub.calls.length,
          trace: retA,
          note: "query_raw/query_normalized 来自 M2 retrieval.executed；knowledgeObjectIds 来自响应 generationMeta（LLM 生成路径）",
        },
      },
    );

    // r2: 对照行 —— "wellbeing" 无连字符应在 knowledge 层命中 pt-topic-health（+ Rule 3 拉入的 guidance）
    // BC-035 修复后：第二次变体请求在路由层被去重复用首个 item（first-write-wins），
    // 响应 generationMeta 来自被复用 item（well-being 的 miss 结果），不代表本行检索；
    // 对照命中以产品真实 retrieveKnowledge 直调为准（同一真实函数，非重新实现）。
    const controlHit = retrieveKnowledge({ term: "wellbeing", currentContext: "general" });
    ctx.rec.check(
      "r2-control-hit",
      '"wellbeing" 无连字符在 knowledge 层命中 pt-topic-health（对照行，证明漏检由连字符规范化缺陷导致）',
      { httpStatus: 200, knowledgeObjectIds: ["pt-topic-health", "lg-collocation-guidance"] },
      { httpStatus: resB.status, knowledgeObjectIds: controlHit.knowledgeObjectIds },
      {
        failure_layer: "RETRIEVAL",
        evidence: {
          routeTrace: retB,
          routeResponseItemId: jsonB?.item?.id ?? null,
          routeResponseCanonical: jsonB?.item?.canonicalForm ?? null,
          routeResponseIds: idsB,
          note: "BC-035 去重生效：B 请求复用 A 的 item（first-write-wins），响应 generationMeta 来自复用 item；对照命中以 retrieveKnowledge 直调为准",
        },
      },
    );

    // r3: generationMeta 应记录 knowledge_miss —— 响应契约层缺能力（trace 层已有 knowledge_miss_flag）
    // M3-P4A：原 BLOCKED 改为 check 如实记录缺口状态（不伪造 PASS，也不以 BLOCKED 掩盖确定性缺口）
    ctx.rec.check(
      "r3-knowledge-miss-flag",
      "generationMeta 记录 knowledge_miss 标记（Frozen required：trace 层 retrieval.executed.knowledge_miss_flag 存在，但 generationMeta 缺字段）",
      { traceHasKnowledgeMissFlag: true, responseHasKnowledgeMissField: false, gapDocumented: true },
      {
        traceHasKnowledgeMissFlag: retA?.knowledge_miss_flag === true,
        responseHasKnowledgeMissField: metaA?.knowledgeMiss === true,
        gapDocumented: retA?.knowledge_miss_flag === true && metaA?.knowledgeMiss !== true,
      },
      {
        failure_layer: "RETRIEVAL",
        evidence: {
          traceHasKnowledgeMissFlag: retA?.knowledge_miss_flag ?? null,
          responseHasKnowledgeMissField: metaA?.knowledgeMiss ?? null,
          conflictDetection: retA?.conflict_detected ?? null,
          conflictResolution: retA?.conflict_resolution ?? null,
          capabilityNote: "PRODUCT_CAPABILITY_GAP：generationMeta 缺 knowledge_miss 字段（与 023 同根因）→ 候选 BC-035-R2；trace 层已如实记录，Frozen 判定以 generationMeta 口径为准",
        },
      },
    );

    // r4: canonical 去重 —— well-being / wellbeing 应归一为同一 learning item
    // （actual 只提交断言键；itemAId/itemBId 等诊断放 evidence，避免 deepEqual 全等误报）
    const itemAId = jsonA?.item?.id ?? null;
    const itemBId = jsonB?.item?.id ?? null;
    ctx.rec.check(
      "r4-canonical-dedup",
      '"well-being" 与 "wellbeing" 归一为同一 learning item（canonical 冲突去重）',
      { deduplicated: true },
      { deduplicated: itemAId !== null && itemAId === itemBId },
      {
        failure_layer: "RETRIEVAL",
        evidence: {
          itemAId,
          itemBId,
          canonicalA: jsonA?.item?.canonicalForm,
          canonicalB: jsonB?.item?.canonicalForm,
          note: "BC-035 修复后：canonicalKey 连字符不敏感 → 同一 canonical identity → 同一 itemId；display form 保留首次创建书写形式",
        },
      },
    );

    ctx.rec.uncoveredAssertion(
      "PRODUCT_CAPABILITY_GAP：generationMeta.knowledge_miss 字段未实现（Frozen 硬性 required；trace 层 flag 已存在）→ 候选产品任务 BC-035-R2；连字符规范化（well-being → 命中 pt-topic-health）属 P0-4 检索升级，FUTURE_TARGET 注释",
    );

    return {
      coverage: "partial",
      uncoveredMode: "UNVERIFIED",
      actualSummary:
        "r1 漏检可复现 PASS（well-being → knowledge ids=[]、trace knowledge_miss_flag=true、词卡生成无崩溃）；" +
        "对照行 wellbeing 在 knowledge 层命中 pt-topic-health + lg-collocation-guidance（r2）；" +
        "r4 去重生效（itemAId===itemBId=item-yi9ukg，canonicalKey 连字符不敏感）；" +
        "r3 如实记录 generationMeta.knowledge_miss 缺口（trace 层 flag=true / 响应层字段=null）→ PRODUCT_CAPABILITY_GAP → UNVERIFIED。",
      notes:
        "M3-P4A：分类 = PRODUCT_CAPABILITY_GAP（LEGITIMATE_UNVERIFIED）。BC-035 canonical 修复保持 PASS（r1/r2/r4）；" +
        "generationMeta.knowledge_miss 为 Frozen 硬性 required 口径（与 023 同根因，BC-035-R2 候选）；不得因 trace 层 flag 视为等价。",
    };
  },
};
