package com.ielts.app.auth

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * MOBILE-04B §16/§17 — LingxiApiClient + CookieJar HTTP 集成测试（MockWebServer）
 * 验证：Set-Cookie 自动保存 → 后续请求自动携带 → cookie rotation 替换旧值。
 */
@RunWith(RobolectricTestRunner::class)
class LingxiApiClientTest {

    private val ctx: Context = ApplicationProvider.getApplicationContext()
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        LingxiApiClient.cookieJar = EncryptedCookieJar(ctx, InMemoryCookieCipher())
        LingxiApiClient.baseUrlOverride = server.url("/").toString().trimEnd('/')
    }

    @After
    fun tearDown() {
        LingxiApiClient.baseUrlOverride = null
        server.shutdown()
    }

    @Test
    fun `Set-Cookie saved and carried on subsequent request`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Set-Cookie", "sb-abc-auth-token=session1; Path=/; Max-Age=3600")
                .setBody("""{"authenticated":true}"""),
        )
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"authenticated":true}"""))

        val login = LingxiApiClient.postJson("/api/auth/mobile/login", """{"email":"a@b.c","password":"x"}""")
        assertEquals(200, login.code)
        login.close()

        val probe = LingxiApiClient.get("/api/auth/mobile/session")
        assertEquals(200, probe.code)
        probe.close()

        val sessionRequest = server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)!! // login
        val probeRequest = server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)!!   // session
        assertNull(sessionRequest.getHeader("Cookie"))
        assertEquals("sb-abc-auth-token=session1", probeRequest.getHeader("Cookie"))
    }

    @Test
    fun `cookie rotation replaces old session value`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Set-Cookie", "sb-abc-auth-token=OLD; Path=/; Max-Age=3600"),
        )
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Set-Cookie", "sb-abc-auth-token=NEW; Path=/; Max-Age=7200"),
        )
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))

        LingxiApiClient.postJson("/login", "{}").close()
        LingxiApiClient.postJson("/refresh", "{}").close()
        LingxiApiClient.get("/session").close()

        server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)!!
        server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)!!
        val third = server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)!!
        assertEquals("sb-abc-auth-token=NEW", third.getHeader("Cookie"))
    }

    @Test
    fun `multiple Set-Cookie lines carried`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Set-Cookie", "sb-one=1; Path=/; Max-Age=3600")
                .addHeader("Set-Cookie", "sb-two=2; Path=/; Max-Age=3600"),
        )
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))

        LingxiApiClient.postJson("/login", "{}").close()
        LingxiApiClient.get("/session").close()

        server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)!!
        val probe = server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)!!
        val cookie = probe.getHeader("Cookie") ?: ""
        assertTrue(cookie.contains("sb-one=1") && cookie.contains("sb-two=2"))
    }

    @Test
    fun `clearCookies removes session material`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Set-Cookie", "sb-abc-auth-token=session1; Path=/; Max-Age=3600"),
        )
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))

        LingxiApiClient.postJson("/login", "{}").close()
        LingxiApiClient.clearCookies()
        LingxiApiClient.get("/session").close()

        server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)!!
        val probe = server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)!!
        assertNull(probe.getHeader("Cookie"))
    }
}
