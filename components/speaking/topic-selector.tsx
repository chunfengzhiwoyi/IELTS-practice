"use client";
/**
 * AI Speaking Coach — 题型选择
 * -------------------------------------------------------
 * Coach 风格：标题 + 三个精致 Part 卡片
 * Props 不变：onSelect
 */
import type { SpeakingPart } from "@/lib/speaking/types";

interface Props {
  onSelect: (part: SpeakingPart, questionId?: string) => void;
}

const PARTS: Array<{ part: SpeakingPart; label: string; desc: string; hint: string }> = [
  { part: "P1", label: "Part 1", desc: "日常话题简答", hint: "40–80 words · 1–2 min" },
  { part: "P2", label: "Part 2", desc: "独白描述", hint: "100–200 words · 2 min" },
  { part: "P3", label: "Part 3", desc: "深入讨论", hint: "80–150 words · 2–3 min" },
];

export function TopicSelector({ onSelect }: Props) {
  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="text-center space-y-2">
        <h2 className="text-xl font-medium text-ink">IELTS Speaking Coach</h2>
        <p className="text-sm text-ink-soft">选择一个题型开始模拟练习</p>
      </div>

      {/* Part 卡片 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {PARTS.map((p) => (
          <button
            key={p.part}
            onClick={() => onSelect(p.part)}
            className="group rounded-xl border border-ink/8 bg-white p-5 text-left shadow-sm transition hover:border-accent/40 hover:shadow-md"
          >
            <span className="inline-flex items-center rounded-md bg-accent/8 px-2 py-0.5 text-xs font-semibold text-accent">
              {p.label}
            </span>
            <p className="mt-3 text-sm font-medium text-ink group-hover:text-accent transition">
              {p.desc}
            </p>
            <p className="mt-1 text-xs text-ink-meta">{p.hint}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
