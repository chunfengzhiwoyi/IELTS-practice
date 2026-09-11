/**
 * ELS Eval Runner — Speaking E2E Tool（C 级 Special Tool：ELS-EVAL-034）
 * ------------------------------------------------------------------
 * 最小真实浏览器旅程（Playwright + next start）：
 *  - /speaking 页面：文字输入回退路径可达（默认文字模式 textarea 可用）
 *  - 语音模式：假麦克风录制 → 提交 → STT 失败（无 Whisper Key → 503）
 *  - 失败提示（alert）出现后，文字模式仍可切回（回退不阻塞流程）
 *
 * 设计原则：
 *  - deterministic fixture（fake media stream / 无外部 Key）
 *  - isolated（独立端口；每次运行独立 browser context）
 *  - reset before run（每次全新 launch；server 每次 spawn）
 *  - evidence artifact（返回结构化观察结果供 adapter 断言）
 *  - 超时/失败可诊断（error 字段；server stdout 尾部留存）
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

export interface SpeakingE2EResult {
  ok: boolean;
  textareaReachable: boolean;
  typedValue: string | null;
  voiceRecorderVisible: boolean;
  voiceErrorAlert: string | null;
  fallbackAfterError: boolean;
  error: string | null;
  serverLogTail: string | null;
}

// ------------------------------------------------------------------
// 本地 5xx 上游模拟（行 2：注入上游 5xx）
// ------------------------------------------------------------------
export interface FivexxServer {
  port: number;
  close(): Promise<void>;
}

export function start5xxServer(): Promise<FivexxServer> {
  const server = http.createServer((_req, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "upstream simulation (eval)" }));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("5xx mock server: no port"));
        return;
      }
      resolve({ port: addr.port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

// ------------------------------------------------------------------
// next start server（E2E 用）
// ------------------------------------------------------------------
export interface NextServerHandle {
  port: number;
  stop(): Promise<void>;
}

/** 动态获取一个空闲端口（避免与既有进程冲突） */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("findFreePort: no port")));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

export function isAppBuilt(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, ".next", "BUILD_ID"));
}

export async function startNextServer(port: number): Promise<NextServerHandle> {
  const cwd = process.cwd();
  const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) {
    throw new Error(`next bin 不存在: ${nextBin}`);
  }

  const serverEnv: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v != null)) as Record<string, string>,
    DATA_PROVIDER: "memory",
    AUTH_MODE: "demo",
    DEMO_REVIEW_SEED_ENABLED: "false",
    LLM_PRIMARY_PROVIDER: "mock",
    LLM_FALLBACK_ENABLED: "false",
    LLM_MOCK_ENABLED: "true",
    NODE_ENV: "production",
    // 行 1 场景：不配置任何 STT Key（空串 → 路由 !openaiKey → 503 CONFIG_ERROR）
    OPENAI_API_KEY: "",
    DEEPSEEK_API_KEY: "",
    WHISPER_BASE_URL: "",
  };

  const spawnOpts: import("node:child_process").SpawnOptions = {
    cwd,
    env: serverEnv as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"] as const,
    windowsHide: true,
  };
  const child: ChildProcess = spawn(process.execPath, [nextBin, "start", "-p", String(port)], spawnOpts);

  let stdoutTail = "";
  let stderrTail = "";
  child.stdout?.on("data", (d: Buffer) => {
    stdoutTail = (stdoutTail + d.toString()).slice(-4000);
  });
  child.stderr?.on("data", (d: Buffer) => {
    stderrTail = (stderrTail + d.toString()).slice(-4000);
  });

  // 等待就绪：GET /speaking 200
  const deadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start 提前退出 code=${child.exitCode}: ${stderrTail || stdoutTail}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/speaking`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // 未就绪，重试
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!ready) {
    await stopChild(child);
    throw new Error(`next start 120s 未就绪: ${stderrTail || stdoutTail}`);
  }

  return {
    port,
    stop: async () => {
      await stopChild(child);
    },
  };
}

function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    try {
      child.kill();
    } catch {
      resolve();
    }
    // 兜底：Windows 树杀
    setTimeout(() => {
      try {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        // ignore
      }
    }, 2000);
  });
}

// ------------------------------------------------------------------
// Playwright 最小 journey
// ------------------------------------------------------------------
export async function runSpeakingE2E(port: number): Promise<SpeakingE2EResult> {
  let browser: Awaited<ReturnType<typeof import("playwright").chromium.launch>> | null = null;
  const baseResult: SpeakingE2EResult = {
    ok: false,
    textareaReachable: false,
    typedValue: null,
    voiceRecorderVisible: false,
    voiceErrorAlert: null,
    fallbackAfterError: false,
    error: null,
    serverLogTail: null,
  };
  try {
    const browserRef = await chromium.launch({
      headless: true,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--no-sandbox",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });
    browser = browserRef;
    const context = await browser.newContext();
    const page = await context.newPage();

    let alertMsg: string | null = null;
    page.on("dialog", async (d) => {
      alertMsg = d.message();
      await d.dismiss();
    });

    // 1. 打开 /speaking → 题型选择（Part 卡片）→ 进入 Part 1 会话 → 文字模式 textarea 可达
    await page.goto(`http://127.0.0.1:${port}/speaking`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    const part1 = page.getByRole("button", { name: /Part 1/ });
    await part1.waitFor({ state: "visible", timeout: 20_000 });
    await part1.click();
    const textarea = page.locator("textarea");
    await textarea.waitFor({ state: "visible", timeout: 25_000 });
    const SAMPLE = "My favourite place is a quiet park near my home where I like to walk every evening.";
    await textarea.fill(SAMPLE);
    const typedValue = await textarea.inputValue();
    const textareaReachable = typedValue === SAMPLE;

    // 2. 切到语音模式 → 录音器可达
    await page.getByRole("button", { name: /语音回答/ }).click();
    const recordBtn = page.getByRole("button", { name: "开始录音" });
    await recordBtn.waitFor({ state: "visible", timeout: 10_000 });
    const voiceRecorderVisible = await recordBtn.isVisible();

    // 3. 假麦克风录制 → 结束 → 提交 → STT 失败 alert
    await recordBtn.click();
    await page.waitForTimeout(1600);
    const stopBtn = page.getByRole("button", { name: "结束录音" });
    await stopBtn.waitFor({ state: "visible", timeout: 10_000 });
    await stopBtn.click();
    const voiceSubmit = page.getByRole("button", { name: "提交 AI 分析" });
    await voiceSubmit.waitFor({ state: "visible", timeout: 15_000 });
    await voiceSubmit.click();
    await page.waitForTimeout(3000); // transcribe 503 + alert

    // 4. 失败后文字模式仍可达（回退不阻塞）
    await page.getByRole("button", { name: /文字回答/ }).click();
    const ta2 = page.locator("textarea");
    const fallbackAfterError = await ta2.isVisible().catch(() => false);

    await browser.close();
    browser = null;

    return {
      ok: textareaReachable && voiceRecorderVisible && fallbackAfterError,
      textareaReachable,
      typedValue,
      voiceRecorderVisible,
      voiceErrorAlert: alertMsg,
      fallbackAfterError,
      error: null,
      serverLogTail: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await browser?.close();
    } catch {
      // ignore
    }
    return { ...baseResult, error: msg.slice(0, 500) };
  }
}
