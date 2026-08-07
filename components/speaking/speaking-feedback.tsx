"use client";

import type { SpeakingAnalysisResult } from "@/lib/speaking/types";

interface Props {
  analysis: SpeakingAnalysisResult;
  isSecondAnswer: boolean;
  onViewDrill?: () => void;
  onTryAgain?: () => void;
  onFinish: () => void;
}

export function SpeakingFeedback({ analysis, isSecondAnswer, onViewDrill, onTryAgain, onFinish }: Props) {
  const mainColor = analysis.mainIssue.severity === "major"
    ? "border-amber-200 bg-amber-50"
    : "border-emerald-200 bg-emerald-50";

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">分析结果</h3>
        <p className="mt-1 text-sm text-slate-600">{analysis.summary}</p>
        <div className="mt-2 flex gap-3 text-xs text-slate-500">
          <span>{analysis.metrics.wordCount} 词</span>
          <span>{analysis.metrics.sentenceCount} 句</span>
          <span>{analysis.metrics.connectorCount} 个连接词</span>
        </div>
      </div>

      {/* Main Issue */}
      <div className={`rounded-lg border p-4 ${mainColor}`}>
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/70 px-2 py-0.5 text-xs font-medium">
            {analysis.mainIssue.dimension}
          </span>
          <span className="rounded bg-white/70 px-2 py-0.5 text-xs">
            {analysis.mainIssue.severity === "major" ? "主要问题" : "可优化"}
          </span>
        </div>
        <p className="mt-2 text-sm">{analysis.mainIssue.description}</p>
        <p className="mt-1 text-sm font-medium">{analysis.mainIssue.suggestion}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!isSecondAnswer && onViewDrill && (
          <button onClick={onViewDrill} className="rounded-md border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">
            查看微训练
          </button>
        )}
        {!isSecondAnswer && onTryAgain && (
          <button onClick={onTryAgain} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            重新回答
          </button>
        )}
        <button onClick={onFinish} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          {isSecondAnswer ? "完成" : "跳过重答，结束"}
        </button>
      </div>
    </div>
  );
}
