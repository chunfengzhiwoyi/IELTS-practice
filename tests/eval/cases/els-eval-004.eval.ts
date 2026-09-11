/**
 * ELS-EVAL-004 — LEARNING_FLOW（已学词重复请求：状态不被重置）
 * 词「decline」已于 D-3 学习并进入复习周期（RECALLED_INDEPENDENTLY, recallLevel=1）。
 * 再次请求词卡：alreadyLearned=true、currentState 保留、不重置、不重复建词条、不产生新事件。
 */
import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { wordCardJson } from "../runner/stub-llm";
import {
  T0_ISO,
  iso,
  HOUR,
  traceOf,
  memRepo,
  DEMO_USER_ID,
  putState,
  currentState,
} from "./helpers";

interface CardResponse {
  item?: { itemId?: string; canonicalForm?: string };
  alreadyLearned?: boolean;
  currentState?: { status?: string; recallLevel?: number; nextReviewAt?: string } | null;
}

export const case_004: EvalCaseDefinition = {
  case_id: "ELS-EVAL-004",
  automation_level: "A",
  async run(ctx) {
    // 先建立词条 + 预置 D-3 已学状态（走真实 learn/card 生成路径）
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const stub1 = ctx.script([wordCardJson("decline", "下降；婉拒")]);
    const first = await callRoute(LEARN_CARD, { term: "decline" }, evalTraceId("004-seed"));
    const firstItem = (first.json as { item?: { itemId?: string; id?: string } } | null)?.item;
    const itemId = firstItem?.id ?? firstItem?.itemId;
    if (!itemId) {
      ctx.rec.blocked("r-seed", "预置 decline 词条失败", "itemId 存在", itemId, {
        failure_layer: "LEARNING_FLOW",
      });
      return { coverage: "partial", actualSummary: "预置失败（BLOCKED_BY_CAPABILITY）" };
    }

    const seededNext = iso(T0_ISO, -3 * 24 * HOUR);
    await putState(itemId, {
      status: "RECALLED_INDEPENDENTLY",
      recallLevel: 1,
      consecutiveCorrect: 1,
      currentIntervalDays: 3,
      nextReviewAt: seededNext,
    });
    const stateBefore = await currentState(itemId);
    const eventsBefore = memRepo()._getAllEvents().length;
    const itemBefore = await memRepo().getItemById(itemId);

    // 再次请求词卡（已学 → 应命中既有词条）
    // 注意：不再调用 ctx.reset() —— 预置状态（putState）在内存仓库中，reset 会清空。
    // 仅重新注册 scripted LLM provider（覆盖同名 mock kind）。
    const stub2 = ctx.script([wordCardJson("decline", "下降；婉拒")]);
    const res = await callRoute(LEARN_CARD, { term: "decline" }, evalTraceId("004-relearn"));
    const json = res.json as CardResponse | null;
    const itemAfter = await memRepo().getItemById(itemId);

    ctx.rec.check(
      "r-known",
      "已学词「decline」→ alreadyLearned=true 且 currentState 完整返回（无重置）",
      {
        status: 200,
        alreadyLearned: true,
        stateStatus: "RECALLED_INDEPENDENTLY",
        recallLevel: 1,
        nextReviewAtUnchanged: true,
      },
      {
        status: res.status,
        alreadyLearned: json?.alreadyLearned === true,
        stateStatus: json?.currentState?.status,
        recallLevel: json?.currentState?.recallLevel,
        nextReviewAtUnchanged: (json?.currentState?.nextReviewAt ?? null) === stateBefore?.nextReviewAt,
      },
      { failure_layer: "LEARNING_FLOW", evidence: { stateBefore, stateAfter: json?.currentState } },
    );

    ctx.rec.check(
      "r-no-reset",
      "重复请求不重置状态、不重复建词条（同一 itemId 同一 canonicalForm）、不产生新事件",
      { itemUnchanged: true, eventsUnchanged: true },
      {
        itemUnchanged:
          itemBefore?.canonicalForm === "decline" &&
          itemAfter?.id === itemId &&
          itemAfter?.canonicalForm === "decline",
        eventsUnchanged: memRepo()._getAllEvents().length === eventsBefore,
      },
      {
        failure_layer: "STATE_WRITE",
        evidence: { eventsBefore, eventsAfter: memRepo()._getAllEvents().length, itemBefore, itemAfter, user: DEMO_USER_ID },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "已学词第二次请求 → alreadyLearned=true，currentState（RECALLED_INDEPENDENTLY/recallLevel=1/nextReviewAt）完整保留；词条未重复、事件未新增。",
      notes: "A 级确定性断言。precondition 通过真实 learn/card 生成 + putState 预置（内存仓库）。",
    };
  },
};
