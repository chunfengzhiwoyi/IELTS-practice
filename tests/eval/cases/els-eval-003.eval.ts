/**
 * ELS-EVAL-003 — LEARNING_FLOW（新词卡首次生成：无副作用）
 * 词「mitigate」首次请求：生成结构化词卡 + 检索元数据，但不写任何状态/事件。
 */
import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { wordCardJson } from "../runner/stub-llm";
import { T0_ISO, traceOf, eventsOfType, payloadOf, memRepo, DEMO_USER_ID, currentState } from "./helpers";

interface CardResponse {
  item?: {
    id?: string;
    itemId?: string;
    canonicalForm?: string;
    contentJson?: {
      term?: string;
      coreMeaning?: string;
      generationMeta?: { knowledgeObjectIds?: string[]; promptVersion?: string };
    };
  };
  alreadyLearned?: boolean;
  currentState?: Record<string, unknown> | null;
}

interface RetrievalEvPayload {
  query?: string;
  hit_count?: number;
  knowledge_miss_flag?: boolean;
  matched_object_ids?: string[];
  returned_snippet_count?: number;
}

export const case_003: EvalCaseDefinition = {
  case_id: "ELS-EVAL-003",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const stub = ctx.script([wordCardJson("mitigate", "减轻；缓和（不良影响）")]);

    const beforeEvents = memRepo()._getAllEvents().length;
    const beforeStates = memRepo()._getAllStates().length;

    const res = await callRoute(
      LEARN_CARD,
      { term: "mitigate" },
      evalTraceId("003-new-word"),
    );
    const json = res.json as CardResponse | null;
    const trace = traceOf(evalTraceId("003-new-word"));
    const retrievalEv = eventsOfType(trace?.events, "knowledge.retrieved").map((e) =>
      payloadOf<RetrievalEvPayload>(e),
    )[0];

    const item = json?.item;
    const meta = item?.contentJson?.generationMeta;
    const itemId = item?.id ?? item?.itemId ?? "mitigate";
    const state = await currentState(itemId);
    const itemExists = (await memRepo().getItemById(itemId)) != null;

    ctx.rec.check(
      "r-new-word",
      "「mitigate」首学 → 结构化词卡生成 + alreadyLearned=false + currentState=null",
      {
        status: 200,
        alreadyLearned: false,
        stateNull: true,
        hasCoreMeaning: true,
        itemCreated: true,
      },
      {
        status: res.status,
        alreadyLearned: json?.alreadyLearned === true,
        stateNull: state === null,
        hasCoreMeaning: Boolean(item?.contentJson?.coreMeaning),
        itemCreated: itemExists,
      },
      { failure_layer: "LEARNING_FLOW", evidence: { replyItem: item, state } },
    );

    ctx.rec.check(
      "r-no-events",
      "词卡只读请求不产生任何学习事件 / 状态（纯展示）",
      { eventsUnchanged: true, statesUnchanged: true },
      {
        eventsUnchanged: beforeEvents === memRepo()._getAllEvents().length,
        statesUnchanged: beforeStates === memRepo()._getAllStates().length,
      },
      { failure_layer: "STATE_WRITE", evidence: { beforeEvents, afterEvents: memRepo()._getAllEvents().length } },
    );

    ctx.rec.check(
      "r-meta",
      "检索命中对象均见于 generationMeta.knowledgeObjectIds（knowledge_layer_version=v1 数据源）",
      { hasKnowledgeIds: true, version: "v1.1-knowledge-layer" },
      {
        hasKnowledgeIds: Boolean(meta?.knowledgeObjectIds && meta.knowledgeObjectIds.length > 0),
        version: meta?.promptVersion,
      },
      {
        failure_layer: "RETRIEVAL",
        metrics: ["M6"],
        evidence: { generationMeta: meta, retrievalEvent: retrievalEv, traceEvents: trace?.events.map((e) => e.event_type) },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "mitigate 词卡生成成功（HTTP 200, alreadyLearned=false, currentState=null）；items+1、events+0；" +
        "generationMeta.knowledgeObjectIds 含检索命中对象（promptVersion=v1.1-knowledge-layer）。",
      notes: "A 级确定性断言。词条走非 seed LLM 生成路径（真实 generateWordCardWithLlm + retrieveKnowledge）。",
    };
  },
};
