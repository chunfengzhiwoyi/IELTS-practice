"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { computeStreak } from "@/lib/client/progress";
import { createSupabaseBrowserClient } from "@/lib/db/browser";
import { useAuth } from "@/components/auth/useAuth";
import { Logo } from "@/components/layout/logo";
import { NavMenu } from "@/components/layout/nav-menu";
import { useLlmStatus } from "@/components/llm/llm-status";

export function Masthead() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { status: llmStatus } = useLlmStatus();
  const [streak, setStreak] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 首页以四张功能卡作为唯一菜单，无需重复触发；子页显示紧凑「菜单」浮层。
  const isHome = pathname === "/";
  // 登录/找回密码页不显示账户控制，避免与页面表单重复
  const isAuthPage = pathname === "/login" || pathname.startsWith("/reset-password");

  useEffect(() => {
    setStreak(computeStreak());
  }, []);

  // 路由变化时收起菜单
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut({ scope: "global" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="masthead">
      <div className="masthead__inner">
        <Logo />

        <div className="masthead__right">
          {!isHome && (
            <div className="nav-menu-wrap">
              <button
                ref={triggerRef}
                type="button"
                className="nav-trigger"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="打开页面导航菜单"
                onClick={() => setMenuOpen((v) => !v)}
              >
                菜单
              </button>
              {menuOpen && (
                <NavMenu onNavigate={() => setMenuOpen(false)} triggerRef={triggerRef} />
              )}
            </div>
          )}

          {!isAuthPage && !loading && (
            <div className="account-area">
              {user ? (
                <div className="account-chip">
                  <Link href="/account" className="account-chip__link" title={user.email ?? ""}>
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt="" className="account-chip__avatar" />
                    ) : (
                      <span className="account-chip__letter">
                        {(user.displayName || user.email || "?").trim().charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                    <span className="account-chip__name">
                      {user.displayName || user.email?.split("@")[0] || "已登录"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="account-area__link"
                    onClick={() => void handleSignOut()}
                  >
                    退出
                  </button>
                </div>
              ) : (
                <Link href="/login" className="account-area__link">
                  登录
                </Link>
              )}
            </div>
          )}

          <div className="streak">
            连续 <b>{streak ?? "—"}</b> 天
          </div>

          {!isAuthPage && (
            llmStatus === "offline" ? (
              <Link
                href="/account"
                className="ai-status ai-status--offline"
                aria-label="AI 离线，去配置模型"
                title="AI 离线 · 点击配置你的模型"
              >
                <span className="ai-status__dot" />
                <span className="ai-status__text">AI 离线</span>
                <span className="ai-status__cta">去配置</span>
              </Link>
            ) : (
              <span
                className={`ai-status${llmStatus === "checking" ? " ai-status--checking" : ""}`}
                title={llmStatus === "checking" ? "正在检查 AI 服务" : "AI 服务在线"}
              >
                <span className="ai-status__dot" />
                <span className="ai-status__text">
                  {llmStatus === "checking" ? "AI 检查中…" : "AI 在线"}
                </span>
              </span>
            )
          )}
        </div>
      </div>
    </header>
  );
}
