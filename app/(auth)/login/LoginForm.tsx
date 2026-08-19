"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/db/browser";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working" }
    | { kind: "sent" }
    | { kind: "need-confirm" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // 微信扫码登录弹窗状态
  const [showQr, setShowQr] = useState(false);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<
    "idle" | "loading" | "pending" | "confirmed" | "expired" | "error"
  >("idle");
  const [qrError, setQrError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPoll = (state: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/wechat-login/poll?state=${state}`);
        const data = await res.json();
        if (data.status === "confirmed" && data.session) {
          if (pollRef.current) clearInterval(pollRef.current);
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          setQrStatus("confirmed");
          router.push("/");
          router.refresh();
        } else if (data.status === "expired") {
          if (pollRef.current) clearInterval(pollRef.current);
          setQrStatus("expired");
        } else {
          setQrStatus("pending");
        }
      } catch {
        // 网络抖动忽略，下次重试
      }
    }, 1500);
  };

  const openQr = async () => {
    setShowQr(true);
    setQrStatus("loading");
    setQrImg(null);
    setQrError("");
    try {
      const res = await fetch("/api/auth/wechat-login/qrcode");
      const data = await res.json();
      if (!res.ok || !data.qrcode) {
        throw new Error(data.error ?? "生成二维码失败");
      }
      setQrImg(data.qrcode);
      setQrStatus("pending");
      startPoll(data.state);
    } catch (e) {
      setQrStatus("error");
      setQrError(e instanceof Error ? e.message : "生成二维码失败");
    }
  };

  const closeQr = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setShowQr(false);
  };

  // 邮箱 + 密码：登录 / 注册
  const submit = async () => {
    if (!email.trim() || !password) return;
    setStatus({ kind: "working" });
    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // confirm email 已关闭时，signUp 会直接返回 session，用户立即登录
        if (!data.session) {
          setStatus({ kind: "need-confirm" });
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "操作失败，请稍后重试",
      });
    }
  };

  // 备选：发送一次性邮件链接登录（走 /auth/callback，已修好 cookie 写入）
  const sendLink = async () => {
    if (!email.trim()) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (url.includes("placeholder.supabase.co")) {
      setStatus({ kind: "error", message: "Supabase 尚未配置真实凭据。" });
      return;
    }
    setStatus({ kind: "working" });
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo:
            (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") +
            "/auth/callback",
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
    <div className="space-y-4">
      {/* 模式切换 */}
      <div className="flex rounded-md border border-line p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`flex-1 rounded px-3 py-1.5 ${
            mode === "signin" ? "bg-accent text-white" : "text-ink-soft"
          }`}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded px-3 py-1.5 ${
            mode === "signup" ? "bg-accent text-white" : "text-ink-soft"
          }`}
        >
          注册
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="email" className="text-sm font-medium text-ink">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium text-ink">
            密码（至少 6 位）
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={status.kind === "working"}
          className="btn btn--primary w-full disabled:cursor-not-allowed"
        >
          {status.kind === "working"
            ? "处理中…"
            : mode === "signup"
              ? "注册并进入"
              : "登录"}
        </button>

        <div className="flex justify-end pt-1">
          <Link
            href="/reset-password"
            className="text-xs text-ink-meta underline-offset-2 hover:text-accent hover:underline"
          >
            忘记密码？
          </Link>
        </div>
      </form>

      <div className="flex items-center gap-3 text-xs text-ink-meta">
        <span className="h-px flex-1 bg-line" />
        或
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={() => void sendLink()}
        disabled={status.kind === "working" || !email.trim()}
        className="btn btn--ghost w-full disabled:cursor-not-allowed"
      >
        发送邮件登录链接
      </button>

      <div className="flex items-center gap-3 text-xs text-ink-meta">
        <span className="h-px flex-1 bg-line" />
        或
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={() => void openQr()}
        className="btn btn--ghost w-full"
      >
        微信扫码登录
      </button>

      {status.kind === "sent" ? (
        <p className="text-sm text-emerald-700">
          链接已发送，请前往邮箱点击登录。
        </p>
      ) : null}
      {status.kind === "need-confirm" ? (
        <p className="text-sm text-amber-800">
          注册成功，但邮箱验证仍开启，请查收验证邮件后登录。
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p className="text-sm text-rose-700">{status.message}</p>
      ) : null}

      {showQr ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-6"
          onClick={closeQr}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">微信扫码登录</h2>
              <button
                type="button"
                onClick={closeQr}
                aria-label="关闭"
                className="text-ink-meta hover:text-ink"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              请用微信扫一扫，扫码后将在网页自动登录。
            </p>
            <div className="mt-4 flex justify-center">
              {qrStatus === "loading" ? (
                <p className="text-sm text-ink-meta">二维码生成中…</p>
              ) : null}
              {qrImg && qrStatus !== "error" && qrStatus !== "expired" ? (
                <img
                  src={qrImg}
                  alt="微信登录二维码"
                  className="h-56 w-56 rounded border border-line"
                />
              ) : null}
              {qrStatus === "expired" ? (
                <div className="flex h-56 w-56 flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm text-ink-soft">二维码已失效</p>
                  <button
                    type="button"
                    onClick={() => void openQr()}
                    className="btn btn--ghost text-sm"
                  >
                    刷新二维码
                  </button>
                </div>
              ) : null}
              {qrStatus === "error" ? (
                <p className="text-sm text-rose-700">{qrError}</p>
              ) : null}
            </div>
            <p className="mt-3 text-center text-xs text-ink-meta">
              {qrStatus === "pending"
                ? "等待扫码…"
                : qrStatus === "confirmed"
                  ? "登录成功，正在进入…"
                  : ""}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
