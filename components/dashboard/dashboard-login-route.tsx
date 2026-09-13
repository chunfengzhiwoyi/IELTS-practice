"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLoginPage from "./DashboardLoginPage";
import { createSupabaseBrowserClient } from "@/lib/db/browser";

/**
 * DASHBOARD-LOGIN-V10：后台登录路由（dashboard-only 分支专用）。
 * 复用项目现有 Supabase 浏览器客户端（@/lib/db/browser），不创建第二套认证实现。
 * 登录方式仅保留：邮箱 + 密码（signInWithPassword）。
 *  - 成功 -> /dashboard（服务端 dashboard layout 再执行 DASHBOARD_ALLOWED_EMAILS 校验）
 *  - 失败 -> inline 中文错误，不离开页面
 * 忘记密码：V1 只显示 toast「密码找回功能将在后续开放」（DashboardLoginPage 默认行为，不接 recovery）。
 */
export default function DashboardLoginRoute() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <DashboardLoginPage
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      // onForgotPassword 不传：DashboardLoginPage 默认展示「密码找回功能将在后续开放」toast
    />
  );
}
