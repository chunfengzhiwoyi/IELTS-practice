"use client";

import { useEffect, useState } from "react";
import {
  computeStreak,
  computeWeeklyReviewAccuracy,
  getLearnedCount,
} from "@/lib/client/progress";

export function ProgressBand() {
  const [learned, setLearned] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    setLearned(getLearnedCount());
    setAccuracy(computeWeeklyReviewAccuracy());
    setStreak(computeStreak());
  }, []);

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
            {accuracy === null ? "—" : `${accuracy}%`}
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
