/**
 * PRODUCT-LOOP-04B — State Integrity 测试（T25–T29）
 * ------------------------------------------------------------
 * 冻结边界：LONG_TERM_STATE_WRITEBACK = NO。
 * 无论 evidence 为 CORRECT / ISSUE / NOT_USED / UNCERTAIN，
 * applicationLevel / recallLevel / status / nextReviewAt /
 * currentIntervalDays / consecutiveCorrect 一律不变。
 * T29：Speaking session 显式完成（02A）仍正常。
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";

process.env.AUTH_MODE = "demo";
process.env.DATA_PROVIDER = "memory";
process.env.LLM_PRIMARY_PROVIDER = "mock";
process.env.LLM_FALLBACK_ENABLED = "false";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { POST as SPK_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPK_ANALYZE } from "@/app/api/speaking/analyze/route";
import { POST as SPK_COMPLETE } from "@/app/api/speaking/complete/route";
import { getLearningRepository, _resetRepositories } from "@/lib/repository-factory";
import { _resetGoalRepositoryForTests } from "@/lib/goal/repository";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import type { TargetExpressionUsageEvidence } from "@/lib/speaking/types";
import type { UserItemState } from "@/lib/learning/types";

const ITEM = "seed-003";
// AUTH_MODE=demo 时 requireUser 固定返回 demo-user-001（DEMO_USER_ID 模块加载时冻结）；
// 每个用例 afterEach 重置 repositories，天然隔离。
const USER = "demo-user-001";

const STATE_FIELDS = [
  "applicationLevel",
  "recallLevel",
  "status",
  "nextReviewAt",
  "currentIntervalDays",
  "consecutiveCorrect",
] as const;

function cleanJson(answer: string, evidence?: TargetExpressionUsageEvidence[]): string {
  const sample = answer.toLowerCase().match(/\S+/g)?.slice(0, 6).join(" ") || "answer";
  return JSON.stringify({
    mainIssue: { dimension: "fluency", severity: "minor", description: "回答可以更充实。", suggestion: "补充细节。" },
    microDrill: { prompt: "练习", exampleImprovement: "For example, ..." },
    summary: "内容清楚。",
    fluency: { label: "流利度", level: "adequate", evidence: [sample], issues: [], suggestions: [] },
    lexicalResource: { label: "词汇", level: "adequate", evidence: [sample], issues: [], suggestions: [] },
    grammaticalRange: { label: "语法", level: "adequate", evidence: [sample], issues: [], suggestions: [] },
    overallDiagnosis: "整体良好。",
    prioritizedSuggestions: ["继续练习"],
    ...(evidence ? { targetExpressionUsageEvidence: evidence } : {}),
  });
}

function install(evidence: TargetExpressionUsageEvidence[]) {
  const provider: LlmProvider = {
    kind: "mock",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const answer = req.messages.find((m) => m.role === "user")?.content ?? "";
      const words = answer.toLowerCase().match(/\S+/g) ?? [];
      const sample = words.slice(0, 6).join(" ") || "answer";
      const body = JSON.parse(cleanJson(sample, evidence)) as Record<string, unknown>;
      return { model: "mock-04b-state", content: JSON.stringify(body) };
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

async function seedState(userId: string, status: string) {
  const repo = getLearningRepository();
  await repo.upsertUserItemState({
    userId,
    itemId: ITEM,
    status: status as never,
    recognitionLevel: 0,
    recallLevel: 0,
    applicationLevel: 0,
    consecutiveCorrect: 0,
    currentIntervalDays: 0,
    nextReviewAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  return repo.getUserItemState(userId, ITEM);
}

async function runAnalyzeWithEvidence(userId: string, evidence: TargetExpressionUsageEvidence[], status: string) {
  await seedState(userId, status);
  install(evidence);
  const s = await post(SPK_SESSION, "http://local/api/speaking/session", { part: "P1", topic: "daily" });
  expect(s.json.suggestedExpressions).toHaveLength(1);
  const before = await getLearningRepository().getUserItemState(userId, ITEM);
  const a = await post(SPK_ANALYZE, "http://local/api/speaking/analyze", {
    sessionId: s.json.session.id,
    answer: "I take my health for granted every single day.",
    isSecondAnswer: false,
  });
  expect(a.status).toBe(200);
  const after = await getLearningRepository().getUserItemState(userId, ITEM);
  return { before: before!, after: after!, response: a.json };
}

function assertAllFieldsUnchanged(before: UserItemState, after: UserItemState, label: string) {
  for (const f of STATE_FIELDS) {
    expect(after[f], `${label}: ${f} unchanged`).toEqual(before[f]);
  }
}

beforeAll(() => {
  _resetRepositories();
  _resetGoalRepositoryForTests();
  __resetRegistryForTests();
});

afterEach(() => {
  __resetRegistryForTests();
  _resetRepositories();
  _resetGoalRepositoryForTests();
});

describe("T25: CORRECT evidence → applicationLevel unchanged", () => {
  it("evidence=CORRECT 后 applicationLevel 仍为 0", async () => {
    const { before, after } = await runAnalyzeWithEvidence(
      USER,
      [{ itemId: ITEM, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" }],
      "RECALLED_INDEPENDENTLY",
    );
    expect(after.applicationLevel).toBe(0);
    assertAllFieldsUnchanged(before, after, "T25");
  });
});

describe("T26: ISSUE evidence → recallLevel unchanged", () => {
  it("evidence=ISSUE 后 recallLevel 不降级", async () => {
    const { before, after } = await runAnalyzeWithEvidence(
      USER,
      [{ itemId: ITEM, attempted: true, quote: "take my exam for granted", assessment: "ISSUE", reason: "语义误用" }],
      "RECALLED_WITH_HELP",
    );
    expect(after.recallLevel).toEqual(before.recallLevel);
    assertAllFieldsUnchanged(before, after, "T26");
  });
});

describe("T27: NOT_USED → status unchanged", () => {
  it("NOT_USED 不改变 status（OPTIONAL 契约，不使用不惩罚）", async () => {
    const { before, after } = await runAnalyzeWithEvidence(
      USER,
      [{ itemId: ITEM, attempted: false, quote: null, assessment: "NOT_USED", reason: "未使用" }],
      "EXPOSED",
    );
    expect(after.status).toBe("EXPOSED");
    assertAllFieldsUnchanged(before, after, "T27");
  });
});

describe("T28: UNCERTAIN → review schedule unchanged", () => {
  it("UNCERTAIN 不触碰 nextReviewAt / currentIntervalDays", async () => {
    const { before, after } = await runAnalyzeWithEvidence(
      USER,
      [{ itemId: ITEM, attempted: true, quote: "take my family", assessment: "UNCERTAIN", reason: "意图不明" }],
      "RECALLED_INDEPENDENTLY",
    );
    expect(after.nextReviewAt).toEqual(before.nextReviewAt);
    expect(after.currentIntervalDays).toEqual(before.currentIntervalDays);
    assertAllFieldsUnchanged(before, after, "T28");
  });
});

describe("T29: complete session → 02A 完成路径保持", () => {
  it("显式 Finish → status=COMPLETED；第二次调用幂等", async () => {
    const { response } = await runAnalyzeWithEvidence(
      USER,
      [{ itemId: ITEM, attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" }],
      "RECALLED_INDEPENDENTLY",
    );
    const sessionId = response.session.id;
    expect(response.session.status).toBe("IN_PROGRESS");

    const c1 = await post(SPK_COMPLETE, "http://local/api/speaking/complete", { sessionId });
    expect(c1.status).toBe(200);
    expect(c1.json.session.status).toBe("COMPLETED");

    const c2 = await post(SPK_COMPLETE, "http://local/api/speaking/complete", { sessionId });
    expect(c2.status).toBe(200);
    expect(c2.json.session.status).toBe("COMPLETED");
  });
});
