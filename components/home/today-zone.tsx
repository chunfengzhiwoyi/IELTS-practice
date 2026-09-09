"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * M1: Single Source of Truth
 * 今日区域数据从服务端 /api/learning/stats 获取。
 * 前端不再从 localStorage 计算到期数和口语闲置天数。
 */

interface Stats {
  learnedCount: number;
  dueCount: number;
  weeklyAccuracy: number | null;
  streak: number;
  speakingIdleDays: number | null;
}

export function TodayZone() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/learning/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => setStats({ learnedCount: 0, dueCount: 0, weeklyAccuracy: null, streak: 0, speakingIdleDays: null }));
  }, []);

  const due = stats?.dueCount ?? 0;
  const hasDue = due > 0;
  const minutes = due > 0 ? Math.max(1, Math.ceil(due * 0.5)) : 1;
  const speakingIdleDays = stats?.speakingIdleDays;

  return (
    <section className="today-zone" aria-labelledby="today-title">
      <p className="section-label">今日复习</p>

      <h2 id="today-title" className="today-zone__title">
        {hasDue ? "继续复习" : "学一个新表达"}
      </h2>

      <p className="today-zone__sub">
        {hasDue
          ? `今日 ${due} 个到期词汇 · 约 ${minutes} 分钟`
          : "今天暂时没有需要复习的内容，换个新表达保持节奏。"}
      </p>

      {hasDue ? (
        <Link href="/review" className="btn btn--primary">
          开始复习 →
        </Link>
      ) : (
        <Link href="/learn" className="btn btn--primary">
          学习新表达 →
        </Link>
      )}

      <div className="today-zone__secondary">
        {speakingIdleDays != null && speakingIdleDays >= 2 && (
          <span>口语 · {speakingIdleDays} 天没练</span>
        )}
        {stats?.streak ? <span>连续 {stats.streak} 天</span> : null}
      </div>
    </section>
  );
}
