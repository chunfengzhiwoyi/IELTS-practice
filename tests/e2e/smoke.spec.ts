/**
 * P0 冒烟测试
 * ------------------------------------------------------------
 * 只验证最小路径：
 *   1. 首页能加载并展示四个入口
 *   2. 登录页能加载
 *   3. POST /api/agent/message 返回合法 AgentResponse
 */
import { expect, test } from "@playwright/test";

test("首页正常渲染", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "英语高效学习助手" })).toBeVisible();
  await expect(page.getByText("新词学习")).toBeVisible();
  await expect(page.getByText("今日复习")).toBeVisible();
  await expect(page.getByText("口语训练")).toBeVisible();
  await expect(page.getByText("学习报告")).toBeVisible();
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
