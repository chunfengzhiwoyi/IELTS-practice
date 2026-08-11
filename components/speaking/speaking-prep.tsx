"use client";

import type { SpeakingQuestion } from "@/lib/speaking/types";

interface Props {
  question: SpeakingQuestion;
  onStart: () => void;
}

const DIM_LABELS: Record<string, string> = {
  fluency: "表达流畅度",
  vocabulary: "词汇运用",
  coherence: "衔接连贯",
  development: "内容展开",
  argumentation: "论证逻辑",
};

export function SpeakingPrep({ question, onStart }: Props) {
  const { part, topic, question: q, questionZh, expectedLength, keyTopicWords, goodConnectors, followUps } = question;
  const words = expectedLength?.ideal ?? 0;

  return (
    <div className="space-y-4">
      <div className="note note--accent">
        <div className="flex items-center gap-2 font-ui text-xs text-ink-meta">
          <span className="pill">{part}</span>
          <span>{topic}</span>
        </div>
        <p className="mt-2 text-base font-medium text-ink">{q}</p>
        <p className="mt-1 text-sm text-ink-soft">{questionZh}</p>
      </div>

      {/* 准备提示 */}
      <div className="prep-timer">
        <span className="prep-timer__dot" aria-hidden />
        <span>
          你有约 1 分钟准备。建议构思 <b>{words}</b> 词左右的回答（约 2 分钟），不必写完整句子。
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {keyTopicWords.length > 0 && (
          <div className="prep-block">
            <p className="prep-block__k">可以谈到的角度</p>
            <div className="flex flex-wrap gap-2">
              {keyTopicWords.map((k, i) => (
                <span key={i} className="pill">{k}</span>
              ))}
            </div>
          </div>
        )}
        {goodConnectors.length > 0 && (
          <div className="prep-block">
            <p className="prep-block__k">可用连接词</p>
            <div className="flex flex-wrap gap-2">
              {goodConnectors.map((c, i) => (
                <span key={i} className="pill pill--accent">{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {followUps.length > 0 && (
        <div className="prep-block">
          <p className="prep-block__k">可能的追问</p>
          <ul className="prep-followups">
            {followUps.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {question.dimensions.length > 0 && (
        <p className="text-xs font-ui text-ink-meta">
          评分侧重：{question.dimensions.map((d) => DIM_LABELS[d] ?? d).join(" · ")}
        </p>
      )}

      <button onClick={onStart} className="btn btn--primary w-full">
        开始作答 →
      </button>
    </div>
  );
}
