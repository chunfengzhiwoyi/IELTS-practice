import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { exchangeWechatCode } from "@/lib/auth/wechat";
import { issueSessionForOpenid } from "@/lib/auth/wechat-bridge";

export const runtime = "nodejs";

interface WechatBridgeResult {
  session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    user: unknown;
  };
  openid: string;
}

/**
 * 微信登录桥（小程序端调用，P2 保留）
 * ------------------------------------------------------------
 * 流程：小程序 wx.login() 拿到 code → POST { code } 到此路由
 *   → 服务端用 code 换 openid → 查/建 Supabase 用户 → 签发会话
 *   → 返回 access_token / refresh_token 给小程序端本地保存
 */
export async function POST(req: NextRequest) {
  let body: { code?: unknown };
  try {
    body = (await req.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "缺少 wx.login code" }, { status: 400 });
  }

  // 1) code → openid
  let openid: string;
  try {
    const wx = await exchangeWechatCode(code);
    openid = wx.openid;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "微信身份验证失败" },
      { status: 502 },
    );
  }

  // 2) openid → 查/建用户 + 签发会话
  try {
    const { session } = await issueSessionForOpenid(openid);
    const result: WechatBridgeResult = {
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      },
      openid,
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "签发会话失败" },
      { status: 502 },
    );
  }
}
