"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TodayPlan } from "@/lib/planner/planner-v1";
import { TodayPlanView } from "@/components/home/today-plan-view";

/**
 * TodayZone — 首页今日区域（PRODUCT-LOOP-02B）
 * 数据来自服务端 /api/today（服务端读取 Goal + 学习状态 + Speaking + Ability 后调用 Planner）。
 * 前端只渲染 planner 输出，不重新实现决策规则，不重新排序。
 * 旧逻辑（dueCount>0 → 复习，否则学新）已由 Planner 输出替代。
 */
export function TodayZone() {
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/today")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`today ${r.status}`))))
      .then((data: TodayPlan) => {
        if (!cancelled) setPlan(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (plan) return <TodayPlanView plan={plan} />;

  return (
    <section className="today-zone" aria-labelledby="today-title">
      <p className="section-label">今日安排</p>
      <h2 id="today-title" className="today-zone__title">
        {failed ? "今日计划暂不可用" : "正在计算今日安排…"}
      </h2>
      <p className="today-zone__sub">
        {failed
          ? "稍后再来看看今天该做什么。"
          : "结合你的目标、复习进度与口语状态生成。"}
      </p>
      {failed ? (
        <Link href="/review" className="btn btn--primary">
          去复习 →
        </Link>
      ) : null}
    </section>
  );
}
