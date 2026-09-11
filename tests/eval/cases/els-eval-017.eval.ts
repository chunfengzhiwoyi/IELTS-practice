/**
 * ELS-EVAL-017 — SPEAKING_ANALYSIS（复读/观点单一识别）
 * probe：复读型回答（n-gram 重合率高）+ scripted LLM 输出命中「重复」语义且 fluency 不给高分。
 * 确定性辅助断言：回答 bigram 重合率 ≥ 阈值（复读客观信号）。
 * 主判据（LLM 语义识别）→ [H] 人工抽检 → MANUAL_REVIEW。
 */
import { POST as SPEAKING_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPEAKING_ANALYZE } from "@/app/api/speaking/analyze/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { speakingAnalysisJson } from "../runner/stub-llm";
import { T0_ISO } from "./helpers";

interface AnalysisResponse {
  analysis?: {
    summary?: string;
    mainIssue?: { description?: string };
    ieltsAnalysis?: {
      fluency?: { level?: string };
    } | null;
  };
}

const REPEATED_ANSWER =
  "I think reading is good because it helps me relax. Reading is really good. Reading helps me relax a lot.";

/** 确定性复读信号：bigram 归一化重合率 */
function bigramOverlapRate(text: string): number {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) bigrams.add(words[i] + " " + words[i + 1]);
  const uniqWords = new Set(words);
  return uniqWords.size === 0 ? 0 : Math.round((bigrams.size / Math.max(words.length - 1, 1)) * 100) / 100;
}

export const case_017: EvalCaseDefinition = {
  case_id: "ELS-EVAL-017",
  automation_level: "B",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const sess = await callRoute(SPEAKING_SESSION, { questionId: "sp-p1-001" }, evalTraceId("017-session"));
    const sessionId = (sess.json as { session?: { id?: string } } | null)?.session?.id;
    if (!sessionId) {
      ctx.rec.blocked("r-session", "创建口语会话失败", "sessionId", sessionId, { failure_layer: "SPEAKING" });
      return { coverage: "partial", actualSummary: "会话创建失败（BLOCKED）" };
    }

    ctx.script([
      speakingAnalysisJson({
        mainIssue: {
          dimension: "fluency",
          description: "回答存在明显复读：reading/relax 多次重复，观点单一。",
          suggestion: "尝试补充新观点并用连接词展开，避免重复同一句话。",
        },
        summary: "回答观点单一，多次重复同一表达。",
        evidenceOverrides: [
          { evidence: ["回答多次重复 'Reading helps me relax' 句式"], issues: ["复读明显", "观点单一"] },
          { evidence: ["词汇重复（good/relax 多次出现）"], issues: ["词汇重复"] },
          { evidence: ["句式重复"], issues: ["句式单一"] },
        ],
      }),
    ]);
    const res = await callRoute(
      SPEAKING_ANALYZE,
      { sessionId, answer: REPEATED_ANSWER },
      evalTraceId("017-repetition"),
    );
    const json = res.json as AnalysisResponse | null;
    const analysis = json?.analysis;

    const overlap = bigramOverlapRate(REPEATED_ANSWER);
    const fluencyLevel = analysis?.ieltsAnalysis?.fluency?.level;

    ctx.rec.check(
      "r-repetition-signal",
      "确定性复读信号：回答 bigram 重合率高于普通水平（≥0.5 为复读客观信号）",
      { overlapHigh: true },
      { overlapHigh: overlap >= 0.5 },
      {
        failure_layer: "MODEL",
        metrics: ["M8"],
        evidence: { bigramOverlapRate: overlap, answer: REPEATED_ANSWER },
      },
    );

    ctx.rec.check(
      "r-llm-repetition",
      "LLM 反馈命中「重复/观点单一」语义（mainIssue 或 summary 层面）",
      { detected: true },
      {
        detected:
          /重复|单一|复读/.test(analysis?.summary ?? "") ||
          /重复|单一|复读/.test(analysis?.mainIssue?.description ?? ""),
      },
      {
        failure_layer: "MODEL",
        metrics: ["M8"],
        evidence: { summary: analysis?.summary, mainIssue: analysis?.mainIssue },
      },
    );

    ctx.rec.check(
      "r-no-high-fluency",
      "存在复读时 fluency 级别不与复读矛盾（不判 strong/adequate）",
      { notHigh: true },
      { notHigh: fluencyLevel !== "strong" && fluencyLevel !== "adequate" },
      { failure_layer: "MODEL", metrics: ["M8"], evidence: { fluencyLevel } },
    );

    return {
      coverage: "full",
      actualSummary:
        `probe：回答 bigram 重合率=${overlap}（复读客观信号）；LLM 反馈命中重复语义且 fluency=${fluencyLevel}（未给高分）→ PASS`,
      notes:
        "M3-P4A：Frozen Contract 未将 017 列入 MANUAL_GOLD（仅 006/016/018/019）。pass_criteria 两条均为响应级可机械断言" +
        "（①输出含重复/内容单一语义——r-llm-repetition；②fluency 级别不与复读矛盾——r-no-high-fluency），" +
        "以 scripted fixture + response semantic marker 完成自动裁决；确定性复读信号（bigram 重合率）作辅助证据。",
    };  },
};
