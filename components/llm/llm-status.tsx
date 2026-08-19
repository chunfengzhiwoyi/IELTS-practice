"use client";

/**
 * 全局 LLM 在线状态：单一数据源。
 * Masthead 药丸、主页离线引导卡、AI 助手悬浮窗 都消费同一份状态，
 * 避免每处各自请求 /api/health/llm。
 *
 * 状态语义：
 *   - checking：首屏挂载、或窗口重新聚焦时瞬时态
 *   - online：  服务器默认 provider 或 用户私有模型 任一可达
 *   - offline： 两者皆不可达
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type LlmStatus = "online" | "offline" | "checking";

interface LlmStatusValue {
  status: LlmStatus;
  scope: "server" | "user" | "none" | null;
  provider: string | null;
  refresh: () => void;
}

const LlmStatusContext = createContext<LlmStatusValue | null>(null);

export function LlmStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LlmStatus>("checking");
  const [scope, setScope] = useState<LlmStatusValue["scope"]>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/health/llm", { cache: "no-store" });
      const data = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        scope?: LlmStatusValue["scope"];
        provider?: string | null;
      };
      setStatus(data.ok ? "online" : "offline");
      setScope(data.scope ?? null);
      setProvider(data.provider ?? null);
    } catch {
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    setStatus("checking");
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return (
    <LlmStatusContext.Provider value={{ status, scope, provider, refresh }}>
      {children}
    </LlmStatusContext.Provider>
  );
}

export function useLlmStatus(): LlmStatusValue {
  const v = useContext(LlmStatusContext);
  if (!v) {
    // 未在 Provider 内（理论不会发生）：返回安全的默认态
    return { status: "checking", scope: null, provider: null, refresh: () => {} };
  }
  return v;
}
