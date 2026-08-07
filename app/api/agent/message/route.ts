/**
 * POST /api/agent/message
 * 连续会话入口：接收 messages 数组，返回 assistant_text + ui_action
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { CHAT_SYSTEM_PROMPT, CHAT_JSON_EXAMPLE } from "@/lib/agent/chat-instructions";
import type { ChatResponse } from "@/lib/agent/chat-schema";
import { callLlmStructured } from "@/lib/llm/structured-output";
import { isMockPrimary } from "@/lib/env";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
  conversation_state: z.record(z.string(), z.unknown()).optional(),
});

const ResponseSchema = z.object({
  assistant_text: z.string().min(1),
  ui_action: z.object({
    type: z.enum(["NONE", "SHOW_CHOICES", "START_LEARN", "START_REVIEW", "START_SPEAKING", "VIEW_REPORT"]),
    options: z.array(z.object({ label: z.string(), message: z.string() })).optional(),
    term: z.string().optional(),
    itemId: z.string().optional(),
    mode: z.enum(["WARM_UP", "FULL_EXPRESSION", "DEEP_DISCUSSION"]).optional(),
    topic: z.string().optional(),
  }),
  conversation_state_patch: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const bodyRaw = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const { messages, conversation_state } = parsed.data;

    // Mock 模式快速回退
    if (isMockPrimary()) {
      const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? "";
      const mockResp = buildMockResponse(lastUser);
      return NextResponse.json(mockResp, { status: 200, headers: { "x-trace-id": traceId } });
    }

    // 构造 LLM messages
    const stateContext = conversation_state
      ? `\n当前对话状态：${JSON.stringify(conversation_state)}`
      : "";

    const llmMessages = [
      { role: "system" as const, content: CHAT_SYSTEM_PROMPT + stateContext },
      ...messages.slice(-20).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const result = await callLlmStructured({
      tier: "fast",
      messages: llmMessages,
      schema: ResponseSchema,
      schemaName: "ChatResponse",
      jsonExample: CHAT_JSON_EXAMPLE,
      traceId,
      temperature: 0.5,
    });

    const resp: ChatResponse = {
      assistant_text: result.data.assistant_text,
      ui_action: result.data.ui_action,
      conversation_state_patch: result.data.conversation_state_patch as ChatResponse["conversation_state_patch"],
    };

    return NextResponse.json(resp, { status: 200, headers: { "x-trace-id": traceId } });
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "INVALID_INPUT" ? 400 : 502;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}

function buildMockResponse(userText: string): ChatResponse {
  const lower = userText.toLowerCase();
  if (/学|learn|新词|表达/.test(lower)) {
    return {
      assistant_text: "给你推荐一个雅思高频表达：sustainable（可持续的）。要开始学习吗？",
      ui_action: { type: "START_LEARN", term: "sustainable" },
      conversation_state_patch: { currentIntent: "learn", currentTarget: "sustainable" },
    };
  }
  if (/复习|review|巩固/.test(lower)) {
    return {
      assistant_text: "好的，帮你看看有哪些词条需要复习。",
      ui_action: { type: "START_REVIEW" },
      conversation_state_patch: { currentIntent: "review" },
    };
  }
  if (/口语|speak|练/.test(lower)) {
    return {
      assistant_text: "好的！你想怎么练？",
      ui_action: {
        type: "SHOW_CHOICES",
        options: [
          { label: "轻松热身", message: "来一道轻松热身题" },
          { label: "完整表达", message: "来一道完整表达题" },
          { label: "深入讨论", message: "来一道深入讨论题" },
        ],
      },
      conversation_state_patch: { currentIntent: "speaking" },
    };
  }
  if (/报告|report|情况|怎么样/.test(lower)) {
    return {
      assistant_text: "帮你看看最近的学习情况。",
      ui_action: { type: "VIEW_REPORT" },
      conversation_state_patch: { currentIntent: "report" },
    };
  }
  return {
    assistant_text: "我可以帮你学新词、复习、练口语或看学习报告。今天想做什么？",
    ui_action: {
      type: "SHOW_CHOICES",
      options: [
        { label: "学一个新表达", message: "帮我学一个新表达" },
        { label: "复习最近内容", message: "帮我复习" },
        { label: "练一会儿口语", message: "我想练口语" },
        { label: "看看学习情况", message: "看看我的学习情况" },
      ],
    },
  };
}
