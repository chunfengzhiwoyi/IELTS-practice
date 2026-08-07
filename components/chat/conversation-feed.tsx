"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/agent/chat-schema";
import { UserMessage } from "@/components/chat/user-message";
import { AssistantMessage } from "@/components/chat/assistant-message";
import { TypingIndicator } from "@/components/chat/typing-indicator";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onChoiceClick: (message: string) => void;
}

export function ConversationFeed({ messages, isLoading, onChoiceClick }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // Detect user scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledUp.current = !atBottom;
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll only if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserMessage key={msg.id} text={msg.text} />
          ) : (
            <AssistantMessage
              key={msg.id}
              text={msg.text}
              uiAction={msg.ui_action}
              onChoiceClick={onChoiceClick}
            />
          ),
        )}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
