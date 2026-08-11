#!/usr/bin/env tsx
/**
 * Knowledge Layer V1 — Context-aware Evaluation
 * -----------------------------------------------
 * 对每个测试词分别在 general / writing-task2 / speaking-part3 三种 context 下生成词卡，
 * 比较 retrieval 命中、内容差异和场景适配性。
 */
import process from "node:process";
import path from "node:path";
import fs from "node:fs";

process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));

// Stub server-only BEFORE any imports that transitively use it
const soPath = path.resolve(process.cwd(), "node_modules/server-only/index.js");
const soBackup = soPath + ".bak2";
fs.copyFileSync(soPath, soBackup);
fs.writeFileSync(soPath, "// stubbed for eval");

type SeedLearningItem = any;
type ExamContext = "general" | "writing-task2" | "speaking-part3";

// Restore on exit
process.on("exit", () => { try { fs.copyFileSync(soBackup, soPath); fs.unlinkSync(soBackup); } catch {} });
process.on("SIGINT", () => process.exit());

// =============================================================
const TEST_WORDS = [
  { term: "mitigate", expectedTopic: "environment" },
  { term: "algorithm", expectedTopic: "technology" },
  { term: "stigma", expectedTopic: "society" },
  { term: "vocational", expectedTopic: "education" },
  { term: "procrastinate", expectedTopic: null },
];

const CONTEXTS: ExamContext[] = ["general", "writing-task2", "speaking-part3"];

// =============================================================
interface ContextResult {
  context: ExamContext;
  retrievalIds: string[];
  item: SeedLearningItem | null;
  error?: string;
}

interface WordResult {
  term: string;
  expectedTopic: string | null;
  results: ContextResult[];
}

async function main() {
  // Dynamic imports after server-only stub
  const { generateWordCardWithLlm } = await import("../lib/llm/tasks/generate-word-card");
  const { retrieveKnowledge } = await import("../lib/knowledge/retrieval");
  const { normalizeTerm } = await import("../lib/learning/item-id");

  console.log("=== Context-aware Evaluation ===");
  console.log(`Words: ${TEST_WORDS.length} × Contexts: ${CONTEXTS.length} = ${TEST_WORDS.length * CONTEXTS.length} generations\n`);

  const allResults: WordResult[] = [];

  for (const { term, expectedTopic } of TEST_WORDS) {
    console.log(`\n━━━ ${term} (topic: ${expectedTopic ?? "none"}) ━━━`);
    const wordResult: WordResult = { term, expectedTopic, results: [] };

    for (const ctx of CONTEXTS) {
      const retrieval = retrieveKnowledge({ term: normalizeTerm(term), currentContext: ctx });
      let item: SeedLearningItem | null = null;
      let error: string | undefined;

      try {
        item = await generateWordCardWithLlm(term, `ctx-${term}-${ctx}`, { context: ctx });
        console.log(`  ${ctx}: ✓ (KOs: ${retrieval.knowledgeObjectIds.join(",") || "none"})`);
      } catch (err) {
        error = err instanceof Error ? err.message : "unknown";
        console.log(`  ${ctx}: ✗ ${error}`);
      }

      wordResult.results.push({ context: ctx, retrievalIds: retrieval.knowledgeObjectIds, item, error });
      await new Promise((r) => setTimeout(r, 800));
    }
    allResults.push(wordResult);
  }

  // =============================================================
  // REPORT
  // =============================================================
  console.log("\n\n" + "═".repeat(60));
  console.log("CONTEXT-AWARE EVALUATION REPORT");
  console.log("═".repeat(60));

  // 1. Retrieval per word × context
  console.log("\n┌─ 1. RETRIEVAL MATRIX ─┐\n");
  console.log("| Term | general | writing-task2 | speaking-part3 |");
  console.log("|------|---------|---------------|----------------|");
  for (const w of allResults) {
    const g = w.results.find((r) => r.context === "general")!;
    const wt = w.results.find((r) => r.context === "writing-task2")!;
    const sp = w.results.find((r) => r.context === "speaking-part3")!;
    console.log(`| ${w.term} | ${g.retrievalIds.join(",") || "-"} | ${wt.retrievalIds.join(",") || "-"} | ${sp.retrievalIds.join(",") || "-"} |`);
  }

  // 2. Content differences
  console.log("\n┌─ 2. CONTENT DIFFERENCES ─┐\n");
  for (const w of allResults) {
    console.log(`\n── ${w.term} ──`);
    for (const r of w.results) {
      if (!r.item) { console.log(`  ${r.context}: ERROR`); continue; }
      const i = r.item;
      console.log(`  ${r.context}:`);
      console.log(`    register: ${i.ielts?.register ?? "—"}`);
      console.log(`    contexts: ${i.ielts?.contexts?.join(",") ?? "—"}`);
      console.log(`    topics: ${i.ielts?.topics?.join(",") ?? "—"}`);
      console.log(`    descriptorFocus: ${i.ielts?.descriptorFocus?.join(",") ?? "—"}`);
      console.log(`    usageContext: ${i.usageContext?.slice(0, 80)}...`);
      console.log(`    collocations[0:2]: ${i.collocations?.slice(0, 2).join(" | ")}`);
    }
  }

  // 3. Scene accuracy
  console.log("\n┌─ 3. SCENE KNOWLEDGE TRIGGER ACCURACY ─┐\n");
  let correctTriggers = 0;
  let totalChecks = 0;

  for (const w of allResults) {
    for (const r of w.results) {
      if (r.context === "general") {
        // general 不应含 writing/speaking 专属 KO
        const hasWritingSpecific = r.retrievalIds.includes("lg-register-writing-task2");
        const hasSpeakingSpecific = r.retrievalIds.includes("lg-appropriacy-speaking");
        const correct = !hasWritingSpecific && !hasSpeakingSpecific;
        totalChecks++;
        if (correct) correctTriggers++;
        if (!correct) console.log(`  ✗ ${w.term}/general: 错误注入了场景规则 (${r.retrievalIds.join(",")})`);
      }
      if (r.context === "writing-task2") {
        // 应含 writing 相关 KO
        const hasWriting = r.retrievalIds.some((id) => id.includes("writing") || id === "oer-writing-lr");
        totalChecks++;
        if (hasWriting) correctTriggers++;
        else console.log(`  ✗ ${w.term}/writing-task2: 未触发 writing 知识 (${r.retrievalIds.join(",")})`);
      }
      if (r.context === "speaking-part3") {
        // 应含 speaking 相关 KO
        const hasSpeaking = r.retrievalIds.some((id) => id.includes("speaking") || id === "oer-speaking-lr");
        totalChecks++;
        if (hasSpeaking) correctTriggers++;
        else console.log(`  ✗ ${w.term}/speaking-part3: 未触发 speaking 知识 (${r.retrievalIds.join(",")})`);
      }
    }
  }
  console.log(`\n  Accuracy: ${correctTriggers}/${totalChecks} (${Math.round(correctTriggers/totalChecks*100)}%)`);

  // 4. Teaching differentiation
  console.log("\n┌─ 4. TEACHING DIFFERENTIATION ─┐\n");
  for (const w of allResults) {
    const items = w.results.filter((r) => r.item).map((r) => ({ ctx: r.context, item: r.item! }));
    if (items.length < 3) { console.log(`  ${w.term}: incomplete data`); continue; }

    const registers = new Set(items.map((i) => i.item.ielts?.register));
    const usageTexts = items.map((i) => i.item.usageContext);
    const allSameUsage = usageTexts.every((u) => u === usageTexts[0]);
    const allSameRegister = registers.size <= 1;

    console.log(`  ${w.term}:`);
    console.log(`    register variation: ${registers.size > 1 ? "YES ✓" : "NO (all same)"}`);
    console.log(`    usageContext variation: ${allSameUsage ? "NO ⚠️ (identical across contexts)" : "YES ✓"}`);
    if (registers.size > 1) {
      for (const i of items) {
        console.log(`      ${i.ctx} → register=${i.item.ielts?.register}`);
      }
    }
  }

  // 5. Overall assessment
  console.log("\n┌─ 5. OVERALL ASSESSMENT ─┐\n");
  const triggerRate = Math.round(correctTriggers / totalChecks * 100);
  console.log(`  Scene trigger accuracy: ${triggerRate}%`);
  console.log(`  ${triggerRate >= 80 ? "✓ Retrieval 足够支撑 V1" : "✗ Retrieval 有 blocker 需修复"}`);
  console.log(`\n=== Context-aware Evaluation Complete ===`);
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });
