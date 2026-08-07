"use client";

import { useState } from "react";

interface Props {
  prompt: string;
  disabled?: boolean;
  onSubmit: (answer: string) => void;
}

export function RecallTask({ prompt, disabled, onSubmit }: Props) {
  const [answer, setAnswer] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim() && !disabled) {
      onSubmit(answer.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="text-sm font-medium text-blue-800">{prompt}</div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        disabled={disabled}
        className="mt-2 w-full resize-none rounded-md border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100"
        placeholder="输入你的回答..."
        aria-label="回忆答案"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={disabled || !answer.trim()}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          提交
        </button>
      </div>
    </form>
  );
}
