/**
 * ELS-EVAL-032 — FALLBACK_FAILURE（JSON 修复链路）
 * 模型返回非法 JSON（截断）→ 管线应触发恰好 1 次 fast-tier 修复
 * 并成功解析，结果通过 Zod，无用户可见错误。
 * 直驱 callLlmStructured + 本地 EchoSchema（不经过判题 route，
 * 覆盖点在管线层本身）。
 * 预期：PASS（coverage full，无 uncovered）。
 */
import { z } from "zod";

import { callLlmStructured } from "@/lib/llm/structured-output";
import type { EvalCaseDefinition } from "../runner/harness";
import { evalTraceId } from "../runner/http";
import { T0_ISO } from "./helpers";

const EchoSchema = z.object({ value: z.string() });

export const case_032: EvalCaseDefinition = {
  case_id: "ELS-EVAL-032",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    // 脚本：第 1 次返回截断的非法 JSON；第 2 次（修复）返回合法 JSON
    const stub = ctx.script([`{"value": `, `{"value": "repaired"}`]);

    let data: unknown = null;
    let repairUsed: boolean | undefined = undefined;
    let thrown: unknown = null;
    try {
      const result = await callLlmStructured(
        {
          tier: "main",
          messages: [
            { role: "system", content: "回显输入 value 字段。" },
            { role: "user", content: "value = original" },
          ],
          schema: EchoSchema,
          schemaName: "EvalEcho",
          jsonExample: `{"value": "示例"}`,
          traceId: evalTraceId("032", 1),
          temperature: 0.3,
          maxTokens: 100,
        },
        {
          overrideProviders: {
            primary: stub.provider,
            fallback: null,
            fallbackEnabled: false,
          },
        },
      );
      data = result.data;
      repairUsed = result.meta.repairUsed;
    } catch (err) {
      thrown = err;
    }

    // r1: 修复成功且恰好 1 次（repair_attempts=1）
    ctx.rec.check(
      "r1-repair-once-success",
      "非法 JSON 触发恰好 1 次修复并成功（无用户可见错误）",
      { succeeded: true, repairUsed: true, thrown: null },
      {
        succeeded: thrown === null && data !== null,
        repairUsed,
        thrown: thrown === null ? null : String(thrown),
      },
      { failure_layer: "FALLBACK" },
    );

    // r2: 修复循环不 >1（总调用数 = 首次 + 1 次修复 = 2）
    ctx.rec.check(
      "r2-call-count",
      "LLM 总调用数 = 2（首次 + 单次修复，无多余循环）",
      { llmCallCount: 2 },
      { llmCallCount: stub.calls.length },
      { failure_layer: "FALLBACK", evidence: { tiers: stub.calls.map((c) => c.tier) } },
    );

    // r3: 修复调用强制 fast tier、temperature=0（回归重点）
    const repairCall = stub.calls[1];
    ctx.rec.check(
      "r3-repair-tier-temp",
      "修复调用 tier=fast 且 temperature=0",
      { tier: "fast", temperature: 0 },
      {
        tier: repairCall?.tier,
        temperature: repairCall?.temperature,
      },
      {
        failure_layer: "FALLBACK",
        evidence: { repairRequestJsonMode: repairCall?.jsonMode },
      },
    );

    // r4: 修复后结果通过 Zod（data 结构合法）
    ctx.rec.check(
      "r4-zod-valid",
      "修复后解析结果通过 Zod schema",
      { value: "repaired" },
      data as { value: string } | null,
      { failure_layer: "OUTPUT_VALIDATION" },
    );

    return {
      coverage: "full",
      actualSummary:
        "非法 JSON → 1 次 fast-tier(temp=0) 修复成功，共 2 次调用，结果通过 Zod，无错误抛出。",
      notes: "required_trace_fields 中 llm_raw_output/repair_attempts 的 trace 断言依赖 M2 Trace；本 Case 以 meta.repairUsed + calls 计数等效覆盖。",
    };
  },
};
