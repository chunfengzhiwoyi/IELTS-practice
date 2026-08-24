"use client";
/**
 * 录音回放播放器
 * 简洁的播放/暂停 + 时长显示。
 */
import { useRef, useState } from "react";
import { formatDuration } from "@/lib/client/audio-utils";

interface Props {
  src: string; // object URL
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

  return (
    <div className={`audio-player ${className ?? ""}`}>
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
        className="btn btn--ghost btn--sm"
        aria-label={playing ? "暂停" : "播放录音"}
      >
        {playing ? "⏸ 暂停" : "▶ 试听"}
      </button>
      <span className="audio-player__time">
        {formatDuration(currentTime)} / {formatDuration(duration || 0)}
      </span>
    </div>
  );
}
