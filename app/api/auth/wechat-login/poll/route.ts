import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/db/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/wechat-login/poll?state=xxx
 * 网页/安卓轮询：
 *   pending  → { status: "pending" }
 *   confirmed → { status: "confirmed", session } 并删除该行（一次性消费）
 *   不存在/过期 → { status: "expired" }
 */
export async function GET(req: NextRequest) {
  const state = new URL(req.url).searchParams.get("state") ?? "";
  if (!state) {
    return NextResponse.json({ status: "expired" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: row } = await admin
    .from("wechat_login_states")
    .select("state, status, session_json, expires_at")
    .eq("state", state)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ status: "expired" });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from("wechat_login_states").delete().eq("state", state);
    return NextResponse.json({ status: "expired" });
  }
  if (row.status === "confirmed" && row.session_json) {
    await admin.from("wechat_login_states").delete().eq("state", state);
    return NextResponse.json({ status: "confirmed", session: row.session_json });
  }
  return NextResponse.json({ status: "pending" });
}
