"use client";
/**
 * AI Speaking Coach — 回答输入组件
 * -------------------------------------------------------
 * Segmented tab 切换文字/语音模式
 * 文字模式：练习空间风格 textarea + word count
 * 语音模式：嵌入 AudioRecorder（AI Listening 风格）
 *
 * Props 不变：question, questionZh, part, topic, onSubmit, label
 */
import { useState } from "react";
import type { SpeakingPart } from "@/lib/speaking/types";
import type { AudioMetadata } from "@/lib/speaking/audio-types";
import { AudioRecorder } from "@/components/speaking/audio-recorder";

type InputMode = "text" | "voice";

interface Props {
  question: string;
  questionZh: string;
  part: SpeakingPart;
  topic: string;
  onSubmit: (answer: string, audioMetadata?: AudioMetadata) => void;
  label: string;
}

export function AnswerInput({ question, questionZh, part, topic, onSubmit, label }: Props) {
  const [mode, setMode] = useState<InputMode>("text");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [_audioUrl, setAudioUrl] = useState<string | null>(null);
  const [_lastAudioMetadata, setLastAudioMetadata] = useState<AudioMetadata | null>(null);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    onSubmit(answer.trim());
  };

  const handleRecordingComplete = (blob: Blob, objectUrl: string) => {
    setAudioBlob(blob);
    setAudioUrl(objectUrl);
  };

  const handleVoiceSubmit = async () => {
    if (!audioBlob) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const res = await fetch("/api/speaking/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "转写失败" } }));
        alert(err?.error?.message ?? "语音转文字失败，请重试或使用文字回答。");
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      const transcript: string = data.transcript ?? "";

      if (!transcript.trim()) {
        alert("未检测到有效语音内容，请重新录制。");
        setSubmitting(false);
        return;
      }

      setLastAudioMetadata(data.audioMetadata ?? null);
      onSubmit(transcript.trim(), data.audioMetadata ?? undefined);
    } catch {
      alert("网络错误，请重试。");
      setSubmitting(false);
    }
  };

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* ─── 题目卡片 ─── */}
      <div className="rounded-xl border border-ink/8 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-ink-meta">
          <span className="inline-flex items-center rounded-md bg-accent/8 px-2 py-0.5 font-medium text-accent">
            {part}
          </span>
          <span className="text-ink-meta">{topic}</span>
        </div>
        <p className="mt-3 text-lg font-medium leading-relaxed text-ink">{question}</p>
        <p className="mt-1.5 text-sm text-ink-soft">{questionZh}</p>
      </div>

      {/* ─── 回答方式 ─── */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-ink-meta uppercase tracking-wide">回答方式</p>
        <div className="inline-flex rounded-lg border border-ink/10 bg-surface-raised p-0.5">
          <button
            type="button"
            onClick={() => setMode("text")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              mode === "text"
                ? "bg-white text-ink shadow-sm"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            ✍️ 文字回答
          </button>
          <button
            type="button"
            onClick={() => setMode("voice")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              mode === "voice"
                ? "bg-white text-ink shadow-sm"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            🎙️ 语音回答
          </button>
        </div>
      </div>

      {/* ─── 文字模式 ─── */}
      {mode === "text" && (
        <form onSubmit={handleTextSubmit} className="space-y-3">
          <div className="rounded-xl border border-ink/8 bg-white p-4 shadow-sm focus-within:border-accent/40 transition">
            <label className="block text-xs font-medium text-ink-meta mb-2">{label}</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              disabled={submitting}
              className="w-full resize-none bg-transparent text-ink text-[15px] leading-relaxed placeholder:text-ink-meta/50 focus:outline-none"
              placeholder="Start your answer in English..."
            />
            <div className="mt-2 flex items-center justify-between border-t border-ink/5 pt-2">
              <span className="font-mono text-xs text-ink-meta tabular-nums">
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </span>
              {wordCount > 0 && wordCount < 20 && (
                <span className="text-xs text-amber-600">建议 30+ 词</span>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting || !answer.trim()}
            aria-busy={submitting}
            className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-50"
          >
            {submitting ? "AI 分析中…" : "提交 AI 分析"}
          </button>
        </form>
      )}

      {/* ─── 语音模式 ─── */}
      {mode === "voice" && (
        <div className="rounded-xl border border-ink/8 bg-white shadow-sm overflow-hidden">
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            disabled={submitting}
          />
          {audioBlob && (
            <div className="border-t border-ink/5 px-5 py-3">
              <button
                type="button"
                onClick={handleVoiceSubmit}
                disabled={submitting}
                className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-50"
              >
                {submitting ? "AI 识别中…" : "提交 AI 分析"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
