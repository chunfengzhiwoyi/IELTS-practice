/**
 * GET /api/debug/traces/[traceId]
 * ------------------------------------------------------------
 * M2 Phase 1: 按 trace_id 查询完整 trace（header + events ordered by seq）。
 * 内部 debug 端点，不做鉴权（demo 项目）。
 * 生产环境应限制访问。
 */
import { NextResponse } from "next/server";

import { traceStore } from "@/lib/observability/trace-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ traceId: string }> },
) {
  const { traceId } = await params;

  if (!traceId) {
    return NextResponse.json({ error: "traceId is required" }, { status: 400 });
  }

  const trace = traceStore.getTrace(traceId);
  if (!trace) {
    return NextResponse.json(
      { error: "trace not found", trace_id: traceId },
      { status: 404 },
    );
  }

  return NextResponse.json({
    header: trace.header,
    events: trace.events,
  }, { status: 200 });
}
