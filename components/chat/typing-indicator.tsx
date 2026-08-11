"use client";

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-md bg-paper-2 px-4 py-3">
        <div className="flex gap-1">
          <div className="h-2 w-2 animate-bounce rounded-full bg-ink-meta" style={{ animationDelay: "0ms" }} />
          <div className="h-2 w-2 animate-bounce rounded-full bg-ink-meta" style={{ animationDelay: "150ms" }} />
          <div className="h-2 w-2 animate-bounce rounded-full bg-ink-meta" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
