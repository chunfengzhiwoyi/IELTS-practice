package com.ielts.app.viewmodel

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.ielts.app.auth.AuthErrorCode
import com.ielts.app.auth.AuthStatus
import com.ielts.app.auth.EncryptedCookieJar
import com.ielts.app.auth.InMemoryCookieCipher
import com.ielts.app.auth.LingxiApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * MOBILE-04B §21 — AuthViewModel 状态机测试（真实 Repository + MockWebServer）
 * 覆盖：cold start 200/401/网络失败；login success/invalid；logout；网络失败 ≠ 自动登出。
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class AuthViewModelTest {

    private val app: Application = ApplicationProvider.getApplicationContext()
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        server = MockWebServer()
        server.start()
        LingxiApiClient.cookieJar = EncryptedCookieJar(app, InMemoryCookieCipher())
        LingxiApiClient.baseUrlOverride = server.url("/").toString().trimEnd('/')
    }

    @After
    fun tearDown() {
        LingxiApiClient.baseUrlOverride = null
        server.shutdown()
        Dispatchers.resetMain()
    }

    private fun jsonUser(id: String, email: String) =
        """{"authenticated":true,"user":{"id":"$id","email":"$email"}}"""

    private fun awaitStatus(vm: AuthViewModel, vararg statuses: AuthStatus): AuthStatus {
        val deadline = System.currentTimeMillis() + 5000
        while (System.currentTimeMillis() < deadline) {
            val s = vm.state.status
            if (s in statuses) return s
            Thread.sleep(25)
        }
        return vm.state.status
    }

    // ---------- cold start ----------

    @Test
    fun `cold start with valid session becomes AUTHENTICATED`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u1", "a@b.c")))
        val vm = AuthViewModel(app)
        val status = awaitStatus(vm, AuthStatus.AUTHENTICATED, AuthStatus.UNAUTHENTICATED, AuthStatus.RESTORE_NETWORK_ERROR)
        assertEquals(AuthStatus.AUTHENTICATED, status)
        assertEquals("u1", vm.state.user?.id)
    }

    @Test
    fun `cold start with 401 becomes UNAUTHENTICATED`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        val vm = AuthViewModel(app)
        val status = awaitStatus(vm, AuthStatus.AUTHENTICATED, AuthStatus.UNAUTHENTICATED, AuthStatus.RESTORE_NETWORK_ERROR)
        assertEquals(AuthStatus.UNAUTHENTICATED, status)
        assertTrue(vm.state.user == null)
    }

    @Test
    fun `cold start network failure becomes RESTORE_NETWORK_ERROR and does not clear cookie`() {
        // 先登录种 cookie
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Set-Cookie", "sb-abc-auth-token=session1; Path=/; Max-Age=3600")
                .setBody(jsonUser("u1", "a@b.c")),
        )
        LingxiApiClient.postJson("/api/auth/mobile/login", """{"email":"a@b.c","password":"secret1"}""").close()
        val seeded = LingxiApiClient.cookieJar.size()
        assertTrue(seeded > 0)

        server.shutdown()
        val vm = AuthViewModel(app)
        val status = awaitStatus(vm, AuthStatus.AUTHENTICATED, AuthStatus.UNAUTHENTICATED, AuthStatus.RESTORE_NETWORK_ERROR)
        assertEquals(AuthStatus.RESTORE_NETWORK_ERROR, status)
        assertEquals(AuthErrorCode.NETWORK_UNAVAILABLE, vm.state.errorCode)
        // 网络失败 ≠ 登出：cookie 保留
        assertEquals(seeded, LingxiApiClient.cookieJar.size())
    }

    // ---------- login ----------

    @Test
    fun `login success transitions to AUTHENTICATED`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        val vm = AuthViewModel(app)
        awaitStatus(vm, AuthStatus.UNAUTHENTICATED)

        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u2", "b@c.d")))
        vm.login("b@c.d", "secret1")
        val status = awaitStatus(vm, AuthStatus.AUTHENTICATED, AuthStatus.UNAUTHENTICATED)
        assertEquals(AuthStatus.AUTHENTICATED, status)
        assertEquals("u2", vm.state.user?.id)
    }

    @Test
    fun `login invalid credentials shows error and stays UNAUTHENTICATED`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        val vm = AuthViewModel(app)
        awaitStatus(vm, AuthStatus.UNAUTHENTICATED)

        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody("""{"authenticated":false,"error":{"code":"INVALID_CREDENTIALS"}}"""),
        )
        vm.login("a@b.c", "wrong1")
        val status = awaitStatus(vm, AuthStatus.AUTHENTICATED, AuthStatus.UNAUTHENTICATED)
        assertEquals(AuthStatus.UNAUTHENTICATED, status)
        assertEquals(AuthErrorCode.INVALID_CREDENTIALS, vm.state.errorCode)
    }

    @Test
    fun `login short password is ignored`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        val vm = AuthViewModel(app)
        awaitStatus(vm, AuthStatus.UNAUTHENTICATED)

        val before = vm.state
        vm.login("a@b.c", "12345")
        Thread.sleep(100)
        assertEquals(before.status, vm.state.status)
    }

    // ---------- logout ----------

    @Test
    fun `logout transitions to UNAUTHENTICATED and clears cookie`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u1", "a@b.c")))
        val vm = AuthViewModel(app)
        awaitStatus(vm, AuthStatus.AUTHENTICATED)

        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"authenticated":false}"""))
        vm.logout()
        val status = awaitStatus(vm, AuthStatus.UNAUTHENTICATED)
        assertEquals(AuthStatus.UNAUTHENTICATED, status)
        assertEquals(0, LingxiApiClient.cookieJar.size())
        assertEquals(true, vm.serverLogoutConfirmed)
    }

    @Test
    fun `logout with server unreachable still clears local cookie`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u1", "a@b.c")))
        val vm = AuthViewModel(app)
        awaitStatus(vm, AuthStatus.AUTHENTICATED)

        server.shutdown()
        vm.logout()
        val status = awaitStatus(vm, AuthStatus.UNAUTHENTICATED)
        assertEquals(AuthStatus.UNAUTHENTICATED, status)
        assertEquals(0, LingxiApiClient.cookieJar.size())
        assertNotEquals(true, vm.serverLogoutConfirmed)
    }
}
