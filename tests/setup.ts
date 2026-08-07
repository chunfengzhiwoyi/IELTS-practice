/**
 * Vitest 全局 setup
 * ------------------------------------------------------------
 * Next.js 会自动加载 .env.local，Vitest 不会。这里用 Node 20+ 内置的
 * process.loadEnvFile 把本地环境变量注入测试进程。
 * 使用 try/catch 以便文件缺失时也不阻断测试。
 */
import path from "node:path";
import process from "node:process";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
try {
  const before = { ...process.env };
  process.loadEnvFile(envLocalPath);
  // 恢复被 loadEnvFile 覆盖的显式变量，让 CI/上游注入的值优先
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value;
  }
} catch {
  // 文件不存在或不可读，忽略；测试自行断言
}
