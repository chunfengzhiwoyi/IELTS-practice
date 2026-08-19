/**
 * 微信小程序登录辅助（服务端）
 * ------------------------------------------------------------
 * 仅用于 wechat-bridge 路由：用 wx.login 拿到的 code 换 openid。
 * appid / secret 来自微信小程序后台，绝不进浏览器包。
 */
import "server-only";

export interface WechatCodeSession {
  /** 小程序用户唯一标识 */
  openid: string;
  /** 同主体多小程序/公众号下的统一标识（可选） */
  unionid?: string;
  /** 会话密钥，仅用于解密微信敏感数据，本产品暂不使用 */
  session_key: string;
}

export interface WechatEnv {
  appid: string;
  secret: string;
}

/**
 * 读取微信小程序凭证。未配置时抛出明确错误（不影响网页端启动）。
 */
export function getWechatEnv(): WechatEnv {
  const appid = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_SECRET;
  if (!appid || !secret) {
    throw new Error(
      "微信登录未配置：请在 .env.local 设置 WECHAT_APPID 与 WECHAT_SECRET（小程序后台 → 开发管理 → 开发设置）",
    );
  }
  return { appid, secret };
}

/**
 * 用 wx.login 的 code 换取 openid（微信 jscode2session）。
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
 */
export async function exchangeWechatCode(code: string): Promise<WechatCodeSession> {
  const { appid, secret } = getWechatEnv();
  const url =
    `https://api.weixin.qq.com/sns/jscode2session` +
    `?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`微信 code2Session HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    openid?: string;
    unionid?: string;
    session_key?: string;
    errcode?: number;
    errmsg?: string;
  };

  if (data.errcode) {
    throw new Error(`微信 code2Session 失败: ${data.errcode} ${data.errmsg ?? ""}`);
  }
  if (!data.openid) {
    throw new Error("微信未返回 openid（code 无效或已过期）");
  }
  return {
    openid: data.openid,
    unionid: data.unionid,
    session_key: data.session_key ?? "",
  };
}
