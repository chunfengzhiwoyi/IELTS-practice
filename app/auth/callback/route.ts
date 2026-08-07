/**
 * Auth 回调
 * ------------------------------------------------------------
 * Supabase 邮箱魔法链接会跳回本地址并附带 ?code=xxx。
 * 走 exchangeCodeForSession，交换成 session cookie。
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectTo = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(redirectTo, url.origin));
}
