"use strict";

// tests/stub-taro.ts
var Taro = {
  async request(opts) {
    const res = await fetch(opts.url, {
      method: opts.method || "POST",
      headers: opts.header || {},
      body: typeof opts.data === "string" ? opts.data : JSON.stringify(opts.data),
      signal: opts.timeout ? AbortSignal.timeout(opts.timeout) : void 0
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = await res.text();
    }
    return { statusCode: res.status, data };
  },
  showToast() {
  }
};
var stub_taro_default = Taro;

// src/lib/api.ts
async function request(opts) {
  try {
    const res = await stub_taro_default.request({
      url: opts.url,
      method: opts.method ?? "POST",
      data: opts.data,
      header: { "Content-Type": "application/json", ...opts.header ?? {} },
      timeout: opts.timeout ?? 3e4
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
      stub_taro_default.showToast({ title: `\u8BF7\u6C42\u5931\u8D25 ${res.statusCode}`, icon: "none" });
      throw new Error(`HTTP ${res.statusCode}: ${msg.slice(0, 200)}`);
    }
    return res.data;
  } catch (e) {
    const err = e;
    if (err && err.errMsg && String(err.errMsg).includes("request:fail")) {
      stub_taro_default.showToast({ title: "\u7F51\u7EDC\u88AB\u62E6\u622A\xB7\u68C0\u67E5\u57DF\u540D\u767D\u540D\u5355", icon: "none" });
    }
    throw e;
  }
}

// src/lib/speaking-llm.ts
function localMetrics(answer2) {
  const words = answer2.trim().split(/\s+/).filter(Boolean);
  const sentences = answer2.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return { wordCount: words.length, sentenceCount: sentences.length, connectorCount: 0 };
}
var SYSTEM_PROMPT = `You are an IELTS speaking coach. Analyze the candidate's spoken answer and return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "candidateIssues": [{"dimension":"fluency|vocabulary|coherence|development|argumentation","severity":"minor|major","description":"\u4E2D\u6587\u70B9\u8BC4","suggestion":"\u4E2D\u6587\u6539\u8FDB\u5EFA\u8BAE"}],
  "mainIssue": {"dimension":"...","severity":"...","description":"...","suggestion":"..."},
  "microDrill": {"prompt":"\u4E00\u4E2A\u53EF\u6267\u884C\u7684\u5FAE\u8BAD\u7EC3\u63D0\u793A\uFF08\u4E2D\u6587\uFF09","exampleImprovement":"\u82F1\u6587\u8303\u4F8B\u53E5","targetDimension":"fluency|vocabulary|coherence|development|argumentation"},
  "summary":"\u4E00\u53E5\u8BDD\u4E2D\u6587\u603B\u8BC4"
}`;
async function analyzeSpeakingWithLLM(answer2, q2, cfg2, imaContext) {
  const userPrompt = `\u9898\u76EE\uFF1A${q2.questionZh}
\u8BDD\u9898\u5173\u952E\u8BCD\uFF1A${q2.keyTopicWords.join("\u3001")}
\u5EFA\u8BAE\u957F\u5EA6\uFF1A\u81F3\u5C11 ${q2.expectedLength.min} \u8BCD\uFF08\u7406\u60F3 ${q2.expectedLength.ideal} \u8BCD\uFF09
${imaContext ? `\u8003\u751F\u77E5\u8BC6\u5E93\u8865\u5145\u80CC\u666F\uFF1A
${imaContext}
` : ""}
\u8003\u751F\u56DE\u7B54\uFF1A
${answer2}`;
  const url = cfg2.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const data = await request({
    url,
    method: "POST",
    header: { Authorization: `Bearer ${cfg2.apiKey}` },
    data: {
      model: cfg2.modelName,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    },
    timeout: 45e3
  });
  const content = data?.choices?.[0]?.message?.content ?? "";
  const parsed = parseSpeakingJSON(content);
  const metrics = localMetrics(answer2);
  return {
    candidateIssues: parsed.candidateIssues,
    mainIssue: parsed.mainIssue,
    microDrill: parsed.microDrill,
    metrics: { ...metrics, uniqueWordRatio: 0, paraphraseScore: 0 },
    summary: parsed.summary
  };
}
function parseSpeakingJSON(text) {
  const jsonStr = extractJson(text);
  const obj = JSON.parse(jsonStr);
  if (!obj.mainIssue || !obj.microDrill) throw new Error("\u6A21\u578B\u8FD4\u56DE\u7ED3\u6784\u7F3A\u5931");
  const normIssue = (i) => ({
    dimension: i?.dimension ?? "fluency",
    severity: i?.severity === "major" ? "major" : "minor",
    description: String(i?.description ?? ""),
    suggestion: String(i?.suggestion ?? "")
  });
  const dims = ["fluency", "vocabulary", "coherence", "development", "argumentation"];
  const normDim = (d) => dims.includes(d) ? d : "fluency";
  return {
    candidateIssues: Array.isArray(obj.candidateIssues) ? obj.candidateIssues.map(normIssue) : [normIssue(obj.mainIssue)],
    mainIssue: normIssue(obj.mainIssue),
    microDrill: {
      prompt: String(obj.microDrill?.prompt ?? "\u8BF7\u518D\u8865\u5145\u4E00\u4E2A\u4F8B\u5B50\u3002"),
      exampleImprovement: String(obj.microDrill?.exampleImprovement ?? ""),
      targetDimension: normDim(obj.microDrill?.targetDimension)
    },
    summary: typeof obj.summary === "string" ? obj.summary : "\u5DF2\u5B8C\u6210\u5206\u6790\u3002"
  };
}
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("\u65E0\u6CD5\u89E3\u6790\u6A21\u578B\u8FD4\u56DE");
  return text.slice(start, end + 1);
}

// tests/run-e2e.ts
var KEY = "YOUR_API_KEY";
var cfg = {
  baseUrl: "https://api.siliconflow.cn/v1",
  modelName: "deepseek-ai/DeepSeek-V3",
  apiKey: KEY
};
var q = {
  questionZh: "Describe a habit your friend has that you want to develop.",
  keyTopicWords: ["habit", "friend", "develop"],
  expectedLength: { min: 80, ideal: 120 }
};
var answer = `My friend Tom has a very good habit. He reads book every day for one hour. I think this is good because reading can improve your knowledge and make you calm. I want to develop this habit too. Every night before sleep I will read some pages. Sometimes I feel tired and just want to sleep, but I try to read a little. I think it is a healthy habit and I should keep it.`;
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
  const ok = !!r.mainIssue && !!r.microDrill && typeof r.summary === "string" && Array.isArray(r.candidateIssues) && r.candidateIssues.length > 0;
  console.log("VALID SHAPE:", ok);
  if (!ok) process.exit(2);
})().catch((e) => {
  console.error("E2E FAILED:", e && e.message ? e.message : e);
  process.exit(1);
});
