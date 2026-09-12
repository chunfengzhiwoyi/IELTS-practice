/**
 * PRODUCT-LOOP-04B — Wiring 测试（T01–T05）
 * ------------------------------------------------------------
 * 验证 04A Finding #1 接线缺口已闭合：
 *  - session 创建时服务端冻结 suggestedExpressions snapshot（server authority）
 *  - analyze 按 sessionId 读回 frozen targets 传给 LLM（绝不重新 select、绝不信任客户端注入）
 *  - 0 targets → evidence=[] 且主分析正常
 *  - learner state 在 session 建立后改变 → analyze targets 不漂移
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";

// ---- env：memory + demo + mock（惰性读取，首次 route 调用前生效）----
process.env.AUTH_MODE = "demo";
process.env.DATA_PROVIDER = "memory";
process.env.LLM_PRIMARY_PROVIDER = "mock";
process.env.LLM_FALLBACK_ENABLED = "false";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { POST as SPK_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPK_ANALYZE } from "@/app/api/speaking/analyze/route";
import { getLearningRepository, getSpeakingRepository, _resetRepositories } from "@/lib/repository-factory";
import { _resetGoalRepositoryForTests } from "@/lib/goal/repository";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import type { TargetExpressionUsageEvidence, SuggestedExpression } from "@/lib/speaking/types";

const USER = "demo-user-001";
const ITEM = "seed-003";

/** 捕获最近一次 LLM 调用的 system+user prompt */
const promptCapture: { system: string; user: string } = { system: "", user: "" };

function cleanAnalysisJson(evidence?: TargetExpressionUsageEvidence[]): string {
  return JSON.stringify({
    mainIssue: {
      dimension: "fluency",
      severity: "minor",
      description: "回答整体流畅，可以继续扩展细节。",
      suggestion: "多补充一个具体例子。",
    },
    microDrill: { prompt: "练习扩展观点", exampleImprovement: "For example, ..." },
    summary: "内容清楚，表达自然。",
    fluency: { label: "流利度", level: "adequate", evidence: ["take my health for granted"], issues: [], suggestions: [] },
    lexicalResource: { label: "词汇", level: "adequate", evidence: ["take my health for granted"], issues: [], suggestions: [] },
    grammaticalRange: { label: "语法", level: "adequate", evidence: ["take my health for granted"], issues: [], suggestions: [] },
    overallDiagnosis: "整体表现良好，继续积累话题表达。",
    prioritizedSuggestions: ["继续练习", "丰富细节"],
    ...(evidence ? { targetExpressionUsageEvidence: evidence } : {}),
  });
}

function installProvider(evidence?: TargetExpressionUsageEvidence[], raw?: string): void {
  const provider: LlmProvider = {
    kind: "mock",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      promptCapture.system = req.messages.find((m) => m.role === "system")?.content ?? "";
      promptCapture.user = req.messages.find((m) => m.role === "user")?.content ?? "";
      return {
        model: "mock-04b",
        content: raw ?? cleanAnalysisJson(evidence),
      };
    },
  };
  __setProviderForTests("mock", provider);
}

function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function post(handler: (r: Request) => Promise<Response>, url: string, body: unknown) {
  const res = await handler(jsonReq(url, "POST", body));
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

async function makeLearnedState(itemId: string, status: string) {
  const repo = getLearningRepository();
  await repo.upsertUserItemState({
    userId: USER,
    itemId,
    status: status as never,
    recognitionLevel: 0,
    recallLevel: 0,
    applicationLevel: 0,
    consecutiveCorrect: 0,
    currentIntervalDays: 0,
    nextReviewAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
}

beforeAll(() => {
  _resetRepositories();
  _resetGoalRepositoryForTests();
  __resetRegistryForTests();
  installProvider();
});

afterEach(() => {
  __resetRegistryForTests();
  _resetRepositories();
  _resetGoalRepositoryForTests();
});

describe("T01: session 1 target → analyze 收到该 target", () => {
  it("route 级：P1 daily 选词 → session snapshot 含 seed-003 → analyze prompt 含 canonicalForm → evidence CORRECT", async () => {
    await makeLearnedState(ITEM, "RECALLED_INDEPENDENTLY");
    installProvider([
      { itemId: ITEM, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "natural use" },
    ]);

    const s = await post(SPK_SESSION, "http://local/api/speaking/session", { part: "P1", topic: "daily" });
    expect(s.status).toBe(200);
    expect(s.json.suggestedExpressions).toHaveLength(1);
    expect(s.json.suggestedExpressions[0].itemId).toBe(ITEM);
    expect(s.json.session.suggestedExpressions).toHaveLength(1); // frozen snapshot 随 session 保存

    const a = await post(SPK_ANALYZE, "http://local/api/speaking/analyze", {
      sessionId: s.json.session.id,
      answer: "I take my health for granted every single day.",
      isSecondAnswer: false,
    });
    expect(a.status).toBe(200);
    // analyze 收到该 target：prompt 中带 canonicalForm + meaning
    expect(promptCapture.user).toContain("take something for granted");
    expect(promptCapture.user).toContain("把某事视为理所当然");
    // evidence 固化
    expect(a.json.analysis.targetExpressionEvidence).toHaveLength(1);
    expect(a.json.analysis.targetExpressionEvidence[0].itemId).toBe(ITEM);
    expect(a.json.analysis.targetExpressionEvidence[0].assessment).toBe("CORRECT");
    expect(a.json.analysis.targetExpressionEvidence[0].upgradeCandidate).toBe(true);
  });
});

describe("T02: session 2 targets → analyze 收到两个", () => {
  it("两个 target 分别独立进入 prompt 与 evidence", async () => {
    const targets: SuggestedExpression[] = [
      { itemId: "seed-003", canonicalForm: "take something for granted", meaning: "把某事视为理所当然" },
      { itemId: "seed-015", canonicalForm: "bear in mind", meaning: "牢记" },
    ];
    installProvider([
      { itemId: "seed-003", attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" },
      { itemId: "seed-015", attempted: false, quote: null, assessment: "NOT_USED", reason: "did not use" },
    ]);

    const speakingRepo = getSpeakingRepository();
    const session = await speakingRepo.createSession({
      id: "spk-t02",
      userId: USER,
      questionId: "sp-p1-001",
      part: "P1",
      topic: "Daily Routine",
      question: "What do you typically do every day?",
      firstAnswer: null,
      firstAnalysis: null,
      secondAnswer: null,
      secondAnalysis: null,
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      suggestedExpressions: targets,
    });
    expect(session.suggestedExpressions).toHaveLength(2);

    const a = await post(SPK_ANALYZE, "http://local/api/speaking/analyze", {
      sessionId: "spk-t02",
      answer: "I take my health for granted and I bear in mind to rest.",
      isSecondAnswer: false,
    });
    expect(a.status).toBe(200);
    expect(promptCapture.user).toContain("take something for granted");
    expect(promptCapture.user).toContain("bear in mind");
    const ev = a.json.analysis.targetExpressionEvidence;
    expect(ev).toHaveLength(2);
    const byId = new Map<string, any>(ev.map((e: any) => [e.itemId, e] as [string, any]));
    expect(byId.get("seed-003")!.assessment).toBe("CORRECT");
    expect(byId.get("seed-015")!.assessment).toBe("NOT_USED"); // 独立判定，互不污染
  });
});

describe("T03: session target=[] → evidence=[] 且主分析正常", () => {
  it("无 targets 时 Speaking analyzer 正常工作，evidence 为空", async () => {
    installProvider(); // 无 evidence 输出
    const s = await post(SPK_SESSION, "http://local/api/speaking/session", { part: "P3" });
    expect(s.status).toBe(200);
    expect(s.json.suggestedExpressions).toHaveLength(0);

    const a = await post(SPK_ANALYZE, "http://local/api/speaking/analyze", {
      sessionId: s.json.session.id,
      answer: "Technology has changed the way people learn.",
      isSecondAnswer: false,
    });
    expect(a.status).toBe(200);
    expect(a.json.analysis.targetExpressionEvidence).toBeUndefined();
    expect(a.json.analysis.mainIssue).toBeDefined();
    expect(a.json.analysis.summary).toBeTruthy();
  });
});

describe("T04: session 建立后 learner state 改变 → analyze targets 不重新选择", () => {
  it("frozen snapshot 优先：state 改回 NEW 后 analyze prompt 仍含原 target", async () => {
    await makeLearnedState(ITEM, "RECALLED_INDEPENDENTLY");
    installProvider([
      { itemId: ITEM, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" },
    ]);
    const s = await post(SPK_SESSION, "http://local/api/speaking/session", { part: "P1", topic: "daily" });
    expect(s.json.suggestedExpressions).toHaveLength(1);

    // 修改 learner state：seed-003 变回未学（若 analyze 时重新 select 将不再选中）
    await makeLearnedState(ITEM, "NEW");

    const a = await post(SPK_ANALYZE, "http://local/api/speaking/analyze", {
      sessionId: s.json.session.id,
      answer: "I take my health for granted every day.",
      isSecondAnswer: false,
    });
    expect(a.status).toBe(200);
    expect(promptCapture.user).toContain("take something for granted"); // 仍来自 session frozen snapshot
    expect(a.json.analysis.targetExpressionEvidence[0].itemId).toBe(ITEM);
  });
});

describe("T05: client 伪造 → server authority 不接受", () => {
  it("LLM 输出白名单外 itemId → 被 drop，evidence 只基于 session targets", async () => {
    await makeLearnedState(ITEM, "RECALLED_INDEPENDENTLY");
    installProvider([
      { itemId: "seed-999", attempted: true, quote: "bear in mind", assessment: "CORRECT", reason: "forged" },
      { itemId: ITEM, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" },
    ]);
    const s = await post(SPK_SESSION, "http://local/api/speaking/session", { part: "P1", topic: "daily" });
    const a = await post(SPK_ANALYZE, "http://local/api/speaking/analyze", {
      sessionId: s.json.session.id,
      answer: "I take my health for granted and I always bear in mind to rest.",
      isSecondAnswer: false,
      // 客户端试图注入伪造 target（RequestSchema 无此字段 → 被忽略）
      suggestedExpressions: [{ itemId: "seed-999", canonicalForm: "forged", meaning: "x" }],
      targetExpressionUsageEvidence: [{ itemId: "seed-999", attempted: true, quote: "x", assessment: "CORRECT", reason: "inject" }],
    });
    expect(a.status).toBe(200);
    const ev = a.json.analysis.targetExpressionEvidence;
    expect(ev).toHaveLength(1);
    expect(ev[0].itemId).toBe(ITEM); // seed-999 被 drop，未扩张 targets
  });
});
