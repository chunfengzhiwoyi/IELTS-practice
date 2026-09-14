"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard-login.module.css";
import { createSupabaseBrowserClient } from "@/lib/db/browser";

/**
 * DASHBOARD-AUTH-V2：密码重置页（dashboard-only 分支专用）。
 * 流程：recovery 邮件链接 -> 本站 /reset-password（@supabase/ssr 自动从 URL 恢复 recovery session）
 *       -> 新密码 + 确认 -> supabase.auth.updateUser({ password })
 *       -> signOut -> 返回 /（登录页）
 * 不注册、不 Magic Link、不第三方登录。
 */
type Phase = "checking" | "ready" | "invalid" | "done";

export default function DashboardResetPasswordRoute() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    const supabase = createSupabaseBrowserClient();

    async function resolveSession() {
      // recovery 邮件链接形如 .../reset-password#access_token=..&refresh_token=..&type=recovery
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (alive) setPhase(error ? "invalid" : "ready");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (alive) setPhase(data.session ? "ready" : "invalid");
    }

    void resolveSession();
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("密码至少需要 6 位");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }

    setWorking(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;

      // 退出当前 session，回到登录页
      await supabase.auth.signOut();
      setPhase("done");
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 1600);
    } catch {
      setError("重置失败，请重试。");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.brand}>灵犀</div>
      <div className={styles.productLabel}>产品数据看板</div>

      <section className={styles.analytics} aria-hidden="true">
        <div className={styles.canvasGlow} />
        <div className={styles.grid} />
      </section>

      <section className={styles.loginPanel}>
        <form className={styles.loginForm} onSubmit={handleSubmit}>
          {phase === "checking" ? (
            <>
              <h1>密码重置</h1>
              <p className={styles.subtitle}>正在校验重置链接…</p>
            </>
          ) : null}

          {phase === "invalid" ? (
            <>
              <h1>链接无效或已过期</h1>
              <p className={styles.subtitle}>
                请重新发送密码重置邮件，或返回登录页。
              </p>
              <div className={styles.formFooter} style={{ justifyContent: "flex-start" }}>
                <button
                  className={styles.forgot}
                  type="button"
                  onClick={() => {
                    router.replace("/");
                    router.refresh();
                  }}
                >
                  ← 返回登录
                </button>
              </div>
            </>
          ) : null}

          {phase === "done" ? (
            <>
              <h1>密码已更新</h1>
              <p className={styles.subtitle}>即将返回登录页…</p>
            </>
          ) : null}

          {phase === "ready" ? (
            <>
              <h1>设置新密码</h1>
              <p className={styles.subtitle}>请输入新的登录密码</p>

              <div className={styles.field}>
                <label htmlFor="reset-password">新密码</label>
                <div className={styles.inputWrap}>
                  <input
                    id="reset-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="至少 6 位"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    className={styles.eye}
                    type="button"
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M3 3l18 18" />
                        <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84" />
                        <path d="M9.88 4.24A10.9 10.9 0 0 1 12 4c5 0 8.5 4 9.5 8a12.6 12.6 0 0 1-2.1 4.3" />
                        <path d="M6.1 6.1A12.7 12.7 0 0 0 2.5 12C3.5 16 7 20 12 20c1.1 0 2.1-.2 3-.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24">
                        <path d="M2.5 12S5.5 5 12 5s9.5 7 9.5 7-3 7-9.5 7-9.5-7-9.5-7Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="reset-confirm">确认新密码</label>
                <div className={styles.inputWrap}>
                  <input
                    id="reset-confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="再次输入新密码"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              </div>

              {error ? <div className={styles.error}>{error}</div> : null}

              <button className={styles.loginButton} type="submit" disabled={working}>
                {working ? "提交中…" : "更新密码"}
              </button>

              <div className={styles.formFooter} style={{ justifyContent: "flex-start" }}>
                <button
                  className={styles.forgot}
                  type="button"
                  onClick={() => {
                    router.replace("/");
                    router.refresh();
                  }}
                >
                  ← 返回登录
                </button>
              </div>
            </>
          ) : null}
        </form>
      </section>

      {phase === "done" ? (
        <div className={styles.toast} role="status">
          密码已更新，请重新登录
        </div>
      ) : null}
    </main>
  );
}
