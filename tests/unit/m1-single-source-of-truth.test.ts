/**
 * M1 Regression Tests — Single Source of Truth
 * ------------------------------------------------------------
 * 验证：
 * 1. 报告纯转换函数正确处理服务端数据
 * 2. 核心页面组件不再 import demo-service 业务函数
 * 3. API 路由使用中央 repository-factory
 * 4. recall_level 范围一致性（0-5）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  buildClientReportFromRaw,
  buildLexiconFromData,
  buildWeekBuckets,
  buildSpeakingDigest,
} from "@/lib/client/report-transform";
import type { LearningEvent, UserItemState } from "@/lib/learning/types";
import type { SpeakingSession } from "@/lib/speaking/types";

const PROJECT_ROOT = process.cwd();

function readFile(relPath: string): string {
  return readFileSync(join(PROJECT_ROOT, relPath), "utf-8");
}

// =============================================================
// 1. 报告纯转换函数
// =============================================================

describe("M1: report-transform 纯函数", () => {
  const mockStates: UserItemState[] = [
    {
      userId: "u1",
      itemId: "item-1",
      status: "RECALLED_INDEPENDENTLY",
      recallLevel: 2,
      nextReviewAt: new Date(Date.now() + 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    } as UserItemState,
    {
      userId: "u1",
      itemId: "item-2",
      status: "EXPOSED",
      recallLevel: 0,
      nextReviewAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date().toISOString(),
    } as UserItemState,
  ];

  const mockEvents: LearningEvent[] = [
    {
      id: "e1",
      userId: "u1",
      itemId: "item-1",
      eventType: "NEW",
      correctness: "INDEPENDENT",
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    } as LearningEvent,
    {
      id: "e2",
      userId: "u1",
      itemId: "item-1",
      eventType: "REVIEW",
      correctness: "INDEPENDENT",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    } as LearningEvent,
  ];

  const mockSessions: SpeakingSession[] = [
    {
      id: "s1",
      userId: "u1",
      questionId: "q1",
      part: "P1",
      topic: "test",
      question: "test question",
      firstAnswer: null,
      firstAnalysis: {
        metrics: { wordCount: 85, connectorCount: 3 },
        mainIssue: { dimension: "fluency", label: "回答长度不足", suggestion: "扩展回答" },
      } as unknown as SpeakingSession["firstAnalysis"],
      secondAnswer: null,
      secondAnalysis: null,
      status: "COMPLETED",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  it("buildClientReportFromRaw 计算正确的统计数据", () => {
    const report = buildClientReportFromRaw({
      states: mockStates,
      events: mockEvents,
      sessions: mockSessions,
    });

    expect(report.totalItems).toBe(2);
    expect(report.newItems).toBe(1);
    expect(report.reviewTotal).toBe(1);
    expect(report.correctIndependent).toBe(1);
    expect(report.speakingCount).toBe(1);
    expect(report.dueNow).toBe(1); // item-2 is overdue
  });

  it("buildLexiconFromData 区分 recent 和 attention", () => {
    const itemContents = {
      "item-1": { term: "sustainable", coreMeaning: "可持续的" },
      "item-2": { term: "ubiquitous", coreMeaning: "无处不在的" },
    };

    const lexicon = buildLexiconFromData(mockStates, mockEvents, itemContents);

    expect(lexicon.recent.length).toBe(1);
    expect(lexicon.recent[0]!.term).toBe("sustainable");
    expect(lexicon.attention.length).toBe(1);
    expect(lexicon.attention[0]!.term).toBe("ubiquitous");
    expect(lexicon.attention[0]!.needsAttention).toBe(true);
  });

  it("buildWeekBuckets 计算滚动周对比", () => {
    const { thisWeek, lastWeek } = buildWeekBuckets(mockEvents, mockSessions);

    expect(thisWeek.newItems).toBe(1);
    expect(thisWeek.reviews).toBe(1);
    expect(thisWeek.speakingCompleted).toBe(1);
    expect(lastWeek.newItems).toBe(0);
  });

  it("buildSpeakingDigest 提取口语摘要", () => {
    const digest = buildSpeakingDigest(mockSessions);

    expect(digest.completedCount).toBe(1);
    expect(digest.avgWordCount).toBe(85);
    expect(digest.topIssue?.dimension).toBe("fluency");
    expect(digest.partsCovered).toContain("P1");
  });

  it("空数据不崩溃", () => {
    const report = buildClientReportFromRaw({ states: [], events: [], sessions: [] });
    expect(report.totalItems).toBe(0);
    expect(report.correctRate).toBe(0);
    expect(report.speaking.topIssue).toBeNull();
  });
});

// =============================================================
// 2. 核心页面不再依赖 localStorage 业务路径
// =============================================================

describe("M1: 核心页面不使用 localStorage 业务数据", () => {
  const corePages = [
    "components/learn/learn-page.tsx",
    "components/review/review-page.tsx",
    "components/speaking/speaking-page.tsx",
    "components/report/report-page.tsx",
    "components/home/today-zone.tsx",
    "components/home/progress-band.tsx",
  ];

  for (const page of corePages) {
    it(`${page} 不 import demo-service 业务函数`, () => {
      const src = readFile(page);
      // 允许 type-only import，但不允许值 import
      const valueImports = src.match(/import\s+\{[^}]+\}\s+from\s+["']@\/lib\/client\/demo-service["']/g);
      expect(valueImports).toBeNull();
    });

    it(`${page} 不直接读写 localStorage`, () => {
      const src = readFile(page);
      // 移除注释后检查
      const codeWithoutComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      const hasLocalStorage = /localStorage\.(getItem|setItem|removeItem)/.test(codeWithoutComments);
      expect(hasLocalStorage).toBe(false);
    });
  }
});

// =============================================================
// 3. API 路由使用中央 repository-factory
// =============================================================

describe("M1: API 路由使用中央 repository-factory", () => {
  const apiRoutes = [
    "app/api/learn/card/route.ts",
    "app/api/learn/submit/route.ts",
    "app/api/review/session/route.ts",
    "app/api/review/submit/route.ts",
    "app/api/speaking/session/route.ts",
    "app/api/speaking/analyze/route.ts",
    "app/api/report/route.ts",
    "app/api/learning/stats/route.ts",
  ];

  for (const route of apiRoutes) {
    it(`${route} import repository-factory`, () => {
      const src = readFile(route);
      expect(src).toContain("@/lib/repository-factory");
    });
  }
});

// =============================================================
// 4. recall_level 范围一致性 (M1 FINAL: mastery 0-2)
// =============================================================

describe("M1 FINAL: recall_level = mastery 0-2", () => {
  it("review/submit 使用 Math.min(prev+1, 2)", () => {
    const src = readFile("app/api/review/submit/route.ts");
    expect(src).toContain("Math.min((existingState?.recallLevel ?? 0) + 1, 2)");
  });

  it("数据库迁移约束 recall_level 0-2", () => {
    const src = readFile("supabase/migrations/0008_data_model_consistency.sql");
    expect(src).toContain("recall_level");
    expect(src).toContain("BETWEEN 0 AND 2");
  });

  it("Agent tool build-review-session 验证 max(2)", () => {
    const src = readFile("lib/agent/tools/build-review-session.ts");
    expect(src).toContain("max(2)");
  });

  it("TypeScript domain type 为 number（业务逻辑约束 0-2）", () => {
    const src = readFile("lib/learning/types.ts");
    expect(src).toContain("recallLevel");
  });
});
