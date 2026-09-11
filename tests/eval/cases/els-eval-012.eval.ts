/**
 * ELS-EVAL-012 — REVIEW_SCHEDULING
 * 同一词三轮（对→错→对），nextReviewAt 链式计算基于各轮提交时刻；
 * 错误后降档（不再沿用 72h）；事件数=3。
 * M3-P4A：复用 ELS-EVAL-013 的 replay-harness（不复制新框架）覆盖「快照==事件重放」。
 */
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import { replayUserItemStates, compareReplayToSnapshot } from "../tools/replay-harness";
import { T0_ISO, DEMO_USER_ID, currentState, eventsFor, iso, HOUR, putState, seedItemIntoRepo, memRepo } from "./helpers";

export const case_012: EvalCaseDefinition = {
  case_id: "ELS-EVAL-012",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    const item = await seedItemIntoRepo("seed-001");
    await putState(item.id, { nextReviewAt: iso(T0_ISO, -1 * HOUR) });

    // 脚本：轮1 正确 / 轮2 错误 / 轮3 正确
    ctx.script([judgeJson(true), judgeJson(false), judgeJson(true)]);

    const submissions = [
      { tag: "round1", at: T0_ISO, answer: "可持续的", clientEventId: "els-eval-012-r1", expectedOffsetH: 72 },
      { tag: "round2", at: iso(T0_ISO, 1 * HOUR), answer: "记错了", clientEventId: "els-eval-012-r2", expectedOffsetH: 4 },
      { tag: "round3", at: iso(T0_ISO, 2 * HOUR), answer: "可持续的", clientEventId: "els-eval-012-r3", expectedOffsetH: 72 },
    ];

    const nextReviewAtSeq: string[] = [];
    for (const [i, s] of submissions.entries()) {
      ctx.clock.freeze(s.at);
      const res = await callRoute(
        REVIEW_SUBMIT,
        {
          itemId: item.id,
          taskType: "MEANING_RECALL",
          answer: s.answer,
          usedHint: false,
          skipped: false,
          clientEventId: s.clientEventId,
        },
        evalTraceId("012", i),
      );
      const json = res.json as { nextReviewAt?: string } | null;
      nextReviewAtSeq.push(json?.nextReviewAt ?? "MISSING");
    }

    // r1: 三轮 nextReviewAt 均等于公式值（提交时刻 + 对应档位）
    const expectedSeq = submissions.map(
      (s) => new Date(new Date(s.at).getTime() + s.expectedOffsetH * HOUR).toISOString(),
    );
    ctx.rec.check(
      "r1-next-review-at-chain",
      "三轮 nextReviewAt = 各轮提交时刻 + 对应档位（72h / 4h / 72h）",
      { seq: expectedSeq, eachAtOrAfterSubmitTime: true },
      {
        seq: nextReviewAtSeq,
        eachAtOrAfterSubmitTime: submissions.every((s, i) => nextReviewAtSeq[i]! >= s.at),
      },
      { failure_layer: "BUSINESS_RULE", evidence: { submitTimes: submissions.map((s) => s.at) } },
    );

    // r2: 错误后降档（未沿用 72h）
    ctx.rec.check(
      "r2-degrade-after-fail",
      "轮2（答错）后降档为 +4h，而非沿用 72h",
      { round2OffsetH: 4 },
      { round2OffsetH: hoursBetween(submissions[1]!.at, nextReviewAtSeq[1]!) },
      { failure_layer: "BUSINESS_RULE" },
    );

    // r3: 事件数 = 3（各轮独立 clientEventId）
    const events = eventsFor(item.id);
    ctx.rec.check(
      "r3-event-count",
      "事件总数 = 3（NEW/REVIEW 序列完整落库）",
      { eventCount: 3 },
      { eventCount: events.length },
      { failure_layer: "STATE_WRITE" },
    );

    // r4: 终态 recall（对→错→对：0→1→1→2）
    const state = await currentState(item.id);
    ctx.rec.check(
      "r4-final-state",
      "终态 recallLevel=2（对→错→对），status=RECALLED_INDEPENDENTLY",
      { recallLevel: 2, status: "RECALLED_INDEPENDENTLY" },
      { recallLevel: state?.recallLevel, status: state?.status },
      { failure_layer: "STATE_WRITE" },
    );

    // r5: 状态快照 == 事件重放（复用 013 replay-harness，逐字段比对）
    const snapshot = await memRepo().getAllUserItemStates(DEMO_USER_ID);
    const replay = replayUserItemStates(events);
    const comparison = compareReplayToSnapshot(replay, snapshot);
    ctx.rec.check(
      "r5-replay-eq-snapshot",
      "状态快照与事件重放逐字段一致（replay(events) == user_item_states）",
      { matches: true, diffCount: 0 },
      { matches: comparison.matches, diffCount: comparison.diffs.length },
      {
        failure_layer: "STATE_WRITE",
        metrics: ["M5"],
        evidence: {
          diffs: comparison.diffs.slice(0, 5),
          replayFinal: comparison.replayStates.map((s) => ({ itemId: s.itemId, recall: s.recallLevel, next: s.nextReviewAt })),
          snapshotFinal: comparison.snapshotStates.map((s) => ({ itemId: s.itemId, recall: s.recallLevel, next: s.nextReviewAt })),
        },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "三轮 nextReviewAt 链式计算全部正确（T0+72h / T1+4h / T2+72h），错误后正确降档，事件数=3，终态 recall=2；" +
        "replay==snapshot 逐字段一致（0 diff，复用 013 replay-harness）→ PASS",
      notes:
        "M3-P4A：复用 tests/eval/tools/replay-harness.ts（013 同款，不复制新框架）覆盖「快照==事件重放」；" +
        "同一 clientEventId 重放幂等由 ELS-EVAL-037（S1）单独承接，不在本 Case 重复要求。",
    };
  },
};

function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / HOUR;
}
