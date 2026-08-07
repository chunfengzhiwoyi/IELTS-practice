/**
 * POST /api/agent/message
 * ------------------------------------------------------------
 * 交接单 §8.1 唯一自然语言入口。
 *
 * 职责：
 *  - 校验请求体（Zod）
 *  - 生成或复用 trace_id
 *  - 走登录会话（P0 未登录也允许，便于本地 Mock 测试；P1 起收紧）
 *  - 调用 Agent 得到 AgentResponse 并返回
 *  - 统一错误结构
 */
import { NextResponse } from "next/server";

import { runAgent } from "@/lib/agent/agent";
import { AgentMessageRequestSchema } from "@/lib/agent/schemas";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError, toAppError } from "@/lib/observability/errors";
import { logger } from "@/lib/observability/logger";
import { traceIdFromHeaders } from "@/lib/observability/trace";

// 明确声明使用 Node runtime，OpenAI SDK 需要
export const runtime = "nodejs";

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);

  try {
    // 1. 请求体校验
    const bodyRaw = await request.json().catch(() => null);
    const parsed = AgentMessageRequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError(
        "INVALID_INPUT",
        `请求体校验失败: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        traceId,
      );
    }

    // 2. 尝试获取当前用户；P0 阶段允许匿名访问以支持本地 Mock 演示
    const user = await getCurrentUser();

    logger.info("agent.message.received", {
      trace_id: traceId,
      user_id: user?.id,
      message_length: parsed.data.message.length,
    });

    // 3. 调用 Agent
    const response = await runAgent({
      message: parsed.data.message,
      userId: user?.id,
      traceId,
    });

    return NextResponse.json(response, {
      status: 200,
      headers: { "x-trace-id": traceId },
    });
  } catch (err) {
    const appErr = toAppError(err, traceId);
    logger.error("agent.message.failed", {
      trace_id: traceId,
      kind: appErr.kind,
      msg: appErr.message,
    });

    const status = statusForKind(appErr.kind);
    return NextResponse.json(
      { error: appErr.toPayload() },
      { status, headers: { "x-trace-id": traceId } },
    );
  }
}

function statusForKind(kind: AppError["kind"]): number {
  switch (kind) {
    case "AUTH_REQUIRED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "INVALID_INPUT":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "UNSUPPORTED_INTENT":
      return 422;
    case "RATE_LIMITED":
    case "MODEL_RATE_LIMITED":
      return 429;
    case "MODEL_TIMEOUT":
      return 504;
    case "MODEL_PROVIDER_UNAVAILABLE":
    case "MODEL_ALL_PROVIDERS_FAILED":
      return 503;
    case "MODEL_ERROR":
    case "MODEL_EMPTY_RESPONSE":
    case "MODEL_INVALID_JSON":
    case "MODEL_SCHEMA_MISMATCH":
    case "MODEL_UNAUTHORIZED":
      return 502;
    case "CONFIG_ERROR":
    case "PERSISTENCE_ERROR":
    case "INTERNAL":
    default:
      return 500;
  }
}
