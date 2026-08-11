/**
 * Knowledge Retrieval V1 — 结构化规则检索
 * ------------------------------------------------------------
 * 不使用 embedding、RAG 或向量数据库。
 * 基于 associatedTerms 匹配和 context 过滤。
 */
import fs from "node:fs";
import path from "node:path";

import type {
  KnowledgeObject,
  ProjectTaxonomyObject,
  LexicalGuidanceObject,
  RetrievalQuery,
  RetrievalResult,
  RetrievalMatch,
  ExamContext,
} from "@/lib/knowledge/types";

let _cache: KnowledgeObject[] | null = null;

function loadKnowledgeObjects(): KnowledgeObject[] {
  if (_cache) return _cache;
  const filePath = path.resolve(process.cwd(), "data/knowledge/knowledge-objects-v1.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  _cache = JSON.parse(raw) as KnowledgeObject[];
  return _cache;
}

/**
 * 检索与给定 term 和 context 相关的知识对象。
 * 最多返回 5 个命中。
 */
export function retrieveKnowledge(query: RetrievalQuery): RetrievalResult {
  const objects = loadKnowledgeObjects();
  const normalizedTerm = query.term.toLowerCase().trim();
  const context = query.currentContext ?? "general";
  const matches: RetrievalMatch[] = [];

  // Rule 1: Topic taxonomy — term 出现在 associatedTerms 中
  for (const obj of objects) {
    if (obj.type === "project_taxonomy" && obj.content.dimension === "topic") {
      const taxonomy = obj as ProjectTaxonomyObject;
      const terms = taxonomy.content.associatedTerms ?? [];
      if (terms.some((t) => normalizedTerm.includes(t.toLowerCase()) || t.toLowerCase().includes(normalizedTerm))) {
        matches.push({ object: obj, matchReason: `term "${normalizedTerm}" matches topic "${taxonomy.content.value}" associatedTerms` });
      }
    }
  }

  // Rule 2: Context-specific lexical guidance
  if (context !== "general") {
    for (const obj of objects) {
      if (obj.type === "lexical_guidance") {
        const lg = obj as LexicalGuidanceObject;
        const contexts = lg.content.appliesTo.contexts ?? [];
        if (contexts.includes(context)) {
          // 避免重复
          if (!matches.some((m) => m.object.id === obj.id)) {
            matches.push({ object: obj, matchReason: `context "${context}" matches guidance appliesTo` });
          }
        }
      }
    }
  }

  // Rule 3: 如果有 topic 命中，拉入相关 topic 的 lexical guidance
  const matchedTopics = matches
    .filter((m) => m.object.type === "project_taxonomy")
    .map((m) => (m.object as ProjectTaxonomyObject).content.value);

  if (matchedTopics.length > 0) {
    for (const obj of objects) {
      if (obj.type === "lexical_guidance") {
        const lg = obj as LexicalGuidanceObject;
        const topics = lg.content.appliesTo.topics ?? [];
        if (topics.some((t) => matchedTopics.includes(t))) {
          if (!matches.some((m) => m.object.id === obj.id)) {
            matches.push({ object: obj, matchReason: `topic overlap: ${matchedTopics.join(",")}` });
          }
        }
      }
    }
  }

  // Rule 4: 始终注入一条相关 official_exam_rule（基于 context 推断 skill）
  const skill = contextToSkill(context);
  if (skill) {
    const relevant = objects.find(
      (obj) => obj.type === "official_exam_rule" && obj.tags.includes(skill) && obj.tags.includes("lexical-resource"),
    );
    if (relevant && !matches.some((m) => m.object.id === relevant.id)) {
      matches.push({ object: relevant, matchReason: `default official rule for skill "${skill}"` });
    }
  }

  // 限制最多 5 个
  const finalMatches = matches.slice(0, 5);

  // 生成 prompt context
  const promptContext = finalMatches.length > 0 ? buildPromptContext(finalMatches, context) : null;

  return {
    matched: finalMatches,
    promptContext,
    knowledgeObjectIds: finalMatches.map((m) => m.object.id),
  };
}

// =============================================================
// Helpers
// =============================================================

function contextToSkill(ctx: ExamContext): "speaking" | "writing" | null {
  if (ctx.startsWith("speaking")) return "speaking";
  if (ctx.startsWith("writing")) return "writing";
  return null;
}

function buildPromptContext(matches: RetrievalMatch[], context: ExamContext): string {
  const sections: string[] = [];

  // Topics
  const topics = matches
    .filter((m) => m.object.type === "project_taxonomy")
    .map((m) => (m.object as ProjectTaxonomyObject).content);
  if (topics.length > 0) {
    sections.push(`话题归属（项目内部分类）：${topics.map((t) => t.value).join("、")}`);
  }

  // Context
  if (context !== "general") {
    sections.push(`当前学习语境：${context}`);
  }

  // Lexical guidance
  const guidances = matches
    .filter((m) => m.object.type === "lexical_guidance")
    .map((m) => m.object as LexicalGuidanceObject);
  for (const lg of guidances) {
    sections.push(`[${lg.title}] ${lg.content.guidance}`);
  }

  // Official rules
  const officials = matches.filter((m) => m.object.type === "official_exam_rule");
  for (const o of officials) {
    const content = o.object.content as { scope: string; rules: string[] };
    sections.push(`[官方标准] ${content.scope}：${content.rules.slice(0, 2).join("；")}`);
  }

  return sections.join("\n");
}

/** 测试用：重置缓存 */
export function __resetKnowledgeCacheForTests(): void {
  _cache = null;
}
