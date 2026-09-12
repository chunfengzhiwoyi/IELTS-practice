/**
 * Eval Runner — vitest config（PRODUCT-LOOP-04 系列）
 * ------------------------------------------------------------
 * 与 tests/eval/vitest.config.ts 相同的 alias（@ → repo root, server-only → stub），
 * 但 include 针对 *.test.ts 格式的 eval 套件（04C harness / 04-FINAL-E2E real path）。
 * 通过 CLI 文件路径过滤可只跑单个文件：
 *   npx vitest run --config tests/eval/vitest.eval.config.ts tests/eval/product-loop-04-final-e2e-real.test.ts
 *
 * 注意：不使用 tests/eval/runner/setup.ts（该基线强制 mock 并删除真实凭据）。
 * 真实 LLM 套件自行注入 env（.env.local 由外部 PowerShell 载入进程；本 config 无 setupFiles，
 * 确保注入的 provider/凭据直达产品 runtime）。
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@": repoRoot,
      "server-only": resolve(repoRoot, "tests/stubs/server-only.ts"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["tests/eval/**/*.test.ts"],
    globals: true,
    testTimeout: 240_000,
  },
});
