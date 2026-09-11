/**
 * ELS-EVAL-026 — RETRIEVAL_KNOWLEDGE（知识冲突：检测 + 消解可追踪，矛盾不进词卡）
 * V1 知识库无真实冲突对 → 按 Gold 许可注入 fake-fixture（provenance=fake-fixture，
 * 运行时替换知识文件 + finally 恢复，走真实 loader，不修改产品代码）。
 * 注入两条 register 冲突对象（同 context=writing-task2，互斥语域指引）：
 *   断言 (1) 检索层/提示层检测到冲突并处理（conflict_resolution 可追踪）；
 *   断言 (2) 最终注入 prompt 的 guidance 不并列互斥断言。
 * 若产品无冲突检测 → 矛盾 guidance 并列注入 → 按 Gold failure_criteria 记 FAIL → 登记 Bad Case。
 */
import fs from "node:fs";
import path from "node:path";
import { retrieveKnowledge, __resetKnowledgeCacheForTests } from "@/lib/knowledge/retrieval";
import type { EvalCaseDefinition } from "../runner/harness";
import { T0_ISO } from "./helpers";

const KB_PATH = path.resolve(process.cwd(), "data/knowledge/knowledge-objects-v1.json");

/** fake-fixture：同 context 互斥 register 指引（provenance=fake-fixture，Gold 026 许可） */
const FIXTURE_A = {
  id: "fx-register-conflict-a",
  type: "lexical_guidance",
  sourceType: "eval_fixture",
  title: "Fixture 语域指引 A",
  tags: ["writing"],
  content: {
    guidanceType: "register_note",
    appliesTo: { contexts: ["writing-task2"], itemTypes: ["WORD", "PHRASE", "CHUNK"] },
    guidance: "该词在正式学术写作中必须使用（fixture 冲突对 A）。",
    examples: [],
    antiExamples: [],
  },
};

const FIXTURE_B = {
  id: "fx-register-conflict-b",
  type: "lexical_guidance",
  sourceType: "eval_fixture",
  title: "Fixture 语域指引 B",
  tags: ["writing"],
  content: {
    guidanceType: "register_note",
    appliesTo: { contexts: ["writing-task2"], itemTypes: ["WORD", "PHRASE", "CHUNK"] },
    guidance: "该词在正式写作中应避免使用（fixture 冲突对 B）。",
    examples: [],
    antiExamples: [],
  },
};

export const case_026: EvalCaseDefinition = {
  case_id: "ELS-EVAL-026",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    const backup = fs.readFileSync(KB_PATH, "utf8");
    const original = JSON.parse(backup);
    let conflictsInjected = false;
    let injected = { fxA: false, fxB: false };
    try {
      // fixture 前置（unshift）：检索最多 5 条命中（slice(0,5)），必须保证 fixture 在截断前被匹配
      fs.writeFileSync(KB_PATH, JSON.stringify([FIXTURE_A, FIXTURE_B, ...original], null, 2));
      __resetKnowledgeCacheForTests();

      // term "deteriorate"（命中 pt-topic-environment）+ context=writing-task2 → 两条冲突指引同时命中
      const result = retrieveKnowledge({ term: "deteriorate", currentContext: "writing-task2" });
      injected = {
        fxA: result.knowledgeObjectIds.includes("fx-register-conflict-a"),
        fxB: result.knowledgeObjectIds.includes("fx-register-conflict-b"),
      };
      conflictsInjected = injected.fxA && injected.fxB;

      const promptText = result.promptContext ?? "";
      const hasConflictA = promptText.includes("必须使用");
      const hasConflictB = promptText.includes("应避免使用");
      // 产品是否输出消解记录（conflict_resolution / 差异提示）？
      const resolutionPresent =
        /conflict|冲突|消解|差异提示|取舍/.test(promptText) &&
        promptText.includes("conflict_resolution") === false; // prompt 文本不含结构化消解字段
      const structuredResolution = JSON.stringify(result).includes("conflict_resolution");

      ctx.rec.check(
        "r-conflict-detected",
        "检索层/提示层检测到冲突并处理（conflict_resolution 非空、可追踪）",
        { conflictDetected: true, resolutionTracked: true },
        {
          conflictDetected: hasConflictA && hasConflictB,
          resolutionTracked: structuredResolution,
        },
        {
          failure_layer: "RETRIEVAL",
          evidence: {
            provenance: "fake-fixture",
            fixtureIds: ["fx-register-conflict-a", "fx-register-conflict-b"],
            knowledgeObjectIds: result.knowledgeObjectIds,
            promptContextSnippet: promptText.slice(0, 500),
            note: "产品无冲突检测/消解字段时此行为 FAIL（Gold 026 failure_criteria：矛盾内容进入且无可追踪消解记录）",
          },
        },
      );

      ctx.rec.check(
        "r-no-contradiction",
        "最终注入的 guidance 不并列互斥断言（无直接矛盾对并存且无差异说明）",
        { noContradictionPair: true },
        { noContradictionPair: !(hasConflictA && hasConflictB && !resolutionPresent) },
        {
          failure_layer: "PROMPT",
          evidence: { promptContextSnippet: promptText.slice(0, 500), hasConflictA, hasConflictB, resolutionPresent },
        },
      );

      ctx.rec.check(
        "r-fixture-hit",
        "fixture 冲突对象均被检索命中（场景可达，provenance=fake-fixture）",
        { injected: true },
        { injected: conflictsInjected },
        { failure_layer: "RETRIEVAL", evidence: { injected } },
      );
    } finally {
      fs.writeFileSync(KB_PATH, backup);
      __resetKnowledgeCacheForTests();
    }

    return {
      coverage: "full",
      actualSummary: conflictsInjected
        ? "fixture 冲突对同时命中 → 冲突 guidance 并列注入 prompt 且无消解记录（产品无冲突检测机制）→ 按 Gold 记 FAIL，登记 Bad Case（S2 内容质量，provenance=fake-fixture）。"
        : "fixture 未同时命中，场景不可达（BLOCKED 语义）。",
      notes:
        "A 级确定性断言。Gold 026 明确允许 fixture 注入并注明 provenance=fake-fixture；运行时替换知识文件 + finally 恢复，未修改产品代码。" +
        "若 FAIL：登记 bad-case-registry（RETRIEVAL/PROMPT，S2），不修产品。",
    };
  },
};
