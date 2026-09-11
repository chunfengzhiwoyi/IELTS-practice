package com.ielts.core.llm

import com.ielts.core.storage.Store
import kotlinx.serialization.Serializable

/**
 * 模型协议。openai = OpenAI 兼容（/chat/completions）；
 * anthropic / gemini = 原生接口，走各自专用端点与鉴权头。
 */
enum class LlmProtocol(val label: String) {
    OPENAI("OpenAI 兼容"),
    ANTHROPIC("Anthropic"),
    GEMINI("Google Gemini"),
}

/**
 * 模型在线状态（本地优先，不实时 ping）：
 * OFF = 未配置；CONFIGURED = 已配置但未测通；READY = 已测通。
 */
enum class ModelStatus { OFF, CONFIGURED, READY }

/**
 * 用户个人 API 配置。仅保存在本机 DataStore，不会上传。
 * protocol 缺省为 openai，兼容旧版本只存 baseUrl/apiKey/model 的数据。
 */
@Serializable
data class ApiConfig(
    val baseUrl: String = "",
    val apiKey: String = "",
    val model: String = "",
    val protocol: String = LlmProtocol.OPENAI.name,
    val lastTestOk: Boolean = false,
) {
    val isValid: Boolean
        get() = baseUrl.isNotBlank() && apiKey.isNotBlank() && model.isNotBlank()

    val protocolEnum: LlmProtocol
        get() = runCatching { LlmProtocol.valueOf(protocol) }.getOrDefault(LlmProtocol.OPENAI)

    fun status(): ModelStatus = when {
        !isValid -> ModelStatus.OFF
        lastTestOk -> ModelStatus.READY
        else -> ModelStatus.CONFIGURED
    }
}

private const val K_API_CONFIG = "api_config"

fun getApiConfig(): ApiConfig = Store.getJSON<ApiConfig>(K_API_CONFIG) ?: ApiConfig()
fun saveApiConfig(cfg: ApiConfig) = Store.setJSON(K_API_CONFIG, cfg)
