/**
 * LLM 统一类型定义
 * ------------------------------------------------------------
 * 业务层（Agent / Domain 服务）只依赖本文件的类型，
 * 不感知具体 Provider（mock / bailian / deepseek）。
 */
import type { z } from "zod";

import type { ProviderKind } from "@/lib/env";

export type { ProviderKind };

/**
 * 模型等级
 *  - fast：意图识别、关键信息提取、简单分类、JSON 修复
 *  - main：词卡生成、口语回答分析、微训练、学习报告
 */
export type ModelTier = "fast" | "main";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmChatRequest {
  tier: ModelTier;
  messages: LlmMessage[];
  /** true 时要求 provider 使用 json_object / json_schema 模式 */
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** 由调用方生成并透传，Provider 只用于日志 */
  traceId: string;
  signal?: AbortSignal;
}

export interface LlmUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export interface LlmChatResponse {
  /** Provider 原始返回的字符串；可能为空，pipeline 会处理 */
  content: string;
  /** 实际使用的模型名 */
  model: string;
  usage?: LlmUsage;
}

/** 结构化调用的入参（业务层最常用） */
export interface LlmStructuredRequest<T> {
  tier: ModelTier;
  messages: LlmMessage[];
  schema: z.ZodType<T>;
  /** 用于日志 & 修复重试提示 */
  schemaName: string;
  /** JSON 示例字符串，会拼进修复重试的提示词 */
  jsonExample: string;
  traceId: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LlmStructuredResponse<T> {
  data: T;
  meta: {
    provider: ProviderKind;
    model: string;
    fallbackUsed: boolean;
    repairUsed: boolean;
    latencyMs: number;
    traceId: string;
  };
}
