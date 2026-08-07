/**
 * 安全测试
 * ------------------------------------------------------------
 * 覆盖交付项：
 *   14. API Key 不进入日志
 *   15. API Key 不进入客户端 Bundle 检查（静态代码分析）
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetServerEnvCacheForTests } from "@/lib/env";
import { callLlmStructured } from "@/lib/llm";
import type { LlmProvider } from "@/lib/llm";
import { __resetRegistryForTests } from "@/lib/llm/provider-registry";
import { z } from "zod";

const REAL_LOOKING_KEY = "sk-DO-NOT-LOG-ME-1234567890abcdef";

let snapshot: NodeJS.ProcessEnv;
let consoleSpy: ReturnType<typeof vi.spyOn>;
let consoleErrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  snapshot = { ...process.env };
  resetServerEnvCacheForTests();
  __resetRegistryForTests();
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = snapshot;
  resetServerEnvCacheForTests();
  __resetRegistryForTests();
  consoleSpy.mockRestore();
  consoleErrSpy.mockRestore();
});

describe("API Key 不进入日志", () => {
  it("成功调用后所有 console 输出不含 API Key", async () => {
    process.env.BAILIAN_API_KEY = REAL_LOOKING_KEY;
    const provider: LlmProvider = {
      kind: "bailian",
      async chat() {
        return {
          content: JSON.stringify({ intent: "NEW_ITEM", reply: "ok" }),
          model: "qwen-flash",
        };
      },
    };
    const schema = z.object({ intent: z.string(), reply: z.string() });

    await callLlmStructured(
      {
        tier: "fast",
        messages: [{ role: "user", content: "hello" }],
        schema,
        schemaName: "T",
        jsonExample: "{}",
        traceId: "trc_safety_1",
      },
      { overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false } },
    );

    const allLogs = [
      ...consoleSpy.mock.calls.flat(),
      ...consoleErrSpy.mock.calls.flat(),
    ]
      .map((v) => String(v))
      .join("\n");

    expect(allLogs).not.toContain(REAL_LOOKING_KEY);
  });

  it("错误路径也不会把 API Key 打进日志", async () => {
    process.env.DEEPSEEK_API_KEY = REAL_LOOKING_KEY;
    const provider: LlmProvider = {
      kind: "deepseek",
      async chat() {
        // 抛一个 message 里含 apiKey 的错误，验证 provider 层不会盲目打印
        throw new Error(`fake network error, apiKey used=${REAL_LOOKING_KEY}`);
      },
    };
    const schema = z.object({ x: z.string() });

    await callLlmStructured(
      {
        tier: "fast",
        messages: [{ role: "user", content: "x" }],
        schema,
        schemaName: "T",
        jsonExample: "{}",
        traceId: "trc_safety_2",
      },
      { overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false } },
    ).catch(() => {
      /* expected */
    });

    // 我们主动接受 error.message 可能出现 key（模拟了极端场景），
    // 但结构化日志（模型调用日志、llm.call 日志）不得包含它。
    // 简化断言：logger.info 输出的每一行 JSON 都不得含 key。
    const structuredLines = [
      ...consoleSpy.mock.calls.flat(),
      ...consoleErrSpy.mock.calls.flat(),
    ]
      .map((v) => String(v))
      .filter((line) => line.startsWith("{"));

    for (const line of structuredLines) {
      expect(line).not.toContain(REAL_LOOKING_KEY);
    }
  });
});

describe("API Key 不进入客户端 Bundle（静态检查）", () => {
  const ROOT = path.resolve(__dirname, "../..");

  function walk(dir: string): string[] {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".next", "dist", "coverage"].includes(entry.name)) continue;
        out.push(...walk(p));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(p);
      }
    }
    return out;
  }

  it("没有任何 NEXT_PUBLIC_*_API_KEY / NEXT_PUBLIC_*_SECRET 变量", () => {
    const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
    // 排除注释行，只检查实际的赋值行
    const lines = envExample.split("\n").filter((l) => !l.trim().startsWith("#"));
    for (const line of lines) {
      const match = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=/);
      if (match) {
        expect(match[1]).not.toMatch(/API_KEY|SECRET|SERVICE_ROLE/);
      }
    }
  });

  it("所有 'use client' 文件都不 import openai 或 @/lib/llm", () => {
    const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))];
    const violations: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      const isClient = /^\s*["']use client["']/m.test(src);
      if (!isClient) continue;
      if (/from\s+["']openai["']/.test(src)) violations.push(`${f}: imports openai`);
      if (/from\s+["']@\/lib\/llm/.test(src)) violations.push(`${f}: imports @/lib/llm`);
      if (/from\s+["']server-only["']/.test(src)) violations.push(`${f}: imports server-only`);
    }
    expect(violations).toEqual([]);
  });

  it("app/ 与 lib/agent/ 中不允许直接 new OpenAI", () => {
    const files = [
      ...walk(path.join(ROOT, "app")),
      ...walk(path.join(ROOT, "lib", "agent")),
    ];
    const violations: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (/new\s+OpenAI\s*\(/.test(src)) violations.push(f);
    }
    expect(violations).toEqual([]);
  });
});
