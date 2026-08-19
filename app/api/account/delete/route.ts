/**
 * 删除账户（服务端）
 * ------------------------------------------------------------
 * 必须以 service_role 权限删除用户；前端无此权限。
 * 前置：用户已登录（getCurrentUser 从会话 cookie 取 id）。
 * 数据库层：public.users 及全部用户私有表均挂 on delete cascade，
 * 删除 auth.users 后由 Postgres 自动级联清空该用户数据。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/db/server";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录或会话已失效" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
