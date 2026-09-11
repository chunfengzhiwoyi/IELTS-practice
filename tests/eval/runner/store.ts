/**
 * ELS Eval Runner — Result Persistence（§1）
 * ------------------------------------------------------------
 * 结果落盘：docs/eval/runs/<run_id>/results.json
 * 该文件是 baseline / m3 文档生成器的唯一输入。
 */
import fs from "node:fs";
import path from "node:path";

import type { RunResults } from "./types";

const RUNS_DIR = "docs/eval/runs";

export function writeRunResults(results: RunResults): string {
  const dir = path.resolve(process.cwd(), RUNS_DIR, results.manifest.run_id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "results.json");
  fs.writeFileSync(file, JSON.stringify(results, null, 2), "utf-8");
  return file;
}

export function listRunIds(): string[] {
  const dir = path.resolve(process.cwd(), RUNS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, "results.json")))
    .sort();
}

export function readRunResults(runId: string): RunResults {
  const file = path.resolve(process.cwd(), RUNS_DIR, runId, "results.json");
  return JSON.parse(fs.readFileSync(file, "utf-8")) as RunResults;
}

export function latestRunResults(): RunResults {
  const ids = listRunIds();
  if (ids.length === 0) {
    throw new Error("没有可用的 eval run（docs/eval/runs 为空）——请先运行 eval runner");
  }
  // 按 run_id 时间戳后缀倒序取最新（前缀不保证字典序）
  const latest = [...ids].sort((a, b) => {
    const ta = a.match(/(\d{8})-(\d{6})$/);
    const tb = b.match(/(\d{8})-(\d{6})$/);
    const keyA = ta ? `${ta[1]}${ta[2]}` : a;
    const keyB = tb ? `${tb[1]}${tb[2]}` : b;
    return keyB.localeCompare(keyA);
  })[0];
  if (!latest) {
    throw new Error("没有可用的 eval run（docs/eval/runs 为空）");
  }
  return readRunResults(latest);
}
