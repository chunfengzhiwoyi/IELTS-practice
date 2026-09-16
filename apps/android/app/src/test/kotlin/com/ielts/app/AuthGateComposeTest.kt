package com.ielts.app

import android.app.Application
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.navigation.NavHostController
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.compose.DialogNavigator
import androidx.test.core.app.ApplicationProvider
import com.ielts.app.auth.EncryptedCookieJar
import com.ielts.app.auth.InMemoryCookieCipher
import com.ielts.app.auth.LingxiApiClient
import com.ielts.app.nav.AppNavHost
import com.ielts.app.theme.IeltsTheme
import com.ielts.app.viewmodel.AuthViewModel
import com.ielts.app.viewmodel.StudyViewModel
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * MOBILE-04B §22 — Auth Gate Compose / Navigation 测试（Robolectric，非真实设备）
 * 验证：cold start restoring / unauth → Login / login loading+error / login success → Today /
 *       authed cold start → Today / restore network error → retry / logout → Login / 主路由不绕过 Auth Gate。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class AuthGateComposeTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val app: Application = ApplicationProvider.getApplicationContext()
    private lateinit var server: MockWebServer
    private lateinit var nav: NavHostController
    private lateinit var studyVm: StudyViewModel

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        LingxiApiClient.cookieJar = EncryptedCookieJar(app, InMemoryCookieCipher())
        LingxiApiClient.baseUrlOverride = server.url("/").toString().trimEnd('/')
        nav = NavHostController(app).apply {
            navigatorProvider.addNavigator(ComposeNavigator())
            navigatorProvider.addNavigator(DialogNavigator())
        }
        studyVm = StudyViewModel(app)
    }

    @After
    fun tearDown() {
        LingxiApiClient.baseUrlOverride = null
        server.shutdown()
    }

    private fun jsonUser(id: String, email: String) =
        """{"authenticated":true,"user":{"id":"$id","email":"$email"}}"""

    private fun render(authVm: AuthViewModel) {
        composeTestRule.setContent {
            IeltsTheme {
                AppNavHost(navController = nav, vm = studyVm, authVm = authVm)
            }
        }
    }

    private fun waitForText(text: String, timeoutMs: Long = 8000) {
        composeTestRule.waitUntil(timeoutMs) {
            composeTestRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun `unauthenticated cold start goes to Login and main routes are blocked`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        render(AuthViewModel(app))

        waitForText("邮箱密码登录")
        // 主路由未绕过 Auth Gate：不会闪 Today
        org.junit.Assert.assertTrue(composeTestRule.onAllNodesWithText("今日").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun `authenticated cold start goes straight to Today`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u1", "a@b.c")))
        render(AuthViewModel(app))

        waitForText("今日")
    }

    @Test
    fun `restore network error shows retry and retry recovers to Today`() {
        // 冷启动指向死端口 → 网络失败（≠ 登出）
        LingxiApiClient.baseUrlOverride = "http://127.0.0.1:1"
        render(AuthViewModel(app))

        waitForText("重试")
        org.junit.Assert.assertTrue(composeTestRule.onAllNodesWithText("邮箱密码登录").fetchSemanticsNodes().isEmpty())

        // 网络恢复后重试成功 → Today
        LingxiApiClient.baseUrlOverride = server.url("/").toString().trimEnd('/')
        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u1", "a@b.c")))
        composeTestRule.onNodeWithText("重试").performClick()
        waitForText("今日")
    }

    @Test
    fun `login success navigates from Login to Today`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        render(AuthViewModel(app))
        waitForText("邮箱密码登录")

        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u2", "b@c.d")))
        composeTestRule.onAllNodes(hasSetTextAction() and isEnabled() and hasText("邮箱", substring = true))[0]
            .performTextInput("b@c.d")
        composeTestRule.onAllNodes(hasSetTextAction() and isEnabled() and hasText("密码", substring = true))[0]
            .performTextInput("secret1")
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("邮箱密码登录").performClick()

        waitForText("今日")
    }

    @Test
    fun `login invalid credentials shows product error on Login`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        render(AuthViewModel(app))
        waitForText("邮箱密码登录")

        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody("""{"authenticated":false,"error":{"code":"INVALID_CREDENTIALS","message":"邮箱或密码错误"}}"""),
        )
        composeTestRule.onAllNodes(hasSetTextAction() and isEnabled() and hasText("邮箱", substring = true))[0]
            .performTextInput("a@b.c")
        composeTestRule.onAllNodes(hasSetTextAction() and isEnabled() and hasText("密码", substring = true))[0]
            .performTextInput("wrong1")
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("邮箱密码登录").performClick()

        waitForText("邮箱或密码错误")
    }

    @Test
    fun `logout returns to Login and session cannot restore`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody(jsonUser("u1", "a@b.c")))
        render(AuthViewModel(app))
        waitForText("今日")

        composeTestRule.onNodeWithText("我的").performClick()
        waitForText("退出登录 ›")
        composeTestRule.onNodeWithText("退出登录 ›").performScrollTo().performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("退出登录").performClick()
        composeTestRule.waitForIdle()

        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"authenticated":false}"""))
        waitForText("邮箱密码登录")
        // 登出后主路由不可达
        org.junit.Assert.assertTrue(composeTestRule.onAllNodesWithText("今日").fetchSemanticsNodes().isEmpty())
    }
}
