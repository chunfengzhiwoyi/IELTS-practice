"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { computeStreak } from "@/lib/client/progress";
import { Logo } from "@/components/layout/logo";
import { NavMenu } from "@/components/layout/nav-menu";

export function Masthead() {
  const pathname = usePathname();
  const [streak, setStreak] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // 首页以四张功能卡作为唯一菜单，无需重复触发；子页显示紧凑「菜单」浮层。
  const isHome = pathname === "/";

  useEffect(() => {
    setStreak(computeStreak());
  }, []);

  // 路由变化时收起菜单
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="masthead">
      <div className="masthead__inner">
        <Logo />

        <div className="masthead__right">
          {!isHome && (
            <div className="nav-menu-wrap">
              <button
                type="button"
                className="nav-trigger"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                菜单
              </button>
              {menuOpen && <NavMenu onNavigate={() => setMenuOpen(false)} />}
            </div>
          )}
          <div className="streak">
            连续 <b>{streak ?? "—"}</b> 天
          </div>
        </div>
      </div>
    </header>
  );
}
