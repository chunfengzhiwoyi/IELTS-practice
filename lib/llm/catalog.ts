/**
 * 厂商目录（协议 + UI 元数据）
 * ------------------------------------------------------------
 * 配置页与测试连接共用的纯数据模块，不依赖任何服务端能力，
 * 因此可在客户端组件与服务端路由中安全 import。
 *
 * 设计要点：把「协议(protocol)」从「厂商(vendor)」中拆开。
 *  - protocol 决定如何与端点对话（openai / anthropic / gemini 原生）。
 *  - vendor 只是 UI 预设，帮用户自动带出 protocol + baseUrl + 默认模型。
 * 这样新增厂商只是往 VENDOR_PRESETS 加一行，无需改任何调用链。
 */
export type LlmProtocol = "openai" | "anthropic" | "gemini";

export interface VendorPreset {
  key: string;
  label: string;
  group: "domestic" | "overseas";
  protocol: LlmProtocol;
  baseUrl: string;
  defaultModel: string;
  authHint: string;
}

export const PROTOCOL_LABELS: Record<LlmProtocol, string> = {
  openai: "OpenAI 兼容",
  anthropic: "Anthropic 原生",
  gemini: "Google Gemini 原生",
};

/** 自定义端点（非预设） */
export const CUSTOM_VENDOR: VendorPreset = {
  key: "__custom__",
  label: "自定义端点",
  group: "domestic",
  protocol: "openai",
  baseUrl: "",
  defaultModel: "",
  authHint: "支持任意 OpenAI 兼容端点（含本地 Ollama、one-api 等网关）。",
};

/**
 * 厂商预设目录（约 18 家，覆盖国内外主流市场模型）。
 * 绝大多数 OpenAI 兼容；Claude / Gemini 走原生协议适配器。
 */
export const VENDOR_PRESETS: VendorPreset[] = [
  // ---------------- 国内 ----------------
  {
    key: "deepseek",
    label: "DeepSeek",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    authHint: "DeepSeek 官方 API（OpenAI 兼容）。",
  },
  {
    key: "bailian",
    label: "阿里云百炼 / 通义",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    authHint: "阿里云百炼 DashScope 兼容模式端点。",
  },
  {
    key: "siliconflow",
    label: "硅基流动 SiliconFlow",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    authHint: "硅基流动 SiliconFlow 兼容端点。",
  },
  {
    key: "moonshot",
    label: "月之暗面 Moonshot",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    authHint: "Moonshot 月之暗面 OpenAI 兼容。",
  },
  {
    key: "zhipu",
    label: "智谱 GLM",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    authHint: "智谱 BigModel 兼容端点（/api/paas/v4）。",
  },
  {
    key: "qianfan",
    label: "百度文心千帆",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://qianfan.baidubce.com/v2",
    defaultModel: "ernie-4.0-8k",
    authHint: "百度千帆 v2（OpenAI 兼容）。",
  },
  {
    key: "doubao",
    label: "火山方舟 / 豆包",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-1.6-250615",
    authHint: "火山方舟 Ark（OpenAI 兼容）。",
  },
  {
    key: "minimax",
    label: "MiniMax",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://api.minimax.io/v1",
    defaultModel: "abab6.5s-chat",
    authHint: "MiniMax 开放平台兼容端点。",
  },
  {
    key: "baichuan",
    label: "百川智能",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://api.baichuan-ai.com/v1",
    defaultModel: "baichuan4",
    authHint: "百川智能 OpenAI 兼容。",
  },
  {
    key: "stepfun",
    label: "阶跃星辰 StepFun",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://api.stepfun.com/v1",
    defaultModel: "step-1v-8k",
    authHint: "阶跃星辰 StepFun 兼容端点。",
  },
  {
    key: "hunyuan",
    label: "腾讯混元",
    group: "domestic",
    protocol: "openai",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    defaultModel: "hunyuan-turbo",
    authHint: "腾讯混元 OpenAI 兼容。",
  },
  {
    key: "ollama",
    label: "本地 Ollama",
    group: "domestic",
    protocol: "openai",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3",
    authHint: "本地 Ollama（OpenAI 兼容，需先启动）。",
  },
  // ---------------- 海外 ----------------
  {
    key: "openai",
    label: "OpenAI",
    group: "overseas",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    authHint: "OpenAI 官方 API。",
  },
  {
    key: "anthropic",
    label: "Anthropic Claude",
    group: "overseas",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-latest",
    authHint: "Claude 原生 Messages API：Headers 需 x-api-key 与 anthropic-version，无需 /v1 后缀。",
  },
  {
    key: "gemini",
    label: "Google Gemini",
    group: "overseas",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-1.5-flash",
    authHint: "Gemini 原生生成式 API：API Key 以 ?key= 拼入请求 URL。",
  },
  {
    key: "xai",
    label: "xAI Grok",
    group: "overseas",
    protocol: "openai",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    authHint: "xAI Grok（OpenAI 兼容）。",
  },
  {
    key: "mistral",
    label: "Mistral AI",
    group: "overseas",
    protocol: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    authHint: "Mistral AI（OpenAI 兼容）。",
  },
  {
    key: "perplexity",
    label: "Perplexity",
    group: "overseas",
    protocol: "openai",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar",
    authHint: "Perplexity（OpenAI 兼容）。",
  },
];

const VENDOR_BY_KEY = new Map(VENDOR_PRESETS.map((v) => [v.key, v]));

export function findVendor(key: string): VendorPreset | undefined {
  return VENDOR_BY_KEY.get(key);
}

/** 当前协议对应的认证/接入提示（古铜色注脚用） */
export function protocolHint(protocol: LlmProtocol): string {
  switch (protocol) {
    case "anthropic":
      return "使用 Anthropic 原生 Messages API：Headers 需 x-api-key 与 anthropic-version，无需 /v1 后缀。";
    case "gemini":
      return "使用 Gemini 原生生成式 API：API Key 会以 ?key= 形式拼入请求 URL。";
    default:
      return "使用 OpenAI 兼容协议：baseUrl 通常以 /v1 结尾。";
  }
}
