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
    <form onSubmit={handleSubmit} className="panel">
      <div className="font-ui text-sm font-medium text-ink">{prompt}</div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        disabled={disabled}
        className="field-input mt-3"
        placeholder="输入你的回答…"
        aria-label="回忆答案"
      />
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={disabled || !answer.trim()}
          className="btn btn--primary"
        >
          提交
        </button>
      </div>
    </form>
  );
}
