/**
 * POST /api/speaking/complete
 * ------------------------------------------------------------
 * 显式完成口语会话：用户完成本轮训练（结束）时将 session 置 COMPLETED。
 * PRODUCT-LOOP-02A：此前 completeSession() 无调用者，未重答即结束的会话会长期 IN_PROGRESS。
 * 幂等：对已 COMPLETED（重答路径 updateSecondAnswer 已置位）的会话重复调用无害。
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getSpeakingRepository } from "@/lib/repository-factory";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

const RequestSchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const bodyRaw = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    const { sessionId } = parsed.data;
    const repo = getSpeakingRepository();

    const session = await repo.getSession(sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND", `会话 ${sessionId} 不存在`, traceId);
    }
    if (session.userId !== user.id) {
      throw new AppError("FORBIDDEN", "无权操作该会话", traceId);
    }

    const completed = await repo.completeSession(sessionId);

    return NextResponse.json({ session: completed }, { status: 200, headers: { "x-trace-id": traceId } });
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status =
      appErr.kind === "AUTH_REQUIRED" ? 401
        : appErr.kind === "INVALID_INPUT" ? 400
          : appErr.kind === "NOT_FOUND" ? 404
            : appErr.kind === "FORBIDDEN" ? 403
              : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
