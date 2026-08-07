#!/usr/bin/env tsx
/**
 * 百炼真实冒烟脚本
 * ------------------------------------------------------------
 * 用法：
 *   1. 在 .env.local 中填入真实的 BAILIAN_API_KEY / BAILIAN_BASE_URL / BAILIAN_*_MODEL
 *   2. npm run smoke:bailian
 *
 * 本脚本会临时把 LLM_PRIMARY_PROVIDER 设置为 bailian，
 * 依次跑 NEW_ITEM / REVIEW / SPEAKING / REPORT / UNSUPPORTED 五个测试消息，
 * 逐条打印 intent / model / latency / schema_valid。
 *
 * 不打印 API Key、baseURL、prompt 全文或用户敏感数据。
 */
import { loadEnvLocal, SMOKE_CASES } from "./_smoke-shared";

loadEnvLocal();
process.env.LLM_PRIMARY_PROVIDER = "bailian";
process.env.LLM_FALLBACK_ENABLED = "false";

async function main() {
  // 动态 import，避免在 loadEnvLocal 之前构造 env cache
  const { runAgent } = await import("../lib/agent/agent");

  console.log("=== Bailian Smoke ===");
  console.log(
    `model_fast=${process.env.BAILIAN_FAST_MODEL} model_main=${process.env.BAILIAN_MAIN_MODEL}`,
  );

  let allPass = true;
  for (const c of SMOKE_CASES) {
    const started = Date.now();
    try {
      const res = await runAgent({ message: c.message });
      const ok = res.intent === c.expected;
      if (!ok) allPass = false;
      console.log(
        JSON.stringify({
          case: c.label,
          intent: res.intent,
          expected: c.expected,
          match: ok,
          latency_ms: Date.now() - started,
          trace_id: res.trace_id,
        }),
      );
    } catch (err) {
      allPass = false;
      const e = err as { kind?: string; message?: string };
      console.log(
        JSON.stringify({
          case: c.label,
          error_kind: e.kind ?? "UNKNOWN",
          error_msg: e.message?.slice(0, 200),
          latency_ms: Date.now() - started,
        }),
      );
    }
  }
  console.log(`=== Bailian Smoke ${allPass ? "PASS" : "FAIL"} ===`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke-bailian crashed:", err instanceof Error ? err.message : err);
  process.exit(2);
});
