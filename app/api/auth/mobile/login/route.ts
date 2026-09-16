/**
 * POST /api/auth/mobile/login — 移动端邮箱密码登录
 * ------------------------------------------------------------
 * MOBILE-04B Auth Contract §4：
 *  - server-side Supabase Auth（createServerClient + signInWithPassword）
 *  - 成功后将 Supabase session 写入标准 SSR cookie（随响应 Set-Cookie）
 *  - 响应绝不返回 access_token / refresh_token / Session JSON
 *  - 错误映射为产品级错误码（§13 Error Taxonomy）
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/server";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(6).max(128),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { authenticated: false, error: { code: "INVALID_INPUT", message: "请求格式错误" } },
      { status: 400 },
    );
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { authenticated: false, error: { code: "INVALID_INPUT", message: "邮箱或密码格式不正确" } },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // 不区分「账号不存在 / 密码错误 / 邮箱未验证」，避免泄露账号存在性
    return NextResponse.json(
      { authenticated: false, error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" } },
      { status: 401 },
    );
  }

  // 最小用户状态：id + email。token 只存在于 Set-Cookie，绝不进入响应 JSON。
  return NextResponse.json({
    authenticated: true,
    user: { id: data.user.id, email: data.user.email },
  });
}
