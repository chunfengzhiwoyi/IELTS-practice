/**
 * ELS Eval Runner Phase 0 — vitest config
 * ------------------------------------------------------------
 * 与主 vitest.config.ts 相同的 alias（@ → repo root, server-only → stub），
 * 仅 include eval 文件，setupFiles 指向 eval 环境基线。
 *
 * M3-P3：testTimeout 提升至 240s——C 级 special-tool case（034 E2E）需要
 * next start 就绪（≤120s）+ Playwright 浏览器旅程（≤60s）。
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
  // M3-04（EVAL-RUN-M3-04）：产品组件（compare-section.tsx / speaking-feedback.tsx）以
  // "jsx: react-jsx" 编译（无显式 React import），esbuild 需启用 automatic runtime，
  // 否则 eval 内 renderToStaticMarkup（030 true-zero/per-row-null guard、019 UI containment）
  // 报 "React is not defined"。RUNNER_PATCH_REASON：runner 兼容 patch，不改产品/Frozen Gold。
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    // 仅 master 入口（tests/eval/phase0.eval.ts）；cases/ 下是 case 定义，不是测试套件
    include: ["tests/eval/*.eval.ts"],
    globals: true,
    setupFiles: ["./tests/eval/runner/setup.ts"],
    testTimeout: 240_000,
  },
});
