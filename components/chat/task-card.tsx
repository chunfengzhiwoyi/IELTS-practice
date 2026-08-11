"use client";

import Link from "next/link";
import type { UiAction } from "@/lib/agent/chat-schema";

interface Props {
  action: UiAction;
}

export function TaskCard({ action }: Props) {
  const labels: Record<string, string> = {
    START_LEARN: "学习新表达",
    START_REVIEW: "复习",
    START_SPEAKING: "口语训练",
    VIEW_REPORT: "学习报告",
  };
  const title = labels[action.type] ?? "继续";

  switch (action.type) {
    case "START_LEARN": {
      const href = action.term ? `/learn?term=${encodeURIComponent(action.term)}` : "/learn";
      return (
        <Link href={href} className="block border border-line bg-paper-2 px-4 py-3 text-sm transition hover:border-accent">
          <div className="font-medium text-ink">{title}</div>
          {action.term && <div className="mt-0.5 text-ink-soft">{action.term}</div>}
          <div className="mt-1 text-xs text-accent">点击开始 →</div>
        </Link>
      );
    }
    case "START_REVIEW": {
      const href = action.itemId ? `/review?itemId=${action.itemId}` : "/review";
      return (
        <Link href={href} className="block border border-line bg-paper-2 px-4 py-3 text-sm transition hover:border-accent">
          <div className="font-medium text-ink">{title}</div>
          <div className="mt-1 text-xs text-accent">点击开始 →</div>
        </Link>
      );
    }
    case "START_SPEAKING": {
      const modeLabels = { WARM_UP: "轻松热身", FULL_EXPRESSION: "完整表达", DEEP_DISCUSSION: "深入讨论" };
      const label = action.mode ? modeLabels[action.mode] : "口语训练";
      return (
        <Link href="/speaking" className="block border border-line bg-paper-2 px-4 py-3 text-sm transition hover:border-accent">
          <div className="font-medium text-ink">{title}</div>
          {action.topic && <div className="mt-0.5 text-ink-soft">{action.topic}</div>}
          <div className="mt-1 text-xs text-accent">{label} · 点击开始 →</div>
        </Link>
      );
    }
    case "VIEW_REPORT":
      return (
        <Link href="/report" className="block border border-line bg-paper-2 px-4 py-3 text-sm transition hover:border-accent">
          <div className="font-medium text-ink">{title}</div>
          <div className="mt-1 text-xs text-accent">查看详情 →</div>
        </Link>
      );
    default:
      return null;
  }
}
