"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/db/browser";

type Phase =
  | "request" // 填邮箱，请求发送重置链接
  | "sending"
  | "sent" // 已发送邮件，等待点链接
  | "verifying" // 点链接到达，正在兑换临时会话
  | "reset" // 显示"设置新密码"表单
  | "updating"
  | "done" // 密码已重置，提示重新登录
  | "error";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");

  const [phase, setPhase] = useState<Phase>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [updating, setUpdating] = useState(false);

  // 点邮件链接到达：code 存在 → 兑换临时会话 → 进入重置表单
  useEffect(() => {
    if (!code) return;
    let active = true;
    setPhase("verifying");
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (!active) return;
        if (error) {
          setPhase("error");
          setMessage("重置链接已失效或已被使用，请重新申请。");
        } else {
          setPhase("reset");
        }
      })
      .catch(() => {
        if (!active) return;
        setPhase("error");
        setMessage("重置链接验证失败，请重新申请。");
      });
    return () => {
      active = false;
    };
  }, [code]);

  const sendLink = useCallback(async () => {
    if (!email.trim()) return;
    setPhase("sending");
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${APP_URL}/reset-password`,
      });
      if (error) throw error;
      setPhase("sent");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "发送失败，请稍后重试。");
    }
  }, [email]);

  const setNewPassword = useCallback(async () => {
    if (password.length < 6) {
      setMessage("密码至少需要 6 位。");
      return;
    }
    if (password !== confirm) {
      setMessage("两次输入的密码不一致。");
      return;
    }
    setUpdating(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // 安全：改密成功后强制全局登出，防止会话固定，要求重新登录
      await supabase.auth.signOut({ scope: "global" });
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "重置失败，请稍后重试。");
    } finally {
      setUpdating(false);
    }
  }, [password, confirm]);

  // ---- 各阶段 UI ----
  if (phase === "verifying") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">正在验证重置链接…</p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="space-y-4">
        <div className="note note--accent">
          密码已重置成功。出于安全考虑，你已在所有设备上被登出，请使用新密码重新登录。
        </div>
        <Link href="/login" className="btn btn--primary w-full">
          前往登录
        </Link>
      </div>
    );
  }

  if (phase === "reset") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          已通过邮箱验证。请设置一个新密码（至少 6 位）。
        </p>
        <div className="space-y-3">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="新密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field-input"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="再次输入新密码"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="field-input"
          />
        </div>
        {message ? <p className="text-sm text-rose-700">{message}</p> : null}
        <button
          type="button"
          onClick={() => void setNewPassword()}
          disabled={updating}
          className="btn btn--primary w-full disabled:cursor-not-allowed"
        >
          {updating ? "处理中…" : "设置新密码"}
        </button>
      </div>
    );
  }

  // request / sending / sent / error —— 均围绕"发送重置链接"
  return (
    <div className="space-y-4">
      {phase === "sent" ? (
        <div className="note note--bronze">
          重置链接已发送至 <b>{email}</b>。请前往邮箱点击链接，链接为一次性、短期有效。
        </div>
      ) : null}
      {phase === "error" && message ? (
        <p className="text-sm text-rose-700">{message}</p>
      ) : null}

      <div>
        <label htmlFor="reset-email" className="text-sm font-medium text-ink">
          注册邮箱
        </label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          placeholder="you@example.com"
        />
      </div>

      <button
        type="button"
        onClick={() => void sendLink()}
        disabled={phase === "sending" || !email.trim()}
        className="btn btn--primary w-full disabled:cursor-not-allowed"
      >
        {phase === "sending" ? "发送中…" : "发送重置链接"}
      </button>

      <button
        type="button"
        onClick={() => router.push("/login")}
        className="btn btn--quiet btn--quiet--back w-full"
      >
        返回登录
      </button>
    </div>
  );
}
