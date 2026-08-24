"use client";
/**
 * AI Speaking Coach — Micro Drill Card
 * -------------------------------------------------------
 * 立即练习卡片：目标 + 任务 + 示例 + 行动按钮
 * Props 不变
 */
import type { MicroDrill } from "@/lib/speaking/types";

interface Props {
  drill: MicroDrill;
  onTryAgain: () => void;
  onFinish: () => void;
}

export function MicroDrillCard({ drill, onTryAgain, onFinish }: Props) {
  return (
    <div className="rounded-xl border border-ink/8 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-accent/5 border-b border-accent/10 px-5 py-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-medium text-ink">立即练习</h3>
          <p className="text-xs text-ink-meta">针对你的主要问题设计的微训练</p>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {/* Task */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-ink-meta uppercase tracking-wide">练习任务</p>
          <p className="text-sm leading-relaxed text-ink">{drill.prompt}</p>
        </div>

        {/* Example */}
        <div className="rounded-lg bg-surface-raised border border-ink/5 p-3.5 space-y-1.5">
          <p className="text-xs font-medium text-ink-meta">参考示例</p>
          <p className="text-sm italic text-ink-soft leading-relaxed">&ldquo;{drill.exampleImprovement}&rdquo;</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onTryAgain}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90"
          >
            开始重答
          </button>
          <button
            onClick={onFinish}
            className="rounded-lg border border-ink/10 px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:text-ink hover:bg-surface-raised"
          >
            跳过，结束
          </button>
        </div>
      </div>
    </div>
  );
}
