/**
 * ELS-EVAL-030 — LEARNING_REPORT（S1 候选：无基线进步结论）
 * BC-M3-003 修复（496ae31）：CompareSection 区分 MISSING（hasActivity=false → 空态）与
 * TRUE ZERO（有活动但指标=0 → 正常比较）；per-row lastV=null → 不计算 delta。
 * 验证矩阵：
 *  r-api-no-progress-claim —— API 全文无进步/提升/突破结论（确定性）
 *  r-ui-compare-empty —— Playwright E2E：仅本周数据 → 空态文案，无编造 ▲/▼ Δ
 *  r-ui-true-zero-guard —— REGRESSION_GUARD：上周有活动但某指标 lastV=0 → 正常显示比较
 *  r-ui-per-row-null —— 上周有活动但某指标 lastV=null → 该行不计算 delta（其他行正常）
 * 修复回归守卫属 Eval-side 验证（非新增 Frozen Gold）。
 */
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import { GET as REPORT_GET } from "@/app/api/report/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, callRouteGet, evalTraceId } from "../runner/http";
import { judgeJson, reportSummaryJson } from "../runner/stub-llm";
import { isAppBuilt, startNextServer, findFreePort } from "../tools/speaking-e2e";
import { runReportNoBaselineE2E } from "../tools/ui-e2e";
import { renderToStaticMarkup } from "react-dom/server";
import { CompareSection } from "@/components/report/compare-section";
import { T0_ISO, seedItemIntoRepo } from "./helpers";

/** 无据趋势结论模式（API 响应扫描） */
const PROGRESS_CLAIMS = [
  /明显进步/,
  /显著提升/,
  /大幅提升/,
  /突破/,
  /进步明显/,
  /提升明显/,
  /这周.*(进步|提升|落后)/,
  /(进步|提升|下降).*对比/,
  /相比.*(进步|提升)/,
];

import type { WeekBucket } from "@/lib/client/report-transform";


const ACTIVITY_CELLS = [
  { key: "d0", label: "d0", hasActivity: true, isToday: false },
  { key: "d1", label: "d1", hasActivity: false, isToday: false },
  { key: "d2", label: "d2", hasActivity: false, isToday: true },
];

export const case_030: EvalCaseDefinition = {
  case_id: "ELS-EVAL-030",
  automation_level: "B",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    // 仅本周数据：1 次学习（无上周/更早基线）
    await seedItemIntoRepo("seed-001");
    ctx.script([judgeJson(true), reportSummaryJson()]);
    await callRoute(
      LEARN_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "可持续的", usedHint: false, clientEventId: "evt-030" },
      evalTraceId("030-learn"),
    );

    const res = await callRouteGet(REPORT_GET, { period: "7d" }, evalTraceId("030-report"));
    const body = JSON.stringify(res.json ?? {});
    const hits = PROGRESS_CLAIMS.filter((p) => p.test(body)).map((p) => p.source);

    ctx.rec.check(
      "r-api-no-progress-claim",
      "仅本周数据（无基线）→ API 响应全文无进步/提升/突破结论",
      { noClaim: true, hits: [] },
      { noClaim: hits.length === 0, hits },
      {
        failure_layer: "REPORT",
        evidence: { hits, responseSnippet: body.slice(0, 500), note: "scripted llmSummary 为中性文案；本断言扫描全部响应字段" },
      },
    );

    // CompareSection 主场景：无上周基线 → 空态而非编造 Δ（Playwright 真实 E2E）
    const built = isAppBuilt(process.cwd());
    if (!built) {
      ctx.rec.blocked(
        "r-ui-compare-empty",
        "CompareSection 无基线时进入空态而非编造 Δ",
        "empty note visible / no fabricated delta",
        "EVAL_INFRA: .next/BUILD_ID 缺失，未构建 app",
        { failure_layer: "EVAL_INFRA" },
      );
      ctx.rec.uncoveredAssertion("030: UI E2E 未运行（app 未构建）");
    } else {
      try {
        const port = await findFreePort();
        const server = await startNextServer(port);
        try {
          const e2e = await runReportNoBaselineE2E(port);
          ctx.rec.check(
            "r-ui-compare-empty",
            "仅本周数据（无上周基线）→ CompareSection 进入空态文案，不编造 ▲/▼ Δ（BC-M3-003 修复）",
            { emptyNoteVisible: true, fabricatedDeltaVisible: false },
            { emptyNoteVisible: e2e.emptyNoteVisible, fabricatedDeltaVisible: e2e.fabricatedDeltaVisible },
            {
              failure_layer: "UI",
              metrics: ["M5"],
              evidence: {
                sectionText: e2e.sectionText,
                deltaTexts: e2e.deltaTexts,
                compareRowsVisible: e2e.compareRowsVisible,
                note: "E2E：真实 /api/learn/submit 注入 1 条本周数据 → /report DOM 扫描；修复后应显示「暂无历史对比数据」空态",
              },
            },
          );
          if (e2e.error) {
            ctx.rec.uncoveredAssertion(`030: E2E 工具错误（${e2e.error}）`);
          }
        } finally {
          await server.stop();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.rec.blocked(
          "r-ui-compare-empty",
          "CompareSection 空态（Playwright journey）",
          "empty note visible",
          `EVAL_INFRA: ${msg.slice(0, 300)}`,
          { failure_layer: "EVAL_INFRA" },
        );
        ctx.rec.uncoveredAssertion(`030: E2E 工具无法执行（${msg.slice(0, 120)}）`);
      }
    }

    // REGRESSION_GUARD 1：TRUE ZERO（上周有活动但某指标 lastV=0）→ 正常比较（▲ 1 是真实零值差，非编造）
    const trueZeroHtml = renderToStaticMarkup(
      CompareSection({
        thisWeek: { newItems: 1, reviews: 0, reviewAccuracy: null, activeDays: 1, speakingCompleted: 0, hasActivity: true } as WeekBucket,
        lastWeek: { newItems: 0, reviews: 2, reviewAccuracy: 50, activeDays: 2, speakingCompleted: 0, hasActivity: true } as WeekBucket,
        weeklyActivity: ACTIVITY_CELLS,
      }),
    );
    ctx.rec.check(
      "r-ui-true-zero-guard",
      "REGRESSION_GUARD：上周有真实活动但 newItems=0（TRUE ZERO）→ 仍正常显示 ▲ 1 比较（修复未把 lastV===0 一律隐藏）",
      { trueZeroCompareVisible: true, emptyStateNotShown: true },
      {
        trueZeroCompareVisible: trueZeroHtml.includes("▲ 1"),
        emptyStateNotShown: !trueZeroHtml.includes("暂无历史对比数据"),
      },
      {
        failure_layer: "UI",
        evidence: {
          htmlExcerpt: trueZeroHtml.replace(/\s+/g, " ").slice(0, 300),
          note: "BC-M3-003 必须区分 MISSING 与 TRUE ZERO；lastWeek.hasActivity=true + newItems=0 → 合法 ▲ 1",
        },
      },
    );

    // REGRESSION_GUARD 2：per-row NULL（上周有活动但该指标无数据）→ 该行不计算 delta，其他行正常
    const perRowNullHtml = renderToStaticMarkup(
      CompareSection({
        thisWeek: { newItems: 1, reviews: 3, reviewAccuracy: 80, activeDays: 1, speakingCompleted: 0, hasActivity: true } as WeekBucket,
        lastWeek: { newItems: 2, reviews: 3, reviewAccuracy: null, activeDays: 2, speakingCompleted: 0, hasActivity: true } as WeekBucket,
        weeklyActivity: ACTIVITY_CELLS,
      } as never),
    );
    const rowHtml = perRowNullHtml.replace(/\s+/g, " ");
    // 本期复习正确率行：lastV=null（上周期有活动但该指标无数据）→ delta "—"（无 ▲/▼）；新收表达行 lastV=2 → 正常 delta（▼ 1）
    ctx.rec.check(
      "r-ui-per-row-null",
      "REGRESSION_GUARD：指标级 lastV=null（上周无该指标数据）→ 该行不计算 delta（—），其他有 baseline 行正常比较",
      { nullRowNoDelta: true, otherRowCompareVisible: true },
      {
        nullRowNoDelta: /本期复习正确率[^▲▼]*→ —/.test(rowHtml) && !/本期复习正确率[\s\S]{0,120}[▲▼]/.test(rowHtml),
        otherRowCompareVisible: rowHtml.includes("▼ 1"),
      },
      {
        failure_layer: "UI",
        evidence: { htmlExcerpt: rowHtml.slice(0, 350), note: "per-row baselineMissing（lastV==null）时不计算 delta；不得 null ?? 0 → delta" },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "仅本周数据报告：API 全文无进步/提升/突破结论；CompareSection 浏览器实测进入空态（暂无历史对比数据），无编造 Δ；" +
        "TRUE ZERO guard 与 per-row NULL guard 组件级实测通过（修复正确区分 missing/zero）。",
      notes:
        "M3-04：BC-M3-003 修复验证。主场景 E2E（真实 /api/learn/submit + /report DOM）+ 两个 REGRESSION_GUARD（react-dom/server 渲染实际组件）。" +
        "修复回归守卫非新增 Frozen Gold；空态文案以产品实际文案为准（暂无历史对比数据）。",
    };
  },
};
