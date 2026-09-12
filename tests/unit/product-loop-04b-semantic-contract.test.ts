/**
 * PRODUCT-LOOP-04B — Semantic Contract 测试（T15–T20）
 * ------------------------------------------------------------
 * 用 mocked LLM 输出验证 prompt 语义规则 → LLM → 管线 的契约：
 *  - 语义误用（04A E20–E23）→ ISSUE（prompt 规则让 LLM 判 ISSUE；validator 保持）
 *  - 定义式/元语言回声（04A G31）→ not CORRECT（prompt 规则 → UNCERTAIN）
 *  - 自然屈折变体（04A C 类）→ CORRECT
 *  - 自纠最终正确（04A I35）→ CORRECT with final quote
 *  - 最终意图不明（04A H34）→ UNCERTAIN
 *  - 双目标独立判定（04A L/M 类）→ per-item
 * 这些断言验证「管线正确传递 LLM 语义判断」，不代表真实 CORRECT precision
 * 已提升（质量证明属于 04C）。
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";

process.env.AUTH_MODE = "demo";
process.env.DATA_PROVIDER = "memory";
process.env.LLM_PRIMARY_PROVIDER = "mock";
process.env.LLM_FALLBACK_ENABLED = "false";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { analyzeSpeakingWithLlm } from "@/lib/llm/tasks/analyze-speaking";
import { getQuestionById } from "@/lib/speaking";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import type { SuggestedExpression, TargetExpressionUsageEvidence } from "@/lib/speaking/types";

const QUESTION = () => getQuestionById("sp-p1-001")!;

const TARGET: SuggestedExpression = {
  itemId: "seed-003",
  canonicalForm: "take something for granted",
  meaning: "把某事视为理所当然",
};

const TWO_TARGETS: SuggestedExpression[] = [
  TARGET,
  { itemId: "seed-015", canonicalForm: "bear in mind", meaning: "牢记" },
];

const promptCapture: { system: string } = { system: "" };

function install(evidence: TargetExpressionUsageEvidence[], answer: string) {
  const provider: LlmProvider = {
    kind: "mock",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      promptCapture.system = req.messages.find((m) => m.role === "system")?.content ?? "";
      const words = answer.toLowerCase().match(/\S+/g) ?? [];
      const sample = words.slice(0, 6).join(" ") || "answer";
      return {
        model: "mock-04b-sem",
        content: JSON.stringify({
          mainIssue: {
            dimension: "fluency",
            severity: "minor",
            description: "回答可以更充实。",
            suggestion: "补充细节。",
          },
          microDrill: { prompt: "练习", exampleImprovement: "For example, ..." },
          summary: "内容清楚。",
          fluency: { label: "流利度", level: "adequate", evidence: [sample], issues: [], suggestions: [] },
          lexicalResource: { label: "词汇", level: "adequate", evidence: [sample], issues: [], suggestions: [] },
          grammaticalRange: { label: "语法", level: "adequate", evidence: [sample], issues: [], suggestions: [] },
          overallDiagnosis: "整体良好。",
          prioritizedSuggestions: ["继续练习"],
          ...(evidence.length > 0 ? { targetExpressionUsageEvidence: evidence } : {}),
        }),
      };
    },
  };
  __setProviderForTests("mock", provider);
}

beforeAll(() => {
  __resetRegistryForTests();
});

afterEach(() => {
  __resetRegistryForTests();
});

describe("T15: semantic misuse（04A E20）→ ISSUE", () => {
  it("LLM 判 ISSUE + grounded quote → 最终 ISSUE，upgradeCandidate=false；prompt 含语义 fit 规则", async () => {
    const answer = "I take my exam for granted because it is very hard.";
    install(
      [{ itemId: "seed-003", attempted: true, quote: "take my exam for granted", assessment: "ISSUE", reason: "语义误用：exam 不是被理所当然对待的对象" }],
      answer,
    );
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t15", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    expect(promptCapture.system).toContain("语义适合当前句子");
    expect(result.targetExpressionEvidence).toHaveLength(1);
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("ISSUE");
    expect(result.targetExpressionEvidence![0]!.upgradeCandidate).toBe(false);
    expect(result.targetExpressionEvidence![0]!.attempted).toBe(true);
  });
});

describe("T16: definitional meta echo（04A G31）→ not CORRECT", () => {
  it("prompt 含回声规则；LLM 判 UNCERTAIN → 最终 UNCERTAIN（结构守卫拦不住长句，语义层必须承担）", async () => {
    const answer = "Hmm, take something for granted means to not appreciate something, I guess.";
    install(
      [{ itemId: "seed-003", attempted: true, quote: "take something for granted", assessment: "UNCERTAIN", reason: "定义式复述，非应用" }],
      answer,
    );
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t16", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    expect(promptCapture.system).toContain("定义式/元语言回声");
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("UNCERTAIN");
    expect(result.targetExpressionEvidence![0]!.upgradeCandidate).toBe(false);
  });
});

describe("T17: natural inflected use（04A C14）→ CORRECT", () => {
  it("屈折变体 took ... for granted → CORRECT（不要求 canonical 逐字）", async () => {
    const answer = "He took her kindness for granted for years.";
    install(
      [{ itemId: "seed-003", attempted: true, quote: "took her kindness for granted", assessment: "CORRECT", reason: "形态变化，语义正确" }],
      answer,
    );
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t17", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    expect(promptCapture.system).toContain("合法形态变化");
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("CORRECT");
    expect(result.targetExpressionEvidence![0]!.upgradeCandidate).toBe(true);
    expect(result.targetExpressionEvidence![0]!.quote).toBe("took her kindness for granted");
  });
});

describe("T18: self-correction final correct（04A I35）→ CORRECT", () => {
  it("先错后改，最终正确 span → CORRECT，quote 指向最终 span，reason 说明 self-corrected", async () => {
    const answer = "I take my parents for grant— sorry, I take their support for granted.";
    install(
      [{ itemId: "seed-003", attempted: true, quote: "I take their support for granted", assessment: "CORRECT", reason: "self-corrected：先 for grant 后改为正确表达" }],
      answer,
    );
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t18", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    expect(promptCapture.system).toContain("自纠");
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("CORRECT");
    expect(result.targetExpressionEvidence![0]!.quote).toBe("I take their support for granted");
    expect(result.targetExpressionEvidence![0]!.reason).toContain("self-corrected");
  });
});

describe("T19: final intent ambiguous（04A H34）→ UNCERTAIN", () => {
  it("自我怀疑场景 → UNCERTAIN（永不 upgradeCandidate）", async () => {
    const answer = "I take my family... for granted? maybe";
    install(
      [{ itemId: "seed-003", attempted: true, quote: "take my family", assessment: "UNCERTAIN", reason: "自我怀疑，意图不明" }],
      answer,
    );
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t19", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    expect(promptCapture.system).toContain("自我怀疑");
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("UNCERTAIN");
    expect(result.targetExpressionEvidence![0]!.upgradeCandidate).toBe(false);
  });
});

describe("T20: two targets → 独立判定（one CORRECT / one NOT_USED）", () => {
  it("per-item：A CORRECT 不影响 B；B NOT_USED 不影响 A", async () => {
    const answer = "I take my health for granted and I bear in mind to rest.";
    install(
      [
        { itemId: "seed-003", attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" },
        { itemId: "seed-015", attempted: false, quote: null, assessment: "NOT_USED", reason: "未使用" },
      ],
      answer,
    );
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t20", undefined, undefined, {
      suggestedExpressions: TWO_TARGETS,
    });
    const ev = result.targetExpressionEvidence!;
    expect(ev).toHaveLength(2);
    const byId = new Map(ev.map((e) => [e.itemId, e]));
    expect(byId.get("seed-003")!.assessment).toBe("CORRECT");
    expect(byId.get("seed-003")!.upgradeCandidate).toBe(true);
    expect(byId.get("seed-015")!.assessment).toBe("NOT_USED");
    expect(byId.get("seed-015")!.upgradeCandidate).toBe(false);
    expect(byId.get("seed-015")!.quote).toBeNull();
  });
});
