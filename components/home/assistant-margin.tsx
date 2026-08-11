import { ChatSection } from "@/components/chat/chat-section";

export function AssistantMargin() {
  return (
    <section className="companion" aria-labelledby="assistant-label">
      <div className="companion__head">
        <span className="monogram" aria-hidden="true">
          灵
        </span>
        <span className="companion__name">学习助手</span>
        <span className="status-dot" aria-hidden="true" />
        <span className="status-text">随时在</span>
      </div>
      <ChatSection />
    </section>
  );
}
