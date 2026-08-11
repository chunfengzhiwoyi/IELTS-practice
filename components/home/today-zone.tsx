"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getItem } from "@/lib/client/storage";
import type { UserItemState } from "@/lib/learning/types";
import type { SpeakingSession } from "@/lib/speaking/types";

export function TodayZone() {
  const [due, setDue] = useState<number | null>(null);
  const [speakingIdleDays, setSpeakingIdleDays] = useState<number | null>(null);

  useEffect(() => {
    const states = getItem<Record<string, UserItemState>>("states") ?? {};
    const now = new Date().toISOString();
    const dueCount = Object.values(states).filter((s) => s.nextReviewAt <= now).length;
    setDue(dueCount);

    const sessions = getItem<SpeakingSession[]>("speaking_sessions") ?? [];
    if (sessions.length > 0) {
      const last = sessions
        .map((s) => new Date(s.updatedAt).getTime())
        .sort((a, b) => b - a)[0]!;
      const days = Math.floor((Date.now() - last) / 86400000);
      setSpeakingIdleDays(days);
    }
  }, []);

  const hasDue = due !== null && due > 0;
  const minutes = due !== null ? Math.max(1, Math.ceil(due * 0.5)) : 1;

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
        {speakingIdleDays !== null && speakingIdleDays >= 2 && (
          <span>
            口语 · {speakingIdleDays} 天没练
          </span>
        )}
        <Link href="/report">查看学习报告 →</Link>
      </div>
    </section>
  );
}
