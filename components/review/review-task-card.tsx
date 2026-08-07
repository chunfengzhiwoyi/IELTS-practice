"use client";

import { useState } from "react";

interface Props {
  term: string;
  prompt: string;
  onSubmit: (answer: string, usedHint: boolean) => void;
  onSkip: () => void;
  disabled?: boolean;
}

export function ReviewTaskCard({ term, prompt, onSubmit, onSkip, disabled }: Props) {
  const [answer, setAnswer] = useState("");
  const [hintRevealed, setHintRevealed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || disabled) return;
    onSubmit(answer.trim(), hintRevealed);
  };

  const handleRevealHint = () => {
    setHintRevealed(true);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-center">
        <h3 className="text-2xl font-bold text-slate-900">{term}</h3>
        <p className="mt-2 text-sm text-slate-600">{prompt}</p>
      </div>

      {hintRevealed && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
          提示已显示（本次回忆将计为&ldquo;借助提示&rdquo;）
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="输入你的答案..."
          disabled={disabled}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
          autoFocus
        />

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleRevealHint}
            disabled={disabled || hintRevealed}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {hintRevealed ? "提示已显示" : "显示提示"}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSkip}
              disabled={disabled}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              跳过
            </button>
            <button
              type="submit"
              disabled={disabled || !answer.trim()}
              className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
            >
              提交
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
