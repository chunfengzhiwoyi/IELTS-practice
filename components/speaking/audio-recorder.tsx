"use client";
/**
 * 麦克风录音组件
 * -------------------------------------------------------
 * 状态：idle → recording → stopped
 * stopped 后可试听、重录、或提交（Phase 2 调 STT）。
 * 
 * Props:
 *   onRecordingComplete(blob, objectUrl) — 录音结束时回调
 *   onTranscriptionReady(text) — Phase 2: STT 完成后回调（预留）
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
  /** 录音完成时回调（blob + objectUrl） */
  onRecordingComplete?: (blob: Blob, objectUrl: string) => void;
  /** Phase 2 预留：转写完成后回调文本 */
  onTranscriptionReady?: (text: string) => void;
  disabled?: boolean;
}

export function AudioRecorder({ onRecordingComplete, disabled }: Props) {
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const [recState, setRecState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 创建 recorder 实例
  useEffect(() => {
    recorderRef.current = createAudioRecorder(
      (s) => setRecState(s),
      (t) => setElapsed(t),
    );
    return () => { recorderRef.current?.reset(); };
  }, []);

  // 当录音停止后，通知父组件
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
        setError("请允许浏览器使用麦克风。");
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

  // --- Render ---

  if (error) {
    return (
      <div className="audio-rec audio-rec--error">
        <p className="audio-rec__error">{error}</p>
        <button type="button" onClick={handleReset} className="btn btn--ghost btn--sm">
          重试
        </button>
      </div>
    );
  }

  if (recState === "idle") {
    return (
      <div className="audio-rec audio-rec--idle">
        <button
          type="button"
          onClick={handleStart}
          disabled={disabled}
          className="btn btn--primary audio-rec__start"
          aria-label="开始录音"
        >
          🎙️ 开始录音
        </button>
        <p className="audio-rec__hint">点击后浏览器会请求麦克风权限</p>
      </div>
    );
  }

  if (recState === "recording") {
    return (
      <div className="audio-rec audio-rec--recording">
        <div className="audio-rec__indicator">
          <span className="audio-rec__dot" />
          <span className="audio-rec__time">{formatDuration(elapsed)}</span>
        </div>
        <p className="audio-rec__hint">正在录音…请用英语回答题目</p>
        <button
          type="button"
          onClick={handleStop}
          className="btn btn--primary audio-rec__stop"
          aria-label="结束录音"
        >
          ⏹ 结束录音
        </button>
      </div>
    );
  }

  // stopped — 可试听、重录
  return (
    <div className="audio-rec audio-rec--stopped">
      <p className="audio-rec__done">录音完成（{formatDuration(elapsed)}）</p>
      {objectUrl && <AudioPlayer src={objectUrl} />}
      <div className="audio-rec__actions">
        <button type="button" onClick={handleReset} className="btn btn--ghost btn--sm">
          🔄 重新录制
        </button>
        {/* Phase 2: 这里将增加"转为文字"按钮调用 STT */}
      </div>
    </div>
  );
}
