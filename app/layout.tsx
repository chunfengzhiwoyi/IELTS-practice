import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "英语高效学习助手",
  description: "MVP 0.1 - 单 Agent + 确定性工具 + 持久化数据库",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
