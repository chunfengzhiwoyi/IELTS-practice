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
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="term-input" className="font-ui text-sm font-medium text-ink-soft">
        新词 / 语块
      </label>
      <div className="flex gap-2">
        <input
          id="term-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例如：sustainable"
          className="field-input"
          disabled={disabled}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="btn btn--primary"
        >
          查词
        </button>
      </div>
    </form>
  );
}
