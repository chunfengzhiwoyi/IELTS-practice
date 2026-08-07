/**
 * 首页 / 助手入口
 */
import Link from "next/link";

import { AgentChat } from "@/components/agent/AgentChat";
import { currentPrimaryProviderKind } from "@/lib/env";

const ENTRIES = [
  {
    href: "/learn" as const,
    title: "新词学习",
    desc: "输入单词或语块，生成词卡并完成主动回忆",
  },
  {
    href: "/review" as const,
    title: "今日复习",
    desc: "到期词条复习，巩固长期记忆",
  },
  {
    href: "/speaking" as const,
    title: "口语训练",
    desc: "文字版 Part 1/2/3，每轮聚焦一个改善点",
  },
  {
    href: "/report" as const,
    title: "学习报告",
    desc: "汇总学习数据，追踪进展与薄弱点",
  },
];

export default function HomePage() {
  const provider = currentPrimaryProviderKind();
  const providerLabel = provider === "deepseek" ? "DeepSeek" : provider === "bailian" ? "百炼" : "本地模拟";

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">英语高效学习助手</h1>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 px-2.5 py-0.5">AI 服务：{providerLabel}</span>
          <span className="rounded-full border border-slate-200 px-2.5 py-0.5">学习数据：保存在当前浏览器</span>
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-medium">核心能力</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ENTRIES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow-md"
            >
              <span className="font-medium text-slate-900">{e.title}</span>
              <p className="mt-1 text-sm text-slate-600">{e.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">智能对话</h2>
        <AgentChat />
      </section>
    </main>
  );
}
