"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

// 子页紧凑菜单浮层：点击展开四张功能卡入口（替代常驻 tab）。
// 仅作导航，不承载任务状态。
const ENTRIES = [
  { folio: "01", href: "/learn", title: "新词学习", desc: "词卡 + 主动回忆" },
  { folio: "02", href: "/review", title: "今日复习", desc: "按记忆曲线巩固" },
  { folio: "03", href: "/speaking", title: "口语训练", desc: "Part 1/2/3 反馈" },
  { folio: "04", href: "/report", title: "学习报告", desc: "分项表现与建议" },
];

export function NavMenu({ onNavigate }: { onNavigate: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNavigate();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onNavigate();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onNavigate]);

  return (
    <div className="nav-overlay" role="menu" ref={ref}>
      {ENTRIES.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          role="menuitem"
          className="nav-overlay__item"
          onClick={onNavigate}
        >
          <span className="folio">{e.folio}</span>
          <span className="nav-overlay__body">
            <span className="nav-overlay__title">{e.title}</span>
            <span className="nav-overlay__desc">{e.desc}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
