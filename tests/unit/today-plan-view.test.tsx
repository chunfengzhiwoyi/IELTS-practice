/**
 * TodayPlanView UI 测试（PRODUCT-LOOP-02B §14 case 10 + 03B overload 展示）
 * 纯展示组件：渲染 planner.primary + actions（顺序=planner 顺序），
 * 以及 OVERLOADED 时的 overloadReason。
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TodayPlanView } from "@/components/home/today-plan-view";
import type { TodayPlan, NextAction, BudgetStatus } from "@/lib/planner/planner-v1";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) =>
    React.createElement("a", { href, ...rest }, children),
}));

function action(type: NextAction["type"], i: number): NextAction {
  return {
    type,
    priority: i === 0 ? "HIGH" : "MEDIUM",
    reason: `${type}-reason-${i}`,
    target: {},
    estimatedMinutes: 5,
    href: `/${type.toLowerCase().replace("_", "-")}`,
  };
}

function plan(
  types: NextAction["type"][],
  over: { budgetStatus?: BudgetStatus; overloadReason?: string } = {},
): TodayPlan {
  const actions = types.map(action);
  return {
    date: "2026-09-11",
    actions,
    primary: actions[0]!,
    dailyBudgetMinutes: 30,
    computedBy: "planner-v1",
    budgetStatus: over.budgetStatus ?? "WITHIN_BUDGET",
    overloadReason: over.overloadReason,
    inputsSnapshot: {
      dueCount: 0,
      speakingIdleDays: null,
      weeklyProgress: 0.5,
      feasibility: "comfortable",
      recurringIssueCount: 0,
    },
  };
}

function orderOf(html: string): string[] {
  const re = /data-action-type="([A-Z_]+)"/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]!);
  return out;
}

describe("TodayPlanView", () => {
  it("case 10a: actions 渲染顺序 = planner 顺序（不重排）", () => {
    const p = plan(["REVIEW", "SPEAKING", "LEARN_NEW"]);
    const html = renderToStaticMarkup(<TodayPlanView plan={p} />);
    expect(orderOf(html)).toEqual(["REVIEW", "SPEAKING", "LEARN_NEW"]);
  });

  it("case 10b: primary = 首个 action，且主 CTA 类型正确", () => {
    const p = plan(["SPEAKING", "LEARN_NEW"]);
    const html = renderToStaticMarkup(<TodayPlanView plan={p} />);
    expect(html).toContain('data-today-primary="SPEAKING"');
    expect(orderOf(html)).toEqual(["SPEAKING", "LEARN_NEW"]);
  });

  it("case 10c: REST 单动作渲染为休息主 CTA，无多余 action 列表", () => {
    const p = plan(["REST"]);
    const html = renderToStaticMarkup(<TodayPlanView plan={p} />);
    expect(html).toContain('data-today-primary="REST"');
    expect(html).toContain("今天可以休息");
    expect(html).not.toContain("data-today-actions");
  });

  it("case 10d: 渲染 reason 与预算信息", () => {
    const p = plan(["REVIEW"]);
    const html = renderToStaticMarkup(<TodayPlanView plan={p} />);
    expect(html).toContain("REVIEW-reason-0");
    expect(html).toContain("今日预算 30 分钟");
  });

  it("case 10e: OVERLOADED 时渲染 overloadReason，不让 UI 猜", () => {
    const p = plan(["REVIEW", "SPEAKING"], {
      budgetStatus: "OVERLOADED",
      overloadReason: "今天到期复习较多，同时口语已超期未练。计划略超出你的时间预算。",
    });
    const html = renderToStaticMarkup(<TodayPlanView plan={p} />);
    expect(html).toContain('data-today-overload');
    expect(html).toContain("计划略超出你的时间预算");
  });

  it("case 10f: WITHIN_BUDGET 不渲染 overload 提示", () => {
    const p = plan(["LEARN_NEW"]);
    const html = renderToStaticMarkup(<TodayPlanView plan={p} />);
    expect(html).not.toContain("data-today-overload");
  });
});
