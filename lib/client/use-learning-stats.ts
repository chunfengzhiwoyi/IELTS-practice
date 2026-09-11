"use client";

/**
 * 共享学习统计 Hook — PRODUCT-LOOP-02A
 * ------------------------------------------------------------
 * 服务端 /api/learning/stats 是学习统计的 SSOT。
 * masthead / goals 页面等只读展示统一经本 hook 获取，
 * 不再从 localStorage 读取已停止写入的 events/states。
 */
import { useEffect, useState } from "react";

export interface LearningStats {
  learnedCount: number;
  dueCount: number;
  masteredCount: number;
  weeklyAccuracy: number | null;
  streak: number;
  speakingIdleDays: number | null;
}

/** 请求失败 / 未就绪时为 null（调用方自行处理占位展示） */
export function useLearningStats(): LearningStats | null {
  const [stats, setStats] = useState<LearningStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/learning/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`stats ${r.status}`))))
      .then((data: LearningStats) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
