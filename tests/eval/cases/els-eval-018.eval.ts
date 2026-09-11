/**
 * ELS-EVAL-018 — SPEAKING_ANALYSIS（首答较差 → 重答改善：evaluation + evidenceStatus=IMPROVING）
 * probe：3 个会话（前 2 个建立历史观察：fluency 持续 developing），第 3 个会话首答弱、
 * 重答（isSecondAnswer=true）fluency=adequate：
 *  断言 (1) computeSessionEvaluation 保存且 overallChange=improved；
 *  断言 (2) fluency 观察 evidenceStatus=IMPROVING；
 *  断言 (3) 重答 analyze 的 LLM prompt 注入 abilityContext（含最弱维度=流利度）。
 * 「改善是否真实显著」→ [H] 人工抽检 → MANUAL_REVIEW。
 */
import { POST as SPEAKING_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPEAKING_ANALYZE } from "@/app/api/speaking/analyze/route";
import { getAbilityRepository, getEvaluationRepository } from "@/lib/repository-factory";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { speakingAnalysisJson, type ScriptedProvider } from "../runner/stub-llm";
import { T0_ISO, DEMO_USER_ID } from "./helpers";

interface SessionBody {
  session?: { id?: string };
}

/**
 * 构造不同水平的 scripted 分析。
 * fluency 为被观测维度：developing（弱）→ adequate（改善）；lexical/grammar 恒 adequate，
 * 使「最薄弱维度=流利度」确定性成立。
 */
const analysisFor = (level: "developing" | "adequate") =>
  speakingAnalysisJson({
    mainIssue: {
      dimension: "fluency",
      description: level === "adequate" ? "回答有改善，流利度提升。" : "回答展开不足，流利度受限。",
      suggestion: "尝试用具体例子展开回答。",
    },
    summary: level === "adequate" ? "回答更完整，连接词使用有进步。" : "回答较短，主要问题是展开不足。",
    levels: { fluency: level, lexicalResource: "adequate", grammaticalRange: "adequate" },
    evidenceOverrides: [
      {
        evidence: [level === "adequate" ? "回答使用了连接词以及更多细节" : "回答缺少细节"],
        issues: [level === "adequate" ? "连接词仍可更丰富" : "观点之间缺乏过渡"],
      },
      { evidence: ["使用了一些基础词汇"], issues: ["词汇范围有限"] },
      { evidence: ["句子结构简单"], issues: ["缺少复合句"] },
    ],
  });

export const case_018: EvalCaseDefinition = {
  case_id: "ELS-EVAL-018",
  automation_level: "B",
  async run(ctx) {
    async function createSession(): Promise<string> {
      const sess = await callRoute(SPEAKING_SESSION, { questionId: "sp-p1-001" }, evalTraceId("018-session"));
      const id = (sess.json as SessionBody | null)?.session?.id;
      if (!id) throw new Error("speaking session 创建失败");
      return id;
    }

    // 会话 A/B/C1：每次 analyze 独立注入 scripted LLM（fluency=developing ×3，建立历史观察）
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const sessA = await createSession();
    ctx.script([analysisFor("developing")]);
    await callRoute(SPEAKING_ANALYZE, { sessionId: sessA, answer: "I think exercise is good for health. I like it." }, evalTraceId("018-a"));
    const sessB = await createSession();
    ctx.script([analysisFor("developing")]);
    await callRoute(SPEAKING_ANALYZE, { sessionId: sessB, answer: "I think exercise is good. I like it a lot." }, evalTraceId("018-b"));
    const sessC = await createSession();
    ctx.script([analysisFor("developing")]);
    await callRoute(
      SPEAKING_ANALYZE,
      { sessionId: sessC, answer: "I think reading is good because it helps me relax." },
      evalTraceId("018-c1"),
    );

    // 会话 C 重答：fluency=adequate（改善）；捕获 prompt 以断言 abilityContext 注入
    const secondStub: ScriptedProvider = ctx.script([analysisFor("adequate")]);
    const second = await callRoute(
      SPEAKING_ANALYZE,
      {
        sessionId: sessC,
        answer: "I think reading is good because it helps me relax and learn new things. For example, I read every day before bed.",
        isSecondAnswer: true,
      },
      evalTraceId("018-c2"),
    );

    const evals = await getEvaluationRepository().getAll(DEMO_USER_ID);
    const obs = await getAbilityRepository().getAll(DEMO_USER_ID);
    const fluencyObs = obs.filter((o) => o.dimension === "fluency");
    const lastFluency = fluencyObs[fluencyObs.length - 1];
    const evaluation = evals.find((e) => e.sessionId === sessC);

    ctx.rec.check(
      "r-evaluation",
      "重答后 computeSessionEvaluation 保存，overallChange=improved（改善被识别）",
      { saved: true, improving: true },
      { saved: evaluation != null, improving: evaluation?.overallChange === "improved" },
      {
        failure_layer: "STATE_WRITE",
        metrics: ["M8"],
        evidence: { evaluation, evalsCount: evals.length },
      },
    );

    ctx.rec.check(
      "r-evidence-status",
      "fluency 观察 evidenceStatus=IMPROVING（升迁正确，非 REPEATED）",
      { status: "IMPROVING" },
      { status: lastFluency?.evidenceStatus },
      {
        failure_layer: "STATE_WRITE",
        metrics: ["M8"],
        evidence: { fluencyHistory: fluencyObs.map((o) => `${o.level}:${o.evidenceStatus}`) },
      },
    );

    ctx.rec.check(
      "r-ability-context",
      "重答 analyze 的 LLM prompt 注入 abilityContext（含最弱维度=流利度）",
      { injected: true, hasWeakest: true },
      {
        injected: secondStub.calls.some((c) => c.userContent.includes("学习者历史背景")),
        hasWeakest: secondStub.calls.some((c) => c.userContent.includes("最薄弱维度") && c.userContent.includes("流利度")),
      },
      {
        failure_layer: "PROMPT",
        evidence: { promptSnippet: secondStub.calls.map((c) => c.userContent).join("\n").slice(-500), secondStatus: second.status },
      },
    );

    ctx.rec.uncoveredAssertion(
      "人工抽检：维度改善是否'真实显著'（防止把 LLM 自评当金标；scripted 仅验证产品升迁链路）",
    );

    return {
      coverage: "partial",
      uncoveredMode: "MANUAL_REVIEW",
      actualSummary:
        "probe：3 会话序列后，重答 evaluation 保存（overallChange=improved）；fluency 观察升迁 IMPROVING；重答 prompt 注入含最弱维度的 abilityContext。",
      notes: "B 级 probe（scripted LLM + 真实状态机）。packet 见 docs/eval/manual-review/els-eval-018.md。",
    };
  },
};
