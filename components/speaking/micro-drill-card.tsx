"use client";

import type { MicroDrill } from "@/lib/speaking/types";

interface Props {
  drill: MicroDrill;
  onTryAgain: () => void;
  onFinish: () => void;
}

export function MicroDrillCard({ drill, onTryAgain, onFinish }: Props) {
  return (
    <div className="note note--accent">
      <h3 className="font-display text-base text-ink">微训练</h3>
      <p className="mt-2 text-ink-soft">{drill.prompt}</p>
      <div className="mt-3 rounded-md bg-paper-3 p-3">
        <div className="font-ui text-xs text-ink-meta">参考改善示例</div>
        <p className="mt-1 italic text-ink-soft">{drill.exampleImprovement}</p>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={onTryAgain} className="btn btn--primary">尝试重答</button>
        <button onClick={onFinish} className="btn btn--ghost">跳过，结束</button>
      </div>
    </div>
  );
}
