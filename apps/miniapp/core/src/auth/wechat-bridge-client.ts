/**
 * 微信登录桥接客户端（小程序端 / H5 通用，纯 TS）
 * ------------------------------------------------------------
 * 不依赖 @supabase/supabase-js，避免污染 core 包、破坏 web 端构建。
 * 仅负责：调网页端 wechat-bridge 路由拿到会话，并存到本地 StorageAdapter。
 *
 * 接入步骤（P5 · 小程序接 Supabase 同步层时）：
 *   1. 小程序端安装 @supabase/supabase-js，用 anon key 创建客户端；
 *   2. 调 WechatBridgeClient.loginWithCode(wx.login().code) 拿 session；
 *   3. 用 session.access_token / refresh_token 注入 supabase 客户端
 *      （supabase.auth.setSession({ access_token, refresh_token })）；
 *   4. 之后该客户端即代表该微信用户，学习数据经 P2 仓库自动同步；
 *   5. 匿名转正：本地匿名进度在拿到正式 userId 后，由同步层 upsert 合并
 *      （按 client_event_id 幂等，详见 mini-service.ts）。
 */
import type { StorageAdapter } from "../storage/adapter";

/** 与网页端 wechat-bridge 路由返回结构对齐 */
export interface WechatSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    [key: string]: unknown;
  };
  openid: string;
}

const K_WX_SESSION = "els_wx_session";

export interface WechatBridgeClientOptions {
  /** 网页端根地址，例如 https://your-app.com 或 http://localhost:3000 */
  bridgeBaseUrl: string;
  /** 本地存储适配（小程序传 TaroStorageAdapter，H5 传 LocalStorageAdapter） */
  storage: StorageAdapter;
  /** 注入的 fetch（小程序/H5 环境差异，默认用全局 fetch） */
  fetchImpl?: typeof fetch;
}

export class WechatBridgeClient {
  private readonly bridgeUrl: string;
  private readonly storage: StorageAdapter;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: WechatBridgeClientOptions) {
    const base = opts.bridgeBaseUrl.replace(/\/+$/, "");
    this.bridgeUrl = `${base}/api/auth/wechat-bridge`;
    this.storage = opts.storage;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * 用 wx.login 的 code 完成微信登录，返回会话并存本地。
   */
  async loginWithCode(code: string): Promise<WechatSession> {
    const res = await this.fetchImpl(this.bridgeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = (await res.json()) as {
      session?: WechatSession;
      openid?: string;
      error?: string;
    };
    if (!res.ok || !data.session) {
      throw new Error(data.error ?? `微信登录失败（HTTP ${res.status}）`);
    }
    const session: WechatSession = { ...data.session, openid: data.openid ?? "" };
    this.storage.setString(K_WX_SESSION, JSON.stringify(session));
    return session;
  }

  getStoredSession(): WechatSession | null {
    const raw = this.storage.getString(K_WX_SESSION);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WechatSession;
    } catch {
      return null;
    }
  }

  clearSession(): void {
    this.storage.remove(K_WX_SESSION);
  }
}
