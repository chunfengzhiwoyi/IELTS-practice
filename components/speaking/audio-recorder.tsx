"use client";
/**
 * AI Speaking Coach — 录音组件
 * -------------------------------------------------------
 * 三态：idle → recording → stopped
 * 视觉风格：AI Listening（呼吸动画 + 简洁状态文案）
 *
 * Props 不变：onRecordingComplete, onTranscriptionReady, disabled
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAudioRecorder,
  formatDuration,
  type AudioRecorderHandle,
  type RecorderState,
} from "@/lib/client/audio-utils";
import { AudioPlayer } from "@/components/speaking/audio-player";

interface Props {
  onRecordingComplete?: (blob: Blob, objectUrl: string) => void;
  onTranscriptionReady?: (text: string) => void;
  disabled?: boolean;
}

export function AudioRecorder({ onRecordingComplete, disabled }: Props) {
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const [recState, setRecState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    recorderRef.current = createAudioRecorder(
      (s) => setRecState(s),
      (t) => setElapsed(t),
    );
    return () => { recorderRef.current?.reset(); };
  }, []);

  useEffect(() => {
    if (recState === "stopped") {
      const blob = recorderRef.current?.getBlob();
      const url = recorderRef.current?.getObjectUrl();
      if (blob && url) {
        setObjectUrl(url);
        onRecordingComplete?.(blob, url);
      }
    }
  }, [recState, onRecordingComplete]);

  const handleStart = useCallback(async () => {
    setError(null);
    setObjectUrl(null);
    try {
      await recorderRef.current?.start();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("请允许浏览器使用麦克风权限。");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setError("未检测到麦克风设备。");
      } else {
        setError("录音启动失败，请检查设备。");
      }
    }
  }, []);

  const handleStop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const handleReset = useCallback(() => {
    recorderRef.current?.reset();
    setObjectUrl(null);
    setElapsed(0);
    setError(null);
  }, []);

  // ─── Error ─────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm text-ink-soft text-center max-w-[240px]">{error}</p>
        <button type="button" onClick={handleReset} className="text-sm font-medium text-accent hover:underline">
          重试
        </button>
      </div>
    );
  }

  // ─── Idle ──────────────────────────────────────────────
  if (recState === "idle") {
    return (
      <div className="flex flex-col items-center gap-5 py-8">
        <div className="relative flex h-20 w-20 items-center justify-center">
          {/* 静态外圈 */}
          <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
          <svg className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-ink">准备开始你的回答</p>
          <p className="text-xs text-ink-meta">AI 会根据 IELTS 标准分析你的表现</p>
        </div>
        <button
          type="button"
          onClick={handleStart}
          disabled={disabled}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-50"
          aria-label="开始录音"
        >
          开始录音
        </button>
      </div>
    );
  }

  // ─── Recording ─────────────────────────────────────────
  if (recState === "recording") {
    return (
      <div className="flex flex-col items-center gap-5 py-8">
        <div className="relative flex h-20 w-20 items-center justify-center">
          {/* 呼吸波纹动画 */}
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/10" />
          <span className="absolute inset-2 animate-pulse rounded-full bg-accent/15" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-ink">正在聆听你的回答</p>
          <p className="font-mono text-lg text-accent tabular-nums">{formatDuration(elapsed)}</p>
        </div>
        {/* 声波示意 */}
        <div className="flex items-end gap-0.5 h-5" aria-hidden>
          {[...Array(12)].map((_, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-accent/60 animate-pulse"
              style={{
                height: `${8 + Math.sin(i * 0.8) * 8 + 4}px`,
                animationDelay: `${i * 0.08}s`,
                animationDuration: `${0.6 + Math.random() * 0.4}s`,
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={handleStop}
          className="rounded-full border border-accent bg-white px-6 py-2.5 text-sm font-medium text-accent shadow-sm transition hover:bg-accent/5"
          aria-label="结束录音"
        >
          结束回答
        </button>
      </div>
    );
  }

  // ─── Stopped ───────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink">回答完成 · {formatDuration(elapsed)}</p>
      {objectUrl && <AudioPlayer src={objectUrl} />}
      <button
        type="button"
        onClick={handleReset}
        className="text-sm font-medium text-ink-soft hover:text-ink transition"
      >
        重新录制
      </button>
    </div>
  );
}
