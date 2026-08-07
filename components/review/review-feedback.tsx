"use client";

import type { ReviewResult } from "@/lib/review/answer-judge";

interface Props {
  result: ReviewResult;
  feedback: string;
  nextReviewAt: string;
  onNext: () => void;
}

const colorMap: Record<ReviewResult, string> = {
  CORRECT_INDEPENDENT: "border-emerald-200 bg-emerald-50 text-emerald-900",
  CORRECT_WITH_HINT: "border-amber-200 bg-amber-50 text-amber-900",
  INCORRECT: "border-rose-200 bg-rose-50 text-rose-900",
  SKIPPED: "border-slate-200 bg-slate-50 text-slate-700",
};

const labelMap: Record<ReviewResult, string> = {
  CORRECT_INDEPENDENT: "独立正确",
  CORRECT_WITH_HINT: "提示后正确",
  INCORRECT: "未通过",
  SKIPPED: "已跳过",
};

export function ReviewFeedback({ result, feedback, nextReviewAt, onNext }: Props) {
  const color = colorMap[result];
  const reviewDate = new Date(nextReviewAt);
  const hoursUntil = Math.max(1, Math.round((reviewDate.getTime() - Date.now()) / (1000 * 60 * 60)));

  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="flex items-center gap-2">
        <span className="rounded bg-white/70 px-2 py-0.5 text-xs font-medium">
          {labelMap[result]}
        </span>
      </div>
      <p className="mt-2 text-sm">{feedback}</p>
      <div className="mt-3 text-xs text-slate-600">
        下次复习：约 {hoursUntil} 小时后
      </div>
      <button
        onClick={onNext}
        className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        下一题
      </button>
    </div>
  );
}
