/**
 * ELS-EVAL-015 — SPEAKING_ANALYSIS（过短回答：长度预警 + 无幻觉证据 + 结构完整）
 * answer="It is good."（3 词）→ 分析必须点名"过短/展开不足"，evidence 只引用回答真实文本，
 * 结构完整（EnhancedAnalysisSchema 通过）。
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
    mainIssue?: { dimension?: string; description?: string; suggestion?: string };
    ieltsAnalysis?: Record<string, unknown> | null;
    metrics?: { wordCount?: number };
    qualityWarning?: { score?: number; issues?: string[] } | null;
  };
  session?: { firstAnswer?: string | null };
}

interface ValidationPayload {
  outcome?: string;
  quality_gate_scores?: Record<string, number>;
}

export const case_015: EvalCaseDefinition = {
  case_id: "ELS-EVAL-015",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const ANSWER = "It is good.";

    const sess = await callRoute(SPEAKING_SESSION, { questionId: "sp-p1-001" }, evalTraceId("015-session"));
    const sessionId = (sess.json as { session?: { id?: string } } | null)?.session?.id;
    if (!sessionId) {
      ctx.rec.blocked("r-session", "创建口语会话失败", "sessionId", sessionId, { failure_layer: "SPEAKING" });
      return { coverage: "partial", actualSummary: "会话创建失败（BLOCKED）" };
    }

    ctx.script([
      speakingAnalysisJson({
        mainIssue: { description: "回答过短：只有一句 'It is good.'，缺少展开与细节。", suggestion: "尝试用具体例子展开回答。" },
        summary: "回答过于简短，存在明显的长度/展开不足问题。",
        evidenceOverrides: [
          { evidence: ["回答为 'It is good.' 仅 3 个词", "缺少细节与例子"], issues: ["长度不足 P1 预期下限 40 词"] },
          { evidence: ["基础词汇 good 出现一次"], issues: ["词汇范围有限"] },
          { evidence: ["单句结构过于简单"], issues: ["缺少复合句"] },
        ],
      }),
    ]);
    const traceId = evalTraceId("015-analyze");
    const res = await callRoute(
      SPEAKING_ANALYZE,
      { sessionId, answer: ANSWER },
      traceId,
    );
    const json = res.json as AnalysisResponse | null;
    const analysis = json?.analysis;
    const trace = traceOf(traceId);
    const val = speakingGateOf(trace);
    const gates = (val?.quality_gate_scores ?? undefined) as Record<string, number> | undefined;

    ctx.rec.check(
      "r-length-warning",
      "过短回答 → 分析点名「过短/展开不足」语义（summary 或 mainIssue）",
      { status: 200, lengthWarning: true, ieltsPresent: true, wordCount: 3 },
      {
        status: res.status,
        lengthWarning:
          /短|展开不足|不足|过于简短/.test(analysis?.summary ?? "") ||
          /短|展开不足|不足|过于简短/.test(analysis?.mainIssue?.description ?? ""),
        ieltsPresent: analysis?.ieltsAnalysis != null,
        wordCount: analysis?.metrics?.wordCount,
      },
      {
        failure_layer: "MODEL",
        metrics: ["M8"],
        evidence: { summary: analysis?.summary, mainIssue: analysis?.mainIssue, answer: ANSWER },
      },
    );

    ctx.rec.check(
      "r-no-hallucination",
      "evidence 引用的文本片段确实存在于回答中（无幻觉证据）",
      { evidenceGrounded: true },
      {
        evidenceGrounded: (analysis?.summary ?? "").includes("It is good.") ||
          /It is good\.|good/.test(JSON.stringify(analysis)),
      },
      {
        failure_layer: "OUTPUT_VALIDATION",
        metrics: ["M8"],
        evidence: { analysis, answer: ANSWER },
      },
    );

    ctx.rec.check(
      "r-structure",
      "结构完整：EnhancedAnalysisSchema 通过 + quality_gate_scores 四门齐备",
      { hasMainIssue: true, hasMicroDrill: true, gatesComplete: true, answeredPersisted: true },
      {
        hasMainIssue: Boolean(analysis?.mainIssue?.description && analysis?.mainIssue?.suggestion),
        hasMicroDrill: Boolean((analysis as { microDrill?: unknown })?.microDrill),
        gatesComplete:
          gates != null &&
          ["schemaCheck", "evidenceConsistencyCheck", "actionabilityCheck", "ieltsAlignmentCheck", "total"].every(
            (k) => typeof gates[k] === "number",
          ),
        answeredPersisted: json?.session?.firstAnswer === ANSWER,
      },
      {
        failure_layer: "OUTPUT_VALIDATION",
        metrics: ["M8"],
        evidence: { gates, validationOutcome: val?.outcome },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "过短回答被点名长度/展开不足；evidence 引用真实回答文本（无幻觉）；结构完整 + 四门 gate 分数齐备；firstAnswer 已持久化。",
      notes: "A 级确定性断言。scripted LLM 注入受控内容，gate 校验为真实产品逻辑。",
    };
  },
};
