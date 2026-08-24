"use client";
/**
 * Evaluation Builder
 * -------------------------------------------------------
 * Phase 5: 从 SpeakingSession 计算单次效果评估。
 *
 * 纯确定性逻辑，不调用 LLM。
 * 比较 firstAnalysis vs secondAnalysis 的维度等级和 issues。
 */

import type { SpeakingSession, SpeakingAnalysisResult, DimensionAnalysis } from "@/lib/speaking/types";
import type {
  SpeakingEvaluation,
  FeedbackEffectiveness,
  OverallChange,
} from "@/lib/evaluation/types";

// =============================================================
// Constants
// =============================================================

const LEVEL_SCORE: Record<string, number> = {
  weak: 1,
  developing: 2,
  adequate: 3,
  strong: 4,
};

/** Issue 匹配时使用前缀长度（处理 LLM 每次措辞略有不同） */
const ISSUE_MATCH_PREFIX_LEN = 12;

// =============================================================
// Main Function
// =============================================================

/**
 * 计算单次 speaking session 的效果评估。
 *
 * @param session - 完整的 SpeakingSession（需要 firstAnalysis + secondAnalysis）
 * @returns SpeakingEvaluation | null（null 表示无法评估，如缺少分析数据）
 */
export function computeSessionEvaluation(session: SpeakingSession): SpeakingEvaluation | null {
  const { firstAnalysis, secondAnalysis, secondAnswer } = session;

  // 如果没有首次分析，无法评估
  if (!firstAnalysis) return null;

  // 用户未完成重答
  if (!secondAnswer || !secondAnalysis) {
    return {
      sessionId: session.id,
      userId: session.userId,
      feedbackAdopted: false,
      dimensionChanges: { fluency: null, lexicalResource: null, grammaticalRange: null },
      resolvedIssues: [],
      unresolvedIssues: [],
      issueResolutionRate: 0,
      feedbackEffectiveness: "uncertain",
      overallChange: "stable",
      evaluatedAt: new Date().toISOString(),
    };
  }

  // 计算维度变化
  const dimensionChanges = computeDimensionChanges(firstAnalysis, secondAnalysis);

  // 计算 issue 解决情况
  const { resolvedIssues, unresolvedIssues, issueResolutionRate } =
    computeIssueResolution(firstAnalysis, secondAnalysis);

  // 综合判断
  const overallChange = determineOverallChange(dimensionChanges);
  const feedbackEffectiveness = determineFeedbackEffectiveness(
    dimensionChanges,
    issueResolutionRate,
    overallChange,
  );

  return {
    sessionId: session.id,
    userId: session.userId,
    feedbackAdopted: true,
    dimensionChanges,
    resolvedIssues,
    unresolvedIssues,
    issueResolutionRate,
    feedbackEffectiveness,
    overallChange,
    evaluatedAt: new Date().toISOString(),
  };
}

// =============================================================
// Dimension Changes
// =============================================================

function computeDimensionChanges(
  first: SpeakingAnalysisResult,
  second: SpeakingAnalysisResult,
): SpeakingEvaluation["dimensionChanges"] {
  return {
    fluency: computeSingleDimensionChange(
      first.ieltsAnalysis?.fluency,
      second.ieltsAnalysis?.fluency,
    ),
    lexicalResource: computeSingleDimensionChange(
      first.ieltsAnalysis?.lexicalResource,
      second.ieltsAnalysis?.lexicalResource,
    ),
    grammaticalRange: computeSingleDimensionChange(
      first.ieltsAnalysis?.grammaticalRange,
      second.ieltsAnalysis?.grammaticalRange,
    ),
  };
}

function computeSingleDimensionChange(
  first: DimensionAnalysis | null | undefined,
  second: DimensionAnalysis | null | undefined,
): number | null {
  if (!first || !second) return null;

  const firstScore = LEVEL_SCORE[first.level] ?? 0;
  const secondScore = LEVEL_SCORE[second.level] ?? 0;

  return secondScore - firstScore;
}

// =============================================================
// Issue Resolution
// =============================================================

function computeIssueResolution(
  first: SpeakingAnalysisResult,
  second: SpeakingAnalysisResult,
): {
  resolvedIssues: string[];
  unresolvedIssues: string[];
  issueResolutionRate: number;
} {
  const firstIssues = extractAllIssues(first);
  const secondIssues = extractAllIssues(second);

  if (firstIssues.length === 0) {
    return { resolvedIssues: [], unresolvedIssues: [], issueResolutionRate: 1 };
  }

  const secondNormalized = secondIssues.map(normalizeIssue);

  const resolvedIssues: string[] = [];
  const unresolvedIssues: string[] = [];

  for (const issue of firstIssues) {
    const normalized = normalizeIssue(issue);
    const prefix = normalized.slice(0, ISSUE_MATCH_PREFIX_LEN);

    const stillExists = secondNormalized.some(
      (sn) => sn.slice(0, ISSUE_MATCH_PREFIX_LEN) === prefix,
    );

    if (stillExists) {
      unresolvedIssues.push(issue);
    } else {
      resolvedIssues.push(issue);
    }
  }

  const issueResolutionRate = resolvedIssues.length / firstIssues.length;

  return { resolvedIssues, unresolvedIssues, issueResolutionRate };
}

function extractAllIssues(analysis: SpeakingAnalysisResult): string[] {
  const issues: string[] = [];

  // 从 ieltsAnalysis 提取
  if (analysis.ieltsAnalysis) {
    const dims = [
      analysis.ieltsAnalysis.fluency,
      analysis.ieltsAnalysis.lexicalResource,
      analysis.ieltsAnalysis.grammaticalRange,
    ];
    for (const dim of dims) {
      if (dim?.issues) {
        issues.push(...dim.issues);
      }
    }
  }

  // 从 mainIssue 提取（如果不在上面的 issues 中）
  if (analysis.mainIssue.description) {
    const mainNorm = normalizeIssue(analysis.mainIssue.description);
    const alreadyIncluded = issues.some(
      (i) => normalizeIssue(i).slice(0, ISSUE_MATCH_PREFIX_LEN) === mainNorm.slice(0, ISSUE_MATCH_PREFIX_LEN),
    );
    if (!alreadyIncluded) {
      issues.push(analysis.mainIssue.description);
    }
  }

  return issues;
}

function normalizeIssue(issue: string): string {
  return issue.toLowerCase().trim().replace(/[，。、！？,.!?]/g, "");
}

// =============================================================
// Overall Judgments
// =============================================================

function determineOverallChange(
  changes: SpeakingEvaluation["dimensionChanges"],
): OverallChange {
  const values = [changes.fluency, changes.lexicalResource, changes.grammaticalRange]
    .filter((v): v is number => v !== null);

  if (values.length === 0) return "stable";

  const total = values.reduce((sum, v) => sum + v, 0);

  if (total > 0) return "improved";
  if (total < 0) return "declined";
  return "stable";
}

function determineFeedbackEffectiveness(
  changes: SpeakingEvaluation["dimensionChanges"],
  issueResolutionRate: number,
  overallChange: OverallChange,
): FeedbackEffectiveness {
  const values = [changes.fluency, changes.lexicalResource, changes.grammaticalRange]
    .filter((v): v is number => v !== null);

  // 至少一个维度改善 或 issue 解决率 > 0
  const hasImprovement = values.some((v) => v > 0);
  const hasResolution = issueResolutionRate > 0;

  if (hasImprovement || hasResolution) {
    return "effective";
  }

  if (overallChange === "declined") {
    return "ineffective";
  }

  return "uncertain";
}
