"use client";

import Link from "next/link";

export interface ReviewSessionStats {
  correct: number;
  hinted: number;
  incorrect: number;
  skipped: number;
  nextReviewTimes: string[];
}

interface Props {
  stats: ReviewSessionStats;
}

export function ReviewSummary({ stats }: Props) {
  const total = stats.correct + stats.hinted + stats.incorrect + stats.skipped;

  const nextReview = stats.nextReviewTimes.length > 0
    ? new Date(stats.nextReviewTimes.sort()[0]!)
    : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">复习完成</h2>
      <p className="mt-1 text-sm text-slate-600">本次共复习 {total} 个词条</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBlock label="独立正确" value={stats.correct} color="text-emerald-700 bg-emerald-50" />
        <StatBlock label="提示后正确" value={stats.hinted} color="text-amber-700 bg-amber-50" />
        <StatBlock label="未通过" value={stats.incorrect} color="text-rose-700 bg-rose-50" />
        <StatBlock label="跳过" value={stats.skipped} color="text-slate-700 bg-slate-50" />
      </div>

      {nextReview && (
        <div className="mt-4 text-xs text-slate-600">
          最近一次复习将在：{nextReview.toLocaleString("zh-CN")}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Link
          href="/learn"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          继续学习
        </Link>
        <Link
          href="/"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-md px-3 py-2 text-center ${color}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
