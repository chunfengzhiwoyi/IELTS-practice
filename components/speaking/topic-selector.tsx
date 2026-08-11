"use client";

import type { SpeakingPart } from "@/lib/speaking/types";

interface Props {
  onSelect: (part: SpeakingPart, questionId?: string) => void;
}

const PARTS: Array<{ part: SpeakingPart; label: string; desc: string }> = [
  { part: "P1", label: "Part 1", desc: "日常话题简答（40-80 词）" },
  { part: "P2", label: "Part 2", desc: "独白描述（100-200 词）" },
  { part: "P3", label: "Part 3", desc: "深入讨论（80-150 词）" },
];

export function TopicSelector({ onSelect }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">选择一个题型开始练习：</p>
      <div className="grid gap-0 sm:grid-cols-3">
        {PARTS.map((p, i) => (
          <button
            key={p.part}
            onClick={() => onSelect(p.part)}
            className="border-line bg-paper p-5 text-left transition hover:border-accent"
            style={{ borderTop: i === 0 ? "1.5px solid var(--line-strong)" : "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}
          >
            <div className="font-medium text-ink">{p.label}</div>
            <div className="mt-1 text-xs text-ink-meta">{p.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
