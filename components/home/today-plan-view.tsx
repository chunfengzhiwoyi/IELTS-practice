"use client";

import Link from "next/link";
import type { TodayPlan, PlannerActionType } from "@/lib/planner/planner-v1";

/**
 * TodayPlanView — 纯展示组件（PRODUCT-LOOP-02B）
 * 渲染 planner.primary（主 CTA）+ actions（按给定顺序，绝不重新排序）。
 */
const TYPE_TITLE: Record<PlannerActionType, string> = {
  REVIEW: "继续复习",
  LEARN_NEW: "学一个新表达",
  SPEAKING: "该练练口语了",
  REST: "今天可以休息",
};

const TYPE_LABEL: Record<PlannerActionType, string> = {
  REVIEW: "开始复习",
  LEARN_NEW: "学习新表达",
  SPEAKING: "去练口语",
  REST: "休息一下",
};

export function TodayPlanView({ plan }: { plan: TodayPlan }) {
  const primary = plan.primary;
  return (
    <section className="today-zone" aria-labelledby="today-title">
      <p className="section-label">今日安排</p>

      <h2 id="today-title" className="today-zone__title">
        {TYPE_TITLE[primary.type]}
      </h2>

      <p className="today-zone__sub">{primary.reason}</p>

      {plan.budgetStatus === "OVERLOADED" && plan.overloadReason && (
        <p className="today-zone__overload" data-today-overload>
          {plan.overloadReason}
        </p>
      )}

      <Link
        href={primary.href}
        className="btn btn--primary"
        data-today-primary={primary.type}
      >
        {TYPE_LABEL[primary.type]} →
      </Link>

      {plan.actions.length > 1 && (
        <ul className="today-zone__actions" data-today-actions>
          {plan.actions.map((a, i) => (
            <li key={`${a.type}-${i}`} data-action-type={a.type} data-action-order={i}>
              <span className="today-zone__action-label">{TYPE_LABEL[a.type]}</span>
              <span className="today-zone__action-reason">{a.reason}</span>
              <span className="today-zone__action-meta">
                {a.estimatedMinutes > 0 ? `约 ${a.estimatedMinutes} 分钟` : "无需时间"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="today-zone__secondary">
        {plan.inputsSnapshot.speakingIdleDays != null &&
          plan.inputsSnapshot.speakingIdleDays >= 2 && (
            <span>口语 · {plan.inputsSnapshot.speakingIdleDays} 天没练</span>
          )}
        {plan.dailyBudgetMinutes > 0 && <span>今日预算 {plan.dailyBudgetMinutes} 分钟</span>}
        {plan.inputsSnapshot.weeklyProgress < 1 && (
          <span>本周进度 {Math.round(plan.inputsSnapshot.weeklyProgress * 100)}%</span>
        )}
      </div>
    </section>
  );
}
