/**
 * 微信登录桥核心（服务端）
 * ------------------------------------------------------------
 * 把「openid → 查/建 Supabase 用户 → 签发会话」抽成公共函数，
 * 供两个入口复用：
 *   1) POST /api/auth/wechat-bridge        —— 小程序端 wx.login 直接登录（P2）
 *   2) POST /api/auth/wechat-login/confirm —— 扫码登录：小程序扫码后回调，写入 state 行
 * 安全：全程服务端，appid/secret/service_role 不进浏览器。
 */
import "server-only";
import type { Session } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/db/server";

export interface IssuedSession {
  session: Session;
  userId: string;
  pseudoEmail: string;
}

export async function issueSessionForOpenid(openid: string): Promise<IssuedSession> {
  const pseudoEmail = `${openid}@wechat.local`;
  const admin = createServiceRoleClient();

  // 1) 查已有用户（按 openid）
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("wechat_openid", openid)
    .maybeSingle();

  let userId: string;
  if (existing?.id) {
    userId = existing.id;
  } else {
    // 2) 创建 Supabase 用户（openid 派生的唯一伪邮箱）
    const created = await admin.auth.admin.createUser({
      email: pseudoEmail,
      email_confirm: true,
      user_metadata: { wechat_openid: openid, display_name: "微信用户" },
    });
    if (created.error || !created.data.user) {
      // 并发创建导致 email 冲突，重试查 openid 映射
      const { data: retry } = await admin
        .from("users")
        .select("id")
        .eq("wechat_openid", openid)
        .maybeSingle();
      if (retry?.id) {
        userId = retry.id;
      } else {
        throw new Error(created.error?.message ?? "创建微信用户失败");
      }
    } else {
      userId = created.data.user.id;
      // 触发器已建 public.users 行（email=伪邮箱）；补写 openid 与昵称
      await admin
        .from("users")
        .update({ wechat_openid: openid, display_name: "微信用户" })
        .eq("id", userId);
    }
  }

  // 3) 签发会话：generateLink(magiclink) + verifyOtp
  const redirectTo = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const linkRes = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: pseudoEmail,
    options: { redirectTo },
  });
  const linkData = linkRes.data as unknown as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const hashed = linkData?.hashed_token ?? linkData?.properties?.hashed_token;
  if (!hashed) {
    throw new Error("签发会话失败：未获取到 magiclink token");
  }
  const otpRes = await admin.auth.verifyOtp({
    email: pseudoEmail,
    token: hashed,
    type: "magiclink",
  });
  if (otpRes.error || !otpRes.data.session) {
    throw new Error(otpRes.error?.message ?? "签发会话失败");
  }

  // 4) 更新最近登录
  await admin
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);

  return { session: otpRes.data.session, userId, pseudoEmail };
}
