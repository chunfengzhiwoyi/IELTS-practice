/**
 * Mock Provider
 * ------------------------------------------------------------
 * 完全离线的 Provider。用途：
 *   - 本地无 Key 开发 / CI 中 build/test 通过
 *   - 单元测试基线
 *
 * 契约：本 Provider 仅在收到面向 AgentResponse 的 prompt 时返回有意义的 JSON
 * （通过关键词识别意图）。其他 schema 的 mock 需要后续按需扩展策略。
 */
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import type { LlmProvider } from "@/lib/llm/provider";
import { resolveModelName } from "@/lib/llm/model-router";

/** 与旧 agent.ts 中的 guessIntent 对齐 */
function guessIntent(message: string): string {
  const msg = message.toLowerCase();
  if (/(报告|report|进展|进度)/i.test(msg)) return "REPORT";
  if (/(复习|review|温习|背)/i.test(msg)) return "REVIEW";
  if (/(口语|speaking|part\s*[123]|口试)/i.test(msg)) return "SPEAKING";
  if (/(学|learn|记|新词|生词|短语)/i.test(msg)) return "NEW_ITEM";
  return "UNSUPPORTED";
}

function buildAgentResponseMock(userMessage: string): string {
  const intent = guessIntent(userMessage);
  const templates: Record<string, unknown> = {
    NEW_ITEM: {
      intent: "NEW_ITEM",
      reply: "（Mock）识别到新词学习意图。P1 将返回真实词卡。",
      ui_action: {
        type: "SHOW_MESSAGE",
        payload: { note: "P0.5 mock: word card pipeline not wired yet" },
      },
      persistence_required: false,
      trace_id: "will-be-overwritten",
    },
    REVIEW: {
      intent: "REVIEW",
      reply: "（Mock）识别到复习意图。P2 将返回真实到期项。",
      ui_action: {
        type: "SHOW_MESSAGE",
        payload: { note: "P0.5 mock: review session not wired yet" },
      },
      persistence_required: false,
      trace_id: "will-be-overwritten",
    },
    SPEAKING: {
      intent: "SPEAKING",
      reply: "（Mock）识别到口语训练意图。P3 将返回真实题目。",
      ui_action: {
        type: "SHOW_MESSAGE",
        payload: { note: "P0.5 mock: speaking task not wired yet" },
      },
      persistence_required: false,
      trace_id: "will-be-overwritten",
    },
    REPORT: {
      intent: "REPORT",
      reply: "（Mock）识别到报告意图。P4 将返回真实汇总。",
      ui_action: {
        type: "SHOW_MESSAGE",
        payload: { note: "P0.5 mock: progress report not wired yet" },
      },
      persistence_required: false,
      trace_id: "will-be-overwritten",
    },
    UNSUPPORTED: {
      intent: "UNSUPPORTED",
      reply:
        "目前我只支持四类能力：新词学习、复习、文字口语训练、查看报告。请选择其一。",
      ui_action: {
        type: "SHOW_MESSAGE",
        payload: {
          echo: userMessage.slice(0, 200),
          hint: "请输入具体的学习需求，例如：帮我学习 take something for granted",
        },
      },
      persistence_required: false,
      trace_id: "will-be-overwritten",
    },
  };
  return JSON.stringify(templates[intent]);
}

export function createMockProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const model = resolveModelName("mock", req.tier);
      // 找到最后一条 user 消息作为 mock 触发词
      const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
      const userText = lastUser?.content ?? "";

      // 检查 system prompt 是否在暗示 AgentResponse。若是，产出对应 JSON。
      const isAgentResponse = req.messages.some(
        (m) => m.role === "system" && m.content.includes("AgentResponse"),
      );
      const isJsonMode = req.jsonMode === true;

      let content: string;
      if (isAgentResponse || isJsonMode) {
        content = buildAgentResponseMock(userText);
      } else {
        content = JSON.stringify({ note: "mock-response", echo: userText.slice(0, 200) });
      }

      return {
        content,
        model,
        usage: { input_tokens: userText.length, output_tokens: content.length },
      };
    },
  };
}
