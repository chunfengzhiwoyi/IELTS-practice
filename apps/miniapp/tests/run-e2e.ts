import { analyzeSpeakingWithLLM } from "../src/lib/speaking-llm";

const KEY = "YOUR_API_KEY";
const cfg = {
  baseUrl: "https://api.siliconflow.cn/v1",
  modelName: "deepseek-ai/DeepSeek-V3",
  apiKey: KEY,
};

// 只用到 speaking-llm 实际访问的字段
const q: any = {
  questionZh: "Describe a habit your friend has that you want to develop.",
  keyTopicWords: ["habit", "friend", "develop"],
  expectedLength: { min: 80, ideal: 120 },
};

const answer = `My friend Tom has a very good habit. He reads book every day for one hour. I think this is good because reading can improve your knowledge and make you calm. I want to develop this habit too. Every night before sleep I will read some pages. Sometimes I feel tired and just want to sleep, but I try to read a little. I think it is a healthy habit and I should keep it.`;

(async () => {
  const t0 = Date.now();
  const r = await analyzeSpeakingWithLLM(answer, q, cfg);
  const ms = Date.now() - t0;
  console.log("=== E2E: analyzeSpeakingWithLLM (real API) ===");
  console.log("elapsed ms:", ms);
  console.log("mainIssue:", JSON.stringify(r.mainIssue));
  console.log("microDrill:", JSON.stringify(r.microDrill));
  console.log("candidateIssues count:", r.candidateIssues.length);
  console.log("candidateIssues[0]:", JSON.stringify(r.candidateIssues[0]));
  console.log("metrics:", JSON.stringify(r.metrics));
  console.log("summary:", r.summary);
  const ok =
    !!r.mainIssue &&
    !!r.microDrill &&
    typeof r.summary === "string" &&
    Array.isArray(r.candidateIssues) &&
    r.candidateIssues.length > 0;
  console.log("VALID SHAPE:", ok);
  if (!ok) process.exit(2);
})().catch((e) => {
  console.error("E2E FAILED:", e && (e as Error).message ? (e as Error).message : e);
  process.exit(1);
});
