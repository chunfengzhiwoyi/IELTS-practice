import Taro from "@tarojs/taro";
import type { StorageAdapter } from "./adapter";

/**
 * Taro 存储适配（微信小程序 / H5 通用）。
 * 在 app.tsx 启动时调用 setStorageAdapter(new TaroStorageAdapter())。
 */
export class TaroStorageAdapter implements StorageAdapter {
  getString(key: string): string | null {
    try {
      const v = Taro.getStorageSync(key);
      if (v == null) return null;
      // Taro H5 把存储值包成 { data: <value> } 信封；weapp 直接返回原始值。
      // 必须拆封，否则 String({data:...}) 得到 "[object Object]"，JSON.parse 失败 → 所有读取变成 null。
      const raw =
        v && typeof v === "object" && "data" in (v as Record<string, unknown>)
          ? (v as Record<string, unknown>).data
          : v;
      return raw == null ? null : String(raw);
    } catch {
      return null;
    }
  }
  setString(key: string, value: string): void {
    try {
      Taro.setStorageSync(key, value);
    } catch {
      /* ignore quota / private mode */
    }
  }
  remove(key: string): void {
    try {
      Taro.removeStorageSync(key);
    } catch {
      /* ignore */
    }
  }
  keys(): string[] {
    try {
      const info = Taro.getStorageInfoSync();
      return info.keys ?? [];
    } catch {
      return [];
    }
  }
}
