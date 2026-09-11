/**
 * 真实 LLM 口语分析：直连用户自带大模型，返回与离线启发式同构的 SpeakingAnalysisResult。
 * 调用方负责在异常时降级到 analyzeSpeakingLocally（离线）。
 */
import { callUserModel } from "./llm-client";
import type {
  ModelConfig,
  SpeakingAnalysisResult,
  SpeakingIssue,
  MicroDrill,
  SpeakingQuestion,
} from "@ielts/core";

function localMetrics(answer: string) {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return { wordCount: words.length, sentenceCount: sentences.length, connectorCount: 0 };
}

const SYSTEM_PROMPT = `You are an IELTS speaking coach. Analyze the candidate's spoken answer and return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "candidateIssues": [{"dimension":"fluency|vocabulary|coherence|development|argumentation","severity":"minor|major","description":"中文点评","suggestion":"中文改进建议"}],
  "mainIssue": {"dimension":"...","severity":"...","description":"...","suggestion":"..."},
  "microDrill": {"prompt":"一个可执行的微训练提示（中文）","exampleImprovement":"英文范例句","targetDimension":"fluency|vocabulary|coherence|development|argumentation"},
  "summary":"一句话中文总评"
}`;

/**
 * 调用户自带大模型做口语分析。
 * @param imaContext 可选：来自用户 ima 知识库的补充上下文，拼进 prompt。
 */
export async function analyzeSpeakingWithLLM(
  answer: string,
  q: SpeakingQuestion,
  cfg: ModelConfig,
  imaContext?: string,
): Promise<SpeakingAnalysisResult> {
  const userPrompt = `题目：${q.questionZh}
话题关键词：${q.keyTopicWords.join("、")}
建议长度：至少 ${q.expectedLength.min} 词（理想 ${q.expectedLength.ideal} 词）
${imaContext ? `考生知识库补充背景：\n${imaContext}\n` : ""}
考生回答：
${answer}`;

  const content = await callUserModel(cfg, SYSTEM_PROMPT, userPrompt, {
    jsonMode: true,
    timeout: 45000,
  });
  if (!content) throw new Error("模型未返回内容");

  const parsed = parseSpeakingJSON(content);
  const metrics = localMetrics(answer);
  return {
    candidateIssues: parsed.candidateIssues,
    mainIssue: parsed.mainIssue,
    microDrill: parsed.microDrill,
    metrics: { ...metrics, uniqueWordRatio: 0, paraphraseScore: 0 },
    summary: parsed.summary,
  };
}

function parseSpeakingJSON(text: string): {
  candidateIssues: SpeakingIssue[];
  mainIssue: SpeakingIssue;
  microDrill: MicroDrill;
  summary: string;
} {
  const jsonStr = extractJson(text);
  const obj = JSON.parse(jsonStr) as any;
  if (!obj.mainIssue || !obj.microDrill) throw new Error("模型返回结构缺失");
  const normIssue = (i: any): SpeakingIssue => ({
    dimension: i?.dimension ?? "fluency",
    severity: i?.severity === "major" ? "major" : "minor",
    description: String(i?.description ?? ""),
    suggestion: String(i?.suggestion ?? ""),
  });
  const dims = ["fluency", "vocabulary", "coherence", "development", "argumentation"];
  const normDim = (d: any) => (dims.includes(d) ? d : "fluency");
  return {
    candidateIssues: Array.isArray(obj.candidateIssues)
      ? obj.candidateIssues.map(normIssue)
      : [normIssue(obj.mainIssue)],
    mainIssue: normIssue(obj.mainIssue),
    microDrill: {
      prompt: String(obj.microDrill?.prompt ?? "请再补充一个例子。"),
      exampleImprovement: String(obj.microDrill?.exampleImprovement ?? ""),
      targetDimension: normDim(obj.microDrill?.targetDimension),
    },
    summary: typeof obj.summary === "string" ? obj.summary : "已完成分析。",
  };
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("无法解析模型返回");
  return text.slice(start, end + 1);
}
