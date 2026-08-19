"use client";

/**
 * 全局 Error Boundary
 * ------------------------------------------------------------
 * 交接单 §9.1：模型调用失败或数据库写入失败时，不产生错误学习状态。
 * 本组件捕获未处理的渲染错误，展示用户友好提示并允许恢复。
 */
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-lg border border-rose-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-rose-900">出现了问题</h2>
        <p className="mt-2 text-sm text-slate-600">
          页面遇到了意外错误。你的学习数据不会受到影响。
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-ink-meta">
            错误码: {error.digest}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <button
            onClick={reset}
            className="btn btn--primary"
          >
            重试
          </button>
          <Link
            href="/"
            className="btn btn--ghost"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
