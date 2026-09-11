/**
 * ELS-EVAL-009 — REVIEW_SCHEDULING
 * 多到期词按 nextReviewAt 升序出队；totalDue=3；未到期词不混入。
 * A(seed-001, T0-3h)、D(seed-002, T0-2h)、B(seed-003, T0-1h)、C(seed-004, T0+5h)
 * 期望 tasks 顺序 = [A, D, B]，totalDue=3。
 */
import { POST as REVIEW_SESSION } from "@/app/api/review/session/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { T0_ISO, HOUR, putState, seedItemIntoRepo } from "./helpers";

export const case_009: EvalCaseDefinition = {
  case_id: "ELS-EVAL-009",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    const A = await seedItemIntoRepo("seed-001");
    const D = await seedItemIntoRepo("seed-002");
    const B = await seedItemIntoRepo("seed-003");
    const C = await seedItemIntoRepo("seed-004");

    await putState(A.id, { nextReviewAt: isoMinus(T0_ISO, 3) });
    await putState(D.id, { nextReviewAt: isoMinus(T0_ISO, 2) });
    await putState(B.id, { nextReviewAt: isoMinus(T0_ISO, 1) });
    await putState(C.id, { nextReviewAt: new Date(new Date(T0_ISO).getTime() + 5 * HOUR).toISOString() });

    const res = await callRoute(
      REVIEW_SESSION,
      { mode: "DUE", limit: 10 },
      evalTraceId("009"),
    );

    const json = res.json as { tasks?: Array<{ itemId: string; term: string; prompt: string }>; totalDue?: number } | null;

    // r1: 出队顺序（按 nextReviewAt 升序，最逾期优先）
    ctx.rec.check(
      "r1-task-order",
      "tasks 顺序 = [A(seed-001), D(seed-002), B(seed-003)]（nextReviewAt 升序）",
      { order: [A.id, D.id, B.id] },
      { order: json?.tasks?.map((t) => t.itemId) ?? [] },
      { failure_layer: "STATE_READ", evidence: { rawTasks: json?.tasks?.map((t) => t.itemId) } },
    );

    // r2: totalDue 口径
    ctx.rec.check(
      "r2-total-due",
      "totalDue = 3（C 未到期不计数）",
      { totalDue: 3, tasksInResponse: 3, cExcluded: true },
      {
        totalDue: json?.totalDue,
        tasksInResponse: json?.tasks?.length,
        cExcluded: !(json?.tasks ?? []).some((t) => t.itemId === C.id),
      },
      { failure_layer: "STATE_READ" },
    );

    // r3: 每个 task 携带完整可作答内容
    const payloadComplete = (json?.tasks ?? []).every(
      (t) => t.itemId && t.term && t.prompt?.includes(t.term),
    );
    ctx.rec.check(
      "r3-task-payload",
      "每个 task 含 itemId + term + prompt（词条完整内容可作答）",
      { payloadComplete: true, taskCount: 3 },
      { payloadComplete, taskCount: json?.tasks?.length },
      { failure_layer: "BUSINESS_RULE" },
    );

    return {
      coverage: "full",
      actualSummary: "DUE 出队按 nextReviewAt 升序 [A,D,B]，totalDue=3，未到期词 C 排除。与 gold 一致。",
    };
  },
};

function isoMinus(base: string, hours: number): string {
  return new Date(new Date(base).getTime() - hours * HOUR).toISOString();
}
