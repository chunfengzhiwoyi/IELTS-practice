"use client";

import { useState } from "react";

interface Props {
  onSubmit: (term: string) => void;
  disabled?: boolean;
}

export function TermInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSubmit(trimmed);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="输入单词或语块，例如：sustainable"
        className="field-input"
        disabled={disabled}
        aria-label="输入要学习的单词或语块"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="btn btn--primary"
      >
        查词
      </button>
    </form>
  );
}
