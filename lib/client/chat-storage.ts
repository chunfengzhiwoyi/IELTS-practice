"use client";
/**
 * 聊天会话 localStorage 持久化
 */
import type { ChatMessage, ConversationState } from "@/lib/agent/chat-schema";

const MESSAGES_KEY = "els_chat_messages";
const STATE_KEY = "els_chat_state";

export function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  // 只保留最近 50 条
  const trimmed = messages.slice(-50);
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(trimmed));
}

export function loadConversationState(): ConversationState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as ConversationState) : {};
  } catch {
    return {};
  }
}

export function saveConversationState(state: ConversationState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function clearChat(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MESSAGES_KEY);
  localStorage.removeItem(STATE_KEY);
}
