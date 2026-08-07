"use client";

import type { MicroDrill } from "@/lib/speaking/types";

interface Props {
  drill: MicroDrill;
  onTryAgain: () => void;
  onFinish: () => void;
}

export function MicroDrillCard({ drill, onTryAgain, onFinish }: Props) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
      <h3 className="text-sm font-semibold text-blue-800">微训练</h3>
      <p className="mt-2 text-sm text-blue-900">{drill.prompt}</p>
      <div className="mt-3 rounded-md bg-white p-3 text-sm text-slate-700">
        <div className="text-xs font-medium text-slate-500">参考改善示例</div>
        <p className="mt-1 italic">{drill.exampleImprovement}</p>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={onTryAgain} className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          尝试重答
        </button>
        <button onClick={onFinish} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          跳过，结束
        </button>
      </div>
    </div>
  );
}
