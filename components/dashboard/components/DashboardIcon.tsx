export type DashboardIconKey =
  | "loop"
  | "activity"
  | "activate"
  | "retention"
  | "first_use"
  | "return"
  | "habit";

export function DashboardIcon({ kind }: { kind: DashboardIconKey }) {
  const common = { viewBox: "0 0 24 24", className: "lxdb-icon", "aria-hidden": true } as const;
  switch (kind) {
    case "loop":
      return (
        <svg {...common}>
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11V9a3 3 0 0 1 3-3h15" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v2a3 3 0 0 1-3 3H3" />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <path d="M3 12h4l2-6 4 12 2-6h6" />
        </svg>
      );
    // 首次激活：圆内播放三角（与 FINAL_MASTER 一致，非对勾）
    case "activate":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m10 8 6 4-6 4z" />
        </svg>
      );
    // 再次学习：循环箭头
    case "return":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      );
    // 7日留存：四列柱状图（与 FINAL_MASTER 一致，非循环箭头）
    case "retention":
      return (
        <svg {...common}>
          <path d="M4 18V8" />
          <path d="M10 18V4" />
          <path d="M16 18V11" />
          <path d="M22 18V7" />
        </svg>
      );
    case "first_use":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case "habit":
      return (
        <svg {...common}>
          <path d="M5 20v-5" />
          <path d="M10 20V9" />
          <path d="M15 20V5" />
          <path d="M20 20V2" />
        </svg>
      );
  }
}
