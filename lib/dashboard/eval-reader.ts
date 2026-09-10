/**
 * Offline eval run reader（P5.1 可测）
 * 排序语义与 tests/eval/runner/store.ts 一致：
 * 仅保留含 results.json 的目录，按 run_id 时间戳后缀 YYYYMMDD-HHMMSS 倒序取最新。
 */
import fs from "node:fs";
import path from "node:path";

export function listRunIds(runsDir: string): string[] {
  if (!fs.existsSync(runsDir)) return [];
  return fs
    .readdirSync(runsDir)
    .filter((d) => fs.existsSync(path.join(runsDir, d, "results.json")))
    .sort((a, b) => {
      const ta = a.match(/(\d{8})-(\d{6})$/);
      const tb = b.match(/(\d{8})-(\d{6})$/);
      const ka = ta ? `${ta[1]}${ta[2]}` : a;
      const kb = tb ? `${tb[1]}${tb[2]}` : b;
      return kb.localeCompare(ka);
    });
}

export function pickLatestRunId(runsDir: string): string | null {
  const ids = listRunIds(runsDir);
  return ids[0] ?? null;
}
