/**
 * PRODUCT-LOOP-04C-FINAL — Real LLM probe（§7 最小真实 analyzer probe）
 * 确认：provider != mock；LLM 调用真实执行（非 fallback-only）；evidence 产出可用。
 * 不打印任何 secret。
 */
import { describe, it, expect } from "vitest";

import { analyzeSpeakingWithLlm } from "@/lib/llm/tasks/analyze-speaking";
import { getQuestionById } from "@/lib/speaking";
import { getServerEnv } from "@/lib/env";

describe("04C-FINAL real LLM probe", () => {
  it("single real analyzer call executes (not fallback-only)", async () => {
    const env = getServerEnv();
    const provider = env.LLM_PRIMARY_PROVIDER;
    // 绝对不打印 key 值
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      provider,
      mainModel: provider === "deepseek" ? env.deepseek?.DEEPSEEK_MAIN_MODEL : provider === "bailian" ? env.bailian?.BAILIAN_MAIN_MODEL : null,
      hasApiKey: provider === "deepseek" ? !!env.deepseek?.DEEPSEEK_API_KEY : provider === "bailian" ? !!env.bailian?.BAILIAN_API_KEY : false,
    }));
    expect(provider).not.toBe("mock");

    const question = getQuestionById("sp-p1-001");
    const result = await analyzeSpeakingWithLlm(
      "I take my health for granted sometimes, and I should change that.",
      question!,
      "04c-final-probe",
      undefined,
      undefined,
      {
        suggestedExpressions: [
          { itemId: "seed-003", canonicalForm: "take something for granted", meaning: "把…当作理所当然" },
        ],
      },
    );

    // LLM 路径而非 fallback：ieltsAnalysis 必须存在
    expect(result.ieltsAnalysis).toBeDefined();
    const evidence = (result as { targetExpressionEvidence?: Array<{ itemId: string; assessment: string; quote: string | null; upgradeCandidate: boolean; validatorNotes: string[] }> }).targetExpressionEvidence ?? [];
    expect(evidence.length).toBe(1);
    expect(evidence[0]?.itemId).toBe("seed-003");
    expect(["CORRECT", "ISSUE", "UNCERTAIN", "NOT_USED"]).toContain(evidence[0]?.assessment);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ probeEvidence: evidence[0] }));
  }, 120_000);
});
