import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Json } from "@/lib/db/types";
import { createServiceRoleClient } from "@/lib/db/server";
import { exchangeWechatCode } from "@/lib/auth/wechat";
import { issueSessionForOpenid } from "@/lib/auth/wechat-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/wechat-login/confirm
 * 小程序扫码落地页调用：{ code, state }
 *   校验 state 有效 → code 换 openid → 签发会话 → 写入 state 行（confirmed）
 * 网页端随后通过 /poll?state= 取走会话。
 */
export async function POST(req: NextRequest) {
  let body: { code?: unknown; state?: unknown };
  try {
    body = (await req.json()) as { code?: unknown; state?: unknown };
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : "";
  if (!code || !state) {
    return NextResponse.json({ error: "缺少 code 或 state" }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  // 校验 state 存在、pending、未过期
  const { data: row } = await admin
    .from("wechat_login_states")
    .select("state, status, expires_at")
    .eq("state", state)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "扫码登录已失效，请刷新二维码" }, { status: 410 });
  }
  if (row.status !== "pending" || new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from("wechat_login_states").delete().eq("state", state);
    return NextResponse.json({ error: "二维码已过期，请刷新" }, { status: 410 });
  }

  // code → openid
  let openid: string;
  try {
    openid = (await exchangeWechatCode(code)).openid;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "微信身份验证失败" },
      { status: 502 },
    );
  }

  // 签发会话并写入 state 行
  try {
    const { session } = await issueSessionForOpenid(openid);
    await admin
      .from("wechat_login_states")
      .update({ status: "confirmed", session_json: session as unknown as Json })
      .eq("state", state);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "签发会话失败" },
      { status: 502 },
    );
  }
}
