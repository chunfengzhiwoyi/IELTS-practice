package com.ielts.app.auth

import com.ielts.app.BuildConfig
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * 统一 Lingxi 后端 HTTP 栈（MOBILE-04B §8/§9）。
 * - 全 App 唯一 auth-aware OkHttpClient：Auth / Speaking session / transcribe / analyze / complete 共用同一 CookieJar
 * - 禁止各 Screen 自行 HttpURLConnection 访问 Lingxi 后端
 * - Base URL 来自 BuildConfig.LINGXI_BACKEND_BASE_URL（非 LLM provider URL）
 */
object LingxiApiClient {

    /** 由 IeltsApplication 注入：加密持久化 CookieJar（SENSITIVE_AUTH_MATERIAL，encrypted at rest） */
    lateinit var cookieJar: EncryptedCookieJar

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    // client 按 cookieJar 实例缓存：生产启动时注入一次；测试替换 jar 时自动重建，
    // 避免旧 jar 串入新测试（cookie 隔离）。
    @Volatile
    private var cachedClient: OkHttpClient? = null
    @Volatile
    private var cachedJar: EncryptedCookieJar? = null

    fun client(): OkHttpClient {
        val jar = cookieJar
        val existing = cachedClient
        if (existing != null && cachedJar === jar) return existing
        val built = OkHttpClient.Builder()
            .cookieJar(jar)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
        cachedClient = built
        cachedJar = jar
        return built
    }

    fun baseUrl(): String = (baseUrlOverride ?: BuildConfig.LINGXI_BACKEND_BASE_URL).trimEnd('/')

    /** 测试注入点：MockWebServer 场景覆盖 BuildConfig base URL；生产为 null */
    var baseUrlOverride: String? = null

    /** POST JSON 到 Lingxi 后端；调用方负责 close() */
    fun postJson(path: String, body: String): Response {
        val request = Request.Builder()
            .url(baseUrl() + path)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .post(body.toRequestBody(jsonMediaType))
            .build()
        return client().newCall(request).execute()
    }

    /** GET 到 Lingxi 后端；调用方负责 close() */
    fun get(path: String): Response {
        val request = Request.Builder()
            .url(baseUrl() + path)
            .header("Accept", "application/json")
            .build()
        return client().newCall(request).execute()
    }

    /** 便捷 URL 构造（测试/诊断） */
    fun url(path: String): HttpUrl = (baseUrl() + path).toHttpUrlOrNull()
        ?: error("invalid base url")

    /** 清空本地 cookie（logout 本地契约；server revocation 由调用方处理） */
    fun clearCookies() {
        cookieJar.clear()
    }

    /** 连接类失败判定（映射 NETWORK_UNAVAILABLE） */
    fun isNetworkFailure(e: Exception): Boolean = e is IOException

    /** 读取响应体并关闭（容错） */
    inline fun <T> use(response: Response, block: (Response) -> T): T =
        response.use(block)
}
