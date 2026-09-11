/**
 * 市场主流模型厂商目录（纯数据，client-safe，配置页与测试连接共用）。
 * 选预设时自动带出 protocol + baseUrl + model；protocol 对用户隐藏。
 */
import type { LlmProtocol } from "./config";

export type ProviderGroup = "cn" | "overseas" | "custom";

export interface LlmProvider {
  key: string;
  label: string;
  group: ProviderGroup;
  protocol: LlmProtocol;
  baseUrl: string;
  model: string;
  authHint: string;
}

export const PROVIDER_CATALOG: LlmProvider[] = [
  // ---------------- 国内 ----------------
  {
    key: "deepseek",
    label: "DeepSeek",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    authHint: "OpenAI 兼容接口：请求头带 Authorization: Bearer <你的 Key>。",
  },
  {
    key: "bailian",
    label: "阿里云百炼 · 通义",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    authHint: "OpenAI 兼容接口（百炼兼容模式）：用百炼 API Key。",
  },
  {
    key: "siliconflow",
    label: "硅基流动 SiliconFlow",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-V3",
    authHint: "OpenAI 兼容接口：模型名填具体型号，如 deepseek-ai/DeepSeek-V3。",
  },
  {
    key: "moonshot",
    label: "月之暗面 Moonshot",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    authHint: "OpenAI 兼容接口：模型名如 moonshot-v1-8k。",
  },
  {
    key: "zhipu",
    label: "智谱 GLM",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4",
    authHint: "OpenAI 兼容接口：用智谱 API Key，模型名如 glm-4。",
  },
  {
    key: "wenxin",
    label: "百度文心千帆",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://qianfan.baidubce.com/v2",
    model: "ernie-4.0-8k",
    authHint: "文心提供 OpenAI 兼容端点：用千帆访问令牌。",
  },
  {
    key: "doubao",
    label: "火山方舟 · 豆包",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-pro-32k",
    authHint: "OpenAI 兼容接口：模型名填方舟接入点 ID。",
  },
  {
    key: "minimax",
    label: "MiniMax",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://api.minimax.chat/v1",
    model: "abab6.5s-chat",
    authHint: "OpenAI 兼容接口：模型名如 abab6.5s-chat。",
  },
  {
    key: "baichuan",
    label: "百川智能",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://api.baichuan-ai.com/v1",
    model: "baichuan4",
    authHint: "OpenAI 兼容接口：模型名如 baichuan4。",
  },
  {
    key: "step",
    label: "阶跃星辰 Step",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://api.stepfun.com/v1",
    model: "step-1v-mini",
    authHint: "OpenAI 兼容接口：模型名如 step-1v-mini。",
  },
  {
    key: "hunyuan",
    label: "腾讯混元",
    group: "cn",
    protocol: "openai",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    model: "hunyuan-pro",
    authHint: "OpenAI 兼容接口：用混元 API Key。",
  },
  {
    key: "ollama",
    label: "本地 Ollama",
    group: "cn",
    protocol: "openai",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3",
    authHint: "本机自托管：需与电脑同网并开启 11434 端口。",
  },
  // ---------------- 海外 ----------------
  {
    key: "openai",
    label: "OpenAI",
    group: "overseas",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    authHint: "OpenAI 兼容接口：请求头带 Authorization: Bearer <你的 Key>。",
  },
  {
    key: "anthropic",
    label: "Anthropic Claude",
    group: "overseas",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-3-5-sonnet-latest",
    authHint: "Anthropic 原生接口：以 x-api-key 头传密钥，并需 anthropic-version: 2023-06-01。",
  },
  {
    key: "gemini",
    label: "Google Gemini",
    group: "overseas",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-1.5-flash",
    authHint: "Google 原生接口：API Key 直接拼入 URL（?key=...），无需 Bearer。",
  },
  {
    key: "xai",
    label: "xAI Grok",
    group: "overseas",
    protocol: "openai",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-2-latest",
    authHint: "OpenAI 兼容接口：模型名如 grok-2-latest。",
  },
  {
    key: "mistral",
    label: "Mistral",
    group: "overseas",
    protocol: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-large-latest",
    authHint: "OpenAI 兼容接口：模型名如 mistral-large-latest。",
  },
  {
    key: "perplexity",
    label: "Perplexity",
    group: "overseas",
    protocol: "openai",
    baseUrl: "https://api.perplexity.ai",
    model: "sonar",
    authHint: "OpenAI 兼容接口：模型名如 sonar。",
  },
  // ---------------- 自定义 ----------------
  {
    key: "custom",
    label: "自定义端点",
    group: "custom",
    protocol: "openai",
    baseUrl: "",
    model: "",
    authHint: "填入任意 OpenAI 兼容 / Anthropic / Gemini 端点；自定义时可选协议。",
  },
];

export function findProvider(key: string): LlmProvider | undefined {
  return PROVIDER_CATALOG.find((p) => p.key === key);
}

export const PROVIDER_GROUP_LABEL: Record<ProviderGroup, string> = {
  cn: "国内厂商",
  overseas: "海外厂商",
  custom: "自定义",
};
