"use client";

/**
 * AgentChat —— 首页测试消息组件
 * ------------------------------------------------------------
 * 向 POST /api/agent/message 发送消息，展示结构化 AgentResponse。
 * 交接单 §4.1：模型回复和业务卡片分离；本组件展示 reply + ui_action(JSON)。
 */
import { useState } from "react";

import type { AgentResponse } from "@/lib/agent/schemas";
import type { AppErrorPayload } from "@/lib/observability/errors";

type ApiResult = { ok: true; data: AgentResponse } | { ok: false; error: AppErrorPayload };

export function AgentChat() {
  const [message, setMessage] = useState("帮我学习 take something for granted");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  const send = async () => {
    if (!message.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult({ ok: true, data: json as AgentResponse });
      } else {
        setResult({ ok: false, error: (json?.error ?? { kind: "INTERNAL", message: "unknown" }) as AppErrorPayload });
      }
    } catch (err) {
      setResult({
        ok: false,
        error: {
          kind: "INTERNAL",
          message: err instanceof Error ? err.message : "network error",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <label htmlFor="agent-input" className="text-sm font-medium text-slate-700">
        输入自然语言指令
      </label>
      <textarea
        id="agent-input"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        className="mt-2 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        placeholder="例如：帮我练一道 Part 2 / 我有五分钟复习 / 看看我最近学得怎么样"
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">POST /api/agent/message</span>
        <button
          onClick={send}
          disabled={loading || !message.trim()}
          className="btn btn--primary disabled:cursor-not-allowed"
        >
          {loading ? "发送中…" : "发送"}
        </button>
      </div>

      {result ? (
        <div className="mt-4 space-y-3">
          {result.ok ? (
            <>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-mono text-white">
                    {result.data.intent}
                  </span>
                  <span className="font-mono text-slate-500">{result.data.trace_id}</span>
                </div>
                <p className="text-slate-800">{result.data.reply}</p>
              </div>
              <details className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-slate-700">
                  ui_action ({result.data.ui_action.type})
                </summary>
                <pre className="mt-2 overflow-x-auto text-slate-700">
                  {JSON.stringify(result.data.ui_action, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="rounded bg-rose-600 px-1.5 py-0.5 font-mono text-white">
                  {result.error.kind}
                </span>
                {result.error.trace_id ? (
                  <span className="font-mono text-slate-500">{result.error.trace_id}</span>
                ) : null}
              </div>
              <p className="text-rose-900">{result.error.message}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
