/**
 * POST /api/review/session
 * ------------------------------------------------------------
 * 创建复习会话：
 *  - mode=DUE: 获取所有到期项目
 *  - mode=MANUAL: 获取指定 itemId 的项目
 * 返回 tasks 数组及 totalDue 计数。
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/learning";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

const RequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("DUE"), limit: z.number().int().min(1).max(50).optional() }),
  z.object({ mode: z.literal("MANUAL"), itemId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const bodyRaw = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    const repo = getRepository();
    const now = new Date().toISOString();

    if (parsed.data.mode === "DUE") {
      const limit = parsed.data.limit ?? 10;
      const dueItems = await repo.getDueReviewItems(user.id, now, limit);
      // Also get total due count (up to a reasonable max)
      const allDue = await repo.getDueReviewItems(user.id, now, 100);
      const totalDue = allDue.length;

      const tasks = dueItems.map(({ item }) => ({
        itemId: item.id,
        term: item.canonicalForm,
        prompt: `请回忆「${item.canonicalForm}」的核心含义（中文）。`,
        taskType: "MEANING_RECALL" as const,
      }));

      return NextResponse.json({ tasks, totalDue }, { status: 200, headers: { "x-trace-id": traceId } });
    }

    // mode === "MANUAL"
    const { itemId } = parsed.data;
    const item = await repo.getItemById(itemId);
    if (!item) {
      throw new AppError("INVALID_INPUT", `知识项 ${itemId} 不存在`, traceId);
    }

    // Get total due for context
    const allDue = await repo.getDueReviewItems(user.id, now, 100);
    const totalDue = allDue.length;

    const tasks = [{
      itemId: item.id,
      term: item.canonicalForm,
      prompt: `请回忆「${item.canonicalForm}」的核心含义（中文）。`,
      taskType: "MEANING_RECALL" as const,
    }];

    return NextResponse.json({ tasks, totalDue }, { status: 200, headers: { "x-trace-id": traceId } });
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
