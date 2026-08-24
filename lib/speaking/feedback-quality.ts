/**
 * Feedback Quality Gate
 * -------------------------------------------------------
 * 对 SpeakingAnalysisResult 进行质量校验。
 *
 * 设计原则：
 * - 纯确定性规则，不调用 LLM
 * - 不修改原始 analysis
 * - 返回校验结果供调用方决策
 * - Generator（analyze-speaking）与 Evaluator（本文件）分离
 */

import type { SpeakingAnalysisResult, DimensionAnalysis } from "@/lib/speaking/types";
import type {
  FeedbackQualityResult,
  FeedbackQualityIssue,
  QualityIssueSeverity,
  QualityStatus,
} from "@/lib/speaking/feedback-quality-types";

// =============================================================
// Main Entry
// =============================================================

/**
 * 校验 Speaking Analysis 反馈质量。
 *
 * @param analysis - LLM 生成的分析结果
 * @param userAnswer - 用户原始回答文本（用于证据匹配）
 * @returns FeedbackQualityResult
 */
export function validateFeedbackQuality(
  analysis: SpeakingAnalysisResult,
  userAnswer: string,
): FeedbackQualityResult {
  const issues: FeedbackQualityIssue[] = [];

  // 四项校验
  schemaCheck(analysis, issues);
  evidenceConsistencyCheck(analysis, userAnswer, issues);
  actionabilityCheck(analysis, issues);
  ieltsAlignmentCheck(analysis, issues);

  // 计算分数
  const score = computeScore(issues);

  // 决策状态
  let status: QualityStatus;
  if (score >= 70) {
    status = "PASS";
  } else if (score >= 40) {
    status = "NEEDS_REVIEW";
  } else {
    status = "FAIL";
  }

  return {
    status,
    issues,
    score,
    checkedAt: new Date().toISOString(),
  };
}

// =============================================================
// Rule 1: Schema Check
// =============================================================

const VALID_DIMENSIONS = new Set([
  "fluency", "vocabulary", "coherence", "development", "argumentation",
  "grammar", "pronunciation", "lexical",
]);

function schemaCheck(analysis: SpeakingAnalysisResult, issues: FeedbackQualityIssue[]): void {
  // mainIssue 必填字段
  if (!analysis.mainIssue.description || analysis.mainIssue.description.trim().length < 5) {
    issues.push({
      type: "MISSING_FIELD",
      severity: "critical",
      description: "mainIssue.description 为空或过短",
      fieldPath: "mainIssue.description",
    });
  }

  if (!analysis.mainIssue.suggestion || analysis.mainIssue.suggestion.trim().length < 5) {
    issues.push({
      type: "MISSING_FIELD",
      severity: "critical",
      description: "mainIssue.suggestion 为空或过短",
      fieldPath: "mainIssue.suggestion",
    });
  }

  // dimension 合法性
  if (!VALID_DIMENSIONS.has(analysis.mainIssue.dimension)) {
    issues.push({
      type: "INVALID_DIMENSION",
      severity: "major",
      description: `mainIssue.dimension "${analysis.mainIssue.dimension}" 不是合法的 IELTS 维度`,
      fieldPath: "mainIssue.dimension",
    });
  }

  // summary
  if (!analysis.summary || analysis.summary.trim().length < 10) {
    issues.push({
      type: "MISSING_FIELD",
      severity: "major",
      description: "summary 为空或过短（< 10 字符）",
      fieldPath: "summary",
    });
  }

  // microDrill
  if (!analysis.microDrill.prompt || analysis.microDrill.prompt.trim().length < 10) {
    issues.push({
      type: "MISSING_FIELD",
      severity: "minor",
      description: "microDrill.prompt 为空或过短",
      fieldPath: "microDrill.prompt",
    });
  }
}

// =============================================================
// Rule 2: Evidence Consistency Check
// =============================================================

function evidenceConsistencyCheck(
  analysis: SpeakingAnalysisResult,
  userAnswer: string,
  issues: FeedbackQualityIssue[],
): void {
  const answerLower = userAnswer.toLowerCase();
  const answerWords = new Set(answerLower.split(/\s+/).filter((w) => w.length > 2));

  // 检查 ieltsAnalysis 各维度
  if (analysis.ieltsAnalysis) {
    const dimensions: Array<[string, DimensionAnalysis | null]> = [
      ["ieltsAnalysis.fluency", analysis.ieltsAnalysis.fluency],
      ["ieltsAnalysis.lexicalResource", analysis.ieltsAnalysis.lexicalResource],
      ["ieltsAnalysis.grammaticalRange", analysis.ieltsAnalysis.grammaticalRange],
    ];

    for (const [path, dim] of dimensions) {
      if (!dim) continue;

      // issues 非空但 evidence 为空
      if (dim.issues.length > 0 && dim.evidence.length === 0) {
        issues.push({
          type: "NO_EVIDENCE",
          severity: "major",
          description: `${path} 有 ${dim.issues.length} 个问题但没有提供证据`,
          fieldPath: `${path}.evidence`,
        });
        continue;
      }

      // evidence 是否与用户回答有关联
      if (dim.evidence.length > 0) {
        const hasRelevantEvidence = dim.evidence.some((ev) => {
          const evLower = ev.toLowerCase();
          // 证据中包含用户回答的关键词（至少 1 个 >3 字母的词匹配）
          // 或者证据包含数据型内容（WPM、秒、次）
          const hasDataEvidence = /\d+\s*(wpm|秒|次|%)/i.test(ev);
          if (hasDataEvidence) return true;

          const evWords = evLower.split(/\s+/).filter((w) => w.length > 3);
          return evWords.some((w) => answerWords.has(w));
        });

        if (!hasRelevantEvidence) {
          issues.push({
            type: "EVIDENCE_MISMATCH",
            severity: "minor",
            description: `${path}.evidence 中未找到与用户回答相关的引用`,
            fieldPath: `${path}.evidence`,
          });
        }
      }
    }
  }

  // mainIssue.description 是否与回答有关联
  if (analysis.mainIssue.description) {
    const descLower = analysis.mainIssue.description.toLowerCase();
    const descWords = descLower.split(/[\s，。、！？,.!?]+/).filter((w) => w.length > 2);
    const hasConnection = descWords.some((w) => answerLower.includes(w)) ||
      /\d+/.test(analysis.mainIssue.description); // 含数据引用也算

    if (!hasConnection && descWords.length > 3) {
      // 只在描述较长时检查（短描述可能是高度概括）
      issues.push({
        type: "EVIDENCE_MISMATCH",
        severity: "minor",
        description: "mainIssue.description 中未能找到与用户回答的直接关联",
        fieldPath: "mainIssue.description",
      });
    }
  }
}

// =============================================================
// Rule 3: Actionability Check
// =============================================================

/** 泛化/无意义建议的模式 */
const VAGUE_PATTERNS = [
  /^继续努力/,
  /^加油/,
  /^提高.*水平$/,
  /^多练习$/,
  /^多听多说$/,
  /^好好学习/,
  /^improve your/i,
  /^keep practicing$/i,
  /^try harder$/i,
  /^work on your english$/i,
];

/** 可执行动作词 */
const ACTION_WORDS = [
  "练习", "使用", "替换", "尝试", "朗读", "跟读", "模仿",
  "改为", "换成", "加入", "删除", "避免", "注意",
  "用.*代替", "每天.*分钟", "每次.*之前",
  "practice", "use", "replace", "try", "read", "repeat",
  "avoid", "instead of", "add", "remove",
];

function actionabilityCheck(analysis: SpeakingAnalysisResult, issues: FeedbackQualityIssue[]): void {
  const suggestionsToCheck: Array<{ text: string; path: string }> = [
    { text: analysis.mainIssue.suggestion, path: "mainIssue.suggestion" },
    { text: analysis.microDrill.prompt, path: "microDrill.prompt" },
  ];

  // 包含 ieltsAnalysis 的 suggestions
  if (analysis.ieltsAnalysis) {
    const dims: Array<[string, DimensionAnalysis | null]> = [
      ["ieltsAnalysis.fluency", analysis.ieltsAnalysis.fluency],
      ["ieltsAnalysis.lexicalResource", analysis.ieltsAnalysis.lexicalResource],
      ["ieltsAnalysis.grammaticalRange", analysis.ieltsAnalysis.grammaticalRange],
    ];
    for (const [path, dim] of dims) {
      if (!dim) continue;
      for (let i = 0; i < dim.suggestions.length; i++) {
        suggestionsToCheck.push({ text: dim.suggestions[i]!, path: `${path}.suggestions[${i}]` });
      }
    }
  }

  for (const { text, path } of suggestionsToCheck) {
    if (!text || text.trim().length < 8) {
      issues.push({
        type: "NOT_ACTIONABLE",
        severity: "minor",
        description: `${path} 过短（< 8 字符），缺乏具体指导`,
        fieldPath: path,
      });
      continue;
    }

    // 检查是否匹配泛化模式
    const isVague = VAGUE_PATTERNS.some((p) => p.test(text.trim()));
    if (isVague) {
      issues.push({
        type: "VAGUE_SUGGESTION",
        severity: "major",
        description: `${path} 为泛化建议："${text.slice(0, 30)}..."`,
        fieldPath: path,
      });
      continue;
    }

    // 检查是否包含可执行动作词
    const hasAction = ACTION_WORDS.some((word) => {
      const pattern = new RegExp(word, "i");
      return pattern.test(text);
    });

    if (!hasAction && text.length < 20) {
      issues.push({
        type: "NOT_ACTIONABLE",
        severity: "minor",
        description: `${path} 缺乏明确可执行的动作词`,
        fieldPath: path,
      });
    }
  }
}

// =============================================================
// Rule 4: IELTS Alignment Check
// =============================================================

/** Band 分数泄漏模式 */
const BAND_SCORE_PATTERNS = [
  /band\s*\d/i,
  /\d\.?\d?\s*分/,
  /得分.*\d/,
  /score.*\d/i,
  /级别.*\d/,
];

function ieltsAlignmentCheck(analysis: SpeakingAnalysisResult, issues: FeedbackQualityIssue[]): void {
  // 收集所有文本字段
  const textFields: Array<{ text: string; path: string }> = [
    { text: analysis.summary, path: "summary" },
    { text: analysis.mainIssue.description, path: "mainIssue.description" },
    { text: analysis.mainIssue.suggestion, path: "mainIssue.suggestion" },
  ];

  if (analysis.ieltsAnalysis) {
    textFields.push({ text: analysis.ieltsAnalysis.overallDiagnosis, path: "ieltsAnalysis.overallDiagnosis" });
    for (const s of analysis.ieltsAnalysis.prioritizedSuggestions) {
      textFields.push({ text: s, path: "ieltsAnalysis.prioritizedSuggestions" });
    }
  }

  // Band 分数泄漏检查
  for (const { text, path } of textFields) {
    if (!text) continue;
    const hasBandScore = BAND_SCORE_PATTERNS.some((p) => p.test(text));
    if (hasBandScore) {
      issues.push({
        type: "BAND_SCORE_LEAK",
        severity: "major",
        description: `${path} 中出现了具体 Band 分数判断："${text.slice(0, 40)}..."`,
        fieldPath: path,
      });
    }
  }

  // ieltsAnalysis 维度 level 合法性
  if (analysis.ieltsAnalysis) {
    const validLevels = new Set(["strong", "adequate", "developing", "weak"]);
    const dims: Array<[string, DimensionAnalysis | null]> = [
      ["fluency", analysis.ieltsAnalysis.fluency],
      ["lexicalResource", analysis.ieltsAnalysis.lexicalResource],
      ["grammaticalRange", analysis.ieltsAnalysis.grammaticalRange],
    ];

    for (const [name, dim] of dims) {
      if (!dim) continue;
      if (!validLevels.has(dim.level)) {
        issues.push({
          type: "IELTS_MISALIGNMENT",
          severity: "major",
          description: `ieltsAnalysis.${name}.level "${dim.level}" 不是合法的评估级别`,
          fieldPath: `ieltsAnalysis.${name}.level`,
        });
      }
    }
  }

  // 泛化反馈检查（summary 太短且无具体信息）
  if (analysis.summary && analysis.summary.length < 15) {
    const isGeneric = !analysis.summary.includes("但") &&
      !analysis.summary.includes("需要") &&
      !analysis.summary.includes("建议") &&
      !/\w{4,}/.test(analysis.summary); // 无英文词

    if (isGeneric) {
      issues.push({
        type: "GENERIC_FEEDBACK",
        severity: "minor",
        description: "summary 过于笼统，缺乏具体诊断信息",
        fieldPath: "summary",
      });
    }
  }
}

// =============================================================
// Score Computation
// =============================================================

const SEVERITY_PENALTY: Record<QualityIssueSeverity, number> = {
  critical: 30,
  major: 15,
  minor: 5,
};

function computeScore(issues: FeedbackQualityIssue[]): number {
  const totalPenalty = issues.reduce((sum, issue) => sum + SEVERITY_PENALTY[issue.severity], 0);
  return Math.max(0, 100 - totalPenalty);
}
