"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/db/browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
    | { kind: "placeholder" }
  >({ kind: "idle" });

  const send = async () => {
    if (!email.trim()) return;

    // 占位配置检测：URL 域名含 placeholder 就走本地提示，不发起真实请求
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (url.includes("placeholder.supabase.co")) {
      setStatus({ kind: "placeholder" });
      return;
    }

    setStatus({ kind: "sending" });
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo:
            (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") + "/auth/callback",
        },
      });
      if (error) throw error;
      setStatus({ kind: "sent" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "发送失败，请稍后重试",
      });
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          邮箱
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          placeholder="you@example.com"
        />
      </div>
      <button
        type="submit"
        disabled={status.kind === "sending" || !email.trim()}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {status.kind === "sending" ? "发送中…" : "发送登录链接"}
      </button>

      {status.kind === "sent" ? (
        <p className="text-sm text-emerald-700">链接已发送，请前往邮箱点击登录。</p>
      ) : null}
      {status.kind === "placeholder" ? (
        <p className="text-sm text-amber-800">
          Supabase 尚未配置真实凭据，未发送邮件。请在
          <code className="mx-1 rounded bg-slate-100 px-1">.env.local</code>
          替换占位值后重试。
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p className="text-sm text-rose-700">{status.message}</p>
      ) : null}
    </form>
  );
}
