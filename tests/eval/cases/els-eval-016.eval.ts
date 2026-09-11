/**
 * ELS-EVAL-016 — SPEAKING_ANALYSIS（空泛建议拦截）
 * probe：scripted LLM 输出 3 处空泛建议（"keep practicing"）→ actionabilityCheck 应拦截：
 *   - gate FAIL（score<40）→ 整体回退规则引擎（用户只见可执行建议）；
 *   - gate NEEDS_REVIEW（40≤score<70）→ quality_warning 附于响应（标记但不直达）。
 * 两条路径都满足 Gold 016 must_not（泛化建议无标记直达用户）。最终建议可执行性为语义判断 → [H] → MANUAL_REVIEW。
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
    mainIssue?: { suggestion?: string };
    ieltsAnalysis?: Record<string, unknown> | null;
    candidateIssues?: Array<{ dimension?: string; severity?: string; description?: string; suggestion?: string }>;
    qualityWarning?: { score?: number; issues?: string[] } | null;
  };
}

interface ValidationPayload {
  outcome?: string;
  quality_warning?: string;
  quality_gate_scores?: Record<string, number>;
}

export const case_016: EvalCaseDefinition = {
  case_id: "ELS-EVAL-016",
  automation_level: "B",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const sess = await callRoute(SPEAKING_SESSION, { questionId: "sp-p1-001" }, evalTraceId("016-session"));
    const sessionId = (sess.json as { session?: { id?: string } } | null)?.session?.id;
    if (!sessionId) {
      ctx.rec.blocked("r-session", "创建口语会话失败", "sessionId", sessionId, { failure_layer: "SPEAKING" });
      return { coverage: "partial", actualSummary: "会话创建失败（BLOCKED）" };
    }

    // 3 处空泛建议：mainIssue.suggestion + microDrill.prompt（stub 注入）+ summary 无具体信息
    ctx.script([
      speakingAnalysisJson({
        mainIssue: {
          suggestion: "keep practicing",
          description: "内容空洞，缺少细节与例子。",
        },
        summary: "回答比较空洞。",
        microDrill: {
          prompt: "keep practicing",
          exampleImprovement: "Please keep practicing every day.",
          targetDimension: "fluency",
        },
        evidenceOverrides: [
          { evidence: ["回答缺少细节与例子"], issues: ["内容空洞"] },
          { evidence: ["词汇基础一般"], issues: ["词汇范围有限"] },
          { evidence: ["句式较简单"], issues: ["缺少复合句"] },
        ],
      }),
    ]);
    const res = await callRoute(
      SPEAKING_ANALYZE,
      { sessionId, answer: "I think learning English is good. I like it very much. It is useful for my future." },
      evalTraceId("016-vague"),
    );
    const json = res.json as AnalysisResponse | null;
    const analysis = json?.analysis;
    const trace = traceOf(evalTraceId("016-vague"));
    const val = speakingGateOf(trace);
    const gates = (val?.quality_gate_scores ?? undefined) as Record<string, number> | undefined;
    const total = gates?.total ?? 100;

    ctx.rec.check(
      "r-gate-ran",
      "quality gate 运行且 actionabilityCheck 分数存在",
      { ran: true, actionabilityScorePresent: true },
      { ran: val?.outcome !== undefined, actionabilityScorePresent: typeof gates?.actionabilityCheck === "number" },
      { failure_layer: "OUTPUT_VALIDATION", metrics: ["M8"], evidence: { gates, validation: val } },
    );

    // 拦截语义：空泛建议不得「无标记」直达用户（Gold 016 must_not）。
    // 合规路径：(a) gate FAIL → 规则引擎（无 LLM 建议）；(b) NEEDS_REVIEW → quality_warning 附加标记。
    const responseText = JSON.stringify(json ?? {});
    const vagueVisible = /keep practicing/i.test(responseText);
    const rulePath = analysis?.ieltsAnalysis == null;
    const warningPath = analysis?.qualityWarning != null;
    ctx.rec.check(
      "r-intercepted",
      "空泛建议（keep practicing）不以未标记形式到达用户（规则回退 或 quality_warning 标记）",
      { vagueVisibleUnmarked: false },
      { vagueVisibleUnmarked: vagueVisible && !warningPath },
      {
        failure_layer: "OUTPUT_VALIDATION",
        metrics: ["M8"],
        evidence: {
          gates,
          total,
          rulePath,
          warningPath: analysis?.qualityWarning,
          ieltsPresent: analysis?.ieltsAnalysis != null,
          vagueVisible,
          responseSnippet: responseText.slice(0, 300),
        },
      },
    );

    ctx.rec.uncoveredAssertion(
      "人工复核：最终建议是否对用户可执行且与回答内容对应（actionability 语义判断，LLM+人工双轨 §12）",
    );

    return {
      coverage: "partial",
      uncoveredMode: "MANUAL_REVIEW",
      actualSummary:
        "probe：gate 运行、actionabilityCheck 分数存在；" +
        (vagueVisible && !warningPath ? "空泛建议仍以未标记形式可见（拦截缺口，人工仲裁）。" : "空泛建议已被拦截/标记（规则回退或 quality_warning）。"),
      notes: "B 级 probe（scripted LLM 注入 + 真实 gate）。packet 见 docs/eval/manual-review/els-eval-016.md。",
    };
  },
};
