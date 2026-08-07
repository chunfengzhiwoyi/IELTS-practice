"use client";

import { useState, useRef } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="告诉我今天想练什么…"
          className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
          aria-label="输入消息"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:bg-slate-300"
          aria-label="发送"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.114A28.897 28.897 0 003.105 2.289z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
