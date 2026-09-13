import type { NextConfig } from "next";

/**
 * EXPORT_STATIC=1 时启用静态导出（output: export），用于 CloudStudio 等纯静态托管。
 * 常规 `next dev` / `next build`（SSR）不受影响。
 * 注意：静态导出不支持 API 路由 / middleware / searchParams —— 见 scripts/deploy-static.mjs。
 */
const staticExport = process.env.EXPORT_STATIC === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  devIndicators: false,
  ...(staticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  // DASHBOARD-DEPLOY-ISOLATION-02：dashboard-only 独立部署专用。
  // 根 URL 直接展示 /dashboard（rewrite 保持浏览器 URL 为 /）。
  // beforeFiles 确保在 app/page.tsx 之前拦截根路径。
  // 仅存在于 dashboard-only 分支；原产品分支不受影响。
  ...(!staticExport
    ? {
        async rewrites() {
          return { beforeFiles: [{ source: "/", destination: "/dashboard" }] };
        },
      }
    : {}),
};

export default nextConfig;
