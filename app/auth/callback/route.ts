/**
 * Auth 回调
 * ------------------------------------------------------------
 * Supabase 邮箱魔法链接 / OAuth 会跳回本地址并附带 ?code=xxx。
 * 走 exchangeCodeForSession，交换成 session cookie。
 *
 * ⚠️ Next 15 关键坑（这就是之前死循环的根因）：
 *   必须把 cookie 写进「响应对象本身」(response.cookies.set)，
 *   仅写 cookies() store 或 request.cookies.set 在 redirect 场景下
 *   会丢失，导致浏览器拿不到 session → 回到登录页 → 反复收邮件死循环。
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

  // callback 只需要 anon key（公开），不需要 service_role
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 先构造响应，确保后续 setAll 写进的是「这个响应」
  let response = NextResponse.redirect(`${origin}${next}`);

  if (code && supabaseUrl && supabaseAnonKey) {
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
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // 交换失败（code 失效/已用过）→ 回登录页并带错误标记，避免静默死循环
      response = NextResponse.redirect(`${origin}/login?error=callback`);
    }
  } else if (!code) {
    response = NextResponse.redirect(`${origin}/login?error=callback`);
  }

  return response;
}
