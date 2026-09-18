/**
 * POST /api/auth/mobile/change-password — 已登录用户修改密码（MOBILE-07）
 * ------------------------------------------------------------
 * server-mediated：基于当前标准 SSR 登录 cookie 识别用户，绝不接受/下发 token，
 * 不使用 service_role 覆盖身份。用户只需输入并确认新密码（不需要旧密码），
 * 因为该调用已经由有效登录会话授权；与"忘记密码"邮件找回是两条独立路径。
 *
 * 成功后保留登录态；如 Supabase 刷新了会话，新 cookie 随响应 Set-Cookie。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/server";

export const runtime = "nodejs";

const BodySchema = z.object({
  newPassword: z.string().min(6).max(128),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "请求格式错误" } },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "WEAK_PASSWORD", message: "新密码至少 6 位" } },
      { status: 422 },
    );
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: { code: "SESSION_EXPIRED", message: "登录状态已失效，请重新登录" } },
      { status: 401 },
    );
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "CHANGE_PASSWORD_FAILED", message: "暂时无法修改密码，请稍后再试" } },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
