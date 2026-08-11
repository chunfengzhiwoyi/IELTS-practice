/**
 * POST /api/learn/card
 * ------------------------------------------------------------
 * 输入 term → 标准化 → 从本地词库获取 → 未命中时用 LLM 生成 → 返回词卡 + 任务
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  findSeedItem,
  getRepository,
  seedToLearningItem,
  type WordCardResponse,
  type SeedLearningItem,
} from "@/lib/learning";
import { normalizeTerm } from "@/lib/learning/item-id";
import { generateWordCardWithLlm } from "@/lib/llm/tasks/generate-word-card";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

const RequestSchema = z.object({
  term: z.string().min(1, "term 不能为空").max(200),
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
    const normalized = normalizeTerm(parsed.data.term);

    // 优先从本地词库查找
    let seedItem: SeedLearningItem | null = findSeedItem(normalized);

    // Seed 未命中 → 用 LLM 生成词卡
    if (!seedItem) {
      try {
        seedItem = await generateWordCardWithLlm(parsed.data.term, traceId);
      } catch (err) {
        // LLM 也失败了 → 返回错误
        const msg = err instanceof Error ? err.message : "生成词卡失败";
        return NextResponse.json(
          { error: { kind: "MODEL_ERROR", message: `无法为「${parsed.data.term}」生成词卡: ${msg}`, trace_id: traceId } },
          { status: 502, headers: { "x-trace-id": traceId } },
        );
      }
    }

    const repo = getRepository();
    const item = await repo.createOrGetItem(seedToLearningItem(seedItem));
    const currentState = await repo.getUserItemState(user.id, item.id);
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

    return NextResponse.json(response, {
      status: 200,
      headers: { "x-trace-id": traceId },
    });
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
