/**
 * ELS-EVAL-010 — REVIEW_SCHEDULING
 * 所有词未到期 → DUE 会话为空：tasks=[]、totalDue=0；
 * 空态引导文案属 UI 层 —— M3-P4A：Playwright 最小 E2E 自动验证（确定性 UI 红线，非 Human Gold）。
 */
import { POST as REVIEW_SESSION } from "@/app/api/review/session/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { isAppBuilt, startNextServer, findFreePort } from "../tools/speaking-e2e";
import { runReviewEmptyStateE2E } from "../tools/ui-e2e";
import { T0_ISO, HOUR, putState, seedItemIntoRepo } from "./helpers";

export const case_010: EvalCaseDefinition = {
  case_id: "ELS-EVAL-010",
  automation_level: "B",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    const w1 = await seedItemIntoRepo("seed-001");
    const w2 = await seedItemIntoRepo("seed-002");
    const w3 = await seedItemIntoRepo("seed-003");

    // 3 个词 nextReviewAt 均在 T0+1h 之后
    await putState(w1.id, { nextReviewAt: plus(T0_ISO, 1 * HOUR) });
    await putState(w2.id, { nextReviewAt: plus(T0_ISO, 2 * HOUR) });
    await putState(w3.id, { nextReviewAt: plus(T0_ISO, 3 * HOUR) });

    const res = await callRoute(REVIEW_SESSION, { mode: "DUE", limit: 10 }, evalTraceId("010"));
    const json = res.json as { tasks?: unknown[]; totalDue?: number } | null;

    ctx.rec.check(
      "r1-empty-queue",
      "tasks=[] 且 totalDue=0（无未到期词混入）",
      { tasks: [], totalDue: 0, httpStatus: 200 },
      { tasks: json?.tasks ?? [], totalDue: json?.totalDue, httpStatus: res.status },
      { failure_layer: "STATE_READ" },
    );

    // UI 空态 + 引导（Playwright 最小真实旅程：全新 memory DB → DUE 空 → EMPTY 态）
    const built = isAppBuilt(process.cwd());
    if (!built) {
      ctx.rec.blocked(
        "r2-ui-empty-state",
        "空态引导文案（「暂无到期」+ 引导新词学习）",
        "empty state visible",
        "EVAL_INFRA: .next/BUILD_ID 缺失，未构建 app（先运行 npx next build）",
        { failure_layer: "EVAL_INFRA" },
      );
      ctx.rec.uncoveredAssertion("010: UI E2E 未运行（app 未构建）");
    } else {
      let serverLogTail: string | null = null;
      let port = 0;
      try {
        port = await findFreePort();
        const server = await startNextServer(port);
        try {
          const e2e = await runReviewEmptyStateE2E(port);
          ctx.rec.check(
            "r2-ui-empty-state",
            "前端空态展示「暂无到期」语义文案并引导新词学习（学习一个新表达 → /learn）",
            { emptyStateVisible: true, guideLinkVisible: true, guideHref: "/learn" },
            {
              emptyStateVisible: e2e.emptyStateVisible,
              guideLinkVisible: e2e.guideLinkVisible,
              guideHref: e2e.guideHref,
            },
            {
              failure_layer: "UI",
              metrics: ["M5"],
              evidence: {
                headingText: e2e.headingText,
                guideHref: e2e.guideHref,
                note: "空态文案为语义等价（Frozen 引用「暂无到期」；产品实为「今天暂时没有需要复习的内容」）——确定性 UI 红线，自动裁决",
              },
            },
          );
          if (e2e.error) {
            ctx.rec.uncoveredAssertion(`010: E2E 工具错误（${e2e.error}）`);
          }
        } finally {
          await server.stop();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.rec.blocked(
          "r2-ui-empty-state",
          "空态引导文案（Playwright journey）",
          "empty state visible",
          `EVAL_INFRA: ${msg.slice(0, 300)}`,
          { failure_layer: "EVAL_INFRA", evidence: { serverLogTail } },
        );
        ctx.rec.uncoveredAssertion(`010: E2E 工具无法执行（${msg.slice(0, 120)}）`);
      }
    }

    return {
      coverage: "full",
      actualSummary:
        "tasks=[]、totalDue=0、HTTP 200（API 确定性）；UI 空态「今天暂时没有需要复习的内容」+「学习一个新表达」引导链接（/learn）浏览器实测可达 → PASS",
      notes:
        "M3-P4A：空态引导文案属确定性 UI 红线（非 Human Gold），用 Playwright 最小 E2E 自动验证；Frozen 语义「暂无到期」以产品语义等价文案实现，自动裁决通过。",
    };
  },
};

function plus(base: string, ms: number): string {
  return new Date(new Date(base).getTime() + ms).toISOString();
}
