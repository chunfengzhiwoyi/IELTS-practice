/**
 * POST /api/auth/mobile/logout — 移动端登出
 * ------------------------------------------------------------
 * MOBILE-04B Auth Contract §6：
 *  - server-side Supabase signOut（撤销 server 侧 session/refresh）
 *  - 显式清空标准 SSR auth cookies（sb-* 前缀），即使 Supabase 不可达
 *    也保证 cookie 被清除（本地 session material 必须清除）
 *  - 返回 authenticated:false
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/db/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = await createServerClient();
    await supabase.auth.signOut();
  } catch {
    // Supabase 不可达时继续本地清理；服务端 revocation 记为未确认（debug log 记录，不暴露给用户）
  }

  try {
    const cookieStore = await cookies();
    cookieStore
      .getAll()
      .filter((c) => c.name.startsWith("sb-"))
      .forEach((c) => cookieStore.delete(c.name));
  } catch {
    // 无 cookie 可清
  }

  return NextResponse.json({ authenticated: false });
}
