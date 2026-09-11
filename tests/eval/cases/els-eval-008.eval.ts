/**
 * ELS-EVAL-008 — ANSWER_JUDGEMENT
 * 空字符串 / 纯空白 / 仅标点 / 仅换行 → 确定性判错，不调 LLM。
 * 直驱真实 route（learn/submit + review/submit），8 行表驱动。
 *
 * 预期（CURRENT checkpoint = M1 Final + M2 Phase 1+2 + BC-008）：
 *  "" / "   " / "\n" / "." 四类输入全部确定性短路（M2 rule.applied(empty_answer_short_circuit) 触发，llm_call_count=0）。
 * BC-008 修复后纯标点边界纳入短路；不再有答案进入 judgeAnswerWithLlm。
 * M2 Trace 证据随行记录（rule.applied / state.write），仅诊断用途：Gold 判定 PASS/FAIL，Trace 解释为什么。
 */
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import { DEMO_USER_ID, T0_ISO, eventsFor, iso, HOUR, traceOf, eventsOfType, payloadOf } from "./helpers";

const ITEM = "seed-001";

const VARIANTS = [
  { tag: "empty", answer: "" },
  { tag: "spaces", answer: "   " },
  { tag: "punct", answer: "." },
  { tag: "newline", answer: "\n" },
] as const;

export const case_008: EvalCaseDefinition = {
  case_id: "ELS-EVAL-008",
  async run(ctx) {
    for (const v of VARIANTS) {
      // ---- learn/submit 行 ----
      ctx.reset();
      ctx.clock.freeze(T0_ISO);
      const learnStub = ctx.script([judgeJson(false)]);
      const learnRes = await callRoute(
        LEARN_SUBMIT,
        {
          itemId: ITEM,
          taskType: "MEANING_RECALL",
          answer: v.answer,
          usedHint: false,
          clientEventId: `els-eval-008-learn-${v.tag}`,
        },
        evalTraceId("008learn" + v.tag),
      );
      const learnEvents = eventsFor(ITEM);
      const learnTrace = traceOf(evalTraceId("008learn" + v.tag));
      const learnRules = eventsOfType(learnTrace?.events, "rule.applied").map((e) =>
        payloadOf<{ rule_key?: string; llm_call_count?: number }>(e),
      );
      const learnStateWrites = eventsOfType(learnTrace?.events, "state.write").map((e) =>
        payloadOf<{ idempotency_outcome?: string }>(e),
      );
      ctx.rec.check(
        `learn-${v.tag}`,
        `learn/submit answer=${JSON.stringify(v.answer)} → FAIL / EXPOSED / llm_calls=0`,
        {
          httpStatus: 200,
          correctness: "FAIL",
          status: "EXPOSED",
          llmCalls: 0,
          eventCount: 1,
          eventCorrectness: "FAIL",
          nextReviewAt: iso(T0_ISO, 2 * HOUR),
        },
        {
          httpStatus: learnRes.status,
          correctness: learnRes.json?.correctness,
          status: learnRes.json?.status,
          llmCalls: learnStub.calls.length,
          eventCount: learnEvents.length,
          eventCorrectness: learnEvents[0]?.correctness,
          nextReviewAt: (learnRes.json as { nextReviewAt?: string } | null)?.nextReviewAt,
        },
        {
          failure_layer: "BUSINESS_RULE",
          evidence: {
            answer: JSON.stringify(v.answer),
            userId: DEMO_USER_ID,
            trace: {
              ruleApplied: learnRules,
              stateWriteOutcomes: learnStateWrites,
              eventCount: learnTrace?.events.length ?? 0,
            },
          },
        },
      );

      // ---- review/submit 行 ----
      ctx.reset();
      ctx.clock.freeze(T0_ISO);
      const reviewStub = ctx.script([judgeJson(false)]);
      const reviewRes = await callRoute(
        REVIEW_SUBMIT,
        {
          itemId: ITEM,
          taskType: "MEANING_RECALL",
          answer: v.answer,
          usedHint: false,
          skipped: false,
          clientEventId: `els-eval-008-review-${v.tag}`,
        },
        evalTraceId("008review" + v.tag),
      );
      const reviewEvents = eventsFor(ITEM);
      const reviewTrace = traceOf(evalTraceId("008review" + v.tag));
      const reviewRules = eventsOfType(reviewTrace?.events, "rule.applied").map((e) =>
        payloadOf<{ rule_key?: string; llm_call_count?: number }>(e),
      );
      const reviewStateWrites = eventsOfType(reviewTrace?.events, "state.write").map((e) =>
        payloadOf<{ idempotency_outcome?: string }>(e),
      );
      ctx.rec.check(
        `review-${v.tag}`,
        `review/submit answer=${JSON.stringify(v.answer)} → INCORRECT / llm_calls=0`,
        {
          httpStatus: 200,
          result: "INCORRECT",
          llmCalls: 0,
          eventCount: 1,
          eventCorrectness: "FAIL",
          nextReviewAt: iso(T0_ISO, 4 * HOUR),
        },
        {
          httpStatus: reviewRes.status,
          result: reviewRes.json?.result,
          llmCalls: reviewStub.calls.length,
          eventCount: reviewEvents.length,
          eventCorrectness: reviewEvents[0]?.correctness,
          nextReviewAt: (reviewRes.json as { nextReviewAt?: string } | null)?.nextReviewAt,
        },
        {
          failure_layer: "BUSINESS_RULE",
          evidence: {
            answer: JSON.stringify(v.answer),
            trace: {
              ruleApplied: reviewRules,
              stateWriteOutcomes: reviewStateWrites,
              eventCount: reviewTrace?.events.length ?? 0,
            },
          },
        },
      );
    }

    return {
      coverage: "full",
      actualSummary:
        '8 行全通过："" / "   " / "\n" / "." 四条变体在 learn 与 review 两条链路均确定性短路（llm_calls=0，eventCount=1，调度按错误档推进）。',
      notes:
        "BC-008 修复后：empty_answer_short_circuit 覆盖 trim-empty 与纯标点边界；M2 Trace rule.applied(empty_answer_short_circuit) 随行记录（evidence.trace.ruleApplied）。",
    };
  },
};
