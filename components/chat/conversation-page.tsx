"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, ChatResponse, ConversationState } from "@/lib/agent/chat-schema";
import { loadMessages, saveMessages, loadConversationState, saveConversationState, clearChat } from "@/lib/client/chat-storage";
import { ConversationFeed } from "@/components/chat/conversation-feed";
import { Composer } from "@/components/chat/composer";

const QUICK_ACTIONS = [
  { label: "学一个新表达", message: "帮我学一个新的英语表达" },
  { label: "复习最近内容", message: "帮我复习最近学过的内容" },
  { label: "练一会儿口语", message: "我想练一会儿口语" },
  { label: "看看学习情况", message: "看看我最近的学习情况" },
];

export function ConversationPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [convState, setConvState] = useState<ConversationState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setMessages(loadMessages());
    setConvState(loadConversationState());
    setLoaded(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (loaded) saveMessages(messages);
  }, [messages, loaded]);

  useEffect(() => {
    if (loaded) saveConversationState(convState);
  }, [convState, loaded]);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const apiMessages = updatedMessages.slice(-20).map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const res = await fetch("/api/agent/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, conversation_state: convState }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message ?? `请求失败 (${res.status})`;
        const errorAssistant: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: `抱歉，出了点问题：${errMsg}。请再试一次。`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorAssistant]);
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
      const errorAssistant: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: `网络错误，请检查连接后重试。`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorAssistant]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, convState]);

  const handleChoiceClick = useCallback((message: string) => {
    sendMessage(message);
  }, [sendMessage]);

  const handleClear = () => {
    clearChat();
    setMessages([]);
    setConvState({});
  };

  // Empty state
  if (loaded && messages.length === 0 && !isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32">
          <h1 className="text-2xl font-semibold text-slate-800">英语高效学习助手</h1>
          <p className="mt-2 text-sm text-slate-500">直接告诉我今天想练什么。</p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.message}
                onClick={() => sendMessage(qa.message)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition hover:border-brand-400 hover:text-brand-700"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>
        <Composer onSend={sendMessage} disabled={isLoading} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <h1 className="text-base font-semibold text-slate-800">英语高效学习助手</h1>
          <button
            onClick={handleClear}
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            清除对话
          </button>
        </div>
      </header>

      {/* Feed */}
      <ConversationFeed
        messages={messages}
        isLoading={isLoading}
        onChoiceClick={handleChoiceClick}
      />

      {/* Composer */}
      <div className="sticky bottom-0 z-10">
        <Composer onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  );
}
