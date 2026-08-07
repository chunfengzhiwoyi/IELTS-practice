"use client";

import type { ChoiceOption } from "@/lib/agent/chat-schema";

interface Props {
  options: ChoiceOption[];
  onSelect: (message: string) => void;
}

export function ChoiceGroup({ options, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => onSelect(opt.message)}
          className="rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-sm text-brand-700 shadow-sm transition hover:bg-brand-50 hover:border-brand-400"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
