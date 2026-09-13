import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/useAuth";
import { LlmStatusProvider } from "@/components/llm/llm-status";

/**
 * DASHBOARD-DEPLOY-FIX-01：dashboard-only 部署专用根布局。
 * 仅存在于 dashboard-only 分支。
 * 移除原 IELTS 产品全局 chrome（Masthead 导航 / AssistantDock / 学习 streak / AI 状态 UI），
 * 保留 globals.css、字体与无视觉 providers（登录表单依赖 AuthProvider）。
 */
export const metadata: Metadata = {
  title: "产品数据看板",
  description: "灵犀 IELTS 产品数据看板",
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
          <LlmStatusProvider>{children}</LlmStatusProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
