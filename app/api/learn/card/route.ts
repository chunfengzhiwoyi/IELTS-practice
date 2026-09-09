/**
 * POST /api/learn/card
 * ------------------------------------------------------------
 * 输入 term → 标准化 → seed 查找 → 未命中时 LLM 生成 → 返回词卡 + 任务
 * M1: 使用中央 repository-factory
 * M2 Phase 2: state.read / retrieval.executed 埋点
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  findSeedItem,
  seedToLearningItem,
  type WordCardResponse,
  type SeedLearningItem,
} from "@/lib/learning";
import { getLearningRepository } from "@/lib/repository-factory";
import { normalizeTerm } from "@/lib/learning/item-id";
import { generateWordCardWithLlm } from "@/lib/llm/tasks/generate-word-card";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { startTrace, endTraceSuccess, endTraceError, appErrorToTrace } from "@/lib/observability/trace-api-helper";

export const runtime = "nodejs";

const RequestSchema = z.object({
  term: z.string().min(1, "term 不能为空").max(200),
});

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const tctx = startTrace(traceId, "/api/learn/card", {
    input_summary: "learn card",
    method: "POST",
  });
  try {
    const bodyRaw = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    const normalized = normalizeTerm(parsed.data.term);

    // ---- retrieval.executed: seed catalog lookup ----
    let seedItem: SeedLearningItem | null = findSeedItem(normalized);
    const retrievalHit = seedItem !== null;
    tctx.emitRetrievalExecuted({
      query_raw: parsed.data.term,
      query_normalized: normalized,
      knowledge_object_ids: retrievalHit ? [`seed:${seedItem!.itemId}`] : [],
      knowledge_injected_count: retrievalHit ? 1 : 0,
      knowledge_miss_flag: !retrievalHit,
      // conflict detection: 当前系统无 conflict detection capability
      conflict_detected: false,
      conflict_resolution: "capability_missing",
    });

    if (!seedItem) {
      try {
        seedItem = await generateWordCardWithLlm(parsed.data.term, traceId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "生成词卡失败";
        endTraceError(tctx, 502, "MODEL_ERROR", msg);
        return NextResponse.json(
          { error: { kind: "MODEL_ERROR", message: `无法为「${parsed.data.term}」生成词卡: ${msg}`, trace_id: traceId } },
          { status: 502, headers: { "x-trace-id": traceId } },
        );
      }
    }

    const repo = getLearningRepository();
    const item = await repo.createOrGetItem(seedToLearningItem(seedItem));

    // ---- state.read: user_item_state ----
    const currentState = await repo.getUserItemState(user.id, item.id);
    tctx.emitStateRead({
      entity: "user_item_state",
      keys: { userId: user.id, itemId: item.id },
      snapshot_summary: currentState
        ? `status=${currentState.status}, recallLevel=${currentState.recallLevel}`
        : "not learned yet",
      state_not_found: !currentState,
    });
    const alreadyLearned = currentState !== null;

    const response: WordCardResponse = {
      item,
      task: {
        taskType: "MEANING_RECALL",
        prompt: `请回忆「${item.canonicalForm}」的核心含义（中文）。`,
        acceptedAnswerHint: seedItem.coreMeaning,
      },
      alreadyLearned,
      currentState,
    };

    const resp = NextResponse.json(response, { status: 200, headers: { "x-trace-id": traceId } });
    return endTraceSuccess(tctx, resp, `term=${item.canonicalForm}, alreadyLearned=${alreadyLearned}, retrievalHit=${retrievalHit}`);
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    const { code, message } = appErrorToTrace(err);
    endTraceError(tctx, status, code, message);
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
