"use client";

import Link from "next/link";
import type { LearnSubmitResponse } from "@/lib/learning/types";

interface Props {
  result: LearnSubmitResponse;
  onContinue: () => void;
}

export function LearningResult({ result, onContinue }: Props) {
  const colorMap: Record<string, string> = {
    INDEPENDENT: "border-emerald-200 bg-emerald-50 text-emerald-900",
    HINTED: "border-amber-200 bg-amber-50 text-amber-900",
    FAIL: "border-rose-200 bg-rose-50 text-rose-900",
    SKIPPED: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const color = colorMap[result.correctness] ?? colorMap.FAIL;
  const reviewDate = new Date(result.nextReviewAt);
  const hoursUntil = Math.round((reviewDate.getTime() - Date.now()) / (1000 * 60 * 60));

  return (
    <div className={`mt-4 rounded-lg border p-4 ${color}`}>
      <div className="flex items-center gap-2">
        <span className="rounded bg-white/70 px-2 py-0.5 text-xs font-medium">
          {result.correctness}
        </span>
        <span className="rounded bg-white/70 px-2 py-0.5 text-xs">
          状态: {result.status}
        </span>
      </div>
      <p className="mt-2 text-sm">{result.feedback}</p>
      <div className="mt-3 text-xs text-slate-600">
        下次复习：约 {hoursUntil} 小时后（{reviewDate.toLocaleString("zh-CN")}）
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={onContinue}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          继续学习下一个
        </button>
        <Link
          href={`/review?itemId=${result.state.itemId}`}
          className="rounded-md border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 shadow-sm transition hover:bg-brand-100"
        >
          立即巩固
        </Link>
      </div>
    </div>
  );
}
