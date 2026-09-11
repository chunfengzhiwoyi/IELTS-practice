/**
 * ELS Eval Runner — UI E2E Tool（M3-P4A：010 空态引导 / 030 CompareSection 无基线）
 * ------------------------------------------------------------------
 * 复用 speaking-e2e 的 next start 基础设施（startNextServer / findFreePort / isAppBuilt）。
 * 最小真实浏览器旅程（Playwright + chromium headless）：
 *  - 010：/review 空队列 → EMPTY 空态文案 + 「学习一个新表达」引导（确定性 UI 红线）
 *  - 030：真实 /api/learn/submit 注入 1 条本周数据（无上周基线）→ /report
 *         CompareSection 必须进入空态而非编造 Δ（无基线趋势断言 S1 红线）
 *
 * 设计原则：deterministic fixture / isolated（独立端口+全新 memory DB）/ reset before run /
 * evidence-producing（结构化观察）/ timeout 可诊断（error 字段）。
 */
import type { NextServerHandle } from "./speaking-e2e";
import { chromium, type Browser, type Page } from "playwright";

export interface ReviewEmptyStateResult {
  ok: boolean;
  emptyStateVisible: boolean;
  headingText: string | null;
  guideLinkVisible: boolean;
  guideHref: string | null;
  error: string | null;
}

export interface ReportNoBaselineResult {
  ok: boolean;
  emptyNoteVisible: boolean;
  compareRowsVisible: boolean;
  sectionText: string | null;
  deltaTexts: string[];
  fabricatedDeltaVisible: boolean;
  error: string | null;
}

async function launch(port: number): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  return { browser, page };
}

/** 010：/review 空队列空态 + 引导链接 */
export async function runReviewEmptyStateE2E(port: number): Promise<ReviewEmptyStateResult> {
  let browser: Browser | null = null;
  try {
    const l = await launch(port);
    browser = l.browser;
    const page = l.page;
    await page.goto(`http://127.0.0.1:${port}/review`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    // 空态标题（语义等价：暂无到期/暂时没有需要复习的内容）
    const heading = page.locator("h2", { hasText: /没有需要复习|暂无到期/ });
    await heading.waitFor({ state: "visible", timeout: 25_000 });
    const headingText = (await heading.textContent())?.trim() ?? null;
    const emptyStateVisible = headingText != null && headingText.length > 0;

    // 引导新词学习链接
    const guide = page.locator("a", { hasText: "学习一个新表达" });
    const guideVisible = await guide.isVisible().catch(() => false);
    const guideHref = await guide.getAttribute("href").catch(() => null);

    await browser.close();
    browser = null;
    return {
      ok: emptyStateVisible && guideVisible,
      emptyStateVisible,
      headingText,
      guideLinkVisible: guideVisible,
      guideHref,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (browser) await browser.close().catch(() => undefined);
    return { ok: false, emptyStateVisible: false, headingText: null, guideLinkVisible: false, guideHref: null, error: msg.slice(0, 300) };
  }
}

/** 030：仅本周数据（无上周基线）→ CompareSection 空态 vs 编造 Δ */
export async function runReportNoBaselineE2E(port: number): Promise<ReportNoBaselineResult> {
  let browser: Browser | null = null;
  try {
    const l = await launch(port);
    browser = l.browser;
    const page = l.page;

    // 1. 通过真实 API 注入 1 条本周学习事件（无上周基线）
    const seedRes = await page.request.post(`http://127.0.0.1:${port}/api/learn/submit`, {
      data: { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "可持续的", usedHint: false, clientEventId: "evt-030-e2e" },
    });
    if (!seedRes.ok()) {
      throw new Error(`learn/submit 失败 status=${seedRes.status()}`);
    }

    // 2. 打开 /report，等待 CompareSection 渲染
    await page.goto(`http://127.0.0.1:${port}/report`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const section = page.locator("h3", { hasText: "最近七天" });
    await section.waitFor({ state: "visible", timeout: 30_000 });
    const sectionEl = section.locator("xpath=..");
    const sectionText = ((await sectionEl.textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim();

    // BC-M3-003 fix 更新空态文案（"暂无历史对比数据"）；兼容 P4A 旧文案
    const emptyNoteVisible = /暂无历史对比数据|还没有可对比的数据/.test(sectionText);
    const deltaTexts: string[] = [];
    const deltas = await sectionEl.locator(".compare-row__delta").allTextContents().catch(() => []);
    for (const d of deltas) {
      const t = d.replace(/\s+/g, " ").trim();
      if (t) deltaTexts.push(t);
    }
    // 编造 Δ 判定：显示了 ▲/▼/持平 数字差，但无上周基线（emptyNote 未出现 且 last 列显示 —）
    const compareRowsVisible = (await sectionEl.locator(".compare-row").count().catch(() => 0)) > 0;
    const fabricatedDeltaVisible = compareRowsVisible && deltaTexts.some((d) => /▲|▼/.test(d)) && !emptyNoteVisible;

    await browser.close();
    browser = null;
    return {
      ok: !fabricatedDeltaVisible,
      emptyNoteVisible,
      compareRowsVisible,
      sectionText: sectionText.slice(0, 400),
      deltaTexts,
      fabricatedDeltaVisible,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (browser) await browser.close().catch(() => undefined);
    return {
      ok: false,
      emptyNoteVisible: false,
      compareRowsVisible: false,
      sectionText: null,
      deltaTexts: [],
      fabricatedDeltaVisible: false,
      error: msg.slice(0, 300),
    };
  }
}

export type { NextServerHandle };
