"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./dashboard-login.module.css";

type DashboardLoginPageProps = {
  onSubmit?: (credentials: { email: string; password: string }) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  onForgotPassword?: () => void;
};

const BASE_BAR_HEIGHTS = [12, 18, 24, 14, 27, 20, 31, 17, 23, 19];

export default function DashboardLoginPage({
  onSubmit,
  loading = false,
  error = null,
  onForgotPassword,
}: DashboardLoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [barHeights, setBarHeights] = useState(BASE_BAR_HEIGHTS);
  const [pulseIndex, setPulseIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const bars = useMemo(
    () =>
      barHeights.map((height, index) => ({
        height,
        accent: index === 2 || index === 6,
      })),
    [barHeights]
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const varyBars = () => {
      setBarHeights((current) => {
        const next = [...current];
        const picks: number[] = [];

        while (picks.length < 2) {
          const index = Math.floor(Math.random() * next.length);
          if (!picks.includes(index)) picks.push(index);
        }

        for (const index of picks) {
          const base = BASE_BAR_HEIGHTS[index] ?? 16; // TS 兜底：index 恒在 0-9 有效，不影响视觉
          const factor = 0.88 + Math.random() * 0.24;
          next[index] = Math.max(9, Math.min(32, Number((base * factor).toFixed(1))));
        }

        return next;
      });

      timer = setTimeout(varyBars, 3500 + Math.random() * 1500);
    };

    timer = setTimeout(varyBars, 2600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const pulse = () => {
      const index = Math.floor(Math.random() * 3);
      setPulseIndex(index);

      setTimeout(() => setPulseIndex(null), 900);
      timer = setTimeout(pulse, 5000 + Math.random() * 4000);
    };

    timer = setTimeout(pulse, 4200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (onSubmit) {
      await onSubmit({ email, password });
      return;
    }

    // Visual-only fallback. The integration agent should wire the real auth handler.
    setToast("视觉稿：登录认证待接入");
  }

  function handleForgotPassword() {
    if (onForgotPassword) {
      onForgotPassword();
      return;
    }

    setToast("密码找回功能将在后续开放");
  }

  return (
    <main className={styles.shell}>
      <div className={styles.brand}>灵犀</div>
      <div className={styles.productLabel}>产品数据看板</div>

      <section className={styles.analytics} aria-label="数据分析画布">
        <div className={styles.canvasGlow} />
        <div className={styles.grid} />

        <div className={styles.analysisStage}>
          <div className={styles.trendWrap}>
            <svg
              className={styles.trendSvg}
              viewBox="0 0 610 180"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <filter id="softGlow" x="-20%" y="-30%" width="140%" height="160%">
                  <feGaussianBlur stdDeviation="0.7" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <path className={styles.ghostLine} d="M0 136 H610" />

              <path
                className={styles.trendBase}
                filter="url(#softGlow)"
                d="M0 132
                   C56 132 88 129 118 124
                   C154 118 174 99 202 77
                   C233 52 263 40 305 42
                   C351 44 382 46 420 58
                   C456 69 483 80 519 84
                   C552 88 580 87 610 86"
              />

              <path
                className={styles.trendHighlight}
                d="M0 132
                   C56 132 88 129 118 124
                   C154 118 174 99 202 77
                   C233 52 263 40 305 42
                   C351 44 382 46 420 58
                   C456 69 483 80 519 84
                   C552 88 580 87 610 86"
              />

              <g
                className={`${styles.eventPoint} ${pulseIndex === 0 ? styles.pulse : ""}`}
                transform="translate(202 77)"
              >
                <circle className={styles.eventRing} cx="0" cy="0" r="9" />
                <circle className={styles.eventCore} cx="0" cy="0" r="2.5" />
              </g>

              <g
                className={`${styles.eventPoint} ${styles.eventMain} ${
                  pulseIndex === 1 ? styles.pulse : ""
                }`}
                transform="translate(351 44)"
              >
                <circle className={styles.eventRing} cx="0" cy="0" r="10" />
                <circle className={styles.eventCore} cx="0" cy="0" r="3" />
              </g>

              <g
                className={`${styles.eventPoint} ${pulseIndex === 2 ? styles.pulse : ""}`}
                transform="translate(519 84)"
              >
                <circle className={styles.eventRing} cx="0" cy="0" r="9" />
                <circle className={styles.eventCore} cx="0" cy="0" r="2.5" />
              </g>
            </svg>

            <div className={styles.scan} aria-hidden="true" />
          </div>

          <div className={styles.density} aria-hidden="true">
            {bars.map((bar, index) => (
              <span
                key={index}
                className={`${styles.bar} ${bar.accent ? styles.barAccent : ""}`}
                style={{ height: `${bar.height}px` }}
              />
            ))}
          </div>

          <div className={styles.ticks} aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <span key={index} className={styles.tick} />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.loginPanel}>
        <form className={styles.loginForm} onSubmit={handleSubmit}>
          <h1>欢迎回来</h1>
          <p className={styles.subtitle}>使用管理员账号继续</p>

          <div className={styles.field}>
            <label htmlFor="dashboard-email">邮箱</label>
            <div className={styles.inputWrap}>
              <span className={styles.fieldIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 6.75h16v10.5H4z" />
                  <path d="m4.5 7.25 7.5 5.5 7.5-5.5" />
                </svg>
              </span>
              <input
                id="dashboard-email"
                type="email"
                autoComplete="username"
                placeholder="请输入邮箱"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          </div>

          <div className={`${styles.field} ${styles.passwordField}`}>
            <label htmlFor="dashboard-password">密码</label>
            <div className={styles.inputWrap}>
              <span className={styles.fieldIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="5" y="10" width="14" height="10" rx="2.5" />
                  <path d="M8.25 10V7.5a3.75 3.75 0 1 1 7.5 0V10" />
                </svg>
              </span>
              <input
                id="dashboard-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="请输入密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className={styles.eye}
                type="button"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPassword((current) => !current)}
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

          {error ? <div className={styles.error}>{error}</div> : null}

          <button className={styles.loginButton} type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className={styles.spinner} />
                登录中…
              </>
            ) : (
              "登录"
            )}
          </button>

          <div className={styles.formFooter}>
            <button className={styles.forgot} type="button" onClick={handleForgotPassword}>
              忘记密码？
            </button>
          </div>
        </form>
      </section>

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </main>
  );
}
