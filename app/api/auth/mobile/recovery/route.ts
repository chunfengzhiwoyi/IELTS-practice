/**
 * POST /api/auth/mobile/recovery — 移动端发送密码重置邮件
 * ------------------------------------------------------------
 * MOBILE-06 §3-A：重置密码场景。
 *  - server-side Supabase Auth resetPasswordForEmail → 发送重置链接到邮箱
 *  - 无论邮箱是否存在均返回 sent:true（防账号枚举）
 *  - 该接口不改变登录态（用户当前可能已登录；重置后密码变化由 Supabase 统一处理）
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/server";

export const runtime = "nodejs";

const RecoverySchema = z.object({
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

  const parsed = RecoverySchema.safeParse(body);
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
  const redirectTo = `${origin}/reset-password`;

  try {
    const supabase = await createServerClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // 邮件服务失败 / Supabase 不可达：仍返回 sent（防枚举）；真实失败由用户收信体验暴露
  }

  return NextResponse.json({ sent: true });
}
