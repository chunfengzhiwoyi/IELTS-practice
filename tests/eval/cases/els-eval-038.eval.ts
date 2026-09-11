/**
 * ELS-EVAL-038 — CROSS_MODULE_STATE（服务端 SSOT 一致性）
 * 学习 1 词答错 → 复习到期答对 → 查看 7d 报告（同一账号）。
 * Gold（V1.1 [FIX-07] 重定义）：权威态 = Server Repository；
 * API 响应 / DUE 队列 / 报告聚合必须是服务端状态的投影。
 *
 * 覆盖行（服务端路径）：
 *  r1 learn/submit 后 api_result 与 server_state 一致
 *  r2 DUE 队列由服务端状态驱动（到期后入队）
 *  r3 review/submit 后状态推进 == 服务端 gold
 *  r4 报告聚合 == 服务端状态的投影（字段级对照）
 * localStorage legs：M1 后已非必须 Gold leg（断言集 1–3 不依赖其存在性），
 * 按 V1.1 FIX-07 不因 localStorage 缺失标 UNVERIFIED → coverage full。
 * 注：M1 将 report 端点改为 GET（旧 POST），runner 用 callRouteGet 直驱。
 */
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import { POST as REVIEW_SESSION } from "@/app/api/review/session/route";
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import { GET as REPORT_GET } from "@/app/api/report/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, callRouteGet, evalTraceId } from "../runner/http";
import {
  T0_ISO,
  currentState,
  iso,
  seedItemIntoRepo,
  HOUR,
  eventsFor,
  memRepo,
} from "./helpers";
import { judgeJson, reportSummaryJson } from "../runner/stub-llm";

export const case_038: EvalCaseDefinition = {
  case_id: "ELS-EVAL-038",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    const item = await seedItemIntoRepo("seed-001");

    // 脚本：① learn 判错 ② review 判对 ③ 报告总结
    ctx.script([judgeJson(false), judgeJson(true), reportSummaryJson()]);

    // ---- Step 1：学习 1 词答错 @T0 ----
    const learnRes = await callRoute(
      LEARN_SUBMIT,
      {
        itemId: item.id,
        taskType: "MEANING_RECALL",
        answer: "完全无关的错误答案",
        usedHint: false,
        clientEventId: "learn-w-1",
      },
      evalTraceId("038", 1),
    );
    const learnJson = learnRes.json ?? {};
    const serverState1 = await currentState(item.id);

    // r1: API 响应语义与 server state 一致（字段级）
    ctx.rec.check(
      "r1-learn-server-consistency",
      "learn/submit 后 api_result 与 server_state 映射一致（EXPOSED / FAIL / +2h / recall=0）",
      {
        apiCorrectness: "FAIL",
        apiStatus: "EXPOSED",
        apiNextReviewAt: iso(T0_ISO, 2 * HOUR),
        serverStatus: "EXPOSED",
        serverRecallLevel: 0,
        serverNextReviewAt: iso(T0_ISO, 2 * HOUR),
      },
      {
        apiCorrectness: learnJson.correctness,
        apiStatus: learnJson.status,
        apiNextReviewAt: learnJson.nextReviewAt,
        serverStatus: serverState1?.status,
        serverRecallLevel: serverState1?.recallLevel,
        serverNextReviewAt: serverState1?.nextReviewAt,
      },
      { severity: "S1", failure_layer: "STATE_WRITE" },
    );

    // ---- Step 2：推进 3h（T1 = T0+3h，越过 +2h 到期）→ DUE 队列 ----
    const T1_MS = 3 * HOUR;
    ctx.clock.advance(T1_MS);
    const sessionRes = await callRoute(
      REVIEW_SESSION,
      { mode: "DUE", limit: 10 },
      evalTraceId("038", 2),
    );
    const sessionJson = sessionRes.json ?? {};
    const tasks = (sessionJson.tasks as Array<{ itemId: string }>) ?? [];

    // r2: DUE 队列由服务端状态驱动（学习答错的词按 +2h 调度到期入队）
    ctx.rec.check(
      "r2-due-server-driven",
      "DUE 队列由服务端状态驱动（到期词入队，totalDue=1）",
      { containsItem: true, totalDue: 1 },
      {
        containsItem: tasks.some((t) => t.itemId === item.id),
        totalDue: sessionJson.totalDue,
      },
      { severity: "S1", failure_layer: "STATE_READ" },
    );

    // ---- Step 3：复习到期答对 @T1 ----
    const reviewRes = await callRoute(
      REVIEW_SUBMIT,
      {
        itemId: item.id,
        taskType: "MEANING_RECALL",
        answer: "减轻",
        usedHint: false,
        skipped: false,
        clientEventId: "rev-w-1",
      },
      evalTraceId("038", 3),
    );
    const reviewJson = reviewRes.json ?? {};
    const serverState2 = await currentState(item.id);

    // r3: 复习后状态推进 == 服务端 gold（CORRECT_INDEPENDENT / recall 0→1 / +72h 自 T1）
    ctx.rec.check(
      "r3-review-state-advance",
      "复习答对后 API 与 server state 一致推进（INDEPENDENT / recall=1 / +72h）",
      {
        apiResult: "CORRECT_INDEPENDENT",
        apiStatus: "RECALLED_INDEPENDENTLY",
        apiNextReviewAt: iso(T0_ISO, T1_MS + 72 * HOUR),
        serverRecallLevel: 1,
        serverNextReviewAt: iso(T0_ISO, T1_MS + 72 * HOUR),
      },
      {
        apiResult: reviewJson.result,
        apiStatus: reviewJson.status,
        apiNextReviewAt: reviewJson.nextReviewAt,
        serverRecallLevel: serverState2?.recallLevel,
        serverNextReviewAt: serverState2?.nextReviewAt,
      },
      { severity: "S1", failure_layer: "STATE_WRITE" },
    );

    // ---- Step 4：7d 报告 @T1（服务端投影对照）----
    const reportRes = await callRouteGet(REPORT_GET, { period: "7d" }, evalTraceId("038", 4));
    const reportJson = reportRes.json ?? {};
    const memory = (reportJson.memory ?? {}) as Record<string, unknown>;
    const review = (reportJson.review ?? {}) as Record<string, unknown>;

    // 从 repo 直读构造期望（报告必须是服务端状态的投影）
    const allStates = await memRepo().getAllUserItemStates("demo-user-001");
    const allEvents = memRepo()
      ._getAllEvents()
      .filter((e) => e.userId === "demo-user-001");
    const expectedReviewedCount = allEvents.filter((e) => e.eventType === "REVIEW").length;
    const expectedCorrectIndependent = allEvents.filter(
      (e) => e.eventType === "REVIEW" && e.correctness === "INDEPENDENT",
    ).length;

    ctx.rec.check(
      "r4-report-server-projection",
      "报告聚合 == 服务端状态投影（totalItems/reviewed/totalReviews/correctIndependent/llmSummary）",
      {
        totalItems: allStates.length,
        reviewedCount: expectedReviewedCount,
        totalReviews: expectedReviewedCount,
        correctIndependent: expectedCorrectIndependent,
        insufficientData: false,
        llmSummaryNotNull: true,
      },
      {
        totalItems: memory.totalItems,
        reviewedCount: memory.reviewedCount,
        totalReviews: review.totalReviews,
        correctIndependent: review.correctIndependent,
        insufficientData: reportJson.insufficientData,
        llmSummaryNotNull: reportJson.llmSummary != null,
      },
      {
        severity: "S1",
        failure_layer: "STATE_READ",
        evidence: { eventCount: eventsFor(item.id).length },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "服务端链路（learn→DUE→review→report）四点字段级一致：学习答错 EXPOSED/+2h；" +
        "3h 后 DUE 入队（服务端驱动）；复习答对 recall 0→1/+72h；报告聚合与 repo 直读投影一致、llmSummary 非空。",
      notes:
        "M1 后 localStorage 已非必须 Gold leg：断言集 1–3 不依赖 localStorage 存在性（V1.1 FIX-07），不因此标 UNVERIFIED。" +
        "Phase 0 = memory provider（DATA_PROVIDER=memory），Supabase 服务端路径未覆盖。",
    };
  },
};
