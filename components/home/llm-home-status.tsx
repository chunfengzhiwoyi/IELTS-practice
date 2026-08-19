"use client";

/**
 * 主页 AI 状态提示：全局状态在 Masthead 已恒定可见，
 * 这里在首页正文顶部补充「情境化」一层——
 *   - 离线：醒目但安静的引导卡，说明哪些 AI 功能受限，并引导去配置；
 *   - 在线：一行极轻的小注，不喧哗；
 *   - 检查中：不渲染，避免闪烁。
 * 引导卡可 × 关闭（仅本次会话）。
 */
import { useState } from "react";
import Link from "next/link";
import { useLlmStatus } from "@/components/llm/llm-status";

export function LlmHomeStatus() {
  const { status } = useLlmStatus();
  const [dismissed, setDismissed] = useState(false);

  if (status === "checking") return null;
  if (status === "online") {
    return (
      <div className="home-online-note" aria-live="polite">
        <span className="d" />
        <span>AI 在线 · 全部 AI 功能可用（新词生成 / 口语分析 / 学习报告）</span>
      </div>
    );
  }

  // offline
  if (dismissed) return null;
  return (
    <section className="home-offline" role="status" aria-live="polite">
      <button
        type="button"
        className="home-offline__close"
        onClick={() => setDismissed(true)}
        aria-label="关闭提示"
      >
        ×
      </button>
      <div className="home-offline__mono" aria-hidden="true">
        灵
      </div>
      <div className="home-offline__body">
        <h3 className="home-offline__title">AI 能力离线 — 部分功能暂不可用</h3>
        <p className="home-offline__text">
          当前没有可用的模型服务。<b>新词生成、口语分析、学习报告</b> 依赖 AI，离线时将无法使用；
          复习与本地进度不受影响。配置你自己的模型密钥后，即可解锁全部 AI 功能。
        </p>
        <Link href="/account" className="home-offline__cta">
          去配置 API →
        </Link>
      </div>
    </section>
  );
}
