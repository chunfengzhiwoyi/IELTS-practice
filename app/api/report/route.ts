/**
 * GET /api/report
 * ------------------------------------------------------------
 * M1: 统一报告数据源。服务端聚合学习/复习/口语/能力/评估数据。
 * M2 Phase 2: state.read / report.aggregated / rule.applied(insufficient_data) 埋点
 */
import "server-only";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { getLearningRepository, getSpeakingRepository, getAbilityRepository, getEvaluationRepository } from "@/lib/repository-factory";
import {
  aggregateReportData,
  generateRecommendations,
  type ProgressReport,
  type ReportPeriod,
} from "@/lib/report";
import { generateReportSummaryWithLlm } from "@/lib/llm/tasks/generate-report-summary";
import { toAppError } from "@/lib/observability/errors";
import { isSpeakingEvaluationsMissingError } from "@/lib/evaluation/missing-table";
import type { SpeakingEvaluation } from "@/lib/evaluation/types";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { startTrace, endTraceSuccess, endTraceError, appErrorToTrace } from "@/lib/observability/trace-api-helper";
import { canonicalStateHash } from "@/lib/observability/trace-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "7d";
  const tctx = startTrace(traceId, "/api/report", {
    input_summary: "period=" + periodParam.slice(0, 50),
    method: "GET",
  });
  try {
    const user = await requireUser(traceId);
    tctx.trace.setUser(user.id);
    const period = periodParam as ReportPeriod;

    const learningRepo = getLearningRepository();
    const speakingRepo = getSpeakingRepository();
    const abilityRepo = getAbilityRepository();
    const evalRepo = getEvaluationRepository();

    const aggregated = await aggregateReportData(learningRepo, speakingRepo, {
      userId: user.id,
      period,
    });

    // ---- state.read: report source data ----
    tctx.emitStateRead({
      entity: "report_source_data",
      keys: { userId: user.id, period },
      snapshot_summary: `states=${aggregated.states.length}, events=${aggregated.events.length}, sessions=${aggregated.sessions.length}`,
    });

    // M1: 从服务端 Repository 获取能力观察和评估
    const abilityObservations = await abilityRepo.getAll(user.id);
    // LEARNING-REPORT-ONLINE-02: speaking_evaluations 缺表（42P01/PGRST205）时仅对该表降级，
    // 报告其余真实指标照常返回；auth/RLS/network/未知错误一律 fail loudly。
    let evaluations: SpeakingEvaluation[] = [];
    let speakingEvaluationsStatus: "OK" | "NOT_INSTRUMENTED" = "OK";
    try {
      evaluations = await evalRepo.getAll(user.id);
    } catch (err) {
      if (isSpeakingEvaluationsMissingError(err)) {
        evaluations = [];
        speakingEvaluationsStatus = "NOT_INSTRUMENTED";
        tctx.emitFallbackTriggered({
          trigger_error_code: "SPEAKING_EVALUATIONS_NOT_INSTRUMENTED",
          chain_snapshot: [
            { step: "eval_repo_read", from: "supabase", to: "none", status: "unavailable" },
            { step: "degraded_empty", from: "none", to: "report", status: "used" },
          ],
          degradation_flag: true,
          to_kind: "rule_based_analysis",
        });
      } else {
        throw err;
      }
    }

    // M1: 获取词条内容供前端词库展示
    const itemContents: Record<string, { term: string; coreMeaning: string }> = {};
    for (const state of aggregated.states) {
      if (!itemContents[state.itemId]) {
        const item = await learningRepo.getItemById(state.itemId);
        if (item) {
          const content = item.contentJson as { term?: string; coreMeaning?: string } | undefined;
          itemContents[state.itemId] = {
            term: content?.term ?? item.canonicalForm,
            coreMeaning: content?.coreMeaning ?? "",
          };
        }
      }
    }

    const recommendations = generateRecommendations(aggregated, new Date());

    const insufficientData =
      aggregated.events.length === 0 &&
      aggregated.sessions.length === 0 &&
      aggregated.states.length === 0;

    // ---- report.aggregated ----
    const aggregateValues = {
      totalItems: aggregated.states.length,
      totalEvents: aggregated.events.length,
      totalSessions: aggregated.sessions.length,
      recalledIndependently: aggregated.memory.statusDistribution.RECALLED_INDEPENDENTLY,
      recalledWithHelp: aggregated.memory.statusDistribution.RECALLED_WITH_HELP,
      reviewCorrectRate: aggregated.review.correctRate,
    };
    tctx.emitReportAggregated({
      period,
      aggregate_checksum: canonicalStateHash(aggregateValues),
      insufficient_data_flag: insufficientData,
      baseline_availability: aggregated.states.length > 0,
      summary_generated: null, // 会在 LLM 调用后更新
      section_render_flags: {
        memory: aggregated.states.length > 0,
        review: aggregated.events.length > 0,
        speaking: aggregated.sessions.length > 0,
        recommendations: recommendations.length > 0,
      },
      aggregate_values: aggregateValues,
    });

    // ---- rule.applied: insufficient_data ----
    if (insufficientData) {
      tctx.emitRuleApplied({
        rule_key: "insufficient_data",
        inputs: {
          events_count: aggregated.events.length,
          sessions_count: aggregated.sessions.length,
          states_count: aggregated.states.length,
        },
        outputs: {
          insufficient_data: true,
          show_message: true,
          llm_summary_skipped: true,
        },
        llm_call_count: 0,
      });
    }

    const report: ProgressReport = {
      period,
      generatedAt: new Date().toISOString(),
      memory: aggregated.memory,
      review: aggregated.review,
      speakingObservations: aggregated.speakingObservations,
      recommendations,
      insufficientData,
      insufficientDataMessage: insufficientData
        ? "暂无学习记录。开始学习新词或练习口语后，报告将自动生成。"
        : undefined,
    };

    // LLM 自然语言建议（不阻塞报告主体）
    let llmSummary = null;
    if (!insufficientData) {
      try {
        llmSummary = await generateReportSummaryWithLlm(report, traceId);
      } catch {
        // LLM 失败不影响报告
      }
      // ---- fallback.triggered: null_summary（LLM 总结失败 → 报告不阻塞，Case 028 相关）----
      if (llmSummary === null) {
        tctx.emitFallbackTriggered({
          trigger_error_code: "REPORT_SUMMARY_FAILED",
          chain_snapshot: [
            { step: "llm_summary", from: "llm", to: "llm", status: "used" },
            { step: "null_summary", from: "llm", to: "null", status: "used" },
          ],
          degradation_flag: true,
          to_kind: "null_report_summary",
        });
      }
    }

    const resp = NextResponse.json(
      {
        ...report,
        llmSummary,
        abilityObservations,
        evaluations,
        speakingEvaluationsStatus,
        _raw: {
          states: aggregated.states,
          events: aggregated.events,
          sessions: aggregated.sessions,
          itemContents,
        },
      },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
    return endTraceSuccess(tctx, resp, `period=${period}, items=${aggregated.states.length}, events=${aggregated.events.length}, insufficientData=${insufficientData}, llmSummary=${llmSummary !== null}`, llmSummary === null);
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : 500;
    const { code, message } = appErrorToTrace(err);
    endTraceError(tctx, status, code, message);
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
