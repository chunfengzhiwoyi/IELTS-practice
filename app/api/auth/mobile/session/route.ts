/**
 * GET /api/auth/mobile/session — 移动端会话探活
 * ------------------------------------------------------------
 * MOBILE-04B Auth Contract §5：
 *  - 必须由 server/Supabase 验证（getUser() 对 JWT 做服务端校验），
 *    禁止只判断 cookie 是否存在。
 *  - 若 access token 过期且可刷新，@supabase/ssr 服务端客户端会
 *    自动用 refresh token 刷新，并把新 Set-Cookie 写入本响应
 *    （Android CookieJar 自动更新，实现 cookie rotation）。
 *  - 200 → authenticated:true + 最小 user；401 → authenticated:false。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: { id: user.id, email: user.email },
  });
}
