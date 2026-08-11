"use client";

import type { UiAction } from "@/lib/agent/chat-schema";
import { ChoiceGroup } from "@/components/chat/choice-group";
import { TaskCard } from "@/components/chat/task-card";

interface Props {
  text: string;
  uiAction?: UiAction;
  onChoiceClick?: (message: string) => void;
}

export function AssistantMessage({ text, uiAction, onChoiceClick }: Props) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        <div className="rounded-2xl rounded-bl-md bg-paper-2 px-4 py-2.5 text-sm text-ink">
          {text}
        </div>
        {uiAction && uiAction.type === "SHOW_CHOICES" && uiAction.options && onChoiceClick && (
          <ChoiceGroup options={uiAction.options} onSelect={onChoiceClick} />
        )}
        {uiAction && uiAction.type !== "NONE" && uiAction.type !== "SHOW_CHOICES" && (
          <TaskCard action={uiAction} />
        )}
      </div>
    </div>
  );
}
