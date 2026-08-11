"use client";

import Link from "next/link";
import type { LearnSubmitResponse } from "@/lib/learning/types";

interface Props {
  result: LearnSubmitResponse;
  onContinue: () => void;
}

const TONE: Record<string, "good" | "warn" | "bad" | "muted"> = {
  INDEPENDENT: "good",
  HINTED: "warn",
  FAIL: "bad",
  SKIPPED: "muted",
};

const LABEL: Record<string, string> = {
  INDEPENDENT: "独立回忆",
  HINTED: "借助提示",
  FAIL: "未想起",
  SKIPPED: "跳过",
};

export function LearningResult({ result, onContinue }: Props) {
  const tone = TONE[result.correctness] ?? "bad";
  const reviewDate = new Date(result.nextReviewAt);
  const hoursUntil = Math.round((reviewDate.getTime() - Date.now()) / (1000 * 60 * 60));

  return (
    <div className={`feedback-card feedback-card--${tone}`}>
      <div className="flex items-center gap-2">
        <span className="pill pill--accent">{LABEL[result.correctness] ?? result.correctness}</span>
        <span className="pill">状态: {result.status}</span>
      </div>
      <p className="feedback-card__body">{result.feedback}</p>
      <div className="mt-3 font-ui text-xs text-ink-meta">
        下次复习：约 {hoursUntil} 小时后（{reviewDate.toLocaleString("zh-CN")}）
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onContinue}
          className="btn btn--ghost"
        >
          继续学习下一个
        </button>
        <Link
          href={`/review?itemId=${result.state.itemId}`}
          className="btn btn--quiet"
        >
          立即巩固
        </Link>
        <Link href="/" className="btn btn--quiet">返回主页</Link>
      </div>
    </div>
  );
}
