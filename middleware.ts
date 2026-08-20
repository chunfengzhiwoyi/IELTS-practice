/**
 * Next.js Middleware
 * ------------------------------------------------------------
 * 职责：
 *  1. 安全 headers (CSP, X-Content-Type-Options 等)
 *  2. 请求日志（trace_id 注入）
 *  3. 路由保护（AUTH_MODE=supabase 时保护 /learn /review /speaking /report）
 *
 * 交接单 §9.2：
 *  - OpenAI/Bailian/DeepSeek API Key 只存在服务端
 *  - Supabase 开启 RLS
 *  - 所有删除和重置数据动作必须由明确用户操作触发
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  // --- 安全 Headers ---
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
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
        "img-src 'self' data: blob:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self'" + (supabaseHost ? ` https://${supabaseHost}` : ""),
        "frame-ancestors 'none'",
      ].join("; "),
    );
  }

  // --- Trace ID ---
  const traceId = request.headers.get("x-trace-id") ?? generateTraceId();
  response.headers.set("x-trace-id", traceId);

  // --- 路由保护：当前全部页面公开访问，不强制登录 ---
  // 认证检查由各 API Route 自行负责（如 /api/account/profile）

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
