/**
 * POST /api/learn/card
 * ------------------------------------------------------------
 * 输入 term → 标准化 → seed 查找 → 未命中时 LLM 生成 → 返回词卡 + 任务
 * M1: 使用中央 repository-factory
 * M2 Phase 2: state.read / retrieval.executed 埋点
 * BC-033: 保留 LLM 具体错误码（MODEL_SCHEMA_MISMATCH 等），不折叠为 MODEL_ERROR
 * BC-033-SAFETY: LlmError(MODEL_ERROR) 可能包含 callAndValidate 包装的 raw err.message，
 *   客户端只得到安全文案；其他具体 LlmError kind（SCHEMA_MISMATCH 等）保留已分类 message。
 *   Trace 仍记录内部诊断 message（debug-only，受 M2 truncation/privacy contract 约束）。
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
import { LlmError } from "@/lib/llm/errors";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { startTrace, endTraceSuccess, endTraceError, appErrorToTrace } from "@/lib/observability/trace-api-helper";
import { canonicalStateHash } from "@/lib/observability/trace-context";

export const runtime = "nodejs";

/**
 * 未知/通用模型错误的公开安全文案。
 * LlmError(MODEL_ERROR) 由 callAndValidate 包装底层 provider 异常产生，
 * 其 message 可能包含 raw err.message（SDK path、apiKey 等），不得暴露给客户端。
 */
const UNKNOWN_MODEL_ERROR_PUBLIC_MESSAGE = "模型服务暂时不可用，请稍后重试";

const RequestSchema = z.object({
  term: z.string().min(1, "term 不能为空").max(200),
});

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const bodyRaw = await request.json().catch(() => null);
  const termRaw = bodyRaw && typeof bodyRaw.term === "string" ? bodyRaw.term : null;
  const tctx = startTrace(traceId, "/api/learn/card", {
    input_summary: termRaw ? "term=" + termRaw.slice(0, 200) : "invalid body",
    method: "POST",
  });
  try {
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    tctx.trace.setUser(user.id);
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
        // BC-033: Preserve specific LLM error kind (MODEL_SCHEMA_MISMATCH, MODEL_TIMEOUT, etc.)
        // LlmError extends AppError, so instanceof AppError catches both.
        //
        // BC-033-SAFETY: Determine whether the error message is safe to expose:
        // - LlmError with specific kind (SCHEMA_MISMATCH, TIMEOUT, etc.): message is
        //   constructed by the LLM pipeline, classified and safe → preserve.
        // - LlmError with kind MODEL_ERROR: produced by callAndValidate as a generic
        //   wrapper for raw provider exceptions. message may contain SDK paths,
        //   apiKeys, internal state → use safe public message.
        // - Non-AppError unknown exception: wrapped as MODEL_ERROR, raw message → safe public message.
        // - Other AppError (AUTH, INVALID_INPUT, etc.): preserve as before.
        const appErr =
          err instanceof AppError
            ? err
            : new AppError(
                "MODEL_ERROR",
                err instanceof Error ? err.message : "unknown error",
                traceId,
              );

        // Trace records internal diagnostic message (debug-only endpoint, 4KB truncation)
        const { code, message } = appErrorToTrace(appErr);
        endTraceError(tctx, 502, code, message);

        // Determine public message safety
        const isGenericModelError =
          appErr instanceof LlmError && appErr.kind === "MODEL_ERROR";
        const isUnknownNonAppError = !(err instanceof AppError);
        const useSafeMessage = isGenericModelError || isUnknownNonAppError;
        const publicMessage = useSafeMessage
          ? UNKNOWN_MODEL_ERROR_PUBLIC_MESSAGE
          : appErr.message;

        return NextResponse.json(
          {
            error: {
              kind: appErr.kind,
              message: `无法为「${parsed.data.term}」生成词卡: ${publicMessage}`,
              trace_id: traceId,
            },
          },
          { status: 502, headers: { "x-trace-id": traceId } },
        );
      }
    }

    // ---- retrieval.executed: knowledge-layer retrieval（LLM 生成路径，ELS-EVAL-026）----
    // seed 命中的请求不走知识层；仅在 LLM 生成路径（generationMeta 存在）时记录
    if (seedItem.generationMeta) {
      const kbIds = seedItem.generationMeta.knowledgeObjectIds;
      const kbConflict = seedItem.generationMeta.conflictDetected ?? false;
      tctx.emitRetrievalExecuted({
        query_raw: parsed.data.term,
        query_normalized: normalized,
        knowledge_object_ids: kbIds,
        knowledge_injected_count: kbIds.length,
        knowledge_miss_flag: kbIds.length === 0,
        conflict_detected: kbConflict,
        conflict_resolution: kbConflict
          ? (seedItem.generationMeta.conflictResolution ?? "none")
          : "none",
      });
    }

    const repo = getLearningRepository();

    // ---- state.write: learning_item（幂等建 item，Contract §1.3 learn/card）----
    const priorItem = await repo.findItemByNormalizedTerm(normalized);
    const item = await repo.createOrGetItem(seedToLearningItem(seedItem));
    tctx.emitStateWrite({
      entity: "learning_item",
      keys: { itemId: item.id, canonicalKey: item.canonicalKey },
      idempotency_outcome: priorItem ? "duplicate_ignored" : "inserted",
      state_before: priorItem ? { id: priorItem.id, canonicalForm: priorItem.canonicalForm } : null,
      state_after: { id: item.id, canonicalForm: item.canonicalForm },
      canonical_state_hash: canonicalStateHash({ id: item.id, canonicalForm: item.canonicalForm }),
    });

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
