"use client";
/**
 * AI Speaking Coach — 轻量内联播放器
 * -------------------------------------------------------
 * 简洁的 play/pause 圆形按钮 + 进度条 + 时长
 * Props 不变：src, className
 */
import { useRef, useState } from "react";
import { formatDuration } from "@/lib/client/audio-utils";

interface Props {
  src: string;
  className?: string;
}

export function AudioPlayer({ src, className }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); }
    else { el.play(); }
    setPlaying(!playing);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`flex items-center gap-3 rounded-full bg-surface-raised px-3 py-1.5 ${className ?? ""}`}>
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={(e) => setDuration(Math.floor((e.target as HTMLAudioElement).duration))}
        onTimeUpdate={(e) => setCurrentTime(Math.floor((e.target as HTMLAudioElement).currentTime))}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={toggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:bg-accent/90"
        aria-label={playing ? "暂停" : "播放录音"}
      >
        {playing ? (
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11.5-7.36a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14Z" />
          </svg>
        )}
      </button>
      {/* 进度条 */}
      <div className="flex-1 h-1 rounded-full bg-ink/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent/60 transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="font-mono text-xs text-ink-meta tabular-nums whitespace-nowrap">
        {formatDuration(currentTime)}/{formatDuration(duration || 0)}
      </span>
    </div>
  );
}
