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
};

export default nextConfig;
