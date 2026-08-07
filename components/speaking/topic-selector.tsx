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
      <p className="text-sm text-slate-600">选择一个题型开始练习：</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {PARTS.map((p) => (
          <button
            key={p.part}
            onClick={() => onSelect(p.part)}
            className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-500 hover:shadow-md"
          >
            <div className="font-medium text-slate-900">{p.label}</div>
            <div className="mt-1 text-xs text-slate-500">{p.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
