/**
 * 找回密码页
 * ------------------------------------------------------------
 * 同一页面承载两个状态：
 *   - 无 ?code：填邮箱 → 发送一次性重置链接（resetPasswordForEmail）
 *   - 有 ?code：兑换临时会话 → 显示"设置新密码"表单
 * 因使用 useSearchParams，必须以 Suspense 包裹（Next 15 构建要求）。
 */
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = {
  title: "找回密码 · 灵犀 IELTS",
};

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">找回密码</h1>
        <p className="mt-1 text-sm text-slate-600">
          通过注册邮箱验证身份，重设你的登录密码。
        </p>
        <div className="mt-6">
          <Suspense
            fallback={<p className="text-sm text-ink-soft">加载中…</p>}
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
