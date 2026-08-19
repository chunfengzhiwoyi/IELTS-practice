/**
 * GET /api/account/profile  — 读取当前用户的昵称与头像
 * PUT /api/account/profile  — 保存昵称与头像（同时写 auth metadata + users 行）
 * ------------------------------------------------------------
 * 鉴权：getCurrentUser（demo 模式返回固定 demo 用户）。
 * 写入走 service_role：auth.admin.updateUserById（顶栏即时读取）
 *   且 upsert public.users（服务端备份 / 检索用）。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/db/server";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }
  try {
    const supabase = createServiceRoleClient();
    const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
    const { data: row } = await supabase
      .from("users")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      ok: true,
      email: user.email,
      displayName:
        (row?.display_name as string | null) ??
        (meta.display_name as string | null) ??
        null,
      avatarUrl:
        (row?.avatar_url as string | null) ??
        (meta.avatar_url as string | null) ??
        null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "读取失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

const PutSchema = z.object({
  displayName: z.string().max(40).optional(),
  // 空字符串表示清除头像
  avatarUrl: z.string().url().optional().or(z.literal("")),
});

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }
  try {
    const body = PutSchema.parse(await request.json());
    const displayName = body.displayName ?? null;
    const avatarUrl = body.avatarUrl && body.avatarUrl.length > 0 ? body.avatarUrl : null;

    const supabase = createServiceRoleClient();
    // 1) auth metadata（masthead / useAuth 即时读取）
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { display_name: displayName, avatar_url: avatarUrl },
    });
    // 2) users 行（注册触发器保证行存在，upsert 仅更新对应列）
    const { error } = await supabase.from("users").upsert({
      id: user.id,
      email: user.email,
      display_name: displayName,
      avatar_url: avatarUrl,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
