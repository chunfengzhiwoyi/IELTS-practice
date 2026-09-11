/**
 * 存储适配器抽象：隔离浏览器 localStorage / Taro storage / 内存，
 * 让领域逻辑（mini-service）不依赖任何运行环境。
 */
export interface StorageAdapter {
  getString(key: string): string | null;
  setString(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

/** 默认内存实现（单测 / SSR / 兜底） */
class MemoryStorage implements StorageAdapter {
  private map = new Map<string, string>();
  getString(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setString(key: string, value: string) {
    this.map.set(key, value);
  }
  remove(key: string) {
    this.map.delete(key);
  }
  keys() {
    return [...this.map.keys()];
  }
}

let current: StorageAdapter = new MemoryStorage();

export function setStorageAdapter(a: StorageAdapter): void {
  current = a;
}

export function getStorage(): StorageAdapter {
  return current;
}

/** 带前缀 + JSON 的便捷封装 */
export const store = {
  getJSON<T>(key: string): T | null {
    const raw = current.getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJSON(key: string, value: unknown): void {
    current.setString(key, JSON.stringify(value));
  },
  remove(key: string): void {
    current.remove(key);
  },
  keys(): string[] {
    return current.keys();
  },
};
