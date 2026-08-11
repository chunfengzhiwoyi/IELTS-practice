#!/usr/bin/env tsx
/**
 * Knowledge Layer V1 ON/OFF 对照评测
 * -----------------------------------
 * 对一批测试词分别以 Knowledge OFF / ON 生成词卡，
 * 比较结构化指标差异，输出评测报告。
 *
 * 用法: npx tsx scripts/eval-knowledge-layer.ts
 */
import process from "node:process";
import path from "node:path";
import Module from "node:module";

// Stub server-only for tsx runtime
const _require = Module.createRequire(import.meta.url);
const _resolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: any[]) {
  if (request === "server-only") return require.resolve("../tests/stubs/server-only.ts");
  return _resolveFilename.call(this, request, ...args);
};

// 加载 env
process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));

import { generateWordCardWithLlm } from "../lib/llm/tasks/generate-word-card";
import { retrieveKnowledge } from "../lib/knowledge/retrieval";
import { normalizeTerm } from "../lib/learning/item-id";
import type { SeedLearningItem } from "../lib/learning/types";

// =============================================================
// 测试词（覆盖 4 个 taxonomy topic + 长尾词）
// =============================================================

const TEST_WORDS = [
  // technology
  { term: "autonomous", expectedTopic: "technology" },
  { term: "algorithm", expectedTopic: "technology" },
  // environment
  { term: "mitigate", expectedTopic: "environment" },
  { term: "deforestation", expectedTopic: "environment" },
  // society
  { term: "stigma", expectedTopic: "society" },
  { term: "demographic", expectedTopic: "society" },
  // education
  { term: "vocational", expectedTopic: "education" },
  { term: "pedagogy", expectedTopic: "education" },
  // 长尾（不在任何 taxonomy associatedTerms 中）
  { term: "procrastinate", expectedTopic: null },
  { term: "nostalgia", expectedTopic: null },
];

// =============================================================
// 结构化指标评估
// =============================================================

interface Metrics {
  hasIeltsField: boolean;
  hasContexts: boolean;
  hasTopics: boolean;
  topicsMatchTaxonomy: boolean;
  hasRegister: boolean;
  registerReasonable: boolean;
  usageContextMentionsIelts: boolean;
  hasDescriptorFocus: boolean;
  hasGenerationMeta: boolean;
  knowledgeObjectCount: number;
  containsBandLevel: boolean;       // 不应有
  containsExamFrequency: boolean;   // 不应有
  collocationsCount: number;
}

function evaluate(item: SeedLearningItem, expectedTopic: string | null): Metrics {
  const ielts = item.ielts;
  const gen = item.generationMeta;
  const usageLower = (item.usageContext ?? "").toLowerCase();
  const allText = JSON.stringify(item).toLowerCase();

  const taxonomyTopics = ["technology", "environment", "society", "education"];

  return {
    hasIeltsField: ielts !== undefined,
    hasContexts: (ielts?.contexts?.length ?? 0) > 0,
    hasTopics: (ielts?.topics?.length ?? 0) > 0,
    topicsMatchTaxonomy: (ielts?.topics ?? []).some((t) => taxonomyTopics.includes(t)),
    hasRegister: ielts?.register !== undefined,
    registerReasonable: ielts?.register === "formal" || ielts?.register === "neutral",
    usageContextMentionsIelts: usageLower.includes("ielts") || usageLower.includes("writing task") || usageLower.includes("speaking part"),
    hasDescriptorFocus: (ielts?.descriptorFocus?.length ?? 0) > 0,
    hasGenerationMeta: gen !== undefined,
    knowledgeObjectCount: gen?.knowledgeObjectIds?.length ?? 0,
    containsBandLevel: allText.includes("band 5") || allText.includes("band 6") || allText.includes("band 7") || allText.includes("band 8"),
    containsExamFrequency: allText.includes("高频") || allText.includes("high frequency") || allText.includes("examfrequency"),
    collocationsCount: item.collocations?.length ?? 0,
  };
}

// =============================================================
// Main
// =============================================================

interface TestResult {
  term: string;
  expectedTopic: string | null;
  retrievalHit: boolean;
  retrievalIds: string[];
  offMetrics: Metrics | null;
  onMetrics: Metrics | null;
  offError?: string;
  onError?: string;
}

async function main() {
  console.log("=== Knowledge Layer V1 Evaluation ===");
  console.log(`Test words: ${TEST_WORDS.length}`);
  console.log(`Provider: ${process.env.LLM_PRIMARY_PROVIDER}`);
  console.log(`Model: ${process.env.DEEPSEEK_MAIN_MODEL}`);
  console.log("");

  const results: TestResult[] = [];

  for (const { term, expectedTopic } of TEST_WORDS) {
    console.log(`--- ${term} (expected: ${expectedTopic ?? "none"}) ---`);

    // Retrieval diagnosis
    const retrieval = retrieveKnowledge({ term: normalizeTerm(term) });
    const retrievalHit = retrieval.matched.length > 0;

    let offResult: SeedLearningItem | null = null;
    let onResult: SeedLearningItem | null = null;
    let offError: string | undefined;
    let onError: string | undefined;

    // Knowledge OFF
    try {
      offResult = await generateWordCardWithLlm(term, `eval-off-${term}`, { skipKnowledge: true });
      console.log(`  OFF: ok (${offResult.collocations.length} collocations)`);
    } catch (err) {
      offError = err instanceof Error ? err.message : "unknown";
      console.log(`  OFF: ERROR - ${offError}`);
    }

    // Knowledge ON
    try {
      onResult = await generateWordCardWithLlm(term, `eval-on-${term}`, { skipKnowledge: false });
      console.log(`  ON:  ok (${onResult.collocations.length} collocations, ${retrieval.knowledgeObjectIds.length} KOs)`);
    } catch (err) {
      onError = err instanceof Error ? err.message : "unknown";
      console.log(`  ON:  ERROR - ${onError}`);
    }

    results.push({
      term,
      expectedTopic,
      retrievalHit,
      retrievalIds: retrieval.knowledgeObjectIds,
      offMetrics: offResult ? evaluate(offResult, expectedTopic) : null,
      onMetrics: onResult ? evaluate(onResult, expectedTopic) : null,
      offError,
      onError,
    });

    // Rate limit courtesy
    await new Promise((r) => setTimeout(r, 1000));
  }

  // =============================================================
  // Report
  // =============================================================

  console.log("\n\n========================================");
  console.log("EVALUATION REPORT");
  console.log("========================================\n");

  // Per-word comparison table
  console.log("| Term | Retrieval | KO IDs | OFF:ielts | ON:ielts | OFF:context | ON:context | OFF:register | ON:register | OFF:desc | ON:desc |");
  console.log("|------|-----------|--------|-----------|----------|-------------|------------|--------------|-------------|----------|---------|");
  for (const r of results) {
    const off = r.offMetrics;
    const on = r.onMetrics;
    console.log(
      `| ${r.term} | ${r.retrievalHit ? "HIT" : "MISS"} | ${r.retrievalIds.join(",")||"-"} | ${off?.hasIeltsField?"Y":"N"} | ${on?.hasIeltsField?"Y":"N"} | ${off?.usageContextMentionsIelts?"Y":"N"} | ${on?.usageContextMentionsIelts?"Y":"N"} | ${off?.hasRegister?"Y":"N"} | ${on?.hasRegister?"Y":"N"} | ${off?.hasDescriptorFocus?"Y":"N"} | ${on?.hasDescriptorFocus?"Y":"N"} |`,
    );
  }

  // Aggregate
  const onResults = results.filter((r) => r.onMetrics);
  const offResults = results.filter((r) => r.offMetrics);

  const aggregate = (items: typeof results, key: "onMetrics" | "offMetrics") => {
    const valid = items.filter((r) => r[key]);
    const count = valid.length;
    if (count === 0) return null;
    return {
      ieltsRate: valid.filter((r) => r[key]!.hasIeltsField).length / count,
      contextRate: valid.filter((r) => r[key]!.usageContextMentionsIelts).length / count,
      registerRate: valid.filter((r) => r[key]!.hasRegister).length / count,
      descriptorRate: valid.filter((r) => r[key]!.hasDescriptorFocus).length / count,
      taxonomyRate: valid.filter((r) => r[key]!.topicsMatchTaxonomy).length / count,
      avgCollocations: valid.reduce((s, r) => s + r[key]!.collocationsCount, 0) / count,
      bandLevelViolation: valid.filter((r) => r[key]!.containsBandLevel).length,
      examFreqViolation: valid.filter((r) => r[key]!.containsExamFrequency).length,
    };
  };

  const offAgg = aggregate(offResults, "offMetrics");
  const onAgg = aggregate(onResults, "onMetrics");

  console.log("\n--- AGGREGATE METRICS ---");
  console.log(`Total test words: ${TEST_WORDS.length}`);
  console.log(`OFF successful: ${offResults.length} | ON successful: ${onResults.length}`);
  if (offAgg && onAgg) {
    console.log(`\n| Metric | OFF | ON | Delta |`);
    console.log(`|--------|-----|-----|-------|`);
    console.log(`| Has ielts field | ${(offAgg.ieltsRate*100).toFixed(0)}% | ${(onAgg.ieltsRate*100).toFixed(0)}% | ${((onAgg.ieltsRate-offAgg.ieltsRate)*100).toFixed(0)}pp |`);
    console.log(`| usageContext mentions IELTS | ${(offAgg.contextRate*100).toFixed(0)}% | ${(onAgg.contextRate*100).toFixed(0)}% | ${((onAgg.contextRate-offAgg.contextRate)*100).toFixed(0)}pp |`);
    console.log(`| Has register | ${(offAgg.registerRate*100).toFixed(0)}% | ${(onAgg.registerRate*100).toFixed(0)}% | ${((onAgg.registerRate-offAgg.registerRate)*100).toFixed(0)}pp |`);
    console.log(`| Has descriptorFocus | ${(offAgg.descriptorRate*100).toFixed(0)}% | ${(onAgg.descriptorRate*100).toFixed(0)}% | ${((onAgg.descriptorRate-offAgg.descriptorRate)*100).toFixed(0)}pp |`);
    console.log(`| Topics match taxonomy | ${(offAgg.taxonomyRate*100).toFixed(0)}% | ${(onAgg.taxonomyRate*100).toFixed(0)}% | ${((onAgg.taxonomyRate-offAgg.taxonomyRate)*100).toFixed(0)}pp |`);
    console.log(`| Avg collocations | ${offAgg.avgCollocations.toFixed(1)} | ${onAgg.avgCollocations.toFixed(1)} | ${(onAgg.avgCollocations-offAgg.avgCollocations).toFixed(1)} |`);
    console.log(`| bandLevel violations | ${offAgg.bandLevelViolation} | ${onAgg.bandLevelViolation} | - |`);
    console.log(`| examFrequency violations | ${offAgg.examFreqViolation} | ${onAgg.examFreqViolation} | - |`);
  }

  // Retrieval diagnosis
  console.log("\n--- RETRIEVAL DIAGNOSIS ---");
  const hits = results.filter((r) => r.retrievalHit);
  const misses = results.filter((r) => !r.retrievalHit);
  console.log(`Hit: ${hits.length}/${results.length} (${hits.map((r) => r.term).join(", ")})`);
  console.log(`Miss: ${misses.length}/${results.length} (${misses.map((r) => r.term).join(", ")})`);

  // KnowledgeObject usage
  const koUsage: Record<string, number> = {};
  for (const r of results) {
    for (const id of r.retrievalIds) {
      koUsage[id] = (koUsage[id] ?? 0) + 1;
    }
  }
  console.log("\nKnowledgeObject usage:");
  const allKoIds = ["oer-speaking-lr", "oer-writing-lr", "pt-topic-technology", "pt-topic-environment", "pt-topic-society", "pt-topic-education", "lg-register-writing-task2", "lg-appropriacy-speaking", "lg-collocation-guidance", "lg-paraphrase-guidance"];
  for (const id of allKoIds) {
    console.log(`  ${id}: ${koUsage[id] ?? 0} hits`);
  }
  const unused = allKoIds.filter((id) => !koUsage[id]);
  if (unused.length > 0) {
    console.log(`\n  ⚠️ Never used: ${unused.join(", ")}`);
  }

  // Wrong topic hits
  console.log("\n--- TOPIC ACCURACY ---");
  for (const r of results) {
    if (r.expectedTopic && r.retrievalHit) {
      const hitTopics = r.retrievalIds.filter((id) => id.startsWith("pt-topic-")).map((id) => id.replace("pt-topic-", ""));
      const correct = hitTopics.includes(r.expectedTopic);
      console.log(`  ${r.term}: expected=${r.expectedTopic}, hit=${hitTopics.join(",")}, ${correct ? "✓" : "✗ WRONG"}`);
    }
  }

  console.log("\n=== Evaluation Complete ===");
}

main().catch((err) => {
  console.error("Evaluation failed:", err);
  process.exit(1);
});
