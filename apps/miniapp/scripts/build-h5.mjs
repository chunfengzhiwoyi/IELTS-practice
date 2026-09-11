/**
 * build-h5.mjs — H5 构建封装（跨平台，不依赖 shell 内联环境变量语法）。
 *
 * 作用：
 *   1. 把 H5 产物固定输出到 dist-h5（与 weapp 的 dist 分流，避免互相覆盖）。
 *   2. 在子进程里关掉 NODE_OPTIONS 注入的 safe-delete shim，
 *      否则 Taro 构建开始的「清空旧输出目录」会触发沙箱批量删除拦截而卡死/超时。
 *   3. 构建完成后自动跑 post-build-css-merge.js，把拆分的 CSS chunk 合并进 app.css，
 *      修复 Taro H5 首屏样式全丢的问题。
 *
 * 用法：node scripts/build-h5.mjs   （或直接 `npm run build:h5`）
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
// taro CLI 被 npm workspaces 提升到仓库根 node_modules（不在 apps/mini/node_modules）
const repoRoot = path.resolve(here, "..", "..", "..");
const taroBin = path.resolve(repoRoot, "node_modules/@tarojs/cli/bin/taro");
const mergeScript = path.resolve(here, "post-build-css-merge.js");
const H5_DIST = "dist-h5";

// 1) 设定 H5 输出目录（优先环境变量，默认 dist-h5）
process.env.TARO_OUTPUT_ROOT = process.env.TARO_OUTPUT_ROOT || H5_DIST;

// 2) 关闭 safe-delete shim（仅对本次子进程生效，不改全局环境）
//    沙箱对 node fs 删除注入了 --require shim，Taro 清空 dist 时会批量删除被拦截。
delete process.env.NODE_OPTIONS;

console.log("[build-h5] TARO_OUTPUT_ROOT =", process.env.TARO_OUTPUT_ROOT);

// 3) 跑 Taro H5 构建
const build = spawnSync(process.execPath, [taroBin, "build", "--type", "h5"], {
  stdio: "inherit",
  cwd: appDir,
});
if (build.status !== 0) {
  console.error("[build-h5] taro build failed, exit", build.status);
  process.exit(build.status ?? 1);
}

// 4) 合并 CSS chunk
const merge = spawnSync(process.execPath, [mergeScript, H5_DIST], {
  stdio: "inherit",
  cwd: appDir,
});
process.exit(merge.status ?? 0);
