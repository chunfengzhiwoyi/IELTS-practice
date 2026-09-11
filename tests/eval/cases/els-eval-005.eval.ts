/**
 * ELS-EVAL-005 — ANSWER_JUDGE（错误答案分支契约：学习链 FAIL/2h + 复习链 INCORRECT/4h）
 * 行 1 学习链：错误回答 → FAIL / EXPOSED / 2h；recallLevel=0。
 * 行 2 复习链：错误回答 → INCORRECT / +4h；recallLevel 不提升。
 */
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import {
  T0_ISO,
  iso,
  HOUR,
  traceOf,
  eventsOfType,
  payloadOf,
  seedItemIntoRepo,
  putState,
  currentState,
} from "./helpers";

interface SubmitResponse {
  eventId?: string;
  correctness?: string;
  status?: string;
  result?: string;
  feedback?: string;
  nextReviewAt?: string;
  state?: {
    status?: string;
    recallLevel?: number;
    consecutiveCorrect?: number;
    nextReviewAt?: string;
  } | null;
}

interface RuleAppliedPayload {
  rule_key?: string;
  outputs?: Record<string, unknown>;
}

export const case_005: EvalCaseDefinition = {
  case_id: "ELS-EVAL-005",
  automation_level: "A",
  async run(ctx) {
    // ---- 行 1：学习链错误回答 ----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");
    ctx.script([judgeJson(false)]);
    const itemId = "seed-001";
    const learnTraceId = evalTraceId("005-learn");

    const learn = await callRoute(
      LEARN_SUBMIT,
      { itemId, taskType: "MEANING_RECALL", answer: "随便写的一个错误答案", usedHint: false, clientEventId: "evt-005-learn" },
      learnTraceId,
    );
    const learnJson = learn.json as SubmitResponse | null;
    const learnTrace = traceOf(learnTraceId);
    const ruleEv = eventsOfType(learnTrace?.events, "rule.applied").map((e) => payloadOf<RuleAppliedPayload>(e));
    const branchMap = ruleEv.find((r) => r?.rule_key === "learning_branch_map");
    const stateAfter = await currentState(itemId);

    ctx.rec.check(
      "r-learn-wrong",
      "行1 学习链错误回答 → correctness=FAIL / status=EXPOSED / nextReviewAt=+2h",
      {
        correctness: "FAIL",
        status: "EXPOSED",
        nextReviewAt: iso(T0_ISO, 2 * HOUR),
        recallLevel: 0,
        scheduleQuality: "FAIL",
        llmCalls: 1,
      },
      {
        correctness: learnJson?.correctness,
        status: learnJson?.status,
        nextReviewAt: learnJson?.nextReviewAt,
        recallLevel: stateAfter?.recallLevel,
        scheduleQuality: branchMap?.outputs?.["scheduleQuality"],
        llmCalls: branchMap?.outputs?.["llm_call_count"],
      },
      {
        failure_layer: "JUDGE",
        metrics: ["M7"],
        evidence: { ruleApplied: ruleEv, response: learnJson, stateAfter },
      },
    );

    // ---- 行 2：复习链错误回答 ----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");
    await putState(itemId, {
      status: "RECALLED_INDEPENDENTLY",
      recallLevel: 1,
      consecutiveCorrect: 2,
      currentIntervalDays: 3,
      nextReviewAt: iso(T0_ISO, -1 * HOUR),
    });
    ctx.script([judgeJson(false)]);
    const reviewTraceId = evalTraceId("005-review");

    const review = await callRoute(
      REVIEW_SUBMIT,
      { itemId, taskType: "MEANING_RECALL", answer: "错误答案", usedHint: false, skipped: false, clientEventId: "evt-005-review" },
      reviewTraceId,
    );
    const reviewJson = review.json as SubmitResponse | null;
    const stateAfterReview = await currentState(itemId);

    ctx.rec.check(
      "r-review-wrong",
      "行2 复习链错误回答 → result=INCORRECT / nextReviewAt=+4h / recallLevel 不提升（保持 1）",
      {
        result: "INCORRECT",
        nextReviewAt: iso(T0_ISO, 4 * HOUR),
        recallLevel: 1,
      },
      {
        result: reviewJson?.result,
        nextReviewAt: reviewJson?.nextReviewAt,
        recallLevel: stateAfterReview?.recallLevel,
      },
      {
        failure_layer: "JUDGE",
        metrics: ["M7"],
        evidence: { response: reviewJson, stateAfter: stateAfterReview },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "学习链错误→FAIL/EXPOSED/2h/recallLevel=0；复习链错误→INCORRECT/+4h/recallLevel 保持 1。两链分支契约一致。",
      notes: "A 级确定性断言（scripted judge=false + 真实路由）。",
    };
  },
};
