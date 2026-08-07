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
        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        disabled={disabled}
        aria-label="输入要学习的单词或语块"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        查词
      </button>
    </form>
  );
}
