/**
 * ELS-EVAL-002 — INTENT_ROUTING（边界：模糊输入 / 域外输入）
 * 行 1 模糊诉求 → 澄清（SHOW_CHOICES），不得直接落地具体模块；
 * 行 2 域外诉求 → NONE + 拒答文案，零副作用、零持久化。
 *
 * 语义映射（产品契约）：
 *   gold UNSUPPORTED 语义 → ui_action.type=NONE + 拒绝引导回复（产品枚举无 UNSUPPORTED，NONE 为冻结映射）。
 */
import { POST as AGENT_MESSAGE } from "@/app/api/agent/message/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { agentResponseJson } from "../runner/stub-llm";
import { T0_ISO, traceOf, eventsOfType, payloadOf, memRepo, DEMO_USER_ID } from "./helpers";

interface RoutingEvPayload {
  intent_decision?: string;
  ui_action_type?: string;
  persistence_required?: boolean;
  reject_reason?: string;
}

interface AgentResponse {
  assistant_text?: string;
  ui_action?: { type?: string };
  fallback?: boolean;
}

export const case_002: EvalCaseDefinition = {
  case_id: "ELS-EVAL-002",
  automation_level: "A",
  async run(ctx) {
    // ---- 行 1：模糊输入 → 澄清，不落地具体模块 ----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    process.env.LLM_PRIMARY_PROVIDER = "deepseek";
    const stub1 = ctx.script(
      [agentResponseJson("SHOW_CHOICES", "你想学新词、复习、练口语还是看报告？")],
      "deepseek",
    );

    const res1 = await callRoute(
      AGENT_MESSAGE,
      { messages: [{ role: "user", content: "随便学点啥吧" }] },
      evalTraceId("002-vague"),
    );
    const json1 = res1.json as AgentResponse | null;
    const trace1 = traceOf(evalTraceId("002-vague"));
    const routing1 = eventsOfType(trace1?.events, "routing.decided").map((e) =>
      payloadOf<RoutingEvPayload>(e),
    )[0];

    ctx.rec.check(
      "r-vague",
      "行1 模糊输入「随便学点啥吧」→ 澄清（SHOW_CHOICES），不得直接落地具体学习模块",
      { status: 200, action: "SHOW_CHOICES", concreteModule: false },
      {
        status: res1.status,
        action: json1?.ui_action?.type,
        concreteModule: ["START_LEARN", "START_REVIEW", "START_SPEAKING", "VIEW_REPORT"].includes(
          json1?.ui_action?.type ?? "",
        ),
      },
      {
        failure_layer: "ROUTING",
        metrics: ["M4"],
        evidence: {
          intent: "gold 行1 未落地具体模块（SHOW_CHOICES=澄清动作，产品冻结枚举）",
          traceRouting: routing1,
          reply: json1?.assistant_text?.slice(0, 120),
          note: "routing.decided.persistence_required 对 SHOW_CHOICES 为 true（产品语义：澄清仍算待持久化意图），gold 仅要求不落地具体模块，故此处不断言 persistence",
        },
      },
    );

    // ---- 行 2：域外输入 → NONE + 拒答，零副作用 ----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    process.env.LLM_PRIMARY_PROVIDER = "deepseek";
    const stub2 = ctx.script(
      [
        agentResponseJson(
          "NONE",
          "我目前只支持英语学习相关功能（学新词、复习、口语、报告），暂时无法帮你写求职邮件。",
        ),
      ],
      "deepseek",
    );
    const beforeStates = memRepo()._getAllStates().length;
    const beforeEvents = memRepo()._getAllEvents().length;

    const res2 = await callRoute(
      AGENT_MESSAGE,
      { messages: [{ role: "user", content: "帮我写一封求职邮件" }] },
      evalTraceId("002-domain"),
    );
    const json2 = res2.json as AgentResponse | null;
    const trace2 = traceOf(evalTraceId("002-domain"));
    const routing2 = eventsOfType(trace2?.events, "routing.decided").map((e) =>
      payloadOf<RoutingEvPayload>(e),
    )[0];

    ctx.rec.check(
      "r-domain",
      "行2 域外输入「帮我写一封求职邮件」→ NONE + 拒答文案，不执行、不伪装完成",
      {
        status: 200,
        action: "NONE",
        persistence: false,
        noSideEffect: true,
        hasRefusal: true,
        noCompletionClaim: true,
      },
      {
        status: res2.status,
        action: json2?.ui_action?.type,
        persistence: routing2?.persistence_required === true,
        noSideEffect:
          memRepo()._getAllStates().length === beforeStates &&
          memRepo()._getAllEvents().length === beforeEvents,
        hasRefusal: /无法|不能|只支持/.test(json2?.assistant_text ?? ""),
        noCompletionClaim: !/完成|已经.*(写好|发送)/.test(json2?.assistant_text ?? ""),
      },
      {
        failure_layer: "ROUTING",
        metrics: ["M4"],
        evidence: {
          intent: "gold UNSUPPORTED 语义 → 产品 NONE（冻结映射）",
          traceRouting: routing2,
          reply: json2?.assistant_text?.slice(0, 160),
          statesBefore: beforeStates,
          eventsBefore: beforeEvents,
          user: DEMO_USER_ID,
          llmCalled: stub2.calls.length,
        },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "行1 SHOW_CHOICES 澄清（未落地具体模块）；行2 NONE + 拒答，persistence_required=false，items/events 零变化，无'已完成'式承诺。",
      notes: "A 级确定性断言。两次调用均走真实 LLM 路由路径（scripted primary=deepseek kind）。",
    };
  },
};
