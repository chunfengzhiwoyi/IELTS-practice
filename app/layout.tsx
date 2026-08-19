import type { Metadata } from "next";
import "./globals.css";
import { Masthead } from "@/components/layout/masthead";
import { AssistantDock } from "@/components/assistant/assistant-dock";
import { AuthProvider } from "@/components/auth/useAuth";
import { LlmStatusProvider } from "@/components/llm/llm-status";

export const metadata: Metadata = {
  title: "灵犀 · IELTS 英语高效学习助手",
  description: "成熟、安静、专业的雅思高效学习助手 — 新词学习、主动回忆复习、口语训练与学习报告。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Instrument+Sans:wght@400;500;600&family=Noto+Serif+SC:wght@400;500;600&family=Noto+Sans+SC:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <AuthProvider>
          <LlmStatusProvider>
            <Masthead />
            {children}
            <AssistantDock />
          </LlmStatusProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
