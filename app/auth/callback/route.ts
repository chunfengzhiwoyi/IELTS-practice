/**
 * Auth 回调
 * ------------------------------------------------------------
 * Supabase 邮箱链接 / OAuth 回跳到此。
 * 
 * 策略：先用 302 → 中间页（带 cookie），中间页再 JS 跳转首页。
 * 这样 Set-Cookie 在非 redirect response 中更可靠。
 * 
 * 但更简单的方案：直接在 GET handler 中 exchangeCodeForSession
 * 然后返回带 cookie 的 redirect。Next.js 15 + Vercel 支持此模式。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!code || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // 构造最终重定向的目标 URL
  const redirectUrl = new URL(next, origin);

  // 构造响应 —— 关键：先 redirect，cookie 写在这个 redirect response 上
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // 写进 response（浏览器会收到 Set-Cookie header）
            response.cookies.set(name, value, {
              ...options,
              // 确保 cookie 属性兼容 Vercel 生产环境
              sameSite: "lax",
              secure: true,
            });
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // code 无效/已过期 → 回登录页
    return NextResponse.redirect(`${origin}/login?error=code_expired`);
  }

  // 成功：response 已经带了 Set-Cookie headers
  return response;
}
