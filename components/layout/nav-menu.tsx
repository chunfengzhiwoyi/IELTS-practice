"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 子页紧凑菜单浮层：点击展开四张功能卡入口（替代常驻 tab）。
// 仅作导航，不承载任务状态。
const ENTRIES = [
  { folio: "01", href: "/learn", title: "新词学习", desc: "词卡 + 主动回忆" },
  { folio: "02", href: "/review", title: "今日复习", desc: "按记忆曲线巩固" },
  { folio: "03", href: "/speaking", title: "口语训练", desc: "Part 1/2/3 反馈" },
  { folio: "04", href: "/report", title: "学习报告", desc: "分项表现与建议" },
  { folio: "05", href: "/goals", title: "备考目标", desc: "计划与自估" },
];

export function NavMenu({
  onNavigate,
  triggerRef,
}: {
  onNavigate: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLAnchorElement[]>([]);
  const pathname = usePathname();

  // 打开时把焦点移到首个条目
  useEffect(() => {
    itemsRef.current[0]?.focus();
  }, []);

  // 关闭（卸载）后把焦点还给触发器，避免键盘用户焦点丢失
  useEffect(() => {
    return () => {
      triggerRef?.current?.focus();
    };
  }, [triggerRef]);

  // 键盘：Esc 关闭、方向键移动、Tab 限制在浮层内
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onNavigate();
        return;
      }
      const items = itemsRef.current.filter(Boolean);
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLAnchorElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (e.key === "Tab") {
        if (idx === -1) {
          e.preventDefault();
          items[0]?.focus();
        } else if (e.shiftKey && idx === 0) {
          e.preventDefault();
          items[items.length - 1]?.focus();
        } else if (!e.shiftKey && idx === items.length - 1) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
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
    <div className="nav-overlay" role="menu" aria-label="页面导航" ref={ref}>
      {ENTRIES.map((e, i) => {
        const active = pathname === e.href;
        return (
          <Link
            key={e.href}
            href={e.href}
            role="menuitem"
            aria-current={active ? "page" : undefined}
            ref={(el) => {
              if (el) itemsRef.current[i] = el;
            }}
            className={`nav-overlay__item${active ? " nav-overlay__item--current" : ""}`}
            onClick={onNavigate}
          >
            <span className="folio">{e.folio}</span>
            <span className="nav-overlay__body">
              <span className="nav-overlay__title">{e.title}</span>
              <span className="nav-overlay__desc">{e.desc}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
