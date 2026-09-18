/**
 * POST /api/auth/mobile/register — 移动端邮箱密码注册
 * ------------------------------------------------------------
 * MOBILE-06 §2：server-mediated 最小注册路径。
 *  - server-side Supabase Auth（createServerClient + signUp）
 *  - 若 signUp 直接返回 session（项目未强制邮件确认）→ 标准 SSR cookie 随响应写入 → 自动登录
 *  - 若项目要求邮件确认（session 为 null）→ 返回 requiresEmailConfirmation:true，
 *    不得宣称已登录；Android 引导用户查收确认邮件
 *  - 响应绝不返回 access_token / refresh_token / Session JSON
 *  - 昵称仅写入 user_metadata（users 表无 nickname 字段；Android 端昵称本地档案）
 *  - 新用户 public.users 行由 handle_new_auth_user 触发器自动创建（0012 已核验）
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/server";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(6).max(128),
  nickname: z.string().trim().max(24).optional(),
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

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { authenticated: false, error: { code: "INVALID_INPUT", message: "请检查邮箱与密码格式" } },
      { status: 400 },
    );
  }

  const { email, password, nickname } = parsed.data;
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: nickname ? { nickname: nickname.trim() } : undefined,
    },
  });

  if (error || !data.user) {
    return NextResponse.json(
      { authenticated: false, error: { code: "REGISTER_FAILED", message: "注册失败，请稍后重试" } },
      { status: 400 },
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
