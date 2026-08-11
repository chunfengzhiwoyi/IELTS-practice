import process from "node:process";
import path from "node:path";
import fs from "node:fs";
process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
import { retrieveKnowledge } from "../lib/knowledge/retrieval";
import { normalizeTerm } from "../lib/learning/item-id";
import type { ExamContext } from "../lib/knowledge/types";

const CONTEXTS: ExamContext[] = ["general", "writing-task1", "writing-task2", "speaking-part1", "speaking-part2", "speaking-part3"];
const WORDS = [
  { t: "mitigate", ex: "environment" }, { t: "algorithm", ex: "technology" },
  { t: "stigma", ex: "society" }, { t: "vocational", ex: "education" },
  { t: "inflation", ex: "economy" }, { t: "incarceration", ex: "crime" },
  { t: "congestion", ex: "transport" }, { t: "nurture", ex: "family" },
  { t: "hypothesis", ex: "science" }, { t: "pandemic", ex: "health" },
  { t: "procrastinate", ex: null }, { t: "eloquent", ex: null },
];

const koUsage: Record<string, number> = {};
let totalChecks = 0, correctTriggers = 0;

for (const w of WORDS) {
  for (const ctx of CONTEXTS) {
    const r = retrieveKnowledge({ term: normalizeTerm(w.t), currentContext: ctx });
    r.knowledgeObjectIds.forEach((id) => { koUsage[id] = (koUsage[id] ?? 0) + 1; });
    const isGeneral = ctx === "general";
    const hasW = r.knowledgeObjectIds.some((id) => id.includes("writing") || id === "oer-writing-lr");
    const hasS = r.knowledgeObjectIds.some((id) => id.includes("speaking") || id === "oer-speaking-lr");
    if (isGeneral) { totalChecks++; if (!hasW && !hasS) correctTriggers++; }
    if (ctx.startsWith("writing")) { totalChecks++; if (hasW) correctTriggers++; }
    if (ctx.startsWith("speaking")) { totalChecks++; if (hasS) correctTriggers++; }
  }
}

console.log(`Scene trigger accuracy: ${correctTriggers}/${totalChecks} (${Math.round(correctTriggers / totalChecks * 100)}%)`);
console.log(`Max KOs per retrieval: ${Math.max(...WORDS.flatMap((w) => CONTEXTS.map((c) => retrieveKnowledge({ term: normalizeTerm(w.t), currentContext: c }).knowledgeObjectIds.length)))}`);

const allIds = JSON.parse(fs.readFileSync("data/knowledge/knowledge-objects-v1.json", "utf8")).map((o: any) => o.id);
const used = allIds.filter((id: string) => koUsage[id]);
const unused = allIds.filter((id: string) => !koUsage[id]);
console.log(`\nKO Coverage: ${used.length}/${allIds.length} used`);
if (unused.length > 0) console.log(`Unused (${unused.length}): ${unused.join(", ")}`);

// Topic accuracy
const topicWords = WORDS.filter((w) => w.ex);
let topicCorrect = 0;
const topicMisses: string[] = [];
for (const w of topicWords) {
  const r = retrieveKnowledge({ term: normalizeTerm(w.t), currentContext: "general" });
  const hitTopics = r.knowledgeObjectIds.filter((id) => id.startsWith("pt-topic-")).map((id) => id.replace("pt-topic-", ""));
  if (hitTopics.includes(w.ex!)) topicCorrect++;
  else topicMisses.push(`${w.t}: expected=${w.ex} got=${hitTopics.join(",") || "none"}`);
}
console.log(`\nTopic accuracy: ${topicCorrect}/${topicWords.length}`);
if (topicMisses.length > 0) console.log(`Misses: ${topicMisses.join("; ")}`);
