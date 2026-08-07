/**
 * /learn 新词学习页面
 * ------------------------------------------------------------
 * P1 实现：输入单词/语块 → 获取词卡 → 主动回忆 → 反馈 → 保存状态 → 复习时间
 */
import Link from "next/link";

import { LearnPage } from "@/components/learn/learn-page";

export default function LearnRoute() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">新词学习</h1>
          <p className="mt-1 text-sm text-slate-600">
            输入一个单词或语块，生成词卡并完成主动回忆任务。
          </p>
        </div>
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← 首页
        </Link>
      </div>
      <LearnPage />
    </main>
  );
}
