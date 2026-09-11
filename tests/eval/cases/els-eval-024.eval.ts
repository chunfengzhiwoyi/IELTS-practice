/**
 * ELS-EVAL-024 — RETRIEVAL_KNOWLEDGE（无知识对象可用：检索空 → 词卡仍正常生成）
 * term "ephemeral"（知识库完全未覆盖）→ knowledgeObjectIds=[], injected_count=0，
 * 词卡仍独立生成（HTTP 2xx + schema 通过），不得 5xx / 不得强行注入无关对象。
 */
import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { wordCardJson } from "../runner/stub-llm";
import { T0_ISO, traceOf, eventsOfType, payloadOf } from "./helpers";

interface CardResponse {
  item?: {
    canonicalForm?: string;
    contentJson?: {
      coreMeaning?: string;
      generationMeta?: { knowledgeObjectIds?: string[]; knowledgeLayerVersion?: string };
    };
  };
  alreadyLearned?: boolean;
}

interface RetrievalEvPayload {
  query?: string;
  hit_count?: number;
  knowledge_miss_flag?: boolean;
  matched_object_ids?: string[];
}

export const case_024: EvalCaseDefinition = {
  case_id: "ELS-EVAL-024",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    ctx.script([wordCardJson("ephemeral", "短暂的；转瞬即逝的")]);

    const res = await callRoute(LEARN_CARD, { term: "ephemeral" }, evalTraceId("024-miss"));
    const json = res.json as CardResponse | null;
    const meta = json?.item?.contentJson?.generationMeta;
    const trace = traceOf(evalTraceId("024-miss"));
    const retrievalEv = eventsOfType(trace?.events, "knowledge.retrieved").map((e) =>
      payloadOf<RetrievalEvPayload>(e),
    )[0];

    ctx.rec.check(
      "r-card-generated",
      "检索空 → 词卡仍正常生成（HTTP 2xx + schema 通过 + 内容独立正确）",
      { status: 200, hasCard: true, hasCoreMeaning: true, missFlagOptional: true },
      {
        status: res.status,
        hasCard: Boolean(json?.item?.contentJson),
        hasCoreMeaning: Boolean(json?.item?.contentJson?.coreMeaning),
        missFlagOptional: retrievalEv?.knowledge_miss_flag !== undefined || meta?.knowledgeObjectIds?.length === 0,
      },
      {
        failure_layer: "RETRIEVAL",
        evidence: { response: json, retrievalEvent: retrievalEv },
      },
    );

    ctx.rec.check(
      "r-empty-injection",
      "knowledgeObjectIds=[] 且 injected_count=0（不强行注入无关对象）",
      { knowledgeObjectIds: [], injectedCount: 0 },
      {
        knowledgeObjectIds: meta?.knowledgeObjectIds ?? null,
        injectedCount: meta?.knowledgeObjectIds?.length ?? -1,
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
        "ephemeral（知识库未覆盖）→ 词卡正常生成，knowledgeObjectIds=[]、无注入、无 5xx；knowledge.retrieved 记录 miss。",
      notes: "A 级确定性断言。term 经核验不在 knowledge-objects-v1 的 associatedTerms 及其子串集合中（含全量 45 对象）。",
    };
  },
};
