"use client";

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
      // 调用 STT API
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

      // 保存 audioMetadata 供后续 fluency 分析使用（Phase 3）
      setLastAudioMetadata(data.audioMetadata ?? null);

      // 提交文本 + audioMetadata 进入分析流程
      onSubmit(transcript.trim(), data.audioMetadata ?? undefined);
    } catch {
      alert("网络错误，请重试。");
      setSubmitting(false);
    }
  };

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* 题目卡片 */}
      <div className="note">
        <div className="flex items-center gap-2 font-ui text-xs text-ink-meta">
          <span className="pill">{part}</span>
          <span>{topic}</span>
        </div>
        <p className="mt-2 text-base font-medium text-ink">{question}</p>
        <p className="mt-1 text-sm text-ink-soft">{questionZh}</p>
      </div>

      {/* 输入模式切换 */}
      <div className="flex gap-1 rounded-lg bg-surface-raised p-1">
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
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
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === "voice"
              ? "bg-white text-ink shadow-sm"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          🎙️ 语音回答
        </button>
      </div>

      {/* 文字模式 */}
      {mode === "text" && (
        <form onSubmit={handleTextSubmit} className="space-y-3">
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
            aria-busy={submitting}
            className="btn btn--primary"
          >
            {submitting ? "分析中…" : "提交回答"}
          </button>
        </form>
      )}

      {/* 语音模式 */}
      {mode === "voice" && (
        <div className="space-y-4">
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            disabled={submitting}
          />
          {audioBlob && (
            <button
              type="button"
              onClick={handleVoiceSubmit}
              disabled={submitting}
              className="btn btn--primary w-full"
            >
              {submitting ? "正在识别…" : "提交录音"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
