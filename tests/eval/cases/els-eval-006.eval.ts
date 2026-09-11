/**
 * ELS-EVAL-006 — ANSWER_JUDGEMENT（语义等价：措辞不同必须判对）
 * 3 行语义等价但措辞不同的答案（gold 判对）。
 * 本轮：probe 真实 learn/review 路由（scripted judge=true），断言分支映射确定性；
 * 「LLM 判对本身」为 [H] 人工复核项 → MANUAL_REVIEW，packet 见 docs/eval/manual-review/。
 */
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import { T0_ISO, iso, HOUR, traceOf, eventsOfType, payloadOf, seedItemIntoRepo, currentState, putState } from "./helpers";

interface SubmitResponse {
  correctness?: string;
  status?: string;
  result?: string;
  nextReviewAt?: string;
  state?: { recallLevel?: number } | null;
}

interface RuleAppliedPayload {
  rule_key?: string;
  outputs?: Record<string, unknown>;
}

const ANSWERS = [
  "to reduce the harmful effects of something",
  "make the damage less severe",
  "to make something bad less harmful",
];

export const case_006: EvalCaseDefinition = {
  case_id: "ELS-EVAL-006",
  automation_level: "B",
  async run(ctx) {
    // ---- 行 1-3：学习链（词 mitigate，scripted 判对）----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");
    ctx.script(ANSWERS.map(() => judgeJson(true)));

    const rowResults: Array<{ answer: string; correctness?: string; status?: string; nextReviewAt?: string }> = [];
    for (let i = 0; i < ANSWERS.length; i++) {
      const res = await callRoute(
        LEARN_SUBMIT,
        { itemId: "seed-001", taskType: "MEANING_RECALL", answer: ANSWERS[i]!, usedHint: false, clientEventId: `evt-006-learn-${i}` },
        evalTraceId("006", i),
      );
      const json = res.json as SubmitResponse | null;
      rowResults.push({ answer: ANSWERS[i]!, correctness: json?.correctness, status: json?.status, nextReviewAt: json?.nextReviewAt });
    }

    // 学习链分支映射：全部正确 → INDEPENDENT / RECALLED_INDEPENDENTLY / +24h（契约 24h/8h/2h 映射）
    const allIndependent = rowResults.every(
      (r) => r.correctness === "INDEPENDENT" && r.status === "RECALLED_INDEPENDENTLY" && r.nextReviewAt === iso(T0_ISO, 24 * HOUR),
    );
    ctx.rec.check(
      "r-learn-chain",
      "3 行语义等价答案学习链 → 全部 INDEPENDENT / RECALLED_INDEPENDENTLY / +24h（分支契约）",
      { allIndependent: true, rows: 3 },
      { allIndependent, rows: rowResults.length },
      {
        failure_layer: "JUDGE",
        metrics: ["M7"],
        evidence: { rowResults },
      },
    );

    // ---- 行 4：复习链（复用行 1 答案，scripted 判对）----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");
    await putState("seed-001", {
      status: "RECALLED_INDEPENDENTLY",
      recallLevel: 1,
      consecutiveCorrect: 1,
      currentIntervalDays: 3,
      nextReviewAt: iso(T0_ISO, -1 * HOUR),
    });
    ctx.script([judgeJson(true)]);
    const review = await callRoute(
      REVIEW_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: ANSWERS[0]!, usedHint: false, skipped: false, clientEventId: "evt-006-review" },
      evalTraceId("006-review"),
    );
    const reviewJson = review.json as SubmitResponse | null;
    const stateAfter = await currentState("seed-001");

    ctx.rec.check(
      "r-review-chain",
      "复习链语义等价答案 → CORRECT_INDEPENDENT（+72h、recall_level+1）",
      { result: "CORRECT_INDEPENDENT", nextReviewAt: iso(T0_ISO, 72 * HOUR), recallLevel: 2 },
      {
        result: reviewJson?.result,
        nextReviewAt: reviewJson?.nextReviewAt,
        recallLevel: stateAfter?.recallLevel,
      },
      {
        failure_layer: "JUDGE",
        metrics: ["M7"],
        evidence: { response: reviewJson, stateAfter },
      },
    );

    // [H] 人工复核：LLM 判对本身（gold 合理性抽样）
    ctx.rec.uncoveredAssertion(
      "人工复核项（[H]）：3 行措辞不同但语义等价的答案，LLM 判对是否合理（gold 合理性抽样，防错误 gold 固化）",
    );

    return {
      coverage: "partial",
      uncoveredMode: "MANUAL_REVIEW",
      actualSummary:
        "probe：3 行语义等价答案全部走上正确分支（INDEPENDENT/+24h、CORRECT_INDEPENDENT/+72h/recall+1）；" +
        "judge 决策本身为 scripted，判对合理性待人工抽样。",
      notes: "B 级 probe（scripted judge=true + 真实路由）。packet 见 docs/eval/manual-review/els-eval-006.md。",
    };
  },
};
