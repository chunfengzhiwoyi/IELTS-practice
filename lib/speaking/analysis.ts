/**
 * 口语分析引擎（确定性，无 LLM）
 * ------------------------------------------------------------
 * 交接单 §3.4：每轮只选择一个最值得改善的问题。
 *
 * 检测维度（按优先级）：
 *  1. fluency: 答案长度是否足够/过短
 *  2. coherence: 是否使用连接词/过渡词
 *  3. vocabulary: 是否大量重复题目原词（lack of paraphrasing）
 *  4. development/argumentation: 句子多样性（是否全是简单短句）
 *
 * 每个维度独立评估，选 severity=major 中优先级最高的一个作为 mainIssue。
 * 若无 major，选第一个 minor。若全通过，给出鼓励性 minor issue。
 */
import type {
  MicroDrill,
  SpeakingAnalysisResult,
  SpeakingDimension,
  SpeakingIssue,
  SpeakingQuestion,
} from "@/lib/speaking/types";

export function analyzeSpeakingAnswer(
  answer: string,
  question: SpeakingQuestion,
): SpeakingAnalysisResult {
  const metrics = computeMetrics(answer, question);
  const candidates: SpeakingIssue[] = [];

  // 1. Fluency: length check
  const fluencyIssue = checkFluency(metrics, question);
  if (fluencyIssue) candidates.push(fluencyIssue);

  // 2. Coherence: connectors
  const coherenceIssue = checkCoherence(metrics, question);
  if (coherenceIssue) candidates.push(coherenceIssue);

  // 3. Vocabulary: paraphrase
  const vocabIssue = checkVocabulary(metrics, question);
  if (vocabIssue) candidates.push(vocabIssue);

  // 4. Development/Argumentation: sentence variety
  const devIssue = checkDevelopment(metrics, question);
  if (devIssue) candidates.push(devIssue);

  // Select main issue: first major, then first minor
  const mainIssue = candidates.find((i) => i.severity === "major")
    ?? candidates[0]
    ?? createFallbackIssue();

  const microDrill = generateMicroDrill(mainIssue, answer, question);

  const summary = generateSummary(metrics, candidates.length, mainIssue);

  return {
    candidateIssues: candidates,
    mainIssue,
    microDrill,
    metrics,
    summary,
  };
}

// =============================================================
// Metrics
// =============================================================

interface Metrics {
  wordCount: number;
  sentenceCount: number;
  connectorCount: number;
  uniqueWordRatio: number;
  paraphraseScore: number;
}

function computeMetrics(answer: string, question: SpeakingQuestion): Metrics {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;

  // Connector count
  const lowerAnswer = answer.toLowerCase();
  const allConnectors = [
    ...question.goodConnectors,
    "however", "moreover", "furthermore", "in addition", "nevertheless",
    "therefore", "consequently", "meanwhile", "on the other hand",
    "firstly", "secondly", "finally", "for example", "for instance",
    "in my opinion", "I believe", "to be honest", "as a result",
  ];
  const connectorCount = allConnectors.filter((c) => lowerAnswer.includes(c.toLowerCase())).length;

  // Unique word ratio
  const lowerWords = words.map((w) => w.toLowerCase().replace(/[^a-z']/g, "")).filter(Boolean);
  const uniqueWords = new Set(lowerWords);
  const uniqueWordRatio = lowerWords.length > 0 ? uniqueWords.size / lowerWords.length : 0;

  // Paraphrase score: lower overlap with keyTopicWords = better
  const keyWords = question.keyTopicWords.map((w) => w.toLowerCase());
  const keyWordUsed = keyWords.filter((kw) => lowerAnswer.includes(kw)).length;
  const overlapRatio = keyWords.length > 0 ? keyWordUsed / keyWords.length : 0;
  const paraphraseScore = 1 - overlapRatio; // 1 = perfect paraphrase, 0 = all key words repeated

  return { wordCount, sentenceCount, connectorCount, uniqueWordRatio, paraphraseScore };
}

// =============================================================
// Issue Detectors
// =============================================================

function checkFluency(m: Metrics, q: SpeakingQuestion): SpeakingIssue | null {
  if (m.wordCount < q.expectedLength.min) {
    return {
      dimension: "fluency",
      severity: "major",
      description: `回答过短（${m.wordCount} 词，建议至少 ${q.expectedLength.min} 词）。在雅思口语中，过短的回答可能影响流利度评分。`,
      suggestion: `尝试展开回答：加入原因、例子或个人经历。目标 ${q.expectedLength.ideal} 词左右。`,
    };
  }
  if (m.wordCount > q.expectedLength.max) {
    return {
      dimension: "fluency",
      severity: "minor",
      description: `回答偏长（${m.wordCount} 词）。Part ${q.part.replace("P", "")} 建议控制在 ${q.expectedLength.max} 词以内，保持简洁。`,
      suggestion: "尝试精简表达，去掉重复或不必要的细节。",
    };
  }
  return null;
}

function checkCoherence(m: Metrics, q: SpeakingQuestion): SpeakingIssue | null {
  const threshold = q.part === "P1" ? 1 : 2;
  if (m.connectorCount < threshold) {
    return {
      dimension: "coherence",
      severity: m.connectorCount === 0 ? "major" : "minor",
      description: `连接词/过渡语使用不足（检测到 ${m.connectorCount} 个）。缺乏过渡词会让回答显得跳跃，影响连贯性评分。`,
      suggestion: `试着加入过渡词，如：${q.goodConnectors.slice(0, 3).join("、")}。`,
    };
  }
  return null;
}

function checkVocabulary(m: Metrics, _q: SpeakingQuestion): SpeakingIssue | null {
  if (m.paraphraseScore < 0.3) {
    return {
      dimension: "vocabulary",
      severity: "major",
      description: "大量重复题目原词，缺乏同义替换（paraphrase）。雅思口语高分需要展示词汇多样性。",
      suggestion: "尝试用同义词替换题目中的关键词。例如用 'significant' 替代 'important'，用 'a variety of' 替代 'many'。",
    };
  }
  if (m.uniqueWordRatio < 0.5) {
    return {
      dimension: "vocabulary",
      severity: "minor",
      description: `词汇重复率较高（独特词比例 ${Math.round(m.uniqueWordRatio * 100)}%）。`,
      suggestion: "尝试使用更多样化的表达，避免在同一段落中反复使用相同的词。",
    };
  }
  return null;
}

function checkDevelopment(m: Metrics, q: SpeakingQuestion): SpeakingIssue | null {
  const dimension: SpeakingDimension = q.dimensions.includes("argumentation")
    ? "argumentation"
    : "development";

  if (m.sentenceCount > 0 && m.wordCount / m.sentenceCount < 8) {
    return {
      dimension,
      severity: "minor",
      description: "句子普遍较短，缺乏复合句式。适当使用从句和并列结构能提升语法评分。",
      suggestion: "尝试连接两个简单句，例如用 'which'、'because'、'although' 构建复合句。",
    };
  }
  return null;
}

function createFallbackIssue(): SpeakingIssue {
  return {
    dimension: "fluency",
    severity: "minor",
    description: "整体表达不错！可以继续精进细节，如语调变化和更自然的过渡。",
    suggestion: "试着在关键观点前加入简短停顿或过渡语，让表达更有节奏感。",
  };
}

// =============================================================
// Micro Drill
// =============================================================

function generateMicroDrill(
  issue: SpeakingIssue,
  answer: string,
  question: SpeakingQuestion,
): MicroDrill {
  switch (issue.dimension) {
    case "fluency":
      if (issue.severity === "major" && answer.trim().split(/\s+/).length < question.expectedLength.min) {
        return {
          prompt: `请在你的回答基础上，补充一个具体的例子或个人经历来支撑你的观点。目标增加 ${question.expectedLength.ideal - answer.trim().split(/\s+/).length} 词左右。`,
          exampleImprovement: `For example, I remember when... This experience taught me that...`,
          targetDimension: "fluency",
        };
      }
      return {
        prompt: "请用 2-3 句话概括你的核心观点，练习简洁表达。",
        exampleImprovement: "In short, I believe... The main reason is... For instance...",
        targetDimension: "fluency",
      };

    case "coherence":
      return {
        prompt: `请在你的回答中加入至少 2 个过渡词（如 ${question.goodConnectors.slice(0, 3).join(", ")}），重新组织回答。`,
        exampleImprovement: `${question.goodConnectors[0] ?? "Firstly"}, ... ${question.goodConnectors[1] ?? "Moreover"}, ...`,
        targetDimension: "coherence",
      };

    case "vocabulary":
      return {
        prompt: "请尝试用不同的词替换你回答中重复的关键词，重新回答一次。",
        exampleImprovement: "Instead of repeating the same word, try: significant → crucial / essential / vital",
        targetDimension: "vocabulary",
      };

    case "development":
    case "argumentation":
      return {
        prompt: "请尝试用一个 'because/although/which' 引导的复合句来改写你回答中的一个简单句。",
        exampleImprovement: "Original: I like reading. It helps me relax. → Improved: I enjoy reading because it helps me unwind after a long day.",
        targetDimension: issue.dimension,
      };
  }
}

// =============================================================
// Summary
// =============================================================

function generateSummary(m: Metrics, issueCount: number, mainIssue: SpeakingIssue): string {
  if (issueCount === 0) {
    return `回答结构完整（${m.wordCount} 词，${m.sentenceCount} 句），表达清晰流畅。继续保持！`;
  }
  if (mainIssue.severity === "major") {
    return `本次回答 ${m.wordCount} 词，主要需要改善的是「${dimensionLabel(mainIssue.dimension)}」维度。`;
  }
  return `表达基本到位（${m.wordCount} 词），可以进一步优化「${dimensionLabel(mainIssue.dimension)}」。`;
}

function dimensionLabel(d: SpeakingDimension): string {
  const map: Record<SpeakingDimension, string> = {
    fluency: "流利度",
    vocabulary: "词汇多样性",
    coherence: "连贯性",
    development: "展开深度",
    argumentation: "论证逻辑",
  };
  return map[d];
}
