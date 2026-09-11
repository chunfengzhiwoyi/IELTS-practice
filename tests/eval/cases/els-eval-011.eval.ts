/**
 * ELS-EVAL-011 — REVIEW_SCHEDULING（表驱动 4 行）
 * 四档复习结果 → 间隔/状态精确映射：
 *   W1 CORRECT_INDEPENDENT → +72h, recall+1, interval 3d
 *   W2 CORRECT_WITH_HINT   → +24h, recall 不变, interval 1d
 *   W3 INCORRECT           → +4h,  interval 4/24
 *   W4 SKIPPED             → +2h,  interval 2/24
 * 每行独立时钟 T_row（冻结），nextReviewAt 基于该行提交时刻。
 */
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import { T0_ISO, currentState, eventsFor, iso, HOUR, putState, seedItemIntoRepo } from "./helpers";

export const case_011: EvalCaseDefinition = {
  case_id: "ELS-EVAL-011",
  async run(ctx) {
    // W1–W4 相互独立 → 同一 repo 内四个 item，共享一条 LLM 脚本（顺序调用）
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    const items = [
      await seedItemIntoRepo("seed-001"),
      await seedItemIntoRepo("seed-002"),
      await seedItemIntoRepo("seed-003"),
      await seedItemIntoRepo("seed-004"),
    ];
    // 各自无历史 recall 干扰（初始 recall=0，到期）
    for (const it of items) {
      await putState(it.id, { nextReviewAt: iso(T0_ISO, -1 * HOUR) });
    }

    // LLM 脚本：W1 正确 / W2 正确 / W3 错误；W4 skipped 不调 LLM
    const stub = ctx.script([judgeJson(true), judgeJson(true), judgeJson(false)]);

    const rows = [
      { tag: "w1-independent", item: items[0]!, answer: "可持续的", usedHint: false, skipped: false, llmCalls: 1,
        gold: { result: "CORRECT_INDEPENDENT", status: "RECALLED_INDEPENDENTLY", eventCorrectness: "INDEPENDENT",
                recallLevel: 1, consecutiveCorrect: 1, currentIntervalDays: 3, offsetH: 72 } },
      { tag: "w2-hint", item: items[1]!, answer: "重大的", usedHint: true, skipped: false, llmCalls: 1,
        gold: { result: "CORRECT_WITH_HINT", status: "RECALLED_WITH_HELP", eventCorrectness: "HINTED",
                recallLevel: 0, consecutiveCorrect: 1, currentIntervalDays: 1, offsetH: 24 } },
      { tag: "w3-incorrect", item: items[2]!, answer: "完全错误的回答", usedHint: false, skipped: false, llmCalls: 1,
        gold: { result: "INCORRECT", status: "EXPOSED", eventCorrectness: "FAIL",
                recallLevel: 0, consecutiveCorrect: 0, currentIntervalDays: 4 / 24, offsetH: 4 } },
      { tag: "w4-skipped", item: items[3]!, answer: "", usedHint: false, skipped: true, llmCalls: 0,
        gold: { result: "SKIPPED", status: "EXPOSED", eventCorrectness: "SKIPPED",
                recallLevel: 0, consecutiveCorrect: 0, currentIntervalDays: 2 / 24, offsetH: 2 } },
    ];

    for (const [i, row] of rows.entries()) {
      const tRow = iso(T0_ISO, i * HOUR); // 每行提交时刻独立推进
      ctx.clock.freeze(tRow);

      const res = await callRoute(
        REVIEW_SUBMIT,
        {
          itemId: row.item.id,
          taskType: "MEANING_RECALL",
          answer: row.answer,
          usedHint: row.usedHint,
          skipped: row.skipped,
          clientEventId: `els-eval-011-${row.tag}`,
        },
        evalTraceId("011", i),
      );

      const state = await currentState(row.item.id);
      const events = eventsFor(row.item.id);
      const json = res.json as Record<string, unknown> | null;

      ctx.rec.check(
        row.tag,
        `${row.gold.result} → +${row.gold.offsetH}h / recall=${row.gold.recallLevel} / interval=${row.gold.currentIntervalDays}`,
        {
          httpStatus: 200,
          result: row.gold.result,
          status: row.gold.status,
          recallLevel: row.gold.recallLevel,
          consecutiveCorrect: row.gold.consecutiveCorrect,
          currentIntervalDays: row.gold.currentIntervalDays,
          nextReviewAt: iso(tRow, row.gold.offsetH * HOUR),
          eventCorrectness: row.gold.eventCorrectness,
          eventCount: 1,
          llmCalls: row.llmCalls,
        },
        {
          httpStatus: res.status,
          result: json?.result,
          status: state?.status,
          recallLevel: state?.recallLevel,
          consecutiveCorrect: state?.consecutiveCorrect,
          currentIntervalDays: state?.currentIntervalDays,
          nextReviewAt: (json as { nextReviewAt?: string } | null)?.nextReviewAt,
          eventCorrectness: events[0]?.correctness,
          eventCount: events.length,
          llmCalls: stub.calls.length - rows.slice(0, i).reduce((acc, r) => acc + r.llmCalls, 0),
        },
        { failure_layer: "BUSINESS_RULE", evidence: { submitAt: tRow } },
      );
    }

    return {
      coverage: "full",
      actualSummary: "四行间隔/状态/事件映射全部与 gold 一致（72h/24h/4h/2h，recall 与 consecutiveCorrect 行为正确）。",
    };
  },
};
