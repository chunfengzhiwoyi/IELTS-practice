"use client";

import { useEffect, useState } from "react";

/**
 * M1: Single Source of Truth
 * 进度带数据从服务端 /api/learning/stats 获取。
 * 前端不再从 localStorage 计算已学数、正确率、连续天数。
 */

interface Stats {
  learnedCount: number;
  dueCount: number;
  weeklyAccuracy: number | null;
  streak: number;
  speakingIdleDays: number | null;
}

export function ProgressBand() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/learning/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => setStats({ learnedCount: 0, dueCount: 0, weeklyAccuracy: null, streak: 0, speakingIdleDays: null }));
  }, []);

  const learned = stats?.learnedCount;
  const accuracy = stats?.weeklyAccuracy;
  const streak = stats?.streak;

  return (
    <section aria-labelledby="progress-label">
      <p id="progress-label" className="section-label">
        进度带
      </p>
      <div className="progress-band">
        <div className="stat">
          <div className="stat__num">{learned ?? "—"}</div>
          <div className="stat__label">已学表达</div>
        </div>
        <div className="stat">
          <div className="stat__num">
            {accuracy === null || accuracy === undefined ? "—" : `${accuracy}%`}
          </div>
          <div className="stat__label">本周复习正确率</div>
        </div>
        <div className="stat">
          <div className="stat__num">{streak ?? "—"}</div>
          <div className="stat__label">连续天数</div>
        </div>
      </div>
    </section>
  );
}
