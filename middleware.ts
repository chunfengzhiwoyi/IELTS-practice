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
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/** 受保护路由（AUTH_MODE=supabase 时需要登录） */
const PROTECTED_PATHS = ["/learn", "/review", "/speaking", "/report", "/account"];

export async function middleware(request: NextRequest) {
  // 必须带上 request headers，避免 cookie 操作后响应头失效
  let response = NextResponse.next({ request: { headers: request.headers } });

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
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  }

  // --- Trace ID ---
  const traceId = request.headers.get("x-trace-id") ?? generateTraceId();
  response.headers.set("x-trace-id", traceId);

  // --- 路由保护 (仅 AUTH_MODE=supabase 时生效) ---
  const authMode = process.env.AUTH_MODE ?? "demo";
  if (authMode === "supabase") {
    const path = request.nextUrl.pathname;
    const isProtected = PROTECTED_PATHS.some((p) => path.startsWith(p));
    if (isProtected) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && anonKey) {
        const supabase = createServerClient(url, anonKey, {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
              cookiesToSet.forEach(({ name, value, options }) => {
                request.cookies.set(name, value);
                response.cookies.set(name, value, options);
              });
            },
          },
        });

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!user || error) {
          return NextResponse.redirect(new URL("/login", request.url));
        }
      }
    }
  }

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
