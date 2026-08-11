/**
 * Knowledge Layer V1 — 类型定义
 * ------------------------------------------------------------
 * 三类知识以 discriminated union 强绑定 type 与 content。
 * 所有知识对象必须带 provenance，区分官方来源和项目内部规则。
 */

// =============================================================
// Provenance
// =============================================================

export interface OfficialProvenance {
  sourceType: "official";
  sourceTitle: string;
  /** 来源 URL 或出版物标识 */
  sourceId: string;
  /** 项目实际检索/录入该知识的时间 */
  retrievedAt: string;
  /** 仅当来源明确提供版本号时填写 */
  sourceVersion?: string;
  /** 仅当来源明确提供更新时间时填写 */
  updatedAt?: string;
  /** 具体定位：criterion / section / band range */
  sourceLocator?: string;
}

export interface ProjectAuthoredProvenance {
  sourceType: "project_authored";
  sourceTitle: string;
  sourceId: string;
  updatedAt: string;
}

export type Provenance = OfficialProvenance | ProjectAuthoredProvenance;

// =============================================================
// Content Schemas (per type)
// =============================================================

export interface OfficialExamRuleContent {
  scope: string;
  rules: string[];
  skills: Array<"speaking" | "writing" | "reading" | "listening">;
  sections?: string[];
}

export interface ProjectTaxonomyContent {
  dimension: "topic" | "lexical_function" | "register" | "item_type";
  value: string;
  description: string;
  associatedTerms?: string[];
  children?: string[];
}

export interface LexicalGuidanceContent {
  guidanceType:
    | "collocation_pattern"
    | "register_note"
    | "paraphrase_strategy"
    | "appropriacy_rule"
    | "idiomatic_usage";
  appliesTo: {
    topics?: string[];
    contexts?: string[];
    itemTypes?: Array<"WORD" | "PHRASE" | "CHUNK">;
  };
  guidance: string;
  examples?: string[];
  antiExamples?: string[];
}

// =============================================================
// Discriminated Union: KnowledgeObject
// =============================================================

interface KnowledgeObjectBase {
  id: string;
  title: string;
  provenance: Provenance;
  tags: string[];
}

export interface OfficialExamRuleObject extends KnowledgeObjectBase {
  type: "official_exam_rule";
  content: OfficialExamRuleContent;
}

export interface ProjectTaxonomyObject extends KnowledgeObjectBase {
  type: "project_taxonomy";
  content: ProjectTaxonomyContent;
}

export interface LexicalGuidanceObject extends KnowledgeObjectBase {
  type: "lexical_guidance";
  content: LexicalGuidanceContent;
}

export type KnowledgeObject =
  | OfficialExamRuleObject
  | ProjectTaxonomyObject
  | LexicalGuidanceObject;

// =============================================================
// Retrieval Interface
// =============================================================

export type ExamContext =
  | "general"
  | "speaking-part1"
  | "speaking-part2"
  | "speaking-part3"
  | "writing-task1"
  | "writing-task2";

export interface RetrievalQuery {
  term: string;
  currentContext?: ExamContext;
}

export interface RetrievalMatch {
  object: KnowledgeObject;
  matchReason: string;
}

export interface RetrievalResult {
  matched: RetrievalMatch[];
  /** 为 LLM system prompt 准备的上下文摘要；null = 无命中 */
  promptContext: string | null;
  /** 命中的知识对象 ID 列表（用于 generationMeta 持久化） */
  knowledgeObjectIds: string[];
}

// =============================================================
// LearningItem IELTS Metadata
// =============================================================

export interface IeltsItemMetadata {
  skills?: Array<"speaking" | "writing" | "reading" | "listening">;
  contexts?: Array<
    | "speaking-part1"
    | "speaking-part2"
    | "speaking-part3"
    | "writing-task1"
    | "writing-task2"
  >;
  topics?: string[];
  lexicalFunctions?: Array<
    | "cause-effect"
    | "comparison"
    | "opinion-expression"
    | "exemplification"
    | "concession"
    | "emphasis"
    | "hedging"
    | "quantification"
    | "temporal-sequence"
    | "generalization"
  >;
  register?: "formal" | "neutral" | "informal";
  descriptorFocus?: Array<
    | "lexical-resource"
    | "grammatical-range"
    | "coherence-cohesion"
    | "task-response"
    | "fluency-coherence"
    | "pronunciation"
  >;
}

// =============================================================
// Generation Metadata (persisted with LearningItem)
// =============================================================

export interface GenerationMeta {
  knowledgeLayerVersion: "v1";
  knowledgeObjectIds: string[];
  promptVersion: string;
}
