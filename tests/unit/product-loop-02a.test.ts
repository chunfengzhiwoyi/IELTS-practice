/**
 * PRODUCT-LOOP-02A — State Consistency Fix Tests
 * ------------------------------------------------------------
 * 验证三处用户可见状态分叉的修复：
 * A. masthead streak 改读服务端 /api/learning/stats（不再读 localStorage events）
 * B. Goal 页面/概览「当前学习概况」改读服务端 stats（不再调用 getStudyHistory）
 * C. Speaking session 有显式完成路径（completeSession 接入 /api/speaking/complete）
 *    且不破坏 second answer（updateSecondAnswer 仍置 COMPLETED）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import { MemorySpeakingRepository } from "@/lib/speaking/repository";
import type { SpeakingSession } from "@/lib/speaking/types";

const PROJECT_ROOT = process.cwd();

function readFile(relPath: string): string {
  return readFileSync(join(PROJECT_ROOT, relPath), "utf-8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// =============================================================
// A. Masthead streak — server stats SSOT
// =============================================================

describe("02A-FixA: masthead streak 使用服务端统计", () => {
  const src = readFile("components/layout/masthead.tsx");
  const code = stripComments(src);

  it("masthead 不再 import computeStreak / progress.ts 学习状态路径", () => {
    expect(src).not.toMatch(/computeStreak/);
    expect(src).not.toMatch(/@\/lib\/client\/progress/);
  });

  it("masthead 不再从 localStorage 读取学习事实", () => {
    expect(code).not.toMatch(/localStorage\.(getItem|setItem|removeItem)/);
  });

  it("masthead 使用共享 hook useLearningStats", () => {
    expect(src).toMatch(/useLearningStats/);
    expect(src).toMatch(/@\/lib\/client\/use-learning-stats/);
  });

  it("masthead streak 绑定 stats.streak", () => {
    expect(code).toMatch(/learningStats\?\.streak/);
  });
});

// =============================================================
// B. Goal 当前学习概况 — server stats SSOT
// =============================================================

describe("02A-FixB: goal 页面/概览使用服务端统计", () => {
  for (const page of ["components/goals/goal-page.tsx", "components/goals/goal-overview.tsx"]) {
    const src = readFile(page);
    const code = stripComments(src);

    it(`${page} 不再调用 getStudyHistory（localStorage 学习状态路径）`, () => {
      expect(src).not.toMatch(/getStudyHistory/);
    });

    it(`${page} 不再从 localStorage 读取学习事实`, () => {
      expect(code).not.toMatch(/localStorage\.(getItem|setItem|removeItem)/);
    });

    it(`${page} 使用共享 hook useLearningStats`, () => {
      expect(src).toMatch(/useLearningStats/);
      expect(src).toMatch(/@\/lib\/client\/use-learning-stats/);
    });
  }

  it("goal-page 当前情况绑定 stats learnedCount/masteredCount/streak", () => {
    const src = readFile("components/goals/goal-page.tsx");
    const code = stripComments(src);
    expect(code).toMatch(/stats\?\.learnedCount/);
    expect(code).toMatch(/stats\?\.masteredCount/);
    expect(code).toMatch(/stats\?\.streak/);
  });

  it("stats API 提供 masteredCount（服务端已可计算，无新增库）", () => {
    const route = readFile("app/api/learning/stats/route.ts");
    expect(route).toMatch(/masteredCount/);
    expect(route).toMatch(/RECALLED_INDEPENDENTLY/);
  });
});

// =============================================================
// C. Speaking session 显式完成
// =============================================================

function makeSession(overrides: Partial<SpeakingSession> = {}): SpeakingSession {
  return {
    id: "spk-test-1",
    userId: "u1",
    questionId: "sp-p1-001",
    part: "P1",
    topic: "Daily Routine",
    question: "Do you usually have a busy day?",
    firstAnswer: null,
    firstAnalysis: null,
    secondAnswer: null,
    secondAnalysis: null,
    status: "IN_PROGRESS",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("02A-FixC: speaking session 完成路径", () => {
  it("completeSession 把 IN_PROGRESS 会话置为 COMPLETED", async () => {
    const repo = new MemorySpeakingRepository();
    await repo.createSession(makeSession());

    const completed = await repo.completeSession("spk-test-1");
    expect(completed.status).toBe("COMPLETED");

    const fetched = await repo.getSession("spk-test-1");
    expect(fetched?.status).toBe("COMPLETED");
  });

  it("completeSession 幂等：对已 COMPLETED 会话再次调用保持 COMPLETED", async () => {
    const repo = new MemorySpeakingRepository();
    await repo.createSession(makeSession({ status: "COMPLETED" }));

    const again = await repo.completeSession("spk-test-1");
    expect(again.status).toBe("COMPLETED");
  });

  it("second answer 流程保留：updateSecondAnswer 仍置 COMPLETED", async () => {
    const repo = new MemorySpeakingRepository();
    await repo.createSession(makeSession());

    const updated = await repo.updateSecondAnswer("spk-test-1", "My answer", {
      mainIssue: { dimension: "fluency", severity: "major", description: "d", suggestion: "s" },
      candidateIssues: [],
      metrics: { wordCount: 40, connectorCount: 1 },
      microDrill: null,
    } as never);

    expect(updated.status).toBe("COMPLETED");
    expect(updated.secondAnswer).toBe("My answer");
  });

  it("complete API route 存在并调用 completeSession", () => {
    const routePath = join(PROJECT_ROOT, "app/api/speaking/complete/route.ts");
    expect(existsSync(routePath)).toBe(true);
    const src = readFile("app/api/speaking/complete/route.ts");
    expect(src).toMatch(/completeSession/);
    expect(src).toMatch(/requireUser/);
    // 会话归属校验：禁止越权完成他人会话
    expect(src).toMatch(/userId !== user\.id/);
  });

  it("speaking 页面显式完成点调用 /api/speaking/complete", () => {
    const src = readFile("components/speaking/speaking-page.tsx");
    expect(src).toMatch(/\/api\/speaking\/complete/);
    // 完成点位于 handleFinish（显式用户流程结束事件），而非 mount/unmount
    expect(src).toMatch(/const handleFinish = async/);
  });

  it("speaking 页面不再直接读写 localStorage", () => {
    const src = readFile("components/speaking/speaking-page.tsx");
    const code = stripComments(src);
    expect(code).not.toMatch(/localStorage\.(getItem|setItem|removeItem)/);
  });
});

// =============================================================
// 兜底：localStorage 学习事实读取仅存于 legacy 死代码
// =============================================================

describe("02A: 活跃 UI 不再从 localStorage 读取学习事实", () => {
  const activeComponents = [
    "components/layout/masthead.tsx",
    "components/goals/goal-page.tsx",
    "components/goals/goal-overview.tsx",
    "components/learn/learn-page.tsx",
    "components/review/review-page.tsx",
    "components/speaking/speaking-page.tsx",
    "components/report/report-page.tsx",
    "components/home/today-zone.tsx",
    "components/home/progress-band.tsx",
  ];

  for (const page of activeComponents) {
    it(`${page} 不读取 localStorage 学习事实 key (events/states)`, () => {
      const src = readFile(page);
      const code = stripComments(src);
      expect(code).not.toMatch(/getItem\(\s*["'](events|states)["']\s*\)/);
      expect(code).not.toMatch(/localStorage\.\s*getItem/);
    });
  }

  it("getStudyHistory（localStorage 路径）不再被组件调用", () => {
    for (const page of activeComponents) {
      const src = readFile(page);
      expect(src).not.toMatch(/getStudyHistory/);
    }
  });
});
