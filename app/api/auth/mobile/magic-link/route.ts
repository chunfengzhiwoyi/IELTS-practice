/**
 * POST /api/auth/mobile/magic-link — 移动端邮箱一次性登录链接
 * ------------------------------------------------------------
 * MOBILE-06 §3-B：邮箱登录链接场景（仅入口：忘记密码页）。
 *  - server-side Supabase Auth signInWithOtp → 发送一次性登录链接
 *  - shouldCreateUser:false → 不因误发而创建新账号
 *  - 无论邮箱是否存在均返回 sent:true（防账号枚举）
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/server";

export const runtime = "nodejs";

const MagicLinkSchema = z.object({
  email: z.string().email().max(254),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "请求格式错误" } },
      { status: 400 },
    );
  }

  const parsed = MagicLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "请输入正确的邮箱地址" } },
      { status: 400 },
    );
  }

  const { email } = parsed.data;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (request.headers.get("origin") ?? "http://localhost:3000");

  try {
    const supabase = await createServerClient();
    await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: origin,
      },
    });
  } catch {
    // 账号不存在 / 邮件服务失败：仍返回 sent（防枚举）
  }

  return NextResponse.json({ sent: true });
}
