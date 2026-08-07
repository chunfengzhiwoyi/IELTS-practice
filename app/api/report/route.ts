/**
 * POST /api/report
 * ------------------------------------------------------------
 * 生成学习报告 + LLM 自然语言建议
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/learning";
import { getSpeakingRepository } from "@/lib/speaking";
import {
  aggregateReportData,
  generateRecommendations,
  type ProgressReport,
  type ReportPeriod,
} from "@/lib/report";
import { generateReportSummaryWithLlm } from "@/lib/llm/tasks/generate-report-summary";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

const RequestSchema = z.object({
  period: z.enum(["7d", "30d"]).default("7d"),
});

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const bodyRaw = await request.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    const period: ReportPeriod = parsed.data.period;

    const learningRepo = getRepository();
    const speakingRepo = getSpeakingRepository();

    const aggregated = await aggregateReportData(learningRepo, speakingRepo, {
      userId: user.id,
      period,
    });

    const recommendations = generateRecommendations(aggregated, new Date());

    const insufficientData =
      aggregated.events.length === 0 &&
      aggregated.sessions.length === 0 &&
      aggregated.states.length === 0;

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
    const llmSummary = await generateReportSummaryWithLlm(report, traceId);

    return NextResponse.json(
      { ...report, llmSummary },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "7d";
  const syntheticRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ period }),
  });
  return POST(syntheticRequest);
}
