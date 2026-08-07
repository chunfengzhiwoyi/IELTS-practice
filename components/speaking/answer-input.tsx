"use client";

import { useState } from "react";
import type { SpeakingPart } from "@/lib/speaking/types";

interface Props {
  question: string;
  questionZh: string;
  part: SpeakingPart;
  topic: string;
  onSubmit: (answer: string) => void;
  label: string;
}

export function AnswerInput({ question, questionZh, part, topic, onSubmit, label }: Props) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    onSubmit(answer.trim());
  };

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5">{part}</span>
          <span>{topic}</span>
        </div>
        <p className="mt-2 text-base font-medium text-slate-900">{question}</p>
        <p className="mt-1 text-sm text-slate-500">{questionZh}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-sm font-medium text-slate-700">{label}</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={6}
            disabled={submitting}
            className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
            placeholder="用英文回答..."
          />
          <div className="mt-1 text-xs text-slate-400">{wordCount} 词</div>
        </div>
        <button
          type="submit"
          disabled={submitting || !answer.trim()}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? "分析中…" : "提交回答"}
        </button>
      </form>
    </div>
  );
}
