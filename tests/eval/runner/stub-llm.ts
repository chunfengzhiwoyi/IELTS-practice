/**
 * ELS Eval Runner — Scripted LLM Provider（Stub）
 * ------------------------------------------------------------
 * 脚本化 Provider：按调用次序返回预设 content。
 * 每次调用记录 tier / temperature / jsonMode / prompt 摘要，
 * 供断言 llm_call_count、修复 tier=fast、temp=0 等使用。
 *
 * M3-P1 补充：agent 路由 / speaking 深度分析 / report 总结的常用脚本输出。
 */
import type { LlmProvider } from "@/lib/llm/provider";

export type ScriptStep = string | ((callIndex: number, request: LlmChatRequestView) => string);

export interface LlmCallRecord {
  index: number;
  tier: string;
  temperature: number | undefined;
  jsonMode: boolean | undefined;
  systemContent: string;
  userContent: string;
}

/** 与 LlmChatRequest 结构对齐的只读视图（避免直接依赖内部类型细节） */
export interface LlmChatRequestView {
  tier: string;
  jsonMode?: boolean;
  temperature?: number;
  messages: Array<{ role: string; content: string }>;
  traceId: string;
}

export interface ScriptedProvider {
  provider: LlmProvider;
  calls: LlmCallRecord[];
}

export function createScriptedProvider(steps: ScriptStep[]): ScriptedProvider {
  const calls: LlmCallRecord[] = [];

  const provider: LlmProvider = {
    kind: "mock",
    async chat(request) {
      const index = calls.length;
      const system = request.messages.find((m) => m.role === "system");
      const user = request.messages.find((m) => m.role === "user");
      calls.push({
        index,
        tier: request.tier,
        temperature: request.temperature,
        jsonMode: request.jsonMode,
        systemContent: system?.content ?? "",
        userContent: user?.content ?? "",
      });

      const step = steps[index];
      if (step === undefined) {
        throw new Error(
          `scripted-provider: 第 ${index + 1} 次调用无脚本（脚本共 ${steps.length} 步）。` +
            `user 摘要: ${user?.content?.slice(0, 120) ?? "(none)"}`,
        );
      }
      const content = typeof step === "function" ? step(index, request as unknown as LlmChatRequestView) : step;
      return {
        content,
        model: "mock-scripted",
        usage: { input_tokens: 16, output_tokens: 16 },
      };
    },
  };

  return { provider, calls };
}

// ---------- 常用脚本输出 ----------

/** 判题 JSON（correct 可控） */
export const judgeJson = (correct: boolean) =>
  JSON.stringify({
    correct,
    confidence: "high",
    explanation: correct ? "答案表达了核心含义" : "未表达核心含义",
  });

/** 词卡 JSON（满足 WordCardSchema） */
export const wordCardJson = (term: string, coreMeaning: string) =>
  JSON.stringify({
    term,
    normalizedTerm: term.toLowerCase(),
    itemType: "WORD",
    phonetic: "/test/",
    partOfSpeech: "noun",
    coreMeaning,
    usageContext: "IELTS 测试语境",
    collocations: ["test collocation"],
    exampleSentence: "This is a test sentence.",
    exampleTranslation: "这是一个测试句。",
    commonMistake: "测试用提示。",
    topicTags: ["test"],
    acceptedAnswers: [coreMeaning],
    answerKeywords: [coreMeaning.slice(0, 2)],
  });

/** 报告总结 JSON（满足 ReportSummarySchema） */
export const reportSummaryJson = () =>
  JSON.stringify({
    overallAssessment: "测试总结。",
    keyInsight: "测试洞察。",
    actionableSuggestion: "测试建议。",
    encouragement: "继续加油。",
  });

/** Agent /api/agent/message 响应 JSON（满足 ChatResponse / ResponseSchema） */
export const agentResponseJson = (
  uiActionType: string,
  assistantText: string,
  extra: Record<string, unknown> = {},
) =>
  JSON.stringify({
    assistant_text: assistantText,
    ui_action: { type: uiActionType, ...extra },
    conversation_state_patch: { currentIntent: (extra.term as string) ?? uiActionType.toLowerCase() },
  });

/**
 * Speaking 深度分析 JSON（满足 EnhancedAnalysisSchema）。
 * overrides 可注入 band 泄漏 / 幻觉证据 / 空泛建议等 gate 探测内容。
 * evidenceOverrides[i] 依次覆盖 fluency / lexicalResource / grammaticalRange 的证据与问题。
 */
export const speakingAnalysisJson = (
  overrides: {
    summary?: string;
    mainIssue?: { dimension?: string; description?: string; suggestion?: string };
    evidenceOverrides?: Array<{ issues?: string[]; evidence?: string[] }>;
    prioritizedSuggestions?: string[];
    overallDiagnosis?: string;
    microDrill?: { prompt?: string; exampleImprovement?: string; targetDimension?: string };
    /** 维度 level 覆盖（默认 fluency=developing / lexical=adequate / grammar=developing） */
    levels?: { fluency?: "strong" | "adequate" | "developing" | "weak"; lexicalResource?: "strong" | "adequate" | "developing" | "weak"; grammaticalRange?: "strong" | "adequate" | "developing" | "weak" };
  } = {},
) => {
  const dim = (
    level: string,
    evidence: string[],
    issues: string[],
    suggestions: string[],
  ) => ({
    label: "流利度与连贯性",
    level,
    evidence,
    issues,
    suggestions,
  });
  const ev = (idx: number, fallback: { level: string; issues: string[]; evidence: string[]; suggestions: string[] }) => {
    const o = overrides.evidenceOverrides?.[idx];
    const levelKeys: Array<"fluency" | "lexicalResource" | "grammaticalRange"> = ["fluency", "lexicalResource", "grammaticalRange"];
    const levelKey = levelKeys[idx] ?? "fluency";
    return dim(
      overrides.levels?.[levelKey] ?? fallback.level,
      o?.evidence ?? fallback.evidence,
      o?.issues ?? fallback.issues,
      fallback.suggestions,
    );
  };
  return JSON.stringify({
    mainIssue: {
      dimension: overrides.mainIssue?.dimension ?? "development",
      severity: "major",
      description:
        overrides.mainIssue?.description ?? "回答展开不足：内容过于简短，缺少细节与例子支撑观点。",
      suggestion:
        overrides.mainIssue?.suggestion ?? "尝试用具体例子展开回答，先说观点再补充原因和例子。",
    },
    microDrill: {
      prompt: overrides.microDrill?.prompt ?? "练习用 30 秒详细描述一次你喜欢的旅行，包含具体地点、人物和感受。",
      exampleImprovement:
        overrides.microDrill?.exampleImprovement ??
        "Last summer I visited Hangzhou with my family. We walked around the West Lake...",
      targetDimension: overrides.microDrill?.targetDimension ?? "development",
    },
    summary: overrides.summary ?? "回答较短但结构清楚，主要问题是展开不足。",
    strengths: ["能直接回应问题"],
    fluency: ev(0, {
      level: "developing",
      evidence: ["回答只有一句话，缺乏展开"],
      issues: ["观点之间缺乏过渡"],
      suggestions: ["用连接词串联观点"],
    }),
    lexicalResource: ev(1, {
      level: "adequate",
      evidence: ["使用了一些基础词汇"],
      issues: ["词汇范围有限"],
      suggestions: ["积累话题相关词汇"],
    }),
    grammaticalRange: ev(2, {
      level: "developing",
      evidence: ["句子结构简单"],
      issues: ["缺少复合句"],
      suggestions: ["练习使用从句"],
    }),
    overallDiagnosis: overrides.overallDiagnosis ?? "当前最大瓶颈是内容展开不足。",
    prioritizedSuggestions:
      overrides.prioritizedSuggestions ?? ["用具体例子展开回答", "先说观点再补充原因", "每天练习一段完整表达"],
  });
};
