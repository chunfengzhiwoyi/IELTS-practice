#!/usr/bin/env tsx
/**
 * DeepSeek 真实冒烟脚本
 * ------------------------------------------------------------
 * 用法：
 *   1. 在 .env.local 中填入真实的 DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_*_MODEL
 *      注意：只支持 deepseek-v4-flash / deepseek-v4-pro；旧型号已禁用
 *   2. npm run smoke:deepseek
 */
import { loadEnvLocal, SMOKE_CASES } from "./_smoke-shared";

loadEnvLocal();
process.env.LLM_PRIMARY_PROVIDER = "deepseek";
process.env.LLM_FALLBACK_ENABLED = "false";

async function main() {
  const { runAgent } = await import("../lib/agent/agent");

  console.log("=== DeepSeek Smoke ===");
  console.log(
    `model_fast=${process.env.DEEPSEEK_FAST_MODEL} model_main=${process.env.DEEPSEEK_MAIN_MODEL}`,
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
  console.log(`=== DeepSeek Smoke ${allPass ? "PASS" : "FAIL"} ===`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke-deepseek crashed:", err instanceof Error ? err.message : err);
  process.exit(2);
});
