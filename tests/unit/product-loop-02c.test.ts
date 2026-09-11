/**
 * PRODUCT-LOOP-02C — Vocabulary → Speaking V1 实现测试
 * ------------------------------------------------------------
 * 覆盖（任务 §12 A–I）：
 *  A. take something for granted 能在自然匹配题上成为 suggested expression
 *  B. 最多 2 个 target
 *  C. 未学过 item 绝不进入 target
 *  D. 无匹配 → targets=[] + 普通 Speaking 正常（SAFE FALLBACK）
 *  E. 显式 questionId 不会被 target selection 替换
 *  F/G/H. 没有任何长期 learner state 被修改（applicationLevel/recallLevel/status/nextReviewAt 等）
 *  I. UI 在 target 为空时保持原体验（组件返回 null；页面条件渲染）
 *
 * Frozen Safety Boundary：本轮不实现 reverse state update，全部断言只读。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import type { UserItemState } from "@/lib/learning/types";
import { getAllSeedItems, seedToLearningItem } from "@/lib/learning/seed-catalog";
import { selectTargetExpressions, MAX_TARGET_EXPRESSIONS } from "@/lib/speaking/target-selection";
import { matchQuestionForTargets } from "@/lib/speaking/question-matching";
import { getAllQuestions, getQuestionsByPart } from "@/lib/speaking/question-bank";
import { SuggestedExpressions } from "@/components/speaking/suggested-expressions";
import { POST as createSpeakingSession } from "@/app/api/speaking/session/route";
import { _resetRepositories, getLearningRepository } from "@/lib/repository-factory";

const PROJECT_ROOT = process.cwd();
const USER_ID = "demo-user-001";

function readFile(relPath: string): string {
  return readFileSync(join(PROJECT_ROOT, relPath), "utf-8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function makeState(itemId: string, status: UserItemState["status"], overrides: Partial<UserItemState> = {}): UserItemState {
  return {
    userId: USER_ID,
    itemId,
    status,
    recognitionLevel: 1,
    recallLevel: 0,
    applicationLevel: 0,
    consecutiveCorrect: 0,
    currentIntervalDays: 0,
    nextReviewAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const seedById = new Map(getAllSeedItems().map((s) => [s.itemId, s]));
const itemOf = (itemId: string) => seedById.get(itemId) ?? null;
const topicTagsOf = (itemId: string) => seedById.get(itemId)?.topicTags ?? [];

async function callSession(body: unknown): Promise<{ status: number; json: Record<string, any> }> {
  const res = await createSpeakingSession(
    new Request("http://localhost:3000/api/speaking/session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-trace-id": "trc_loop_02c_test" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

describe("PRODUCT-LOOP-02C target-selection（纯函数）", () => {
  beforeEach(() => {
    process.env.AUTH_MODE = "demo";
    process.env.DATA_PROVIDER = "memory";
    _resetRepositories();
  });

  it("A1: take something for granted 在已学(EXPOSED)时进入候选", () => {
    const targets = selectTargetExpressions([makeState("seed-003", "EXPOSED")], itemOf);
    expect(targets.some((t) => t.itemId === "seed-003")).toBe(true);
    expect(targets[0]!.canonicalForm).toBe("take something for granted");
  });

  it("A2: take something for granted 自然匹配 P1 Daily Routine 题并成为建议表达", () => {
    const targets = selectTargetExpressions([makeState("seed-003", "EXPOSED")], itemOf);
    const match = matchQuestionForTargets(getQuestionsByPart("P1"), targets, topicTagsOf);
    expect(match.question?.questionId).toBe("sp-p1-001");
    expect(match.matchedTargets.some((t) => t.itemId === "seed-003")).toBe(true);
  });

  it("B: 最多 2 个 target（5 个合格词条只选 2 个，确定性按 canonicalForm 排序）", () => {
    const states = ["seed-003", "seed-006", "seed-008", "seed-013", "seed-015"].map((id) =>
      makeState(id, "EXPOSED"),
    );
    const targets = selectTargetExpressions(states, itemOf);
    expect(targets.length).toBeLessThanOrEqual(MAX_TARGET_EXPRESSIONS);
    expect(targets.length).toBe(2);
    // 同分时按 canonicalForm 字典序 → a blessing in disguise(seed-013) < bear in mind(seed-015)
    expect(targets.map((t) => t.itemId)).toEqual(["seed-013", "seed-015"]);
  });

  it("C: 未学过（status=NEW / 无状态）绝不进入 target", () => {
    const newState = makeState("seed-003", "NEW");
    expect(selectTargetExpressions([newState], itemOf)).toEqual([]);
    // 无状态 item（未学）不参与
    expect(selectTargetExpressions([], itemOf)).toEqual([]);
  });

  it("C2: 无口语标记或不可口语化的词条不进 target", () => {
    // seed-002 significant: academic/ielts-writing，无口语标记
    expect(selectTargetExpressions([makeState("seed-002", "EXPOSED")], itemOf)).toEqual([]);
  });

  it("D1: 无可靠匹配 → match 返回 null（调用方走 SAFE FALLBACK）", () => {
    const targets = selectTargetExpressions([makeState("seed-003", "EXPOSED")], itemOf);
    // P3 题库无 daily 相关题
    const match = matchQuestionForTargets(getQuestionsByPart("P3"), targets, topicTagsOf);
    expect(match.question).toBeNull();
    expect(match.matchedTargets).toEqual([]);
    expect(match.matchScore).toBe(0);
  });
});

describe("PRODUCT-LOOP-02C session route（V1 接线）", () => {
  beforeEach(() => {
    process.env.AUTH_MODE = "demo";
    process.env.DATA_PROVIDER = "memory";
    _resetRepositories();
  });

  async function seedLearnState(state: UserItemState): Promise<void> {
    const repo = getLearningRepository();
    const seed = seedById.get(state.itemId);
    if (!seed) throw new Error(`unknown seed item ${state.itemId}`);
    await repo.createOrGetItem(seedToLearningItem(seed));
    await repo.upsertUserItemState(state);
  }

  it("A3: 自动选题时自然匹配题 + suggestedExpressions 携带 take something for granted", async () => {
    await seedLearnState(makeState("seed-003", "EXPOSED"));
    const { status, json } = await callSession({ part: "P1" });
    expect(status).toBe(200);
    expect(json.questionData.questionId).toBe("sp-p1-001");
    expect(json.suggestedExpressions).toHaveLength(1);
    expect(json.suggestedExpressions[0].itemId).toBe("seed-003");
    expect(json.suggestedExpressions[0].canonicalForm).toBe("take something for granted");
    expect(json.suggestedExpressions[0].matchedTopic).toBe("Daily Routine");
  });

  it("D2: 无匹配 part → suggestedExpressions=[] 且普通 Speaking 正常（fallback 非错误）", async () => {
    await seedLearnState(makeState("seed-003", "EXPOSED"));
    const { status, json } = await callSession({ part: "P3" });
    expect(status).toBe(200);
    expect(json.suggestedExpressions).toEqual([]);
    expect(json.session.part).toBe("P3");
    expect(typeof json.questionData.questionId).toBe("string");
  });

  it("E1: 显式 questionId 不被 target selection 替换（无匹配题也不替换）", async () => {
    await seedLearnState(makeState("seed-003", "EXPOSED"));
    const { status, json } = await callSession({ questionId: "sp-p2-001" });
    expect(status).toBe(200);
    expect(json.questionData.questionId).toBe("sp-p2-001");
  });

  it("E2: 显式 questionId + 自然匹配 → 保留原题并附加建议", async () => {
    await seedLearnState(makeState("seed-003", "EXPOSED"));
    const { status, json } = await callSession({ questionId: "sp-p1-001" });
    expect(status).toBe(200);
    expect(json.questionData.questionId).toBe("sp-p1-001");
    expect(json.suggestedExpressions.some((e: any) => e.itemId === "seed-003")).toBe(true);
  });

  it("F/G/H: 没有任何长期 learner state 被修改（含 applicationLevel/recallLevel/status/nextReviewAt）", async () => {
    const before = makeState("seed-003", "EXPOSED", {
      recallLevel: 1,
      applicationLevel: 0,
      consecutiveCorrect: 2,
      currentIntervalDays: 1,
      nextReviewAt: "2026-09-15T00:00:00.000Z",
    });
    await seedLearnState(before);

    const repo = getLearningRepository();
    const eventsBefore = await repo.getUserEventsInRange(USER_ID, "2020-01-01T00:00:00.000Z", "2030-01-01T00:00:00.000Z");

    const { status } = await callSession({ part: "P1" });
    expect(status).toBe(200);

    const after = await repo.getUserItemState(USER_ID, "seed-003");
    expect(after).not.toBeNull();
    expect(after!.applicationLevel).toBe(before.applicationLevel); // G
    expect(after!.recallLevel).toBe(before.recallLevel); // H
    expect(after!.status).toBe(before.status); // H
    expect(after!.nextReviewAt).toBe(before.nextReviewAt); // H
    expect(after!.consecutiveCorrect).toBe(before.consecutiveCorrect); // F
    expect(after!.currentIntervalDays).toBe(before.currentIntervalDays); // F
    expect(after!.recognitionLevel).toBe(before.recognitionLevel); // F

    const eventsAfter = await repo.getUserEventsInRange(USER_ID, "2020-01-01T00:00:00.000Z", "2030-01-01T00:00:00.000Z");
    expect(eventsAfter.length).toBe(eventsBefore.length); // 不产生任何学习事件
  });
});

describe("PRODUCT-LOOP-02C Speaking UI（V1 提示）", () => {
  it("I1: suggestedExpressions 为空时组件返回 null（UI 保持原体验）", () => {
    expect(renderToStaticMarkup(React.createElement(SuggestedExpressions, { expressions: [] }))).toBe("");
  });

  it("I2: 非空时渲染轻量提示 + OPTIONAL 文案（自然表达优先，不用也没关系）", () => {
    const html = renderToStaticMarkup(
      React.createElement(SuggestedExpressions, {
        expressions: [
          { itemId: "seed-003", canonicalForm: "take something for granted", meaning: "认为…理所当然" },
        ],
      }),
    );
    expect(html).toContain("take something for granted");
    expect(html).toContain("不用也没关系");
  });

  it("I3: speaking-page 条件渲染 SuggestedExpressions（非空才显示）", () => {
    const src = readFile("components/speaking/speaking-page.tsx");
    const code = stripComments(src);
    expect(src).toMatch(/SuggestedExpressions/);
    expect(code).toMatch(/SuggestedExpressions expressions=\{state\.suggestedExpressions\}/);
    // 会话响应解析：suggestedExpressions 非数组时回退 []
    expect(code).toMatch(/Array\.isArray\(json\.suggestedExpressions\)/);
    // 未引入任何 reverse state 写入
    expect(src).not.toMatch(/applicationLevel\s*[+\-]=/);
    expect(src).not.toMatch(/detectTargetUsage|USED_CORRECTLY|SPEAKING_USED/);
  });

  it("I4: 建议表达组件不渲染任何强制/扣分文案", () => {
    const code = stripComments(readFile("components/speaking/suggested-expressions.tsx"));
    expect(code).not.toMatch(/必须|强制|扣分|评分/);
  });
});
