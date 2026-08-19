import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/db/server";
import { generateWechatLoginQrcode } from "@/lib/auth/wechat-qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/wechat-login/qrcode
 * 生成登录小程序码：建 state → 落库（pending）→ 调微信出码 → 返回 base64 图 + state
 * 前端用 state 轮询 /poll。
 */
export async function GET() {
  try {
    const state = randomBytes(16).toString("hex"); // 32 字符，符合 scene ≤32
    const admin = createServiceRoleClient();

    // 顺手清过期行（best-effort，失败不影响出码）
    try {
      await admin
        .from("wechat_login_states")
        .delete()
        .lt("expires_at", new Date().toISOString());
    } catch {
      // 清理失败不影响出码
    }

    await admin.from("wechat_login_states").insert({
      state,
      status: "pending",
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    const png = await generateWechatLoginQrcode(state);
    const qrcode = `data:image/png;base64,${png.toString("base64")}`;
    return NextResponse.json({ state, qrcode }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "生成二维码失败";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
