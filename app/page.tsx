/**
 * 首页：四类核心能力入口 + 学习助手对话模块
 */
import { AbilityCards } from "@/components/home/ability-cards";
import { ChatSection } from "@/components/chat/chat-section";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">英语高效学习助手</h1>
        <p className="mt-1 text-sm text-slate-500">随时学、随时练、随时看进展</p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-medium">核心能力</h2>
        <AbilityCards />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">和学习助手聊聊</h2>
        <ChatSection />
      </section>
    </main>
  );
}
