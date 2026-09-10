/**
 * Evidence Sanitizer
 * -------------------------------------------------------
 * 在 Quality Gate 检测到 EVIDENCE_MISMATCH 后，
 * 从 API-visible analysis 中移除未在用户回答中获得支持的具体断言。
 *
 * 设计原则：
 * - 纯确定性规则，不调用 LLM
 * - Grounding detection 使用共享 primitive (lib/speaking/evidence-grounding.ts)
 *   Detection SSOT + Enforcement Strategy，不维护第二套 detector
 * - 只移除 ungrounded 的具体 factual claims，保留 level / suggestions
 * - 不修改原始 analysis（返回新对象）
 * - 生成 sanitizationReport 供 Trace 记录
 *
 * BC-M3-004-SAFETY-PATCH:
 * - Grounding logic 移至 evidence-grounding.ts（与 Quality Gate 共享）
 * - 新增 ieltsAnalysis.*.issues sanitization（UI 渲染且可承载 factual claim）
 * - Public API 只暴露安全摘要，raw claims 仅在内部 Trace
 *
 * Product Decision (BC-M3-004 / ELS-EVAL-019):
 *   Option B — sanitize unsupported evidence, preserve rest of analysis.
 */

import type { SpeakingAnalysisResult, IeltsSpeakingAnalysis } from "@/lib/speaking/types";
import type { FeedbackQualityResult } from "@/lib/speaking/feedback-quality-types";
import {
  buildAnswerWordSet,
  filterGroundedEvidence,
} from "@/lib/speaking/evidence-grounding";

// Re-export for backward compatibility (tests import from here)
export { isEvidenceGrounded } from "@/lib/speaking/evidence-grounding";

// =============================================================
// Linguistic Claim Detection（用于 free-text 字段）
// =============================================================

/**
 * 检测文本中是否包含指向具体语言结构的断言，
 * 且该结构在用户回答中不存在。
 *
 * 保守的 pattern-based 检查，仅覆盖 ELS-EVAL-019 冻结的高风险模式。
 * 不做通用 NLP parsing。
 */
const LINGUISTIC_CLAIM_PATTERNS: Array<{ pattern: RegExp; label: string; answerCheck: (answer: string) => boolean }> = [
  {
    pattern: /which|定语从句|relative\s*clause/i,
    label: "which/that 定语从句",
    answerCheck: (a) => /\bwhich\b/i.test(a),
  },
  {
    pattern: /被动|passive\s*voice/i,
    label: "被动语态",
    answerCheck: (a) => /\b(am|is|are|was|were|be|been|being)\s+\w+ed\b/i.test(a),
  },
  {
    pattern: /比较级|comparative|more\s+\w+\s+than|\bbetter\b|\bworse\b/i,
    label: "比较级",
    answerCheck: (a) => /more\s+\w+\s+than|\bbetter\b|\bworse\b|\b\w+er\s+than\b/i.test(a),
  },
  {
    pattern: /复合句|complex\s*sentence|从句|subordinate/i,
    label: "复合句/从句",
    answerCheck: (a) => /\b(which|that|who|whom|whose|where|when|because|although|if|unless|while|since)\b/i.test(a),
  },
  {
    pattern: /现在完成时|present\s*perfect|过去完成时|past\s*perfect|进行时|continuous/i,
    label: "具体时态",
    answerCheck: (a) => /\b(have|has)\s+\w+ed\b|\bhad\s+\w+ed\b|\b(am|is|are|was|were)\s+\w+ing\b/i.test(a),
  },
];

export interface UngroundedClaim {
  label: string;
  matchedText: string;
}

export function detectUngroundedLinguisticClaims(text: string, userAnswer: string): UngroundedClaim[] {
  const claims: UngroundedClaim[] = [];
  for (const { pattern, label, answerCheck } of LINGUISTIC_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match && !answerCheck(userAnswer)) {
      claims.push({ label, matchedText: match[0] });
    }
  }
  return claims;
}

// =============================================================
// Sanitization Report
// =============================================================

export interface SanitizationReport {
  sanitized: boolean;
  evidenceRemoved: number;
  affectedDimensions: string[];
  replacedFields: string[];
  /** 内部诊断用：检测到的 ungrounded claim labels（仅在 Trace 中使用，不进入 public API） */
  ungroundedClaims: UngroundedClaim[];
  safeReplacements: Record<string, string>;
}

// =============================================================
// Main Sanitizer
// =============================================================

export function sanitizeUngroundedAnalysis(
  analysis: SpeakingAnalysisResult,
  userAnswer: string,
  qualityCheck: FeedbackQualityResult,
): { analysis: SpeakingAnalysisResult; report: SanitizationReport } {
  const evidenceMismatchIssues = qualityCheck.issues.filter(
    (i) => i.type === "EVIDENCE_MISMATCH" || i.type === "NO_EVIDENCE",
  );

  if (evidenceMismatchIssues.length === 0) {
    return {
      analysis,
      report: {
        sanitized: false,
        evidenceRemoved: 0,
        affectedDimensions: [],
        replacedFields: [],
        ungroundedClaims: [],
        safeReplacements: {},
      },
    };
  }

  const report: SanitizationReport = {
    sanitized: true,
    evidenceRemoved: 0,
    affectedDimensions: [],
    replacedFields: [],
    ungroundedClaims: [],
    safeReplacements: {},
  };

  const answerWords = buildAnswerWordSet(userAnswer);
  const sanitized: SpeakingAnalysisResult = { ...analysis };

  // ---- 1. Sanitize ieltsAnalysis.*.evidence + *.issues ----
  if (analysis.ieltsAnalysis) {
    const dims: Array<["fluency" | "lexicalResource" | "grammaticalRange", string]> = [
      ["fluency", "fluency"],
      ["lexicalResource", "lexicalResource"],
      ["grammaticalRange", "grammaticalRange"],
    ];

    const newIelts: IeltsSpeakingAnalysis = { ...analysis.ieltsAnalysis };

    for (const [key, dimName] of dims) {
      const dim = newIelts[key];
      if (!dim) continue;

      // Evidence: 逐条 grounding filter
      if (dim.evidence.length > 0) {
        const grounded = filterGroundedEvidence(dim.evidence, answerWords);
        const removed = dim.evidence.length - grounded.length;
        if (removed > 0) {
          report.evidenceRemoved += removed;
          report.affectedDimensions.push(dimName);
          newIelts[key] = { ...dim, evidence: grounded };
        }
      }

      // Issues: UI 渲染（speaking-feedback.tsx:83-88），可承载 factual linguistic claim
      // 对每条 issue 检测 ungrounded linguistic claim，含 claim 的替换为安全通用 issue
      const currentDim = newIelts[key]!;
      if (currentDim.issues.length > 0) {
        const safeIssues = currentDim.issues.map((issue) => {
          const claims = detectUngroundedLinguisticClaims(issue, userAnswer);
          if (claims.length > 0) {
            report.ungroundedClaims.push(...claims);
            if (!report.replacedFields.includes(`ieltsAnalysis.${dimName}.issues`)) {
              report.replacedFields.push(`ieltsAnalysis.${dimName}.issues`);
            }
            return "该维度存在可提升空间，建议针对性练习。";
          }
          return issue;
        });
        if (safeIssues.some((s, i) => s !== currentDim.issues[i])) {
          newIelts[key] = { ...currentDim, issues: safeIssues };
        }
      }
    }

    sanitized.ieltsAnalysis = newIelts;
  }

  // ---- 2. Sanitize mainIssue.description ----
  if (analysis.mainIssue.description) {
    const claims = detectUngroundedLinguisticClaims(analysis.mainIssue.description, userAnswer);
    if (claims.length > 0) {
      report.ungroundedClaims.push(...claims);
      const safeDesc = buildSafeMainIssueDescription(analysis, userAnswer);
      sanitized.mainIssue = { ...analysis.mainIssue, description: safeDesc };
      report.replacedFields.push("mainIssue.description");
      report.safeReplacements["mainIssue.description"] = safeDesc;
    }
  }

  // ---- 2b. Sanitize candidateIssues.description ----
  if (analysis.candidateIssues.length > 0) {
    const sanitizedCandidates = analysis.candidateIssues.map((issue) => {
      const claims = detectUngroundedLinguisticClaims(issue.description, userAnswer);
      if (claims.length > 0) {
        report.ungroundedClaims.push(...claims);
        if (!report.replacedFields.includes("candidateIssues.description")) {
          report.replacedFields.push("candidateIssues.description");
        }
        return { ...issue, description: buildSafeMainIssueDescription(analysis, userAnswer) };
      }
      return issue;
    });
    sanitized.candidateIssues = sanitizedCandidates;
  }

  // ---- 3. Sanitize summary ----
  if (analysis.summary) {
    const claims = detectUngroundedLinguisticClaims(analysis.summary, userAnswer);
    if (claims.length > 0) {
      report.ungroundedClaims.push(...claims);
      const safeSummary = buildSafeSummary(analysis, userAnswer);
      sanitized.summary = safeSummary;
      report.replacedFields.push("summary");
      report.safeReplacements["summary"] = safeSummary;
    }
  }

  // ---- 3b. Sanitize overallDiagnosis ----
  if (analysis.ieltsAnalysis?.overallDiagnosis) {
    const claims = detectUngroundedLinguisticClaims(analysis.ieltsAnalysis.overallDiagnosis, userAnswer);
    if (claims.length > 0) {
      report.ungroundedClaims.push(...claims);
      const safeDiagnosis = "回答的语法结构可以进一步丰富，建议练习多样化的句式表达。";
      if (sanitized.ieltsAnalysis) {
        sanitized.ieltsAnalysis = { ...sanitized.ieltsAnalysis, overallDiagnosis: safeDiagnosis };
      }
      report.replacedFields.push("ieltsAnalysis.overallDiagnosis");
      report.safeReplacements["ieltsAnalysis.overallDiagnosis"] = safeDiagnosis;
    }
  }

  // ---- 4. Attach sanitization info to qualityWarning ----
  // PUBLIC BOUNDARY: 只暴露安全摘要（applied/evidenceRemoved/affectedDimensions/replacedFields）
  // 不暴露 ungroundedClaims / safeReplacements / raw claim text
  // 详细诊断仅在内部 Trace (validation.result.payload.evidence_sanitization)
  sanitized.qualityWarning = {
    score: qualityCheck.score,
    issues: qualityCheck.issues.map((i) => i.description),
    ...(report.sanitized
      ? {
          sanitization: {
            applied: true,
            evidenceRemoved: report.evidenceRemoved,
            affectedDimensions: report.affectedDimensions,
            replacedFields: report.replacedFields,
          },
        }
      : {}),
  };

  return { analysis: sanitized, report };
}

// =============================================================
// Safe Replacement Builders
// =============================================================

function buildSafeMainIssueDescription(analysis: SpeakingAnalysisResult, userAnswer: string): string {
  const wordCount = analysis.metrics?.wordCount ?? userAnswer.trim().split(/\s+/).filter(Boolean).length;
  const sentenceCount = analysis.metrics?.sentenceCount ?? userAnswer.split(/[.!?]+/).filter((s) => s.trim()).length;

  if (wordCount < 30) {
    return `回答较短（约 ${wordCount} 词，${sentenceCount} 句），内容展开不够充分，建议增加具体原因和例子来支撑观点。`;
  }
  if (sentenceCount <= 2) {
    return `回答句式较单一（${sentenceCount} 句），可以尝试使用不同的句子结构让表达更丰富。`;
  }
  return `回答内容可以进一步展开，建议补充具体例子和细节来增强说服力。`;
}

function buildSafeSummary(analysis: SpeakingAnalysisResult, userAnswer: string): string {
  const wordCount = analysis.metrics?.wordCount ?? userAnswer.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 30) {
    return "回答较短，内容展开有提升空间。建议在表达观点后补充具体原因和例子，同时注意句式多样性。";
  }
  return "回答基本切题，可以进一步丰富内容细节和句式变化，提升表达的丰富度。";
}
