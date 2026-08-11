/**
 * P0 冒烟测试
 * ------------------------------------------------------------
 * 只验证最小路径：
 *   1. 首页能加载并展示四个入口
 *   2. 登录页能加载
 *   3. POST /api/agent/message 返回合法 AgentResponse
 */
import { expect, test } from "@playwright/test";

test("首页以四张功能卡为唯一入口", async ({ page }) => {
  await page.goto("/");
  // 四个核心功能卡入口（冻结决策：首页主入口）
  await expect(page.getByRole("link", { name: /新词学习/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /今日复习/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /口语训练/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /学习报告/ })).toBeVisible();
  // 首页不渲染持久导航 tab / 菜单触发，避免与功能卡形成重复入口
  await expect(page.getByRole("button", { name: "菜单" })).toHaveCount(0);
});

test("子页渲染菜单浮层触发与返回主页", async ({ page }) => {
  await page.goto("/learn");
  // 子页才出现紧凑「菜单」触发器（替代常驻 tab）
  await expect(page.getByRole("button", { name: "菜单" })).toBeVisible();
  // 子页提供显式「返回主页」
  await expect(page.getByRole("link", { name: /主页/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "新词学习" })).toBeVisible();
});

test("登录页正常渲染", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeVisible();
});

test("Agent API 返回结构化响应", async ({ request }) => {
  const res = await request.post("/api/agent/message", {
    data: { message: "帮我学习 sustainable" },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json).toMatchObject({
    intent: expect.any(String),
    reply: expect.any(String),
    ui_action: expect.objectContaining({ type: expect.any(String) }),
    persistence_required: expect.any(Boolean),
    trace_id: expect.stringMatching(/^trc_/),
  });
});
