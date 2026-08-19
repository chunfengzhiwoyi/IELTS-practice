"use client";

/**
 * 全站常驻 AI 学习助手：右下角悬浮气泡，点开后上拉成对话面板。
 * 复用现有 ChatSection（已含本地持久化，跨页共享同一段对话）。
 * 设计守约：纸感面板、古铜 hairline、accent 仅用于发送键与状态点，无玻璃拟态、无光晕。
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChatSection } from "@/components/chat/chat-section";
import { useLlmStatus } from "@/components/llm/llm-status";

export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // 全局统一的 LLM 在线状态（与 Masthead / 主页共享同一份）
  const { status } = useLlmStatus();

  // 登录 / 鉴权流程中不显示助手机
  const hidden = pathname.startsWith("/login") || pathname.startsWith("/auth");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (hidden) return null;

  return (
    <div className="assistant-dock">
      {open && (
        <section className="assistant-dock__panel" role="dialog" aria-label="学习助手">
          <header className="assistant-dock__head">
            <Image
              src="/logo-seal.png"
              alt=""
              width={26}
              height={26}
              className="assistant-dock__seal"
            />
            <span className="assistant-dock__name">学习助手</span>
            <span
              className={`status-dot${status === "offline" ? " status-dot--offline" : ""}`}
              aria-hidden="true"
            />
            <span className="status-text">
              {status === "offline" ? "离线" : status === "online" ? "在线" : "检查中…"}
            </span>
            <button
              type="button"
              className="assistant-dock__close"
              onClick={() => setOpen(false)}
              aria-label="收起学习助手"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="assistant-dock__body">
            <ChatSection fill />
          </div>
        </section>
      )}

      {!open && (
        <button
          type="button"
          className="assistant-dock__bubble"
          onClick={() => setOpen(true)}
          aria-label="打开学习助手"
        >
          <Image src="/logo-seal.png" alt="" width={30} height={30} priority />
        </button>
      )}
    </div>
  );
}
