package com.ielts.app.auth

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import okhttp3.Cookie
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * MOBILE-04B §7/§17 — 加密持久化 CookieJar 单元测试
 * 覆盖：persist / restore（进程重启模拟）/ clear / replace（cookie rotation）/
 *       expiry / multiple Set-Cookie / 解密失败降级。
 * 使用 [InMemoryCookieCipher]（纯 JVM），不依赖 Robolectric Keystore 模拟。
 */
@RunWith(RobolectricTestRunner::class)
class EncryptedCookieJarTest {

    private val ctx: Context = ApplicationProvider.getApplicationContext()
    private val url: HttpUrl = "http://10.0.2.2:3000".toHttpUrlOrNull()!!

    private lateinit var cipher: InMemoryCookieCipher

    private fun setCookie(header: String, base: HttpUrl = url): Cookie =
        Cookie.parse(base, header)!!

    @Before
    fun setUp() {
        cipher = InMemoryCookieCipher()
    }

    @Test
    fun `cookie persists across jar instances (process restart)`() {
        val jar1 = EncryptedCookieJar(ctx, cipher)
        jar1.saveFromResponse(url, listOf(setCookie("sb-test-auth=token1; Path=/; Max-Age=3600")))

        // 新实例 = App process restart 后重新读取加密 blob
        val jar2 = EncryptedCookieJar(ctx, cipher)
        val loaded = jar2.loadForRequest(url)
        assertEquals(1, loaded.size)
        assertEquals("sb-test-auth", loaded[0].name)
        assertEquals("token1", loaded[0].value)
    }

    @Test
    fun `clear removes store and persisted file`() {
        val jar1 = EncryptedCookieJar(ctx, cipher)
        jar1.saveFromResponse(url, listOf(setCookie("sb-test-auth=token1; Path=/; Max-Age=3600")))
        assertEquals(1, jar1.size())

        jar1.clear()
        assertEquals(0, jar1.size())

        val jar2 = EncryptedCookieJar(ctx, cipher)
        assertTrue(jar2.loadForRequest(url).isEmpty())
    }

    @Test
    fun `same name domain path cookie replaces old value (rotation)`() {
        val jar = EncryptedCookieJar(ctx, cipher)
        jar.saveFromResponse(url, listOf(setCookie("sb-test-auth=OLD; Path=/; Max-Age=3600")))
        // 服务端刷新 session → 新 Set-Cookie 覆盖旧值
        jar.saveFromResponse(url, listOf(setCookie("sb-test-auth=NEW; Path=/; Max-Age=7200")))

        val loaded = jar.loadForRequest(url)
        assertEquals(1, loaded.size)
        assertEquals("NEW", loaded[0].value)
        assertEquals(1, jar.size())
    }

    @Test
    fun `multiple Set-Cookie headers all saved`() {
        val jar = EncryptedCookieJar(ctx, cipher)
        jar.saveFromResponse(
            url,
            listOf(
                setCookie("sb-one=1; Path=/; Max-Age=3600"),
                setCookie("sb-two=2; Path=/; Max-Age=3600"),
            ),
        )
        val loaded = jar.loadForRequest(url)
        assertEquals(2, loaded.size)
    }

    @Test
    fun `expired cookie is not saved`() {
        val jar = EncryptedCookieJar(ctx, cipher)
        val expired = Cookie.Builder()
            .name("sb-expired").value("x")
            .domain(url.host).path("/")
            .expiresAt(System.currentTimeMillis() - 1000)
            .build()
        jar.saveFromResponse(url, listOf(expired))
        assertTrue(jar.loadForRequest(url).isEmpty())
    }

    @Test
    fun `cookie expiring during runtime is pruned on load`() {
        val jar = EncryptedCookieJar(ctx, cipher)
        val shortLived = Cookie.Builder()
            .name("sb-short").value("x")
            .domain(url.host).path("/")
            .expiresAt(System.currentTimeMillis() + 400)
            .build()
        jar.saveFromResponse(url, listOf(shortLived))
        Thread.sleep(600)
        assertTrue(jar.loadForRequest(url).isEmpty())
    }

    @Test
    fun `corrupted blob degrades to empty session without crash`() {
        val jar1 = EncryptedCookieJar(ctx, cipher)
        jar1.saveFromResponse(url, listOf(setCookie("sb-test-auth=token1; Path=/; Max-Age=3600")))

        // 篡改加密文件（模拟损坏 / 密钥不匹配）
        val f = java.io.File(ctx.filesDir, "lingxi_cookies.enc")
        f.writeBytes(ByteArray(64) { 0x42 })

        val jar2 = EncryptedCookieJar(ctx, cipher)
        assertTrue(jar2.loadForRequest(url).isEmpty())
        assertEquals(0, jar2.size())
    }

    @Test
    fun `cookies scoped to other domain are not delivered`() {
        val jar = EncryptedCookieJar(ctx, cipher)
        jar.saveFromResponse(url, listOf(setCookie("sb-test-auth=token1; Path=/; Max-Age=3600")))
        val other = "https://other.example.com/api/x".toHttpUrlOrNull()!!
        assertTrue(jar.loadForRequest(other).isEmpty())
        assertEquals(1, jar.loadForRequest(url).size)
    }
}
