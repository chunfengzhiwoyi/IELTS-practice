/**
 * 微信 access_token 获取（带内存缓存）
 * ------------------------------------------------------------
 * getwxacodeunlimit 等接口需要 access_token；微信限制每日获取次数（约 2000），
 * 故在进程内缓存至临近过期（提前 60s 刷新）。
 * appid / secret 来自 .env.local 的 WECHAT_APPID / WECHAT_SECRET。
 */
import "server-only";
import { getWechatEnv } from "./wechat";

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cache: CachedToken | null = null;

export async function getWechatAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now + 60_000) {
    return cache.token;
  }
  const { appid, secret } = getWechatEnv();
  const url =
    `https://api.weixin.qq.com/cgi-bin/token` +
    `?grant_type=client_credential` +
    `&appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`微信 access_token HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (data.errcode) {
    throw new Error(`微信 access_token 失败: ${data.errcode} ${data.errmsg ?? ""}`);
  }
  if (!data.access_token) {
    throw new Error("微信未返回 access_token");
  }
  cache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 7200) * 1000,
  };
  return cache.token;
}
