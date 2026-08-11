import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Academic Editorial 设计令牌（OKLCH，见 globals.css :root）
        paper: { DEFAULT: "var(--paper)", 2: "var(--paper-2)", 3: "var(--paper-3)" },
        ink: { DEFAULT: "var(--ink)", soft: "var(--ink-soft)", meta: "var(--ink-meta)" },
        line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
        accent: {
          DEFAULT: "var(--accent)",
          deep: "var(--accent-deep)",
          wash: "var(--accent-wash)",
          contrast: "var(--accent-contrast)",
        },
        bronze: "var(--bronze)",
        // 语义反馈色（仅作小面积文字/顶标，不用大色块）
        pos: "oklch(45% 0.09 150)",
        warn: "oklch(58% 0.12 75)",
        neg: "oklch(50% 0.15 25)",
        // 保留旧 brand 兼容（仅在个别遗留处使用）
        brand: {
          50: "#f0f9ff",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        text: ["var(--font-text)"],
        ui: ["var(--font-ui)"],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
      },
      maxWidth: {
        folio: "920px",
        read: "680px",
      },
    },
  },
  plugins: [],
};

export default config;
