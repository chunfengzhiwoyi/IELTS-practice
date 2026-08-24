/**
 * Speaking Audio Processing 类型
 * -------------------------------------------------------
 * Phase 2: 语音转文字 + 音频元数据
 * Phase 3+: 将扩展 fluency/pronunciation 分析字段
 */

/** Whisper word-level timestamp */
export interface WordTimestamp {
  word: string;
  start: number; // 秒
  end: number;   // 秒
}

/** 基础停顿信息（从 word timestamps 推算） */
export interface PauseInfo {
  /** 总停顿次数（>0.8秒的间隔） */
  pauseCount: number;
  /** 总停顿时长（秒） */
  totalPauseDuration: number;
  /** 最长单次停顿（秒） */
  longestPause: number;
  /** 平均停顿时长（秒） */
  averagePauseDuration: number;
}

/** 音频元数据（Phase 2 输出） */
export interface AudioMetadata {
  /** 音频总时长（秒） */
  duration: number;
  /** 实际说话时间（秒，= duration - 总停顿时长） */
  speakingTime: number;
  /** 语速（words per minute） */
  wpm: number;
  /** 停顿信息 */
  pauses: PauseInfo;
  /** 词级时间戳（Whisper verbose_json 输出，部分模型可能不返回） */
  wordTimestamps?: WordTimestamp[];
}

/** POST /api/speaking/transcribe 的响应 */
export interface TranscribeResponse {
  /** 转写文本 */
  transcript: string;
  /** 音频时长（秒） */
  duration: number;
  /** 音频元数据 */
  audioMetadata: AudioMetadata;
}
