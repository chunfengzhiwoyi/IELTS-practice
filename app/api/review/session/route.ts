/**
 * POST /api/review/session
 * ------------------------------------------------------------
 * M1: 创建复习会话，返回 tasks（含 coreMeaning/answerKeywords 供前端展示）。
 * M2 Phase 2: state.read（含 due_queue）埋点
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getLearningRepository } from "@/lib/repository-factory";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { startTrace, endTraceSuccess, endTraceError, appErrorToTrace } from "@/lib/observability/trace-api-helper";

export const runtime = "nodejs";

const RequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("DUE"), limit: z.number().int().min(1).max(50).optional() }),
  z.object({ mode: z.literal("MANUAL"), itemId: z.string().min(1) }),
]);

interface ReviewTask {
  itemId: string;
  term: string;
  prompt: string;
  taskType: "MEANING_RECALL";
  coreMeaning: string;
  acceptedAnswers: string[];
  answerKeywords: string[];
}

function itemToTask(item: { id: string; canonicalForm: string; contentJson: unknown }): ReviewTask {
  const content = item.contentJson as { coreMeaning?: string; answerKeywords?: string[]; acceptedAnswers?: string[] } | undefined;
  return {
    itemId: item.id,
    term: item.canonicalForm,
    prompt: `请回忆「${item.canonicalForm}」的核心含义（中文）。`,
    taskType: "MEANING_RECALL",
    coreMeaning: content?.coreMeaning ?? "",
    acceptedAnswers: content?.acceptedAnswers ?? [],
    answerKeywords: content?.answerKeywords ?? [],
  };
}

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const bodyRaw = await request.json().catch(() => null);
  const rawMode = bodyRaw && typeof bodyRaw.mode === "string" ? bodyRaw.mode : null;
  const rawItemId = bodyRaw && typeof bodyRaw.itemId === "string" ? bodyRaw.itemId : null;
  const rawModeStr = rawMode ? ("mode=" + rawMode + (rawItemId ? (", itemId=" + rawItemId) : "")) : "invalid body";
  const tctx = startTrace(traceId, "/api/review/session", {
    input_summary: rawModeStr,
    method: "POST",
  });
  try {
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    tctx.trace.setUser(user.id);
    const repo = getLearningRepository();
    const now = new Date().toISOString();

    if (parsed.data.mode === "DUE") {
      const limit = parsed.data.limit ?? 10;
      const dueItems = await repo.getDueReviewItems(user.id, now, limit);
      const allDue = await repo.getDueReviewItems(user.id, now, 100);
      const totalDue = allDue.length;

      // ---- state.read: due_review_queue ----
      tctx.emitStateRead({
        entity: "due_review_queue",
        keys: { userId: user.id, mode: "DUE" },
        snapshot_summary: `total_due=${totalDue}, returned=${dueItems.length}, limit=${limit}`,
        due_queue: allDue.slice(0, 20).map(({ item, state }) => ({
          itemId: item.id,
          nextReviewAt: state.nextReviewAt,
        })),
        total_due: totalDue,
      });

      const tasks: ReviewTask[] = dueItems.map(({ item }) => itemToTask(item));
      const resp = NextResponse.json({ tasks, totalDue }, { status: 200, headers: { "x-trace-id": traceId } });
      return endTraceSuccess(tctx, resp, `DUE mode: totalDue=${totalDue}, returned=${tasks.length}`);
    }

    const { itemId } = parsed.data;
    const item = await repo.getItemById(itemId);
    if (!item) {
      throw new AppError("INVALID_INPUT", `知识项 ${itemId} 不存在`, traceId);
    }

    const allDue = await repo.getDueReviewItems(user.id, now, 100);
    const totalDue = allDue.length;

    // ---- state.read: manual review item ----
    tctx.emitStateRead({
      entity: "user_item_state",
      keys: { userId: user.id, itemId },
      snapshot_summary: `MANUAL mode: item=${item.canonicalForm}, totalDue=${totalDue}`,
      total_due: totalDue,
    });

    const tasks: ReviewTask[] = [itemToTask(item)];
    const resp = NextResponse.json({ tasks, totalDue }, { status: 200, headers: { "x-trace-id": traceId } });
    return endTraceSuccess(tctx, resp, `MANUAL mode: itemId=${itemId}`);
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    const { code, message } = appErrorToTrace(err);
    endTraceError(tctx, status, code, message);
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
