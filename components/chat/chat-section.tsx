"use client";

/**
 * 嵌入式聊天模块（首页"和学习助手聊聊"区域）
 * 不是全屏对话页，而是页面内一个有固定高度的对话区域。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatResponse, ConversationState } from "@/lib/agent/chat-schema";
import { loadMessages, saveMessages, loadConversationState, saveConversationState, clearChat } from "@/lib/client/chat-storage";
import { UserMessage } from "@/components/chat/user-message";
import { AssistantMessage } from "@/components/chat/assistant-message";
import { TypingIndicator } from "@/components/chat/typing-indicator";

const QUICK_ACTIONS = [
  { label: "学一个新表达", message: "帮我学一个新的英语表达" },
  { label: "复习最近内容", message: "帮我复习最近学过的内容" },
  { label: "练一会儿口语", message: "我想练一会儿口语" },
  { label: "看看学习情况", message: "看看我最近的学习情况" },
];

export function ChatSection() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [convState, setConvState] = useState<ConversationState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadMessages());
    setConvState(loadConversationState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveMessages(messages);
  }, [messages, loaded]);

  useEffect(() => {
    if (loaded) saveConversationState(convState);
  }, [convState, loaded]);

  const hasInteracted = useRef(false);

  // 只在用户主动发消息后滚动聊天容器内部，不滚动页面
  useEffect(() => {
    if (!hasInteracted.current) return;
    const container = feedRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (text: string) => {
    hasInteracted.current = true;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setIsLoading(true);

    try {
      const apiMessages = updated.slice(-20).map((m) => ({ role: m.role, content: m.text }));
      const res = await fetch("/api/agent/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, conversation_state: convState }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message ?? `请求失败 (${res.status})`;
        setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: `抱歉，出了点问题：${errMsg}`, timestamp: Date.now() }]);
        return;
      }

      const data: ChatResponse = await res.json();
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data.assistant_text,
        ui_action: data.ui_action,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (data.conversation_state_patch) {
        setConvState((prev) => ({ ...prev, ...data.conversation_state_patch }));
      }
    } catch {
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: "网络错误，请稍后重试。", timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, convState]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    sendMessage(trimmed);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  };

  const handleClear = () => { clearChat(); setMessages([]); setConvState({}); };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Feed area with fixed height */}
      <div ref={feedRef} className="h-[400px] overflow-y-auto px-4 py-4">
        {loaded && messages.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-slate-500">直接输入或选择一个话题开始</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.message}
                  onClick={() => sendMessage(qa.message)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) =>
              msg.role === "user" ? (
                <UserMessage key={msg.id} text={msg.text} />
              ) : (
                <div key={msg.id} className="space-y-2">
                  <AssistantMessage text={msg.text} uiAction={msg.ui_action} onChoiceClick={sendMessage} />
                </div>
              ),
            )}
            {isLoading && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* Composer fixed at bottom of this module */}
      <div className="border-t border-slate-100 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
            placeholder="告诉我今天想练什么…"
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
          />
          <button
            onClick={handleSubmit}
            disabled={isLoading || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:bg-slate-300"
            aria-label="发送"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.114A28.897 28.897 0 003.105 2.289z" />
            </svg>
          </button>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} className="mt-2 text-xs text-slate-400 hover:text-slate-600">
            清除对话
          </button>
        )}
      </div>
    </div>
  );
}
