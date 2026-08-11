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
      <div className="note">
        <div className="flex items-center gap-2 font-ui text-xs text-ink-meta">
          <span className="pill">{part}</span>
          <span>{topic}</span>
        </div>
        <p className="mt-2 text-base font-medium text-ink">{question}</p>
        <p className="mt-1 text-sm text-ink-soft">{questionZh}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="font-ui text-sm font-medium text-ink-soft">{label}</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={6}
            disabled={submitting}
            className="field-input mt-1"
            placeholder="用英文回答..."
          />
          <div className="mt-1 font-ui text-xs text-ink-meta">{wordCount} 词</div>
        </div>
        <button
          type="submit"
          disabled={submitting || !answer.trim()}
          className="btn btn--primary"
        >
          {submitting ? "分析中…" : "提交回答"}
        </button>
      </form>
    </div>
  );
}
