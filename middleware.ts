/**
 * Next.js Middleware
 * ------------------------------------------------------------
 * 职责：
 *  1. 安全 headers (CSP, X-Content-Type-Options 等)
 *  2. 请求日志（trace_id 注入）
 *  3. 路由保护（AUTH_MODE=supabase 时保护 /learn /review /speaking /report）
 *  4. DASHBOARD-DEPLOY-ISOLATION-02：dashboard-only 独立部署路由白名单
 *  5. LEARNING-REPORT-ONLINE-02：additive 放行 Learning Report 自身路由
 *
 * 交接单 §9.2：
 *  - OpenAI/Bailian/DeepSeek API Key 只存在服务端
 *  - Supabase 开启 RLS
 *  - 所有删除和重置数据动作必须由明确用户操作触发
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** dashboard-only 部署允许的精确路径 */
const DASHBOARD_ALLOWED_EXACT = new Set([
  "/",
  "/dashboard",
  "/login",
  "/reset-password",
  "/auth/callback",
  "/report", // LEARNING-REPORT-ONLINE-02
]);

/**
 * LEARNING-REPORT-ONLINE-02：Learning Report 自身必要 API（additive）。
 * 只放行报告页实际依赖的精确路径，不放宽任何其他 API。
 */
const REPORT_ALLOWED_EXACT = new Set([
  "/api/report",
  "/api/goal",
  "/api/learning/stats",
]);

/**
 * MOBILE-04B：移动端 Auth 端点（精确放行，不放宽 /api/auth 全量）。
 * Contract §10：/api/auth/mobile/login|session|logout 三个精确路径。
 * MOBILE-06 §2/§3：注册 / 密码重置邮件 / 邮箱登录链接（精确追加，不放开全量）。
 */
const MOBILE_AUTH_ALLOWED_EXACT = new Set([
  "/api/auth/mobile/login",
  "/api/auth/mobile/session",
  "/api/auth/mobile/logout",
  "/api/auth/mobile/register",
  "/api/auth/mobile/recovery",
  "/api/auth/mobile/magic-link",
]);

/**
 * dashboard-only 白名单（仅 DASHBOARD-DEPLOY-ISOLATION-02 分支生效）。
 * 允许：根(→/dashboard)、/dashboard、/api/dashboard 及其子路由、
 * supabase 登录所需 /login /reset-password /auth/callback、Next 运行时资源、
 * Learning Report 自身路由（/report 与 /api/report /api/goal /api/learning/stats）、
 * MOBILE-04B 移动端 Auth 端点（精确 3 条）与 Speaking API 前缀（鉴权由 requireUser 负责）。
 * 其余一切页面/API 返回 404，不暴露原 IELTS 产品。
 */
export function isDashboardOnlyAllowed(pathname: string): boolean {
  if (DASHBOARD_ALLOWED_EXACT.has(pathname)) return true;
  if (REPORT_ALLOWED_EXACT.has(pathname)) return true; // LEARNING-REPORT-ONLINE-02
  if (MOBILE_AUTH_ALLOWED_EXACT.has(pathname)) return true; // MOBILE-04B：移动 Auth 精确端点
  if (pathname.startsWith("/api/dashboard")) return true; // 主 API + bad-cases/lifecycle/modules/traces
  if (pathname === "/api/speaking" || pathname.startsWith("/api/speaking/")) return true; // MOBILE-04B：Speaking API（auth 由 requireUser 负责）
  if (pathname.startsWith("/_next/")) return true; // Next 运行时资源（静态已由 matcher 排除）
  if (pathname.startsWith("/__nextjs")) return true; // dev overlay / stack frame
  return false;
}

export async function middleware(request: NextRequest) {
  // --- DASHBOARD-DEPLOY-ISOLATION-02：路由隔离（404 优先于 redirect）---
  if (!isDashboardOnlyAllowed(request.nextUrl.pathname)) {
    const blocked = new NextResponse("404 Not Found", { status: 404 });
    blocked.headers.set("X-Content-Type-Options", "nosniff");
    blocked.headers.set("X-Frame-Options", "DENY");
    return blocked;
  }

  const response = NextResponse.next({ request: { headers: request.headers } });

  // --- 安全 Headers ---
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=()",
  );

  // CSP: 开发模式宽松，生产模式收紧
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev) {
    // 放行必需的第三方：Google Fonts(样式/字体) + Supabase API(登录/数据)。
    // 其余保持 'self' 严格策略。Supabase 域名从 env 动态读取，避免写死。
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseHost = supabaseUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob:" + (supabaseHost ? ` https://${supabaseHost}` : ""),
        "font-src 'self' https://fonts.gstatic.com",
        "media-src 'self' blob:",
        "connect-src 'self'" + (supabaseHost ? ` https://${supabaseHost}` : ""),
        "frame-ancestors 'none'",
      ].join("; "),
    );
  }

  // --- Trace ID ---
  const traceId = request.headers.get("x-trace-id") ?? generateTraceId();
  response.headers.set("x-trace-id", traceId);

  return response;
}

export const config = {
  matcher: [
    // 匹配所有路径（排除静态资源和 _next）
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

function generateTraceId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `trc_${ts}_${rand}`;
}
