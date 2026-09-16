package com.ielts.app.auth

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.io.IOException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * MOBILE-04B §20 — AuthRepository 契约测试（MockWebServer）
 * 覆盖：login success / invalid credentials / malformed / network failure；
 *       session authenticated / unauthenticated / network failure；
 *       logout 无条件清空本地 cookie；token 不进入响应 JSON（契约由后端测试保证，此处验证解析不依赖 token）。
 */
@RunWith(RobolectricTestRunner::class)
class AuthRepositoryTest {

    private val ctx: Context = ApplicationProvider.getApplicationContext()
    private lateinit var server: MockWebServer
    private lateinit var repo: AuthRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        LingxiApiClient.cookieJar = EncryptedCookieJar(ctx, InMemoryCookieCipher())
        LingxiApiClient.baseUrlOverride = server.url("/").toString().trimEnd('/')
        repo = AuthRepository()
    }

    @After
    fun tearDown() {
        LingxiApiClient.baseUrlOverride = null
        server.shutdown()
    }

    private fun jsonUser(id: String, email: String) =
        """{"authenticated":true,"user":{"id":"$id","email":"$email"}}"""

    // ---------- login ----------

    @Test
    fun `login success returns user without touching token`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Set-Cookie", "sb-abc-auth-token=session1; Path=/; Max-Age=3600")
                .setBody(jsonUser("u1", "a@b.c")),
        )
        val r = repo.login("a@b.c", "secret1")
        assertTrue(r is AuthResult.Ok)
        val ok = r as AuthResult.Ok
        assertEquals("u1", ok.user.id)
        assertEquals("a@b.c", ok.user.email)
        // Set-Cookie 已保存（session material 在 cookie，不在 JSON）
        assertTrue(LingxiApiClient.cookieJar.size() > 0)
    }

    @Test
    fun `login invalid credentials maps to INVALID_CREDENTIALS`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody("""{"authenticated":false,"error":{"code":"INVALID_CREDENTIALS"}}"""),
        )
        val r = repo.login("a@b.c", "wrong1")
        assertEquals(AuthResult.Err(AuthErrorCode.INVALID_CREDENTIALS), r)
    }

    @Test
    fun `login malformed input maps to UNKNOWN_RECOVERABLE`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(400)
                .setBody("""{"authenticated":false,"error":{"code":"INVALID_INPUT"}}"""),
        )
        val r = repo.login("bad", "123")
        assertEquals(AuthResult.Err(AuthErrorCode.UNKNOWN_RECOVERABLE), r)
    }

    @Test
    fun `login network failure maps to NETWORK_UNAVAILABLE`() = runBlocking {
        server.shutdown()
        val r = repo.login("a@b.c", "secret1")
        assertEquals(AuthResult.Err(AuthErrorCode.NETWORK_UNAVAILABLE), r)
    }

    // ---------- session ----------

    @Test
    fun `session authenticated returns same user`() = runBlocking {
        // 先登录种 cookie
        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u1", "a@b.c")))
        repo.login("a@b.c", "secret1")
        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u1", "a@b.c")))
        val r = repo.session()
        assertTrue(r is AuthResult.Ok)
        assertEquals("u1", (r as AuthResult.Ok).user.id)
    }

    @Test
    fun `session 401 maps to NotAuthenticated`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        val r = repo.session()
        assertTrue(r is AuthResult.NotAuthenticated)
    }

    @Test
    fun `session network failure maps to NETWORK_UNAVAILABLE`() = runBlocking {
        server.shutdown()
        val r = repo.session()
        assertEquals(AuthResult.Err(AuthErrorCode.NETWORK_UNAVAILABLE), r)
    }

    // ---------- logout ----------

    @Test
    fun `logout clears local cookie jar even when server unreachable`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Set-Cookie", "sb-abc-auth-token=session1; Path=/; Max-Age=3600")
                .setBody(jsonUser("u1", "a@b.c")),
        )
        repo.login("a@b.c", "secret1")
        assertTrue(LingxiApiClient.cookieJar.size() > 0)

        server.shutdown()
        val confirmed = repo.logout()
        assertFalse(confirmed)
        assertEquals(0, LingxiApiClient.cookieJar.size())
    }

    @Test
    fun `logout server confirmed returns true and clears jar`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u1", "a@b.c")))
        repo.login("a@b.c", "secret1")
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"authenticated":false}"""))

        val confirmed = repo.logout()
        assertTrue(confirmed)
        assertEquals(0, LingxiApiClient.cookieJar.size())
    }

    @Test
    fun `network failure is IOException classification`() {
        assertTrue(LingxiApiClient.isNetworkFailure(IOException("boom")))
        assertFalse(LingxiApiClient.isNetworkFailure(RuntimeException("boom")))
    }
}
