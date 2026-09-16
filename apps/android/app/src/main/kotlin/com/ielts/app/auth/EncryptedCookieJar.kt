package com.ielts.app.auth

import android.content.Context
import java.io.File
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * 持久化 CookieJar（MOBILE-04B §7）。
 * - 认证 cookie = SENSITIVE_AUTH_MATERIAL：序列化后经 [CookieCipher] 加密落盘
 * - App process restart 后可恢复登录
 * - Set-Cookie 自动保存；同名 cookie（name/domain/path）自动替换旧值（cookie rotation）
 * - 过期 cookie 读取时清理；logout 调用 [clear] 清空
 * - 业务代码不接触 token：本 jar 只处理 okhttp Cookie 对象
 *
 * 存储格式：加密 blob（IV + AES-GCM 密文）→ app-private 文件 lingxi_cookies.enc
 */
class EncryptedCookieJar(
    context: Context,
    private val cipher: CookieCipher,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : CookieJar {

    private val lock = Any()
    private val file = File(context.filesDir, FILE_NAME)

    /** key = name\0domain\0path → cookie */
    private val store = LinkedHashMap<String, Cookie>()

    init {
        load()
    }

    override fun saveFromResponse(url: HttpUrl, cookiesIn: List<Cookie>) {
        synchronized(lock) {
            var changed = false
            for (cookie in cookiesIn) {
                if (!cookie.persistent) continue
                if (cookie.expiresAt <= System.currentTimeMillis()) continue
                store[keyOf(cookie)] = cookie
                changed = true
            }
            changed = pruneExpired() || changed
            if (changed) persist()
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        synchronized(lock) {
            val changed = pruneExpired()
            val result = store.values.filter { it.matches(url) }
            if (changed) persist()
            return result
        }
    }

    /** 清空全部 cookie（logout 契约：本地 session material 必须清除） */
    fun clear() {
        synchronized(lock) {
            store.clear()
            file.delete()
        }
    }

    /** 当前 cookie 数量（测试/诊断用，不包含敏感值） */
    fun size(): Int = synchronized(lock) { store.size }

    private fun keyOf(cookie: Cookie): String = "${cookie.name}\u0000${cookie.domain}\u0000${cookie.path}"

    private fun pruneExpired(): Boolean {
        val now = System.currentTimeMillis()
        val it = store.entries.iterator()
        var changed = false
        while (it.hasNext()) {
            if (it.next().value.expiresAt <= now) {
                it.remove()
                changed = true
            }
        }
        return changed
    }

    private fun persist() {
        try {
            val dtos = store.values.map { it.toDto() }
            val plain = json.encodeToString(dtos).toByteArray(Charsets.UTF_8)
            val encrypted = cipher.encrypt(plain)
            val tmp = File(file.parentFile, "$FILE_NAME.tmp")
            tmp.writeBytes(encrypted)
            if (!tmp.renameTo(file)) {
                file.writeBytes(encrypted)
                tmp.delete()
            }
        } catch (_: Exception) {
            // 持久化失败不崩溃：内存会话仍可用，下次 save/load 重试
        }
    }

    private fun load() {
        synchronized(lock) {
            store.clear()
            if (!file.exists()) return
            try {
                val decrypted = cipher.decrypt(file.readBytes())
                val dtos = json.decodeFromString<List<StoredCookie>>(decrypted.toString(Charsets.UTF_8))
                val now = System.currentTimeMillis()
                for (dto in dtos) {
                    if (dto.expiresAt <= now) continue
                    val cookie = dto.toCookie() ?: continue
                    store[keyOf(cookie)] = cookie
                }
            } catch (_: Exception) {
                // 解密失败 / 数据损坏：清空并删除，视作未登录（可重登），不崩溃
                file.delete()
            }
        }
    }

    @Serializable
    private data class StoredCookie(
        val name: String,
        val value: String,
        val domain: String,
        val path: String,
        val expiresAt: Long,
        val hostOnly: Boolean,
        val httpOnly: Boolean,
        val secure: Boolean,
    )

    private fun Cookie.toDto(): StoredCookie = StoredCookie(
        name = name,
        value = value,
        domain = domain,
        path = path,
        expiresAt = expiresAt,
        hostOnly = hostOnly,
        httpOnly = httpOnly,
        secure = secure,
    )

    private fun StoredCookie.toCookie(): Cookie? = try {
        Cookie.Builder()
            .name(name)
            .value(value)
            .domain(domain)
            .path(path)
            .expiresAt(expiresAt)
            .apply {
                if (hostOnly) hostOnlyDomain(domain)
                if (httpOnly) httpOnly()
                if (secure) secure()
            }
            .build()
    } catch (_: Exception) {
        null
    }

    companion object {
        private const val FILE_NAME = "lingxi_cookies.enc"
    }
}
