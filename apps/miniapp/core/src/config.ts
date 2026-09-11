/**
 * 用户自带配置：大模型 API（用户自带）与 ima 知识库凭证。
 * 纯数据层 —— 仅读写本地 StorageAdapter（els_ 前缀），不引入任何网络层。
 * 网络调用放在 apps/mini/src/lib/，避免 core 被 @tarojs/taro 污染而破坏 web 端。
 */
import { store } from "./storage/adapter";

const K_MODEL = "els_model_config";
const K_IMA = "els_ima_config";

/** 模型协议。openai = OpenAI 兼容（/chat/completions）；anthropic / gemini = 原生接口。 */
export type LlmProtocol = "openai" | "anthropic" | "gemini";

/** 用户自带大模型配置（驱动真实口语 LLM 分析） */
export interface ModelConfig {
  /** 兼容 OpenAI 的 base，例如 https://api.deepseek.com/v1 或 https://dashscope.aliyuncs.com/compatible-mode/v1 */
  baseUrl: string;
  /** 模型名，例如 deepseek-chat / qwen-plus */
  modelName: string;
  apiKey: string;
  /** 接口协议；缺省按 openai，兼容旧数据 */
  protocol?: LlmProtocol;
  /** 最近一次测试连接是否成功（本地优先，不实时 ping） */
  lastTestOk?: boolean;
}

/** 模型在线状态（本地优先）：off 未配置 / configured 已配置未测 / ready 已测通 */
export type ModelStatus = "off" | "configured" | "ready";

export function modelStatus(c: ModelConfig | null): ModelStatus {
  const cfg = c ?? DEFAULT_MODEL_CONFIG;
  const valid = Boolean(cfg.baseUrl && cfg.modelName && cfg.apiKey);
  if (!valid) return "off";
  return cfg.lastTestOk ? "ready" : "configured";
}

/** ima 知识库凭证（增强释义与口语上下文） */
export interface ImaConfig {
  clientId: string;
  apiKey: string;
  /** 可选：指定知识库 ID；留空则用默认/首个知识库 */
  knowledgeBaseId?: string;
}

/**
 * 体验版默认配置（演示用）。
 * ⚠️ 安全约束：严禁将真实密钥编译进包。正式发布前必须把 apiKey / ima apiKey 置空，
 * 改为「用户自行在『设置』页填入」或「服务端密钥保险库（/api/secrets）注入」。
 * 当前留空：设备上未配置时不会自动联网调用，需用户配置后生效（课堂演示可在本地填入自己的 Key）。
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  baseUrl: "https://api.siliconflow.cn/v1",
  modelName: "deepseek-ai/DeepSeek-V3",
  apiKey: "",
  protocol: "openai",
  lastTestOk: false,
};

export const DEFAULT_IMA_CONFIG: ImaConfig = {
  clientId: "",
  apiKey: "",
  // 知识库留空：老师在「设置 → 获取我的知识库」里选（默认列出用户账号下的库）
};

export function getModelConfig(): ModelConfig | null {
  return store.getJSON<ModelConfig>(K_MODEL) ?? DEFAULT_MODEL_CONFIG;
}

export function saveModelConfig(c: ModelConfig): void {
  store.setJSON(K_MODEL, c);
}

export function getImaConfig(): ImaConfig | null {
  return store.getJSON<ImaConfig>(K_IMA) ?? DEFAULT_IMA_CONFIG;
}

export function saveImaConfig(c: ImaConfig): void {
  store.setJSON(K_IMA, c);
}
