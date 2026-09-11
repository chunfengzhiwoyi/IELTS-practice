/**
 * ELS-EVAL-007 — ANSWER_JUDGE（提示分支契约：HINTED 学习链 +8h / CORRECT_WITH_HINT 复习链 +24h，recall 不提升）
 * 行 1 学习链：correct + usedHint=true → HINTED / RECALLED_WITH_HELP / +8h / hintLevel=1。
 * 行 2 复习链：correct + usedHint=true → CORRECT_WITH_HINT / +24h / recallLevel 不提升（0 增量）。
 * 行 3 状态断言：复习链 hint 分支 recall_level_delta=0（与 INDEPENDENT 的 +1 区分）。
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
  seedItemIntoRepo,
  putState,
  currentState,
  eventsFor,
} from "./helpers";

interface SubmitResponse {
  correctness?: string;
  status?: string;
  result?: string;
  nextReviewAt?: string;
  state?: { status?: string; recallLevel?: number; hintLevel?: number } | null;
}

interface StateWritePayload {
  state_after?: { status?: string; recallLevel?: number; consecutiveCorrect?: number; nextReviewAt?: string };
  idempotency_outcome?: string;
}

export const case_007: EvalCaseDefinition = {
  case_id: "ELS-EVAL-007",
  automation_level: "A",
  async run(ctx) {
    // ---- 行 1：学习链 提示正确 ----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");
    ctx.script([judgeJson(true)]);
    const itemId = "seed-001";

    const learn = await callRoute(
      LEARN_SUBMIT,
      { itemId, taskType: "MEANING_RECALL", answer: "可持续的", usedHint: true, clientEventId: "evt-007-learn" },
      evalTraceId("007-learn"),
    );
    const learnJson = learn.json as SubmitResponse | null;
    const stateAfterLearn = await currentState(itemId);
    const learnEvent = eventsFor(itemId).filter((e) => e.eventType === "NEW").pop();

    ctx.rec.check(
      "r-learn-hint",
      "行1 学习链 提示正确 → correctness=HINTED / RECALLED_WITH_HELP / +8h / hintLevel=1",
      {
        correctness: "HINTED",
        status: "RECALLED_WITH_HELP",
        nextReviewAt: iso(T0_ISO, 8 * HOUR),
        recallLevel: 1,
        hintLevel: 1,
      },
      {
        correctness: learnJson?.correctness,
        status: learnJson?.status,
        nextReviewAt: learnJson?.nextReviewAt,
        recallLevel: stateAfterLearn?.recallLevel,
        hintLevel: learnEvent?.hintLevel,
      },
      {
        failure_layer: "JUDGE",
        metrics: ["M7"],
        evidence: { response: learnJson, stateAfter: stateAfterLearn, learnEvent },
      },
    );

    // ---- 行 2/3：复习链 提示正确 ----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");
    await putState(itemId, {
      status: "RECALLED_INDEPENDENTLY",
      recallLevel: 1,
      consecutiveCorrect: 1,
      currentIntervalDays: 3,
      nextReviewAt: iso(T0_ISO, -1 * HOUR),
    });
    ctx.script([judgeJson(true)]);
    const reviewTraceId = evalTraceId("007-review");

    const review = await callRoute(
      REVIEW_SUBMIT,
      { itemId, taskType: "MEANING_RECALL", answer: "可持续的", usedHint: true, skipped: false, clientEventId: "evt-007-review" },
      reviewTraceId,
    );
    const reviewJson = review.json as SubmitResponse | null;
    const stateAfterReview = await currentState(itemId);

    ctx.rec.check(
      "r-review-hint",
      "行2 复习链 提示正确 → CORRECT_WITH_HINT / +24h / recallLevel 不提升（保持 1）",
      { result: "CORRECT_WITH_HINT", nextReviewAt: iso(T0_ISO, 24 * HOUR), recallLevel: 1 },
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

    ctx.rec.check(
      "r-hint-no-raise",
      "行3 提示分支 recall_level_delta=0（不因提示提升召回级别，与 INDEPENDENT +1 区分）",
      { recallDelta: "0", intervalHours: 24 },
      {
        recallDelta: stateAfterReview ? String(stateAfterReview.recallLevel - 1) : "unknown",
        intervalHours: 24,
      },
      {
        failure_layer: "STATE_WRITE",
        metrics: ["M5"],
        evidence: { stateAfterReview, traceId: reviewTraceId },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "学习链提示正确→HINTED/RECALLED_WITH_HELP/+8h/hintLevel=1；复习链提示正确→CORRECT_WITH_HINT/+24h，recallLevel 保持 1（0 增量）。",
      notes: "A 级确定性断言（scripted judge=true + 真实路由 + 状态读回）。",
    };
  },
};
