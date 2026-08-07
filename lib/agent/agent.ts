/**
 * Agent 运行时
 * ------------------------------------------------------------
 * P0.5 重构：不再直接依赖 openai SDK 或 OPENAI_* 环境变量。
 * 所有 LLM 调用都走 lib/llm 统一接口。
 *
 * 流程：
 *  1. 构造 messages (system=AGENT_SYSTEM_INSTRUCTIONS + JSON 契约提示, user=input.message)
 *  2. 通过 callLlmStructured 得到验证过的 AgentResponse-shape JSON
 *  3. 后端强制覆盖 trace_id
 *
 * 主 Provider 由 LLM_PRIMARY_PROVIDER 决定；Fallback 由 LLM_FALLBACK_ENABLED 控制。
 * 真实模型失败不会退回关键词 Mock，除非 LLM_PRIMARY_PROVIDER=mock 或 Fallback=mock 显式配置。
 */
import { AGENT_SYSTEM_INSTRUCTIONS } from "@/lib/agent/instructions";
import { AgentResponseSchema, type AgentResponse } from "@/lib/agent/schemas";
import { callLlmStructured, type LlmMessage } from "@/lib/llm";
import { newTraceId } from "@/lib/observability/trace";

export interface RunAgentInput {
  message: string;
  userId?: string;
  traceId?: string;
}

/** AgentResponse 目标 JSON 示例，用于提示词与修复重试 */
const AGENT_RESPONSE_JSON_EXAMPLE = `{
  "intent": "NEW_ITEM | REVIEW | SPEAKING | REPORT | UNSUPPORTED",
  "reply": "面向用户的中文自然语言回复",
  "ui_action": {
    "type": "SHOW_WORD_CARD | OPEN_REVIEW | OPEN_SPEAKING | SHOW_REPORT | SHOW_MESSAGE",
    "payload": {}
  },
  "persistence_required": false,
  "trace_id": "trc_xxx"
}`;

function buildJsonContractSystemPrompt(): string {
  return [
    "你必须只输出一个合法的 JSON 对象，不要添加任何解释、Markdown 代码块围栏或注释。",
    "输出必须严格符合 AgentResponse 契约，字段说明如下：",
    "",
    "- intent: 必须是 NEW_ITEM / REVIEW / SPEAKING / REPORT / UNSUPPORTED 之一",
    "- reply: 面向用户的中文自然语言回复，至少 1 个字符",
    "- ui_action.type: SHOW_WORD_CARD / OPEN_REVIEW / OPEN_SPEAKING / SHOW_REPORT / SHOW_MESSAGE 之一",
    "- ui_action.payload: 一个 JSON 对象（可为空对象 {}）",
    "- persistence_required: 布尔值",
    "- trace_id: 字符串（后端会覆盖，本次任意占位即可）",
    "",
    "示例结构：",
    AGENT_RESPONSE_JSON_EXAMPLE,
  ].join("\n");
}

/** 主入口：把用户自然语言消息转换成 AgentResponse */
export async function runAgent(input: RunAgentInput): Promise<AgentResponse> {
  const traceId = input.traceId ?? newTraceId();

  const messages: LlmMessage[] = [
    { role: "system", content: AGENT_SYSTEM_INSTRUCTIONS },
    { role: "system", content: buildJsonContractSystemPrompt() },
    { role: "user", content: input.message },
  ];

  const result = await callLlmStructured({
    tier: "fast",
    messages,
    schema: AgentResponseSchema,
    schemaName: "AgentResponse",
    jsonExample: AGENT_RESPONSE_JSON_EXAMPLE,
    traceId,
    temperature: 0.3,
  });

  // 后端强制覆盖 trace_id，不接受模型自造
  return { ...result.data, trace_id: traceId };
}
