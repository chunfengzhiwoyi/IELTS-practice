/**
 * 微信小程序码生成（无数量限制版 getwxacodeunlimit）
 * ------------------------------------------------------------
 * 生成的小程序码 scene 携带登录 state；用户扫码后进入小程序
 * pages/wechat-scan-login 页面，用 scene 里的 state 回调确认端点。
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/qr-code/wxacode.getwxacodeunlimit.html
 */
import "server-only";
import { getWechatAccessToken } from "./wechat-token";

/**
 * 生成登录用小程序码。
 * @param state 32 位随机十六进制串（scene 上限 32 字符）
 * @returns PNG 二进制
 */
export async function generateWechatLoginQrcode(state: string): Promise<Buffer> {
  const token = await getWechatAccessToken();

  // 体验/线上版本切换：默认线上版；本地联调可设 WECHAT_QRCODE_ENV=trial
  const envVersion = process.env.WECHAT_QRCODE_ENV || "release";

  const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scene: state,
      page: "pages/wechat-scan-login/index",
      width: 280,
      check_path: false, // 允许页面尚未发布
      env_version: envVersion,
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  // 成功：image/png 二进制；失败：JSON（含 errcode）
  if (!res.ok || !contentType.includes("image")) {
    const text = await res.text();
    throw new Error(`生成小程序码失败: ${res.status} ${text.slice(0, 200)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}
