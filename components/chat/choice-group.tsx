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
          className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm text-ink-soft transition hover:border-accent hover:text-accent"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
