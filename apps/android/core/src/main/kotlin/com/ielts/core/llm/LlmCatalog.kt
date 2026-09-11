package com.ielts.core.llm

/**
 * 市场主流模型厂商目录（纯数据，client-safe，配置页与测试连接共用）。
 * 选预设时自动带出 protocol + baseUrl + model；protocol 对用户隐藏。
 */
enum class ProviderGroup(val label: String) {
    CN("国内厂商"),
    OVERSEAS("海外厂商"),
    CUSTOM("自定义"),
}

data class LlmProvider(
    val key: String,
    val label: String,
    val group: ProviderGroup,
    val protocol: LlmProtocol,
    val baseUrl: String,
    val model: String,
    val authHint: String,
)

val PROVIDER_CATALOG: List<LlmProvider> = listOf(
    // ---------------- 国内 ----------------
    LlmProvider(
        "deepseek", "DeepSeek", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://api.deepseek.com/v1", "deepseek-chat",
        "OpenAI 兼容接口：请求头带 Authorization: Bearer <你的 Key>。",
    ),
    LlmProvider(
        "bailian", "阿里云百炼 · 通义", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-plus",
        "OpenAI 兼容接口（百炼兼容模式）：用百炼 API Key。",
    ),
    LlmProvider(
        "siliconflow", "硅基流动 SiliconFlow", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://api.siliconflow.cn/v1", "deepseek-ai/DeepSeek-V3",
        "OpenAI 兼容接口：模型名填具体型号，如 deepseek-ai/DeepSeek-V3。",
    ),
    LlmProvider(
        "moonshot", "月之暗面 Moonshot", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://api.moonshot.cn/v1", "moonshot-v1-8k",
        "OpenAI 兼容接口：模型名如 moonshot-v1-8k / moonshot-v1-32k。",
    ),
    LlmProvider(
        "zhipu", "智谱 GLM", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://open.bigmodel.cn/api/paas/v4", "glm-4",
        "OpenAI 兼容接口：用智谱 API Key，模型名如 glm-4 / glm-4-flash。",
    ),
    LlmProvider(
        "wenxin", "百度文心千帆", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://qianfan.baidubce.com/v2", "ernie-4.0-8k",
        "文心提供 OpenAI 兼容端点：用千帆 API Key 与 Secret 换取的访问令牌。",
    ),
    LlmProvider(
        "doubao", "火山方舟 · 豆包", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://ark.cn-beijing.volces.com/api/v3", "doubao-pro-32k",
        "OpenAI 兼容接口：模型名填方舟接入点 ID（如 doubao-pro-32k）。",
    ),
    LlmProvider(
        "minimax", "MiniMax", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://api.minimax.chat/v1", "abab6.5s-chat",
        "OpenAI 兼容接口：模型名如 abab6.5s-chat。",
    ),
    LlmProvider(
        "baichuan", "百川智能", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://api.baichuan-ai.com/v1", "baichuan4",
        "OpenAI 兼容接口：模型名如 baichuan4。",
    ),
    LlmProvider(
        "step", "阶跃星辰 Step", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://api.stepfun.com/v1", "step-1v-mini",
        "OpenAI 兼容接口：模型名如 step-1v-mini。",
    ),
    LlmProvider(
        "hunyuan", "腾讯混元", ProviderGroup.CN, LlmProtocol.OPENAI,
        "https://api.hunyuan.cloud.tencent.com/v1", "hunyuan-pro",
        "OpenAI 兼容接口：用混元 API Key，模型名如 hunyuan-pro。",
    ),
    LlmProvider(
        "ollama", "本地 Ollama", ProviderGroup.CN, LlmProtocol.OPENAI,
        "http://localhost:11434/v1", "llama3",
        "本机自托管：需先在 Ollama 启动并开启 11434 端口；手机需与电脑同网。",
    ),
    // ---------------- 海外 ----------------
    LlmProvider(
        "openai", "OpenAI", ProviderGroup.OVERSEAS, LlmProtocol.OPENAI,
        "https://api.openai.com/v1", "gpt-4o-mini",
        "OpenAI 兼容接口：请求头带 Authorization: Bearer <你的 Key>。",
    ),
    LlmProvider(
        "anthropic", "Anthropic Claude", ProviderGroup.OVERSEAS, LlmProtocol.ANTHROPIC,
        "https://api.anthropic.com", "claude-3-5-sonnet-latest",
        "Anthropic 原生接口：以 x-api-key 头传递密钥，并需 anthropic-version: 2023-06-01。",
    ),
    LlmProvider(
        "gemini", "Google Gemini", ProviderGroup.OVERSEAS, LlmProtocol.GEMINI,
        "https://generativelanguage.googleapis.com/v1beta", "gemini-1.5-flash",
        "Google 原生接口：API Key 直接拼入 URL（?key=...），无需 Bearer。",
    ),
    LlmProvider(
        "xai", "xAI Grok", ProviderGroup.OVERSEAS, LlmProtocol.OPENAI,
        "https://api.x.ai/v1", "grok-2-latest",
        "OpenAI 兼容接口：模型名如 grok-2-latest。",
    ),
    LlmProvider(
        "mistral", "Mistral", ProviderGroup.OVERSEAS, LlmProtocol.OPENAI,
        "https://api.mistral.ai/v1", "mistral-large-latest",
        "OpenAI 兼容接口：模型名如 mistral-large-latest。",
    ),
    LlmProvider(
        "perplexity", "Perplexity", ProviderGroup.OVERSEAS, LlmProtocol.OPENAI,
        "https://api.perplexity.ai", "sonar",
        "OpenAI 兼容接口：模型名如 sonar / sonar-pro。",
    ),
    // ---------------- 自定义 ----------------
    LlmProvider(
        "custom", "自定义端点", ProviderGroup.CUSTOM, LlmProtocol.OPENAI,
        "", "",
        "填入任意 OpenAI 兼容 / Anthropic / Gemini 端点；自定义时可选协议。",
    ),
)

fun findProvider(key: String): LlmProvider? = PROVIDER_CATALOG.firstOrNull { it.key == key }
