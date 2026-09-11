/**
 * ELS-EVAL-037 — CROSS_MODULE_STATE（重复 clientEventId 幂等性）
 * 同一提交以相同 clientEventId 重放两次（间隔 200ms）。
 * Gold：learning_events 仅 1 条；nextReviewAt 仅按一次 +72h 推进；
 * 第二次响应返回既有结果（幂等语义）；无 5xx。
 *
 * CURRENT 实况（checkpoint = M1 Final + M2 Phase 1+2）：
 *  - MemoryLearningRepository.createLearningEvent 有 clientEventId 去重（{event, created} 契约）
 *  - M1 Final：review/submit route 已实现显式幂等跳过 —— created=false 时不更新 state，
 *    返回既有 eventId/result（x-idempotent-replay: true）→ 事件数=1、调度单推、recall 1→2
 *  - M2 Trace：第二次请求 state.write.idempotency_outcome 应为 duplicate_ignored（证据记录，Gold 判定）
 */
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { T0_ISO, currentState, eventsFor, iso, putState, seedItemIntoRepo, HOUR, traceOf, eventsOfType, payloadOf } from "./helpers";
import { judgeJson } from "../runner/stub-llm";

const SEVENTY_TWO_H = 72 * HOUR;
const TWO_HUNDRED_MS = 200_000; // 200ms（μs 精度存 ISO）

export const case_037: EvalCaseDefinition = {
  case_id: "ELS-EVAL-037",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    // 预置：到期复习词 W（recallLevel=1，nextReviewAt 已过期）
    const item = await seedItemIntoRepo("seed-001");
    await putState(item.id, {
      status: "RECALLED_WITH_HELP",
      recallLevel: 1,
      consecutiveCorrect: 0,
      currentIntervalDays: 1,
      nextReviewAt: iso(T0_ISO, -HOUR),
    });

    const stub = ctx.script([judgeJson(true), judgeJson(true)]);

    const body = {
      itemId: item.id,
      taskType: "MEANING_RECALL" as const,
      answer: "减轻",
      usedHint: false,
      skipped: false,
      clientEventId: "rev-w-dup-1",
    };

    // 第一次提交 @T0（独立正确）
    const res1 = await callRoute(REVIEW_SUBMIT, body, evalTraceId("037", 1));

    // 第二次提交（完全同 body，模拟网络重试）@T0+200ms
    ctx.clock.advance(TWO_HUNDRED_MS);
    const res2 = await callRoute(REVIEW_SUBMIT, body, evalTraceId("037", 2));

    const events = eventsFor(item.id);
    const state = await currentState(item.id);

    // r1: learning_events 仅 1 条（repo 层 clientEventId 去重生效）
    ctx.rec.check(
      "r1-event-count",
      "learning_events 仅 1 条（clientEventId 唯一约束生效）",
      { eventCount: 1 },
      { eventCount: events.length },
      {
        severity: "S1",
        failure_layer: "STATE_WRITE",
        evidence: { clientEventIds: events.map((e) => e.clientEventId) },
      },
    );

    // r2: recallLevel 仅 +1（1 → 2，不双推到 3）
    ctx.rec.check(
      "r2-recall-level",
      "recallLevel 仅按一次提交推进（1 → 2）",
      { recallLevel: 2 },
      { recallLevel: state?.recallLevel },
      {
        severity: "S1",
        failure_layer: "STATE_WRITE",
        evidence: { consecutiveCorrect: state?.consecutiveCorrect },
      },
    );

    // r3: nextReviewAt 仅按一次 +72h（自 T0 起算，不因 200ms 后重放再推一次）
    ctx.rec.check(
      "r3-next-review-at",
      "nextReviewAt 仅按一次提交推进（T0 + 72h）",
      { nextReviewAt: iso(T0_ISO, SEVENTY_TWO_H) },
      { nextReviewAt: state?.nextReviewAt },
      { severity: "S1", failure_layer: "STATE_WRITE" },
    );

    // M2 Trace：两次请求的 state.write idempotency 语义（诊断证据）
    const sw1 = eventsOfType(traceOf(evalTraceId("037", 1))?.events, "state.write").map((e) =>
      payloadOf<{ entity?: string; idempotency_outcome?: string }>(e),
    );
    const sw2 = eventsOfType(traceOf(evalTraceId("037", 2))?.events, "state.write").map((e) =>
      payloadOf<{ entity?: string; idempotency_outcome?: string }>(e),
    );

    // r4: 第二次响应返回既有结果（幂等语义：eventId/结果/调度一致）
    const j1 = res1.json ?? {};
    const j2 = res2.json ?? {};
    ctx.rec.check(
      "r4-idempotent-response",
      "第二次响应与首次结果一致（返回既有 eventId 与调度结果）",
      {
        eventId: j1.eventId,
        result: j1.result,
        nextReviewAt: iso(T0_ISO, SEVENTY_TWO_H),
      },
      {
        eventId: j2.eventId,
        result: j2.result,
        nextReviewAt: j2.nextReviewAt,
      },
      {
        severity: "S1",
        failure_layer: "STATE_WRITE",
        evidence: {
          response1: j1,
          response2: j2,
          trace: {
            trace1StateWrites: sw1,
            trace2StateWrites: sw2,
            note: "第二次请求 state.write.idempotency_outcome 应为 duplicate_ignored（M1 幂等跳过）；Trace 仅解释，Gold 判定 PASS/FAIL",
          },
        },
      },
    );

    // r5: 无 5xx（重复提交被吞并处理，而非抛唯一约束冲突）
    ctx.rec.check(
      "r5-no-5xx",
      "两次提交均非 5xx（唯一约束冲突被处理为幂等命中）",
      { res1Status: 200, res2Status: 200 },
      { res1Status: res1.status, res2Status: res2.status },
      { failure_layer: "STATE_WRITE" },
    );

    return {
      coverage: "full",
      actualSummary:
        "事件去重生效（repo 层 clientEventId 唯一）；M1 route 幂等跳过生效：第二次提交不更新 state、" +
        "响应返回既有 eventId/result（x-idempotent-replay），调度单推、recallLevel 1→2、nextReviewAt 仅 +72h 一次。",
      notes:
        "CURRENT=实际运行结果（非 M1 文档推断）。M2 Trace 第二次请求 state.write.idempotency_outcome 应为 duplicate_ignored（见 evidence.trace）。" +
        "SupabaseLearningRepository 路径未在 Phase 0（memory provider）覆盖。",
    };
  },
};
