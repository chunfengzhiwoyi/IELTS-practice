package com.ielts.core.llm

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

private val json = Json { ignoreUnknownKeys = true }

/**
 * 从 LLM 可能夹带说明文字 / markdown 代码块的输出中，抽取第一个完整 JSON 对象。
 * 找不到成对花括号时返回 null，由调用方回退。
 */
fun extractJsonObject(text: String): String? {
    val start = text.indexOf('{')
    val end = text.lastIndexOf('}')
    if (start == -1 || end <= start) return null
    return text.substring(start, end + 1)
}

private fun postJson(
    endpoint: String,
    headers: Map<String, String>,
    body: String,
    connectTimeout: Int,
    readTimeout: Int,
): String? {
    return try {
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
            doOutput = true
            this.connectTimeout = connectTimeout
            this.readTimeout = readTimeout
        }
        conn.outputStream.use { os -> os.write(body.toByteArray(StandardCharsets.UTF_8)) }
        if (conn.responseCode !in 200..299) return null
        conn.inputStream.bufferedReader().readText()
    } catch (_: Exception) {
        null
    }
}

/** OpenAI 兼容：POST {baseUrl}/chat/completions */
private fun chatOpenAi(
    config: ApiConfig,
    system: String,
    user: String,
    temperature: Double,
    maxTokens: Int,
    connectTimeout: Int,
    readTimeout: Int,
): String? {
    val endpoint = config.baseUrl.trimEnd('/') + "/chat/completions"
    val body = buildJsonObject {
        put("model", config.model)
        put("temperature", temperature)
        put("max_tokens", maxTokens)
        putJsonArray("messages") {
            add(buildJsonObject { put("role", "system"); put("content", system) })
            add(buildJsonObject { put("role", "user"); put("content", user) })
        }
    }.toString()
    val raw = postJson(
        endpoint,
        mapOf("Authorization" to "Bearer ${config.apiKey}"),
        body,
        connectTimeout,
        readTimeout,
    ) ?: return null
    return try {
        val root = json.parseToJsonElement(raw)
        root.jsonObject["choices"]
            ?.jsonArray?.firstOrNull()
            ?.jsonObject?.get("message")
            ?.jsonObject?.get("content")
            ?.jsonPrimitive?.content
    } catch (_: Exception) {
        null
    }
}

/** Anthropic 原生：POST {baseUrl}/v1/messages，x-api-key + anthropic-version */
private fun chatAnthropic(
    config: ApiConfig,
    system: String,
    user: String,
    temperature: Double,
    maxTokens: Int,
    connectTimeout: Int,
    readTimeout: Int,
): String? {
    val endpoint = config.baseUrl.trimEnd('/') + "/v1/messages"
    val body = buildJsonObject {
        put("model", config.model)
        put("max_tokens", maxTokens)
        put("temperature", temperature)
        put("system", system)
        putJsonArray("messages") {
            add(buildJsonObject { put("role", "user"); put("content", user) })
        }
    }.toString()
    val raw = postJson(
        endpoint,
        mapOf(
            "x-api-key" to config.apiKey,
            "anthropic-version" to "2023-06-01",
        ),
        body,
        connectTimeout,
        readTimeout,
    ) ?: return null
    return try {
        val root = json.parseToJsonElement(raw)
        root.jsonObject["content"]
            ?.jsonArray?.firstOrNull()
            ?.jsonObject?.get("text")
            ?.jsonPrimitive?.content
    } catch (_: Exception) {
        null
    }
}

/** Google Gemini 原生：POST {baseUrl}/models/{model}:generateContent?key=... */
private fun chatGemini(
    config: ApiConfig,
    system: String,
    user: String,
    temperature: Double,
    maxTokens: Int,
    jsonMode: Boolean,
    connectTimeout: Int,
    readTimeout: Int,
): String? {
    val base = config.baseUrl.trimEnd('/').removeSuffix("/models")
    val endpoint = "$base/models/${config.model}:generateContent?key=${config.apiKey}"
    val body = buildJsonObject {
        putJsonArray("contents") {
            add(buildJsonObject {
                put("role", "user")
                putJsonArray("parts") { add(buildJsonObject { put("text", user) }) }
            })
        }
        putJsonArray("systemInstruction") {
            add(buildJsonObject { putJsonArray("parts") { add(buildJsonObject { put("text", system) }) } })
        }
        putJsonObject("generationConfig") {
            put("temperature", temperature)
            put("maxOutputTokens", maxTokens)
            put("responseMimeType", if (jsonMode) "application/json" else "text/plain")
        }
    }.toString()
    val raw = postJson(endpoint, emptyMap(), body, connectTimeout, readTimeout) ?: return null
    return try {
        val root = json.parseToJsonElement(raw)
        root.jsonObject["candidates"]
            ?.jsonArray?.firstOrNull()
            ?.jsonObject?.get("content")
            ?.jsonObject?.get("parts")
            ?.jsonArray?.firstOrNull()
            ?.jsonObject?.get("text")
            ?.jsonPrimitive?.content
    } catch (_: Exception) {
        null
    }
}

/**
 * 按 config.protocol 分发到对应协议的客户端实现，统一返回文本。
 * 任何异常 / HTTP 非 2xx / 解析失败都返回 null，由调用方决定回退。
 *
 * @param jsonMode 是否要求 JSON 输出（口语诊断 / 报告结构用 true；纯文本建议用 false）。
 *   Gemini 下用原生 responseMimeType 强制；OpenAI / Anthropic 下主要靠 prompt 约束（调用方已在 system 中要求只回 JSON）。
 */
suspend fun callUserModel(
    config: ApiConfig,
    system: String,
    user: String,
    temperature: Double = 0.7,
    maxTokens: Int = 800,
    jsonMode: Boolean = true,
    connectTimeout: Int = 20_000,
    readTimeout: Int = 60_000,
): String? = withContext(Dispatchers.IO) {
    if (!config.isValid) return@withContext null
    when (config.protocolEnum) {
        LlmProtocol.OPENAI ->
            chatOpenAi(config, system, user, temperature, maxTokens, connectTimeout, readTimeout)
        LlmProtocol.ANTHROPIC ->
            chatAnthropic(config, system, user, temperature, maxTokens, connectTimeout, readTimeout)
        LlmProtocol.GEMINI ->
            chatGemini(config, system, user, temperature, maxTokens, jsonMode, connectTimeout, readTimeout)
    }
}
