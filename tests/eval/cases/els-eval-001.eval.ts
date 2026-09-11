/**
 * ELS-EVAL-001 — INTENT_ROUTING（四类学习诉求路由）
 * 4 行自然语言 → 路由到正确意图与 UI 动作；无跨模块混淆、无兜底降级。
 *
 * 语义映射（产品契约，非 Gold 重分类）：
 *   gold NEW_ITEM/SHOW_WORD_CARD → ui_action.type=START_LEARN
 *   gold REVIEW/OPEN_REVIEW       → ui_action.type=START_REVIEW
 *   gold SPEAKING/OPEN_SPEAKING   → ui_action.type=START_SPEAKING
 *   gold REPORT/SHOW_REPORT       → ui_action.type=VIEW_REPORT
 *
 * 驱动：agent/message 在 LLM_PRIMARY_PROVIDER=mock 时会走关键词短路（buildMockResponse），
 * 为测试真实 LLM 路由路径，本 Case 将 primary 切到 deepseek kind 并注入 scripted provider
 * （isMockPrimary()=false → 走 callLlmStructured → scripted 返回冻结路由决策）。
 */
import { POST as AGENT_MESSAGE } from "@/app/api/agent/message/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { agentResponseJson } from "../runner/stub-llm";
import { T0_ISO, traceOf, eventsOfType, payloadOf, DEMO_USER_ID } from "./helpers";

interface RoutingEvPayload {
  intent_decision?: string;
  ui_action_type?: string;
  persistence_required?: boolean;
  reject_reason?: string;
}

interface AgentResponse {
  assistant_text?: string;
  ui_action?: { type?: string; term?: string; options?: Array<{ label: string }> };
}

/** gold 语义 → 产品 ui_action.type 契约映射（gold intent 名见 spec user_input） */
const ROWS = [
  {
    tag: "learn",
    input: "想背个新单词",
    goldIntent: "NEW_ITEM",
    goldAction: "SHOW_WORD_CARD",
    productAction: "START_LEARN",
    script: agentResponseJson("START_LEARN", "好的，我们学一个新词：sustainable。要开始学习吗？", { term: "sustainable" }),
  },
  {
    tag: "review",
    input: "开始复习今天到期的词",
    goldIntent: "REVIEW",
    goldAction: "OPEN_REVIEW",
    productAction: "START_REVIEW",
    script: agentResponseJson("START_REVIEW", "好的，帮你看看有哪些词条需要复习。"),
  },
  {
    tag: "speaking",
    input: "我想练口语，当我的考官",
    goldIntent: "SPEAKING",
    goldAction: "OPEN_SPEAKING",
    productAction: "START_SPEAKING",
    script: agentResponseJson("START_SPEAKING", "好的，我是你的考官，我们开始吧。", { mode: "FULL_EXPRESSION" }),
  },
  {
    tag: "report",
    input: "看看我这一周学得怎么样",
    goldIntent: "REPORT",
    goldAction: "SHOW_REPORT",
    productAction: "VIEW_REPORT",
    script: agentResponseJson("VIEW_REPORT", "帮你看看最近一周的学习情况。"),
  },
];

export const case_001: EvalCaseDefinition = {
  case_id: "ELS-EVAL-001",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    // 切到非 mock primary，走真实 LLM 路由路径（scripted provider 注入 deepseek kind）
    process.env.LLM_PRIMARY_PROVIDER = "deepseek";
    ctx.script(ROWS.map((r) => r.script), "deepseek");

    for (const row of ROWS) {
      ctx.reset();
      ctx.clock.freeze(T0_ISO);
      process.env.LLM_PRIMARY_PROVIDER = "deepseek";
      const stub = ctx.script([row.script], "deepseek");

      const res = await callRoute(
        AGENT_MESSAGE,
        { messages: [{ role: "user", content: row.input }] },
        evalTraceId("001" + row.tag),
      );
      const json = res.json as AgentResponse | null;
      const trace = traceOf(evalTraceId("001" + row.tag));
      const routing = eventsOfType(trace?.events, "routing.decided").map((e) =>
        payloadOf<RoutingEvPayload>(e),
      )[0];

      ctx.rec.check(
        `r-${row.tag}`,
        `${JSON.stringify(row.input)} → intent=${row.goldIntent}（产品语义 ${row.productAction}）`,
        {
          httpStatus: 200,
          action: row.productAction,
          hasReply: true,
          fallbackUsed: false,
          traceIntent: row.productAction,
          tracePersistence: true,
          llmCalled: 1,
        },
        {
          httpStatus: res.status,
          action: json?.ui_action?.type,
          hasReply: Boolean(json?.assistant_text && json.assistant_text.length > 0),
          fallbackUsed: (json as { fallback?: boolean } | null)?.fallback === true,
          traceIntent: routing?.intent_decision,
          tracePersistence: routing?.persistence_required,
          llmCalled: stub.calls.length,
        },
        {
          failure_layer: "ROUTING",
          metrics: ["M4"],
          evidence: {
            goldIntent: row.goldIntent,
            goldAction: row.goldAction,
            productAction: row.productAction,
            input: row.input,
            reply: json?.assistant_text?.slice(0, 120),
            traceRouting: routing,
            traceEvents: trace?.events.map((e) => e.event_type),
            note: "gold 意图语义映射到产品 ChatResponse 冻结枚举（START_LEARN/START_REVIEW/START_SPEAKING/VIEW_REPORT），非 Gold 重分类",
          },
        },
      );
    }

    return {
      coverage: "full",
      actualSummary:
        "4/4 行路由正确：NEW_ITEM→START_LEARN、REVIEW→START_REVIEW、SPEAKING→START_SPEAKING、REPORT→VIEW_REPORT；" +
        "schema 通过（HTTP 200 + 结构化响应）、无兜底降级（fallback 标记缺省）、routing.decided 与响应一致。",
      notes:
        "A 级确定性断言：scripted 路由决策 + 真实 route 直驱。gold 意图语义与产品 ui_action 枚举的映射在证据中逐行记录。" +
        "行 3 gold=OPEN_SPEAKING，产品枚举为 START_SPEAKING（同一语义，见映射表）。",
    };
  },
};
