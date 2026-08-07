#!/usr/bin/env tsx
/**
 * Providers 对比脚本
 * ------------------------------------------------------------
 * 对同一批测试消息，用 bailian 与 deepseek 分别跑一次，
 * 输出对比表：provider / model / intent / schema_valid / latency / success
 *
 * 前置：.env.local 中同时填好 BAILIAN_* 与 DEEPSEEK_*。
 * 缺任一 Provider 的配置，其对应结果为 SKIP。
 */
import { loadEnvLocal, SMOKE_CASES } from "./_smoke-shared";

loadEnvLocal();
process.env.LLM_FALLBACK_ENABLED = "false";

interface Row {
  provider: string;
  case: string;
  model: string;
  intent: string;
  schema_valid: boolean;
  latency_ms: number;
  success: boolean;
  error_kind?: string;
}

async function runOne(providerKind: "bailian" | "deepseek", message: string): Promise<Row> {
  process.env.LLM_PRIMARY_PROVIDER = providerKind;
  // 强制重解析 env 缓存
  const envMod = await import("../lib/env");
  envMod.resetServerEnvCacheForTests();
  const regMod = await import("../lib/llm/provider-registry");
  regMod.__resetRegistryForTests();

  const { runAgent } = await import("../lib/agent/agent");
  const started = Date.now();
  try {
    const res = await runAgent({ message });
    return {
      provider: providerKind,
      case: message.slice(0, 20),
      model:
        providerKind === "bailian"
          ? process.env.BAILIAN_MAIN_MODEL ?? "?"
          : process.env.DEEPSEEK_MAIN_MODEL ?? "?",
      intent: res.intent,
      schema_valid: true,
      latency_ms: Date.now() - started,
      success: true,
    };
  } catch (err) {
    const e = err as { kind?: string };
    return {
      provider: providerKind,
      case: message.slice(0, 20),
      model: "-",
      intent: "-",
      schema_valid: false,
      latency_ms: Date.now() - started,
      success: false,
      error_kind: e.kind,
    };
  }
}

async function main() {
  const rows: Row[] = [];

  const providerCandidates: Array<"bailian" | "deepseek"> = [];
  if ((process.env.BAILIAN_API_KEY ?? "").length > 0) providerCandidates.push("bailian");
  if ((process.env.DEEPSEEK_API_KEY ?? "").length > 0) providerCandidates.push("deepseek");

  if (providerCandidates.length === 0) {
    console.log("no provider configured (need BAILIAN_API_KEY or DEEPSEEK_API_KEY)");
    process.exit(2);
  }

  for (const provider of providerCandidates) {
    for (const c of SMOKE_CASES) {
      rows.push(await runOne(provider, c.message));
    }
  }

  // 对比表
  console.log("provider   | case                 | intent      | ok  | schema | latency_ms");
  console.log("-----------|----------------------|-------------|-----|--------|-----------");
  for (const r of rows) {
    console.log(
      [
        r.provider.padEnd(10),
        r.case.padEnd(20),
        r.intent.padEnd(11),
        (r.success ? "yes" : "no").padEnd(3),
        (r.schema_valid ? "yes" : "no").padEnd(6),
        r.latency_ms.toString().padStart(9),
      ].join(" | "),
    );
  }

  const allOk = rows.every((r) => r.success);
  console.log(`=== Providers Compare ${allOk ? "PASS" : "PARTIAL"} ===`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke-providers crashed:", err instanceof Error ? err.message : err);
  process.exit(2);
});
