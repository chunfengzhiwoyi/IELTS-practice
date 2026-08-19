/**
 * 登录页
 * ------------------------------------------------------------
 * 交接单 §4：邮箱魔法链接登录。
 * P0 阶段：占位配置时点击"发送链接"会给出提示，不会调用 Supabase；
 * 真实配置就位后会走 supabase.auth.signInWithOtp。
 */
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">登录</h1>
        <p className="mt-1 text-sm text-slate-600">用邮箱和密码登录或注册；也可选择发送邮件登录链接。</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
