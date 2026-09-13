"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLoginPage from "./DashboardLoginPage";
import { createSupabaseBrowserClient } from "@/lib/db/browser";

/**
 * DASHBOARD-AUTH-V2：后台登录路由（dashboard-only 分支专用）。
 * 复用项目现有 Supabase 浏览器客户端（@/lib/db/browser），不创建第二套认证实现。
 * 登录方式仅保留：邮箱 + 密码（signInWithPassword）。
 *  - 成功 -> /dashboard（服务端 dashboard layout 再执行 DASHBOARD_ALLOWED_EMAILS 校验）
 *  - 失败 -> inline 中文错误，不离开页面
 * 忘记密码：升级为正式 Supabase recovery（resetPasswordForEmail）。
 *  - 邮箱为空 -> 提示先输入邮箱
 *  - 发送后统一提示（不暴露账号是否存在）
 */
export default function DashboardLoginRoute() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function handleSubmit(credentials: { email: string; password: string }) {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: credentials.email.trim(),
        password: credentials.password,
      });
      if (authError) throw authError;

      router.replace("/dashboard");
      router.refresh();
    } catch {
      // 冻结文案：任何失败（账号不存在 / 密码错误 / 网络）统一展示，不泄露账号状态
      setError("邮箱或密码错误，请重新输入。");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(email: string) {
    setError(null);
    if (!email.trim()) {
      setToast("请先输入邮箱");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "https://ielts-practice-data.vercel.app/reset-password",
    });
    if (error) {
      // 技术性失败也统一提示，不区分账号是否存在
      setToast("如果该邮箱存在，我们已发送密码重置邮件");
      return;
    }
    setToast("如果该邮箱存在，我们已发送密码重置邮件");
  }

  return (
    <DashboardLoginPage
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      toastMessage={toast}
      onForgotPassword={(email) => void handleForgotPassword(email)}
    />
  );
}
