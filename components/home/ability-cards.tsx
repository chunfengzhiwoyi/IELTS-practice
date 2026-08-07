"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getItem } from "@/lib/client/storage";
import type { UserItemState } from "@/lib/learning/types";

export function AbilityCards() {
  const [dueCount, setDueCount] = useState<number | null>(null);

  useEffect(() => {
    const states = getItem<Record<string, UserItemState>>("states") ?? {};
    const now = new Date().toISOString();
    const due = Object.values(states).filter((s) => s.nextReviewAt <= now).length;
    setDueCount(due);
  }, []);

  const reviewDesc = dueCount === null
    ? "到期词条复习，巩固长期记忆"
    : dueCount > 0
      ? `${dueCount} 个表达需要巩固 · 约 ${Math.max(1, Math.ceil(dueCount * 0.5))} 分钟`
      : "今天暂时没有需要复习的内容";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Link href="/learn" className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow-md">
        <span className="font-medium text-slate-900">新词学习</span>
        <p className="mt-1 text-sm text-slate-600">输入单词或语块，生成词卡并完成主动回忆</p>
      </Link>

      <Link href="/review" className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow-md">
        <span className="font-medium text-slate-900">今日复习</span>
        <p className="mt-1 text-sm text-slate-600">{reviewDesc}</p>
      </Link>

      <Link href="/speaking" className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow-md">
        <span className="font-medium text-slate-900">口语训练</span>
        <p className="mt-1 text-sm text-slate-600">文字版口语练习，每轮聚焦一个改善点</p>
      </Link>

      <Link href="/report" className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow-md">
        <span className="font-medium text-slate-900">学习报告</span>
        <p className="mt-1 text-sm text-slate-600">查看最近的学习情况、需要关注的内容和下一步建议</p>
      </Link>
    </div>
  );
}
