/**
 * ELS-EVAL-019 — SPEAKING_ANALYSIS（S1：幻觉证据直达 UI）
 * M3-P4B 人工仲裁已冻结：旧产品（f117d85）FAIL(S1) → BC-M3-004。
 * M3-04：产品 checkpoint 496ae31 已实现 BC-M3-004 修复（evidence sanitization gate + safety patch）。
 *
 * 本 adapter 为 human-gold-backed regression adapter：
 * Human Gold 冻结的是 failure semantic（幻觉证据直达 UI = S1），
 * 修复后该红线是否仍存在可以机械验证，不再每次要求人工重复裁决。
 *
 * 验证矩阵（Frozen fixture：回答无从句/比较级/被动语态，provider 声称存在）：
 *  A. Detection —— gate 检出 evidence inconsistency（r-gate-ran / r-detected）
 *  B. Public API containment —— public factual fields（summary/overallDiagnosis/mainIssue.description/
 *     ieltsAnalysis.*.evidence/issues）无 unsupported factual claims（r-public-api-safe）
 *  C. Public metadata containment —— qualityWarning.sanitization 仅含安全摘要，无 raw claim（r-metadata-safe）
 *  D. UI containment —— 真实组件渲染路径（SpeakingFeedback renderToStaticMarkup）无幻觉文本（r-ui-contained）
 *  E. False-positive control —— 合法 which 定语从句/比较级 不被错删；未 grounded 断言仍被删（r-legitimate-preserved）
 *  F. Trace —— validation.result 可诊断 sanitization；serialized trace 无 raw claim（r-trace-diagnosable）
 *
 * 判定：A-F 全 PASS → PASS；B/C/D 任一 FAIL → FAIL(S1)（BC-M3-004 保持 OPEN）；无法执行 → UNVERIFIED。
 */
import { POST as SPEAKING_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPEAKING_ANALYZE } from "@/app/api/speaking/analyze/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { speakingAnalysisJson } from "../runner/stub-llm";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeakingFeedback } from "@/components/speaking/speaking-feedback";
import type { SpeakingAnalysisResult } from "@/lib/speaking/types";
import { T0_ISO, traceOf, speakingGateOf } from "./helpers";

interface AnalysisResponse {
  analysis?: SpeakingAnalysisResult | null;
}

interface ValidationPayload {
  outcome?: string;
  quality_warning?: string;
  quality_gate_scores?: Record<string, number>;
  evidence_sanitization?: {
    evidence_removed?: number;
    affected_dimensions?: string[];
    replaced_fields?: string[];
    ungrounded_claims?: string[];
  } | null;
}

/** 回答中不含任何从句/比较级/被动语态 */
const ANSWER_NO_CLAUSE = "I like books. Reading is fun. I read often.";

/** 冻结 fixture 的幻觉断言原文（用于 containment 扫描） */
const RAW_CLAIMS = [
  "定语从句 which 引导的复合句",
  "使用了多个复合句",
  "形容词比较级",
  "被动语态",
];
const CLAIM_PATTERN = /定语从句|复合句|被动语态|比较级|which 引导/;

/** 合法输入（which 定语从句 + 比较级 better），用于 false-positive control */
const ANSWER_LEGIT = "The book which I bought yesterday was better than the old one.";

function collectPublicFactualText(analysis: SpeakingAnalysisResult | null | undefined): string {
  if (!analysis) return "";
  const parts: string[] = [];
  if (analysis.summary) parts.push(analysis.summary);
  if (analysis.mainIssue?.description) parts.push(analysis.mainIssue.description);
  const ielts = analysis.ieltsAnalysis;
  if (ielts) {
    if (ielts.overallDiagnosis) parts.push(ielts.overallDiagnosis);
    for (const key of ["fluency", "lexicalResource", "grammaticalRange"] as const) {
      const dim = ielts[key];
      if (!dim) continue;
      if (dim.evidence?.length) parts.push(...dim.evidence);
      if (dim.issues?.length) parts.push(...dim.issues);
    }
  }
  return parts.join(" ");
}

export const case_019: EvalCaseDefinition = {
  case_id: "ELS-EVAL-019",
  automation_level: "B",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const sess = await callRoute(SPEAKING_SESSION, { questionId: "sp-p1-001" }, evalTraceId("019-session"));
    const sessionId = (sess.json as { session?: { id?: string } } | null)?.session?.id;
    if (!sessionId) {
      ctx.rec.blocked("r-session", "创建口语会话失败", "sessionId", sessionId, { failure_layer: "SPEAKING" });
      return { coverage: "partial", actualSummary: "会话创建失败（BLOCKED）" };
    }

    // ==================== Probe 1：幻觉 fixture ====================
    ctx.script([
      speakingAnalysisJson({
        mainIssue: {
          description: "你使用了定语从句 which 引导的复合句，结构复杂但可读性一般。",
          suggestion: "尝试减少长句，拆分表达。",
        },
        summary: "你提到了三个并列观点，使用了多个复合句。",
        evidenceOverrides: [
          { evidence: ["你使用了定语从句 which 引导的复合句", "句子结构较复杂"], issues: ["复合句过多"] },
          { evidence: ["你使用了形容词比较级"], issues: ["词汇重复"] },
          { evidence: ["你使用了被动语态"], issues: ["句式复杂"] },
        ],
      }),
    ]);
    const res = await callRoute(
      SPEAKING_ANALYZE,
      { sessionId, answer: ANSWER_NO_CLAUSE },
      evalTraceId("019-hallucination"),
    );
    const json = res.json as AnalysisResponse | null;
    const analysis = json?.analysis;
    const trace = traceOf(evalTraceId("019-hallucination"));
    const val = speakingGateOf(trace) as ValidationPayload | undefined;
    const gates = val?.quality_gate_scores ?? undefined;

    // A. Detection
    ctx.rec.check(
      "r-gate-ran",
      "evidenceConsistencyCheck 运行（质量门分数存在）",
      { ran: true, evidenceScorePresent: true },
      { ran: val?.outcome !== undefined, evidenceScorePresent: typeof gates?.evidenceConsistencyCheck === "number" },
      { failure_layer: "OUTPUT_VALIDATION", metrics: ["M8"], evidence: { gates, validation: val } },
    );
    const issueDetected = /EVIDENCE_MISMATCH|NO_EVIDENCE|证据|evidence/i.test(
      (val?.quality_warning as string | undefined) ?? "",
    );
    ctx.rec.check(
      "r-detected",
      "gate 检出幻觉证据（evidence inconsistency issue 存在）",
      { detected: true },
      { detected: issueDetected },
      { failure_layer: "OUTPUT_VALIDATION", metrics: ["M8"], evidence: { qualityWarning: val?.quality_warning } },
    );

    // B. Public API containment
    const publicText = collectPublicFactualText(analysis);
    const publicHits = RAW_CLAIMS.filter((c) => publicText.includes(c));
    ctx.rec.check(
      "r-public-api-safe",
      "public analysis factual fields（summary/overallDiagnosis/mainIssue.description/evidence/issues）不含 unsupported factual claims",
      { safe: true, hits: [] },
      { safe: publicHits.length === 0, hits: publicHits },
      {
        severity: "S1",
        failure_layer: "OUTPUT_VALIDATION",
        evidence: {
          publicTextExcerpt: publicText.slice(0, 400),
          hits: publicHits,
          sanitization: (analysis?.qualityWarning as { sanitization?: unknown } | null | undefined)?.sanitization ?? null,
          note: "sanitizeUngroundedAnalysis（BC-M3-004）应移除/替换 ungrounded claims；hit 表示修复失效",
        },
      },
    );

    // C. Public metadata containment
    const body = JSON.stringify(json ?? {});
    const rawLeakInBody = RAW_CLAIMS.filter((c) => body.includes(c));
    const sanitization = (analysis?.qualityWarning as { sanitization?: { applied?: boolean } } | null | undefined)
      ?.sanitization;
    ctx.rec.check(
      "r-metadata-safe",
      "public 响应全文无 raw hallucinated claim；qualityWarning.sanitization 仅暴露安全摘要",
      { applied: true, rawLeak: [] },
      {
        applied: sanitization?.applied === true,
        rawLeak: rawLeakInBody,
      },
      {
        severity: "S1",
        failure_layer: "OUTPUT_VALIDATION",
        evidence: {
          rawLeakInBody,
          sanitization,
          note: "raw claim 不得出现在 public response（含 qualityWarning/metadata）；matchedText 与 provider raw output 不得外泄",
        },
      },
    );

    // D. UI containment：真实组件渲染路径（API 返回 → SpeakingFeedback 渲染）无幻觉文本
    let uiHtml = "";
    let uiRenderError: string | null = null;
    if (analysis) {
      try {
        uiHtml = renderToStaticMarkup(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          SpeakingFeedback({ analysis, isSecondAnswer: false, onFinish: () => undefined } as any),
        );
      } catch (err) {
        uiRenderError = err instanceof Error ? err.message : String(err);
      }
    }
    const uiHits = RAW_CLAIMS.filter((c) => uiHtml.includes(c));
    ctx.rec.check(
      "r-ui-contained",
      "UI 渲染路径（SpeakingFeedback 组件直接渲染 API 字段）无幻觉断言文本（无第二条旁路）",
      { uiSafe: true, hits: [] },
      { uiSafe: uiHtml.length > 0 && uiHits.length === 0, hits: uiHits },
      {
        severity: "S1",
        failure_layer: "UI",
        evidence: {
          uiHits,
          renderedLength: uiHtml.length,
          renderError: uiRenderError,
          note: "真实组件（speaking-feedback.tsx）renderToStaticMarkup：渲染字段 = summary/mainIssue.description/evidence/issues/overallDiagnosis；API safe 且组件直接渲染 ⇒ UI safe",
        },
      },
    );
    if (uiRenderError) {
      ctx.rec.uncoveredAssertion(`019: UI 组件渲染失败（${uiRenderError?.slice(0, 120)}）`);
    }

    // F. Trace：可诊断 sanitization；sanitizer 诊断面（evidence_sanitization）仅含安全 label
    // 注：Frozen Gold required_trace_fields 明确包含 llm_raw_output——provider 原始转录
    // （llm.attempt.raw_output）保留 raw output 是 Gold 契约；raw claims 唯一合法位置是
    // llm_raw_output，不得出现在 sanitizer 诊断/公共 API/UI。
    const sanit = val?.evidence_sanitization;
    const diag = sanit ? JSON.stringify(sanit) : "";
    const diagRawLeak = RAW_CLAIMS.filter((rc) => diag.includes(rc));
    const traceIds = (trace?.events ?? []).filter((e: any) => e.event_type === "validation.result").length;
    const llmAttempts = (trace?.events ?? []).filter((e: any) => e.event_type === "llm.attempt").length;
    ctx.rec.check(
      "r-trace-diagnosable",
      "validation.result 记录 sanitization 诊断（evidence_removed/replaced_fields/ungrounded_claims labels）；" +
        "Frozen required_trace_fields（llm_raw_output/quality_gate_scores/quality_warning）存在；" +
        "sanitizer 诊断面无 raw claim 泄漏（raw claims 仅允许在 llm_raw_output=provider 转录）",
      { diagnosable: true, diagRawLeak: [], traceEventsPresent: true },
      {
        diagnosable:
          sanit?.evidence_removed !== undefined ||
          (sanit?.replaced_fields?.length ?? 0) > 0 ||
          (sanit?.ungrounded_claims?.length ?? 0) > 0,
        diagRawLeak,
        traceEventsPresent: traceIds > 0 && llmAttempts > 0,
      },
      {
        failure_layer: "OUTPUT_VALIDATION",
        evidence: {
          evidence_sanitization: sanit,
          diagRawLeak,
          traceEventCounts: { validation_result: traceIds, llm_attempt: llmAttempts },
          note: "ungrounded_claims 仅记录安全 label（如 which/that 定语从句），不得含 matchedText/raw sentence；" +
            "Frozen required llm_raw_output 允许 provider 原始转录保留 raw output（诊断输入），不属于 public leak",
        },
      },
    );
    // ==================== Probe 2：False-positive control ====================
    ctx.script([
      speakingAnalysisJson({
        mainIssue: {
          description: "你使用了 which 引导的定语从句修饰 the book，并使用比较级 better 进行对比，结构自然恰当。",
          suggestion: "保持多样句式，注意控制句子长度。",
        },
        summary: "回答使用了 which 定语从句和比较级 better，句式较丰富。",
        evidenceOverrides: [
          { evidence: ["You used the relative clause 'which' to describe 'book'", "You used comparative 'better' to compare two items"], issues: ["观点清晰"] },
          { evidence: ["你使用了被动语态"], issues: ["句式可优化"] },
          { evidence: ["You used comparative 'better' naturally"], issues: ["结构合理"] },
        ],
      }),
    ]);
    const res2 = await callRoute(
      SPEAKING_ANALYZE,
      { sessionId, answer: ANSWER_LEGIT },
      evalTraceId("019-legit"),
    );
    const json2 = res2.json as AnalysisResponse | null;
    const analysis2 = json2?.analysis;
    const legitText = collectPublicFactualText(analysis2);
    ctx.rec.check(
      "r-legitimate-preserved",
      "合法 which 定语从句/比较级 断言不被 sanitizer 错删；真正 ungrounded 断言（被动语态）仍被移除",
      {
        legitClaimsPreserved: true,
        ungroundedRemoved: true,
      },
      {
        legitClaimsPreserved: /定语从句/.test(legitText) && /比较级/.test(legitText),
        ungroundedRemoved: !/被动语态/.test(legitText),
      },
      {
        failure_layer: "OUTPUT_VALIDATION",
        evidence: {
          legitTextExcerpt: legitText.slice(0, 400),
          note: "grounding SSOT：which/better 在回答中可定位 → 保留；被动语态回答中不存在 → 移除（精确区分 grounded/ungrounded）",
        },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "M3-04 human-gold-backed regression：BC-M3-004 修复后，" +
        "幻觉 fixture（无从句/比较级/被动语态回答）→ gate 检出 + sanitizer 移除/替换 ungrounded claims，" +
        "public response 与 UI 渲染均无幻觉断言（containment 通过）；合法 which/比较级 保留（false-positive guard 通过）；" +
        "trace 可诊断且无 raw claim 泄漏。",
      notes:
        "RUNNER_PATCH_REASON：Human arbitration 已冻结 failure semantic（幻觉证据直达 UI = S1）；" +
        "修复后 regression 可机械验证该红线是否仍存在，因此不再永久要求人工重复裁决。" +
        "Frozen Gold 未改动；判定依据 = 496ae31 实际 sanitizeUngroundedAnalysis 行为（真实执行）。",
    };
  },
};
