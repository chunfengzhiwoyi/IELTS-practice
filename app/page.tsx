/**
 * 首页 / 助手入口
 * ------------------------------------------------------------
 * 交接单 §4.1：
 *   - 首页保留四个明确入口
 *   - 同时允许自然语言输入
 *   - Agent 返回结构化 ui_action，前端按 type 展示
 */
import Link from "next/link";

import { AgentChat } from "@/components/agent/AgentChat";
import { getCurrentUser } from "@/lib/auth/session";
import { currentPrimaryProviderKind, isMockPrimary, isPlaceholderSupabase } from "@/lib/env";

const ENTRIES = [
  {
    href: "/learn" as const,
    title: "新词学习",
    desc: "识别词/短语/语块，生成词卡与主动任务",
    phase: "P1",
  },
  {
    href: "/review" as const,
    title: "今日复习",
    desc: "读取到期项，四类质量反馈驱动下次间隔",
    phase: "P2",
  },
  {
    href: "/speaking" as const,
    title: "口语训练",
    desc: "文字版 Part 1/2/3，每轮聚焦一个改善点",
    phase: "P3",
  },
  {
    href: "/report" as const,
    title: "学习报告",
    desc: "汇总真实事件，追溯薄弱点与下一任务",
    phase: "P4",
  },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  const placeholders: string[] = [];
  if (isPlaceholderSupabase()) placeholders.push("Supabase");
  if (isMockPrimary()) placeholders.push(`LLM=mock`);
  const primaryProvider = currentPrimaryProviderKind();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">英语高效学习助手</h1>
          <p className="mt-1 text-sm text-slate-600">MVP 0.1 · P0 工程基座</p>
        </div>
        <div className="text-right text-sm">
          {user ? (
            <>
              <div className="text-slate-700">已登录</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-brand-600 px-4 py-2 text-white shadow-sm transition hover:bg-brand-700"
            >
              登录
            </Link>
          )}
        </div>
      </header>

      {placeholders.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>提示：</strong>
          当前 LLM Provider =
          <code className="mx-1 rounded bg-white px-1 py-0.5">{primaryProvider}</code>
          {placeholders.includes("Supabase") ? "，Supabase 使用占位配置。" : "。"}
          在
          <code className="mx-1 rounded bg-white px-1 py-0.5">.env.local</code>
          中修改
          <code className="mx-1 rounded bg-white px-1 py-0.5">LLM_PRIMARY_PROVIDER</code>
          为 <code>bailian</code> 或 <code>deepseek</code>
          并填入对应 API Key 即可切换到真实模型。
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-medium">四类核心能力</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ENTRIES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">{e.title}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {e.phase}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{e.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">对话入口（测试消息）</h2>
        <AgentChat />
      </section>

      <footer className="mt-auto pt-6 text-xs text-slate-400">
        单 Agent · 确定性工具 · 持久化数据库 · 严格遵循开发交接单 v0.1
      </footer>
    </main>
  );
}
