/**
 * ELS Eval Runner Phase 0 — Environment Snapshot（§1）
 * ------------------------------------------------------------
 * 记录运行时的 git commit / branch / node / vitest 版本等。
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { loadSpec } from "./spec-loader";
import type { RunManifest } from "./types";

function git(query: string): string {
  try {
    return execSync(query, { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function vitestVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "node_modules/vitest/package.json"), "utf-8"),
    ) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

export function createRunManifest(subsetCaseIds: string[]): RunManifest {
  const spec = loadSpec();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;

  return {
    run_id: `m3-${stamp}`,
    spec: spec.meta.spec,
    spec_version: spec.meta.spec_version,
    case_set_version: spec.meta.case_set_version,
    spec_case_count: spec.cases.length,
    subset_case_ids: subsetCaseIds,
    git: {
      commit: git("git rev-parse HEAD"),
      branch: git("git rev-parse --abbrev-ref HEAD"),
      worktree_path: process.cwd(),
      dirty: git("git status --porcelain") !== "",
    },
    environment: {
      node: process.version,
      vitest: vitestVersion(),
      data_provider: process.env.DATA_PROVIDER ?? "memory",
      auth_mode: process.env.AUTH_MODE ?? "demo",
      llm_provider: process.env.LLM_PRIMARY_PROVIDER ?? "mock",
      os: `${process.platform} ${process.arch}`,
    },
    started_at: now.toISOString(),
  };
}
