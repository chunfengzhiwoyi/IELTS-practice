/**
 * GET /api/ability/observations
 * M1: 获取用户所有能力观察（服务端 Repository）。
 */
import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getAbilityRepository } from "@/lib/repository-factory";
import { toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const user = await requireUser(traceId);
    const repo = getAbilityRepository();
    const observations = await repo.getAll(user.id);
    return NextResponse.json(
      { observations },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
