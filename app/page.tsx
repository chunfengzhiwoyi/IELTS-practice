/**
 * 首页：四类核心能力入口 + 学习助手对话模块
 */
import Link from "next/link";
import { ChatSection } from "@/components/chat/chat-section";

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
    desc: "文字版口语练习，每轮聚焦一个改善点",
  },
  {
    href: "/report" as const,
    title: "学习报告",
    desc: "汇总学习数据，追踪进展与薄弱点",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">英语高效学习助手</h1>
        <p className="mt-1 text-sm text-slate-500">随时学、随时练、随时看进展</p>
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
        <h2 className="mb-3 text-lg font-medium">和学习助手聊聊</h2>
        <ChatSection />
      </section>
    </main>
  );
}
