/**
 * FailureLayer 中文展示名（presentation-only）。
 * C3：canonical enum 不变；这里只把层名映射为 Dashboard 上显示的中文。
 * UNKNOWN 必须独立显示为“待归因”，不得并入其他层。
 */
import type { FailureLayer } from "./types";

export const FAILURE_LAYER_LABELS: Record<FailureLayer, string> = {
  INPUT: "输入",
  ROUTING: "意图路由",
  STATE_READ: "状态读取",
  RETRIEVAL: "知识检索",
  PROMPT: "提示词",
  MODEL: "模型推理",
  OUTPUT_VALIDATION: "输出校验",
  BUSINESS_RULE: "业务规则",
  STATE_WRITE: "状态写入",
  REPORT_AGGREGATION: "报告聚合",
  FALLBACK: "降级兜底",
  UI_PRESENTATION: "界面呈现",
  UNKNOWN: "待归因",
};

export function failureLayerLabel(layer: FailureLayer): string {
  return FAILURE_LAYER_LABELS[layer] ?? layer;
}
