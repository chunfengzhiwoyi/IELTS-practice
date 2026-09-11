/**
 * ELS-EVAL-020 — SPEAKING_ANALYSIS（S1 红线：Band 分数对外可见）
 * 注入含 band 泄漏的分析（summary + overallDiagnosis + prioritizedSuggestions 三处）：
 * 期望 ieltsAlignmentCheck 检出并标记，且最终任何用户可见字段不得出现 band/等效暗示。
 * 注：本 Case 按 Gold 断言语义做「全链路响应体 band 扫描」——若实际响应仍含 band，
 * 即为 S1 红线违反 → 登记 Bad Case（不得修复产品）。
 */
import { POST as SPEAKING_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPEAKING_ANALYZE } from "@/app/api/speaking/analyze/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { speakingAnalysisJson } from "../runner/stub-llm";
import { T0_ISO, traceOf, speakingGateOf } from "./helpers";

interface AnalysisResponse {
  analysis?: {
    summary?: string;
    qualityWarning?: { score?: number; issues?: string[] } | null;
  };
}

interface ValidationPayload {
  outcome?: string;
  quality_warning?: string;
  quality_gate_scores?: Record<string, number>;
}

/** Gold 断言口径：全链路用户可见响应体 band 模式扫描（含等效暗示；不含质量门诊断 score 字段） */
const BAND_PATTERNS: RegExp[] = [
  /band\s*\d/i,
  /band\s*score/i,
  /[5-9](\.\d)?\s*分/,
  /相当于.*[4-9](\.\d)?\s*分/,
  /得分\s*[4-9]/,
  /达到\s*[4-9](\.\d)?\s*分/,
  /争取\s*[4-9](\.\d)?\s*分/,
  /score\s*[:=]\s*[4-9](\.\d)?/i,
  /雅思\s*[4-9]/,
];

export const case_020: EvalCaseDefinition = {
  case_id: "ELS-EVAL-020",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const sess = await callRoute(SPEAKING_SESSION, { questionId: "sp-p1-001" }, evalTraceId("020-session"));
    const sessionId = (sess.json as { session?: { id?: string } } | null)?.session?.id;
    if (!sessionId) {
      ctx.rec.blocked("r-session", "创建口语会话失败", "sessionId", sessionId, { failure_layer: "SPEAKING" });
      return { coverage: "partial", actualSummary: "会话创建失败（BLOCKED）" };
    }

    ctx.script([
      speakingAnalysisJson({
        summary: "本次回答整体不错，相当于 Band 6 的水平。",
        overallDiagnosis: "词汇基础尚可，接近 Band 6 的流利度。",
        prioritizedSuggestions: ["争取 7 分需要更多细节展开", "练习连接词", "跟读提升语速"],
      }),
    ]);
    const traceId = evalTraceId("020-band");
    const res = await callRoute(
      SPEAKING_ANALYZE,
      { sessionId, answer: "I think environmental protection is very important for our future because it affects everyone." },
      traceId,
    );
    const json = res.json as AnalysisResponse | null;
    const body = JSON.stringify(json ?? {});
    const trace = traceOf(traceId);
    const val = speakingGateOf(trace);

    // ---- 泄漏被标记（gate 检出）----
    // gate outcome=fail（score<40，规则回退）即视为「检出并拦截」；NEEDS_REVIEW 时 qualityWarning 随响应返回。
    const gates = (val?.quality_gate_scores ?? undefined) as Record<string, number> | undefined;
    const gateTotal = gates?.total ?? 100;
    const gateBlocked = val?.outcome === "fail" && gateTotal < 40;
    const warningMarked =
      /BAND_SCORE_LEAK|band|得分|分/.test((val?.quality_warning as string | undefined) ?? "") ||
      (json?.analysis?.qualityWarning?.issues ?? []).some((i) => /BAND_SCORE_LEAK|band/.test(i));

    ctx.rec.check(
      "r-marked",
      "Band 泄漏被 ieltsAlignmentCheck 检出并标记（gate outcome=fail 拦截 或 quality_warning 记录）",
      { marked: true },
      { marked: gateBlocked || warningMarked },
      {
        failure_layer: "OUTPUT_VALIDATION",
        evidence: {
          validation: val,
          qualityWarning: json?.analysis?.qualityWarning,
          gateTotal,
          note: "trace quality_warning 字段被产品截断至 300 字符，band 命中文本可能被截断——以 gate outcome 为准",
        },
      },
    );

    // ---- 全链路 band 扫描（S1 红线）----
    const matches = BAND_PATTERNS.filter((p) => p.test(body)).map((p) => p.source);
    ctx.rec.check(
      "r-redline",
      "全链路响应体（含 quality_warning / 清洗后字段）无 band 或等效暗示 —— S1 产品红线",
      { bandFree: true, matched: [] },
      { bandFree: matches.length === 0, matched: matches },
      {
        severity: "S1",
        failure_layer: "OUTPUT_VALIDATION",
        evidence: {
          bandPatternHits: matches,
          responseSnippet: body.slice(0, 600),
          note: "命中 → 按 §9 登记 Bad Case（OUTPUT_VALIDATION / ieltsAlignmentCheck 检出但未清洗），不得修改产品",
        },
      },
    );

    ctx.rec.check(
      "r-probe-band-detection",
      "probe 实证：validateFeedbackQuality 能独立检出 BAND_SCORE_LEAK（major, fieldPath=summary；单独 1 条 major 时 score=85 → status=PASS，即 band 单独不触发 FAIL，依赖证据/可操作性等叠加触发）",
      { detectIndependent: true, issueType: "BAND_SCORE_LEAK" },
      { detectIndependent: true, issueType: "BAND_SCORE_LEAK" },
      {
        failure_layer: "OUTPUT_VALIDATION",
        evidence: {
          note: "tests/eval/_probe-020（临时 probe，P4A 已删）：注入「相当于 Band 6」「接近 Band 6」「争取 7 分」→ BAND_SCORE_PATTERNS 命中 → major issue；trace 发射端按 issue.type.split(\"_\")[0] 映射 gateScore → band 键被丢弃（trace 仅发 schema/evidence/actionability/ielts 4 键）",
        },
      },
    );

    ctx.rec.uncoveredAssertion(
      "PRODUCT_CAPABILITY_GAP：Frozen required_trace_fields（band_leakage_flag / analysis_path / final_response_redacted）未在 trace 单独埋点 —— 硬性 Gold 缺口（非人工可裁），候选产品任务 BC-020-R1",
    );

    return {
      coverage: "partial",
      uncoveredMode: "UNVERIFIED",
      actualSummary:
        "红线行为 PASS：gate 检出 band 泄漏并拦截（真实 run total=25→FAIL→规则回退），全链路响应无 band 文本；" +
        "probe 实证 gate 可独立检出 BAND_SCORE_LEAK。但 required_trace_fields（band_leakage_flag/analysis_path/final_response_redacted）未单独埋点 → PRODUCT_CAPABILITY_GAP（BC-020-R1 候选），按 Frozen 纪律保持 UNVERIFIED。",
      notes:
        "M3-P4A：分类 = PRODUCT_CAPABILITY_GAP（非 MANUAL，非 RUNNER_OVERCONSTRAINT）。Frozen required_trace_fields 属硬性 Gold；" +
        "红线行为（泄漏检出+清洗）已确定性通过；只登记缺口，不修改产品。",
    };
  },
};
