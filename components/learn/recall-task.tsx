"use client";

import { useState } from "react";

interface Props {
  prompt: string;
  disabled?: boolean;
  onSubmit: (answer: string) => void;
}

export function RecallTask({ prompt, disabled, onSubmit }: Props) {
  const [answer, setAnswer] = useState("");

  const submit = () => {
    if (answer.trim() && !disabled) onSubmit(answer.trim());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <form onSubmit={handleSubmit} className="panel">
      <div className="font-ui text-sm font-medium text-ink" id="recall-prompt">{prompt}</div>
      <label htmlFor="recall-answer" className="mt-3 block font-ui text-sm font-medium text-ink-soft">
        你的回答
      </label>
      <textarea
        id="recall-answer"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        disabled={disabled}
        className="field-input mt-1"
        placeholder="输入你的回答…"
        aria-describedby="recall-prompt"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
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
