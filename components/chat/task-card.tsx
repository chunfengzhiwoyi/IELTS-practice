"use client";

import Link from "next/link";
import type { UiAction } from "@/lib/agent/chat-schema";

interface Props {
  action: UiAction;
}

export function TaskCard({ action }: Props) {
  switch (action.type) {
    case "START_LEARN": {
      const href = action.term ? `/learn?term=${encodeURIComponent(action.term)}` : "/learn";
      return (
        <Link href={href} className="block rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm transition hover:shadow-md">
          <div className="font-medium text-emerald-800">学习新表达</div>
          {action.term && <div className="mt-0.5 text-emerald-600">{action.term}</div>}
          <div className="mt-1 text-xs text-emerald-500">点击开始 →</div>
        </Link>
      );
    }
    case "START_REVIEW": {
      const href = action.itemId ? `/review?itemId=${action.itemId}` : "/review";
      return (
        <Link href={href} className="block rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm transition hover:shadow-md">
          <div className="font-medium text-blue-800">复习</div>
          <div className="mt-1 text-xs text-blue-500">点击开始 →</div>
        </Link>
      );
    }
    case "START_SPEAKING": {
      const modeLabels = { WARM_UP: "轻松热身", FULL_EXPRESSION: "完整表达", DEEP_DISCUSSION: "深入讨论" };
      const label = action.mode ? modeLabels[action.mode] : "口语训练";
      return (
        <Link href="/speaking" className="block rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm transition hover:shadow-md">
          <div className="font-medium text-purple-800">{label}</div>
          {action.topic && <div className="mt-0.5 text-purple-600">{action.topic}</div>}
          <div className="mt-1 text-xs text-purple-500">点击开始 →</div>
        </Link>
      );
    }
    case "VIEW_REPORT":
      return (
        <Link href="/report" className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm transition hover:shadow-md">
          <div className="font-medium text-amber-800">学习报告</div>
          <div className="mt-1 text-xs text-amber-500">查看详情 →</div>
        </Link>
      );
    default:
      return null;
  }
}
