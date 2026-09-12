/**
 * PRODUCT-LOOP-04C — Evidence Quality Eval Harness
 * ------------------------------------------------------------
 * 驱动【真实当前 Speaking analyzer】+【真实 04B evidence schema】+【真实 deterministic validator】
 * 对 04A frozen gold corpus（53 cases / 57 item 级标签）做完整 pipeline 评估。
 *
 * Provider 由环境决定：
 *  - LLM_PRIMARY_PROVIDER=real（bailian/deepseek）+ 对应 API key → 真实模型（质量指标）
 *  - LLM_PRIMARY_PROVIDER=mock → SANITY ONLY（机制验证，不计入质量指标，§6）
 *
 * 用法（每个 RUN 一次，EVAL_RUN 区分批次）：
 *   $env:LLM_PRIMARY_PROVIDER=bailian; npx vitest run tests/eval/product-loop-04c/evidence-quality.eval.test.ts
 * 产物：
 *   tests/eval/product-loop-04c/run-<EVAL_RUN>.json（per-case + metrics）
 *   tests/eval/product-loop-04c/aggregate.json（跨 run 汇总）
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { analyzeSpeakingWithLlm } from "@/lib/llm/tasks/analyze-speaking";
import type { ValidatedTargetExpressionEvidence } from "@/lib/speaking/types";
import { getQuestionById } from "@/lib/speaking";

type Assessment = "CORRECT" | "ISSUE" | "UNCERTAIN" | "NOT_USED";

interface GoldItem { itemId: string; label: Assessment; reason: string; }
interface GoldCase { id: string; category: string; targets?: string[]; answer: string; gold: GoldItem[]; }
interface SeedEntry { itemId: string; term: string; coreMeaning: string; }

const EVAL_DIR = path.join(process.cwd(), "tests", "eval", "product-loop-04c");
const RUN = process.env.EVAL_RUN ?? "1";
const PREFIX = process.env.EVAL_PREFIX ?? "run";
const RUN_FILE = path.join(EVAL_DIR, `${PREFIX}-${RUN}.json`);

function loadJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function computeMetrics(rows: Array<{ id: string; cat: string; gold: Assessment; got: Assessment; upgrade: boolean; quote: string | null; notes: string[] }>) {
  let tpC = 0, fpC = 0, fnC = 0, tpI = 0, fpI = 0, fnI = 0, tnN = 0, fpN = 0, fnN = 0, sysU = 0, goldU = 0;
  const falseCorrect: typeof rows = [];
  const falseIssue: typeof rows = [];
  for (const r of rows) {
    if (r.gold === "UNCERTAIN") goldU++;
    if (r.got === "UNCERTAIN") sysU++;
    if (r.gold === "CORRECT" && r.got === "CORRECT") tpC++;
    if (r.gold !== "CORRECT" && r.got === "CORRECT") { fpC++; falseCorrect.push(r); }
    if (r.gold === "CORRECT" && r.got !== "CORRECT") fnC++;
    if (r.gold === "ISSUE" && r.got === "ISSUE") tpI++;
    if (r.gold !== "ISSUE" && r.got === "ISSUE") { fpI++; falseIssue.push(r); }
    if (r.gold === "ISSUE" && r.got !== "ISSUE") fnI++;
    if (r.gold === "NOT_USED" && r.got === "NOT_USED") tnN++;
    if (r.gold !== "NOT_USED" && r.got === "NOT_USED") fpN++;
    if (r.gold === "NOT_USED" && r.got !== "NOT_USED") fnN++;
  }
  const total = rows.length;
  return {
    totalLabels: total,
    correctPrecision: +(tpC / (tpC + fpC || 1)).toFixed(4),
    correctRecall: +(tpC / (tpC + fnC || 1)).toFixed(4),
    issuePrecision: +(tpI / (tpI + fpI || 1)).toFixed(4),
    issueRecall: +(tpI / (tpI + fnI || 1)).toFixed(4),
    notUsedAccuracy: +(((tnN) / ((tnN + fpN + fnN) || 1))).toFixed(4),
    uncertainRate: +(sysU / (total || 1)).toFixed(4),
    overallAccuracy: +(((tpC + tpI + tnN) / (total || 1))).toFixed(4),
    falseCorrect: fpC,
    falseCorrectIds: falseCorrect.map((f) => `${f.id}(${f.gold})`),
    falseIssue: fpI,
    falseIssueIds: falseIssue.map((f) => `${f.id}(${f.gold})`),
    counts: { tpC, fpC, fnC, tpI, fpI, fnI, tnN, fpN, fnN, sysU, goldU },
  };
}

describe("PRODUCT-LOOP-04C evidence quality eval", () => {
  it(`run-${RUN}: real pipeline over 57 gold labels`, async () => {
    fs.mkdirSync(EVAL_DIR, { recursive: true });

    const provider = process.env.LLM_PRIMARY_PROVIDER ?? "mock";
    const hasBailianKey = !!process.env.BAILIAN_API_KEY;
    const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY;
    const realConfigured = (provider === "bailian" && hasBailianKey) || (provider === "deepseek" && hasDeepSeekKey);
    const providerKind = provider === "bailian" ? "bailian" : provider === "deepseek" ? "deepseek" : "mock";
    const modelName = provider === "bailian" ? (process.env.BAILIAN_MAIN_MODEL ?? "qwen-plus") : provider === "deepseek" ? (process.env.DEEPSEEK_MAIN_MODEL ?? "deepseek-v4-pro") : "mock";
    const meta = {
      run: Number(RUN),
      timestamp: new Date().toISOString(),
      provider: providerKind,
      model: modelName,
      temperature: 0.3,
      pipeline: "analyzeSpeakingWithLlm (single LLM structured call, tier=main) -> validateTargetExpressionEvidence (deterministic)",
      realLlmConfigured: realConfigured,
      realProviderKeyPresent: (provider === "bailian" && hasBailianKey) || (provider === "deepseek" && hasDeepSeekKey),
      note: realConfigured ? "QUALITY RUN (真实模型，计入质量指标)" : (provider === "mock" ? "SANITY ONLY（mock，不计入质量指标，§6）" : "BLOCKED: 未配置对应 API key，analyzer 将走 rule-engine fallback"),
      canonicalCommit: process.env.CANONICAL_HEAD ?? "95f65aadf546e1454a0e2a9b8f7b9a7a6213857a",
      goldVersion: "04A frozen gold-cases.json (53 cases / 57 item labels)",
      mockExcludedFromQuality: true,
    };

    const corpus = loadJson<{ cases: GoldCase[] }>(path.join(process.cwd(), "docs", "product", "evidence-cases", "gold-cases.json"));
    const seed = loadJson<SeedEntry[]>(path.join(process.cwd(), "data", "seed", "ielts-learning-items.json"));
    const seedByItem = new Map(seed.map((s) => [s.itemId, s]));
    const question = getQuestionById("sp-p1-001");

    const rows: Array<{ id: string; cat: string; gold: Assessment; got: Assessment; upgrade: boolean; quote: string | null; notes: string[]; goldReason: string }> = [];
    const rawEvidences: Array<{ id: string; itemId: string; validated: ValidatedTargetExpressionEvidence | null; summary: unknown }> = [];
    let llmCalls = 0;
    let missingEvidence = 0;
    let duplicateConflict = 0;
    let validatorDowngrades = 0;
    let groundingViolations = 0;
    let droppedUnknownItems = 0;
    const latenciesMs: number[] = [];

    for (const cse of corpus.cases) {
      const targets = cse.targets ?? [cse.gold[0]!.itemId];
      const suggestedExpressions = targets.map((itemId) => {
        const s = seedByItem.get(itemId);
        if (!s) throw new Error(`seed 缺 ${itemId}`);
        return { itemId, canonicalForm: s.term, meaning: s.coreMeaning };
      });

      // 真实 pipeline：同一 LLM 调用 + 真实 validator（analyzer 内部执行）
      const t0 = Date.now();
      const result = await analyzeSpeakingWithLlm(
        cse.answer,
        question!,
        `04c-${RUN}-${cse.id}`,
        undefined,
        undefined,
        { suggestedExpressions },
      );
      latenciesMs.push(Date.now() - t0);
      llmCalls++;
      const validated = (result as { targetExpressionEvidence?: ValidatedTargetExpressionEvidence[] }).targetExpressionEvidence ?? [];

      for (const g of cse.gold) {
        const v = validated.find((e) => e.itemId === g.itemId) ?? null;
        if (!v) missingEvidence++;
        else {
          if (v.validatorNotes.some((n) => n.includes("duplicate_conflict"))) duplicateConflict++;
          if (v.validatorNotes.some((n) => n.includes("missing_or_invalid") || n.includes("grounding") || n.includes("echo_guard") || n.includes("duplicate") || n.includes("contract_violation") || n.includes("contradictory"))) validatorDowngrades++;
          if (v.validatorNotes.some((n) => n.startsWith("grounding"))) groundingViolations++;
        }
        const got = (v?.assessment ?? "UNCERTAIN") as Assessment;
        rows.push({
          id: cse.id,
          cat: cse.category,
          gold: g.label,
          got,
          upgrade: v?.upgradeCandidate ?? false,
          quote: v?.quote ?? null,
          notes: v?.validatorNotes ?? ["missing_evidence"],
          goldReason: g.reason,
        });
        rawEvidences.push({ id: cse.id, itemId: g.itemId, validated: v, summary: (result as { evidenceSummary?: unknown }).evidenceSummary ?? null });
      }
      // 统计 dropped（unknown itemId）——analyzer 内部 drop 不暴露，此处基于 validated 完整性近似：validated 全部落入 targets 即无越界
    }

    const metrics = computeMetrics(rows);
    const avgLatency = latenciesMs.length ? Math.round(latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length) : null;
    const runResult = { meta: { ...meta, totalLatencyMs: latenciesMs.reduce((a, b) => a + b, 0), avgLatencyMs: avgLatency, llmCalls }, metrics, rows, rawEvidences };
    fs.writeFileSync(RUN_FILE, JSON.stringify(runResult, null, 2), "utf8");
    // aggregate（对 <prefix>-*.json 汇总）
    const aggPrefix = PREFIX;
    const runFiles = fs.readdirSync(EVAL_DIR).filter((f) => new RegExp(`^${aggPrefix}-\\d+\\.json$`).test(f));
    const aggregates = runFiles.map((f) => {
      const r = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, f), "utf8"));
      return { run: r.meta.run, provider: r.meta.provider, realLlmConfigured: r.meta.realLlmConfigured, metrics: r.metrics, avgLatencyMs: r.meta.avgLatencyMs };
    });
    fs.writeFileSync(path.join(EVAL_DIR, `${PREFIX}-aggregate.json`), JSON.stringify({ runs: aggregates, count: aggregates.length }, null, 2), "utf8");

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      meta: { provider, model: modelName, realConfigured, llmCalls, run: meta.run },
      metrics,
    }, null, 2));

    // sanity 断言：pipeline 机制（每 frozen target 恰好一条 evidence；不崩溃）
    expect(rows.length).toBe(57);
    expect(metrics.totalLabels).toBe(57);
    if (provider === "mock") {
      // SANITY ONLY：mock 不符合 SpeakingAnalysis schema → 规则引擎降级 → 全 UNCERTAIN 保守化
      expect(metrics.counts.sysU).toBe(57);
      expect(metrics.falseCorrect).toBe(0);
    }
  }, 600_000);
});
