/**
 * GET /api/speaking/sessions
 * M1: 获取用户最近口语会话（服务端 Repository），供报告页使用。
 */
import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getSpeakingRepository } from "@/lib/repository-factory";
import { toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const user = await requireUser(traceId);
    const repo = getSpeakingRepository();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100);
    const sessions = await repo.getRecentSessions(user.id, limit);
    return NextResponse.json(
      { sessions },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
