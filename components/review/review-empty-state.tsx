"use client";

import Link from "next/link";

export function ReviewEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl">🎉</div>
      <h2 className="mt-4 text-lg font-semibold text-slate-800">今日复习已完成</h2>
      <p className="mt-2 text-sm text-slate-600">
        暂无到期需要复习的词条。继续学习新词，或稍后再来。
      </p>
      <Link
        href="/learn"
        className="mt-6 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        去学习新词
      </Link>
    </div>
  );
}
