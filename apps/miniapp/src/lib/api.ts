/**
 * 统一网络层：封装 Taro.request（小程序直连用户自带 API / ima）。
 * 微信要求被请求的域名必须已在 mp 后台「服务器域名」白名单 + 已备案，
 * 否则真机/体验版会拦截（开发者工具勾选“不校验域名”仅模拟器有效）。
 */
import Taro from "@tarojs/taro";

export interface ApiOptions {
  url: string;
  method?: "GET" | "POST";
  data?: unknown;
  header?: Record<string, string>;
  timeout?: number;
}

/**
 * 成功返回解析后的 data；失败弹 toast 并抛出，由调用方决定降级（如回退离线分析）。
 */
export async function request<T = unknown>(opts: ApiOptions): Promise<T> {
  try {
    const res = await Taro.request({
      url: opts.url,
      method: (opts.method ?? "POST") as "GET" | "POST",
      data: opts.data,
      header: { "Content-Type": "application/json", ...(opts.header ?? {}) },
      timeout: opts.timeout ?? 30000,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
      Taro.showToast({ title: `请求失败 ${res.statusCode}`, icon: "none" });
      throw new Error(`HTTP ${res.statusCode}: ${msg.slice(0, 200)}`);
    }
    return res.data as T;
  } catch (e: unknown) {
    const err = e as { errMsg?: string; message?: string };
    if (err && err.errMsg && String(err.errMsg).includes("request:fail")) {
      // 典型：域名不在白名单 / 未备案 / 网络不通
      Taro.showToast({ title: "网络被拦截·检查域名白名单", icon: "none" });
    }
    throw e;
  }
}
