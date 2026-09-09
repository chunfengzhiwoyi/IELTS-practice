/**
 * /debug/traces — M2 Phase 3A Minimal Debug Console
 * ------------------------------------------------------------
 * 内部调试页面：输入 trace_id，2 分钟内判断问题最可能在哪一层。
 * 禁止放入普通学习用户导航（不加入 Masthead / 首页卡片）。
 *
 * 信息架构（M2 Contract §4.2 最小可用版）：
 *   A. Trace Summary          trace 头摘要（10 秒速览）
 *   B. Event Timeline         事件瀑布 + 展开脱敏 payload
 *   C. Failure Layer Diagnosis 12 项瀑布检查 + PRIMARY_SUSPECT_LAYER
 *   D. Relevant Correlations  关联 trace / prompt_version 分布（最小版）
 *
 * 数据来源：调用现有 GET /api/debug/traces/[traceId]（不复制 Trace Store）。
 * Fixture 在服务端渲染时幂等注入 Memory Trace Store，与 API 同进程可见。
 */
import type { Metadata } from "next";

import { ensureDebugFixtures } from "@/lib/debug/console/fixtures";
import { TraceConsoleClient } from "@/components/debug/trace-console";

export const metadata: Metadata = {
  title: "M2 Debug Console (Internal)",
};

export default async function DebugTracesPage({
  searchParams,
}: {
  searchParams: Promise<{ trace_id?: string }>;
}) {
  const fixtures = await ensureDebugFixtures();
  const params = await searchParams;
  const initialTraceId = params.trace_id?.trim() ?? "";

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "24px 20px 64px",
        fontFamily: "var(--font-ui)",
        fontSize: "14px",
        lineHeight: 1.5,
      }}
    >
      <header style={{ marginBottom: 16, borderBottom: "1px solid var(--line-strong)", paddingBottom: 12 }}>
        <h1 style={{ fontSize: "22px", letterSpacing: "-0.01em" }}>M2 Debug Console — Trace 诊断</h1>
        <p style={{ color: "var(--ink-meta)", fontSize: "13px" }}>
          内部页面（不在学习用户导航中）· 输入 trace_id 走查 2 分钟判层 · 数据来自现有
          GET /api/debug/traces/[traceId]
        </p>
      </header>

      <TraceConsoleClient initialTraceId={initialTraceId} fixtures={fixtures} />
    </main>
  );
}
