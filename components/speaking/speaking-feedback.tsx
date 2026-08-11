"use client";

import Link from "next/link";
import type { SpeakingAnalysisResult, SpeakingPart } from "@/lib/speaking/types";

interface Props {
  analysis: SpeakingAnalysisResult;
  isSecondAnswer: boolean;
  onViewDrill?: () => void;
  onTryAgain?: () => void;
  onFinish: () => void;
  nextPart?: SpeakingPart;
  onContinuePart?: () => void;
}

export function SpeakingFeedback({ analysis, isSecondAnswer, onViewDrill, onTryAgain, onFinish, nextPart, onContinuePart }: Props) {
  const issueClass = analysis.mainIssue.severity === "major"
    ? "feedback-card feedback-card--warn"
    : "feedback-card feedback-card--good";

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="note note--accent">
        <h3 className="font-display text-base text-ink">分析结果</h3>
        <p className="mt-1 text-ink-soft">{analysis.summary}</p>
        <div className="mt-2 flex gap-3 font-ui text-xs text-ink-meta">
          <span>{analysis.metrics.wordCount} 词</span>
          <span>{analysis.metrics.sentenceCount} 句</span>
          <span>{analysis.metrics.connectorCount} 个连接词</span>
        </div>
      </div>

      {/* Main Issue */}
      <div className={issueClass}>
        <div className="flex items-center gap-2">
          <span className="pill">{analysis.mainIssue.dimension}</span>
          <span className="pill">{analysis.mainIssue.severity === "major" ? "主要问题" : "可优化"}</span>
        </div>
        <p className="mt-2 text-ink-soft">{analysis.mainIssue.description}</p>
        <p className="mt-1 font-medium text-ink">{analysis.mainIssue.suggestion}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!isSecondAnswer && onViewDrill && (
          <button onClick={onViewDrill} className="btn btn--ghost">查看微训练</button>
        )}
        {!isSecondAnswer && onTryAgain && (
          <button onClick={onTryAgain} className="btn btn--ghost">重新回答</button>
        )}
        {!isSecondAnswer && nextPart && onContinuePart && (
          <button onClick={onContinuePart} className="btn btn--primary">继续 {nextPart} →</button>
        )}
        <button onClick={onFinish} className="btn btn--quiet">
          {isSecondAnswer ? "完成" : "跳过重答，结束"}
        </button>
        <Link href="/" className="btn btn--quiet">返回主页</Link>
      </div>
    </div>
  );
}
