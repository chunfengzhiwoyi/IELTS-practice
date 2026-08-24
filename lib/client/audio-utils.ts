"use client";
/**
 * 浏览器音频录制工具
 * -------------------------------------------------------
 * 封装 MediaRecorder API，提供简洁的 start/stop/getBlob 接口。
 * Phase 1 仅负责录制；Phase 2 将把 blob 发送到 /api/speaking/transcribe。
 */

export type RecorderState = "idle" | "recording" | "paused" | "stopped";

export interface AudioRecorderHandle {
  state: RecorderState;
  /** 已录制时长（秒） */
  elapsed: number;
  start(): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  /** 获取录制完成的音频 Blob（webm 或 mp3） */
  getBlob(): Blob | null;
  /** 获取 object URL 用于播放 */
  getObjectUrl(): string | null;
  /** 重置，释放资源 */
  reset(): void;
}

/**
 * 创建一个 AudioRecorder 实例。
 * 调用方负责管理生命周期（组件卸载时调 reset 释放 stream）。
 */
export function createAudioRecorder(
  onStateChange?: (state: RecorderState) => void,
  onElapsedChange?: (seconds: number) => void,
): AudioRecorderHandle {
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let blob: Blob | null = null;
  let objectUrl: string | null = null;
  let state: RecorderState = "idle";
  let elapsed = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function setState(s: RecorderState) {
    state = s;
    onStateChange?.(s);
  }

  function startTimer() {
    elapsed = 0;
    onElapsedChange?.(0);
    timer = setInterval(() => {
      elapsed += 1;
      onElapsedChange?.(elapsed);
    }, 1000);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  const handle: AudioRecorderHandle = {
    get state() { return state; },
    get elapsed() { return elapsed; },

    async start() {
      // 请求麦克风权限
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      blob = null;
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }

      // 选择浏览器支持的编码格式
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        blob = new Blob(chunks, { type: mimeType });
        objectUrl = URL.createObjectURL(blob);
        setState("stopped");
        stopTimer();
      };

      mediaRecorder.start(1000); // 每秒 ondataavailable
      setState("recording");
      startTimer();
    },

    stop() {
      if (mediaRecorder && state === "recording") {
        mediaRecorder.stop();
        // 停止所有音轨
        stream?.getTracks().forEach((t) => t.stop());
      }
    },

    pause() {
      if (mediaRecorder && state === "recording") {
        mediaRecorder.pause();
        setState("paused");
        stopTimer();
      }
    },

    resume() {
      if (mediaRecorder && state === "paused") {
        mediaRecorder.resume();
        setState("recording");
        // 恢复计时
        timer = setInterval(() => {
          elapsed += 1;
          onElapsedChange?.(elapsed);
        }, 1000);
      }
    },

    getBlob() { return blob; },
    getObjectUrl() { return objectUrl; },

    reset() {
      stopTimer();
      if (mediaRecorder && (state === "recording" || state === "paused")) {
        mediaRecorder.stop();
      }
      stream?.getTracks().forEach((t) => t.stop());
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      mediaRecorder = null;
      stream = null;
      chunks = [];
      blob = null;
      elapsed = 0;
      setState("idle");
    },
  };

  return handle;
}

/** 格式化秒数为 mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
