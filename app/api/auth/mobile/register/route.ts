/**
 * POST /api/auth/mobile/register — 移动端邮箱密码注册
 * ------------------------------------------------------------
 * MOBILE-06 §2：server-mediated 最小注册路径。
 * MOBILE-07：错误细分（INVALID_EMAIL / WEAK_PASSWORD / EMAIL_ALREADY_REGISTERED / REGISTER_FAILED），
 * 用户层只看产品化 code，不接触技术细节。
 *  - server-side Supabase Auth（createServerClient + signUp）
 *  - 若 signUp 直接返回 session（项目未强制邮件确认）→ 标准 SSR cookie 随响应写入 → 自动登录
 *  - 若项目要求邮件确认（session 为 null）→ 返回 requiresEmailConfirmation:true
 *  - 响应绝不返回 access_token / refresh_token / Session JSON
 *  - 昵称仅写入 user_metadata
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/server";

export const runtime = "nodejs";

const emailSchema = z.string().email().max(254);
const passwordSchema = z.string().min(6).max(128);
const nicknameSchema = z.string().trim().max(24).optional();

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

  const input = z
    .object({ email: z.unknown(), password: z.unknown(), nickname: z.unknown().optional() })
    .safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { authenticated: false, error: { code: "INVALID_INPUT", message: "请检查邮箱与密码格式" } },
      { status: 400 },
    );
  }

  const emailOk = emailSchema.safeParse(input.data.email);
  if (!emailOk.success) {
    return NextResponse.json(
      { authenticated: false, error: { code: "INVALID_EMAIL", message: "邮箱格式不正确" } },
      { status: 422 },
    );
  }
  const passwordOk = passwordSchema.safeParse(input.data.password);
  if (!passwordOk.success) {
    return NextResponse.json(
      { authenticated: false, error: { code: "WEAK_PASSWORD", message: "密码至少 6 位" } },
      { status: 422 },
    );
  }
  const nicknameOk = nicknameSchema.safeParse(input.data.nickname);

  const email = emailOk.data;
  const password = passwordOk.data;
  const nickname = nicknameOk.success ? nicknameOk.data : undefined;

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: nickname ? { nickname: nickname.trim() } : undefined,
    },
  });

  if (error || !data.user) {
    const status = (error as { status?: number } | null)?.status;
    const code = String(
      (error as { code?: string; message?: string } | null)?.code ??
        (error as { message?: string } | null)?.message ??
        "",
    ).toLowerCase();
    const already =
      status === 422 || code.includes("already") || code.includes("user_already_exists");
    if (already) {
      return NextResponse.json(
        {
          authenticated: false,
          error: { code: "EMAIL_ALREADY_REGISTERED", message: "该邮箱已注册，直接登录即可" },
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { authenticated: false, error: { code: "REGISTER_FAILED", message: "暂时无法完成注册，请稍后再试" } },
      { status: 503 },
    );
  }

  // 项目配置要求邮件确认时 signUp 不返回 session（Supabase 默认）
  if (!data.session) {
    return NextResponse.json({
      authenticated: false,
      requiresEmailConfirmation: true,
      user: { id: data.user.id, email: data.user.email },
    });
  }

  // 已自动登录：SSR client 已把 session 写入标准 auth cookie（随响应 Set-Cookie）
  return NextResponse.json({
    authenticated: true,
    user: { id: data.user.id, email: data.user.email },
  });
}
