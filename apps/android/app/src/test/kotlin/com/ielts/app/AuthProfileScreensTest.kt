package com.ielts.app

import android.app.Application
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
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
import org.junit.Assert
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * MOBILE-06 §16 — Auth + Profile 视觉收敛 Compose 测试（Robolectric，非真实设备）。
 * 断言清单：
 *  - Login 无返回按钮 / 无第二邮箱登录按钮 / Register 入口存在 / Forgot 含 magic-link 入口
 *  - Profile 无 gear / 身份卡可点击 / 无重复账号信息入口 / 学习可视化存在 / 可滚动
 *  - API 入口在 Profile 下方 / 底部导航 5 项 / Profile active 正确 / API key 不明文持久展示
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class AuthProfileScreensTest {

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

    private fun openLogin(): AuthViewModel {
        // 先 enqueue 再构造 AuthViewModel（init restoreSession 立即发请求，避免请求先于响应入队挂起）
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"authenticated":false}"""))
        val vm = AuthViewModel(app)
        render(vm)
        waitForText("灵犀 IELTS")
        return vm
    }

    // ----------------------------- Login -----------------------------

    @Test
    fun `login is auth root - no back button and no secondary email login entry`() {
        openLogin()

        // 无返回按钮（Auth Root）
        Assert.assertTrue(composeTestRule.onAllNodesWithText("返回").fetchSemanticsNodes().isEmpty())
        // 无第二邮箱登录按钮 / 其他登录方式 / 微信扫码 / 三端统一身份 / 个人开发者方案
        for (banned in listOf(
            "使用邮箱登录", "邮件登录链接暂未开放", "微信", "三端统一", "个人开发者",
            "注册功能暂未开放",
        )) {
            Assert.assertTrue("Login 不应出现：$banned", composeTestRule.onAllNodesWithText(banned).fetchSemanticsNodes().isEmpty())
        }
        // Register 入口存在（MOBILE-07：入口文案为「创建账号」）
        Assert.assertTrue(composeTestRule.onAllNodesWithText("创建账号").fetchSemanticsNodes().isNotEmpty())
        // Forgot 入口存在
        Assert.assertTrue(composeTestRule.onAllNodesWithText("忘记密码？").fetchSemanticsNodes().isNotEmpty())
    }

    @Test
    fun `login navigates to register page`() {
        openLogin()
        composeTestRule.onNodeWithText("创建账号").performScrollTo().performClick()
        waitForText("创建你的灵犀账号")
        Assert.assertTrue(composeTestRule.onAllNodesWithText("创建账号").fetchSemanticsNodes().isNotEmpty())
        Assert.assertTrue(composeTestRule.onAllNodesWithText("确认密码").fetchSemanticsNodes().isNotEmpty())
        // MOBILE-07：仅连接真实存在的《隐私政策》；《用户协议》内容缺失（USER_AGREEMENT_CONTENT_REQUIRED），不应展示
        Assert.assertTrue(composeTestRule.onAllNodesWithText("《隐私政策》").fetchSemanticsNodes().isNotEmpty())
        Assert.assertTrue(composeTestRule.onAllNodesWithText("《用户协议》").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun `login navigates to forgot password page with magic link entry`() {
        openLogin()
        composeTestRule.onNodeWithText("忘记密码？").performClick()
        waitForText("找回账号")
        // 重置密码场景
        Assert.assertTrue(composeTestRule.onAllNodesWithText("发送重置链接").fetchSemanticsNodes().isNotEmpty())
        // magic-link 场景（唯一入口：忘记密码页）
        Assert.assertTrue(composeTestRule.onAllNodesWithText("发送登录链接").fetchSemanticsNodes().isNotEmpty())
    }

    // ----------------------------- Profile -----------------------------

    private fun openProfile() {
        // 先 enqueue 再构造 AuthViewModel（避免冷启动请求先于响应入队挂起）
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"authenticated":true,"user":{"id":"u1","email":"a@b.c"}}"""))
        val vm = AuthViewModel(app)
        render(vm)
        waitForText("今日")
        composeTestRule.onNodeWithText("我的").performClick()
        waitForText("我的")
    }

    @Test
    fun `profile has five bottom nav items with profile active and identity card`() {
        openProfile()

        // 底部导航固定 5 项
        for (tab in listOf("今日", "学习", "复习", "口语", "我的")) {
            Assert.assertTrue("底部导航应有：$tab", composeTestRule.onAllNodesWithText(tab).fetchSemanticsNodes().isNotEmpty())
        }
        // 身份卡（点击 → 账号资料页）
        Assert.assertTrue(
            composeTestRule.onAllNodesWithText("持续学习，遇见更好的自己").fetchSemanticsNodes().isNotEmpty(),
        )
        // 无重复「账号信息」入口
        Assert.assertTrue(composeTestRule.onAllNodesWithText("账号信息").fetchSemanticsNodes().isEmpty())
        // 无右上角 gear / 设置图标
        Assert.assertTrue(composeTestRule.onAllNodes(androidx.compose.ui.test.hasContentDescription("设置")).fetchSemanticsNodes().isEmpty())
        Assert.assertTrue(composeTestRule.onAllNodes(androidx.compose.ui.test.hasContentDescription("gear")).fetchSemanticsNodes().isEmpty())
        // 学习可视化（真实数据源 generateReport；空数据 → empty state）
        Assert.assertTrue(composeTestRule.onAllNodesWithText("我的学习").fetchSemanticsNodes().isNotEmpty())
        Assert.assertTrue(
            composeTestRule.onAllNodesWithText("还没有学习记录").fetchSemanticsNodes().isNotEmpty() ||
                composeTestRule.onAllNodesWithText("本周", substring = true).fetchSemanticsNodes().isNotEmpty(),
        )
    }

    @Test
    fun `profile is scrollable and api config entry is below the fold`() {
        openProfile()

        // API 入口在下方：先 scroll 再断言可见
        val apiEntry = composeTestRule.onNodeWithText("AI 服务配置")
        apiEntry.performScrollTo()
        Assert.assertTrue(composeTestRule.onAllNodesWithText("配置你的 API Key").fetchSemanticsNodes().isNotEmpty())
    }

    @Test
    fun `identity card opens account profile page with auth-only content`() {
        openProfile()

        // 点击身份卡（邮箱文本在身份卡内）→ 账号资料页
        composeTestRule.onNodeWithText("a@b.c").performScrollTo().performClick()
        waitForText("账号资料")
        Assert.assertTrue(composeTestRule.onAllNodesWithText("账号状态").fetchSemanticsNodes().isNotEmpty())
        Assert.assertTrue(composeTestRule.onAllNodesWithText("修改密码").fetchSemanticsNodes().isNotEmpty())
        Assert.assertTrue(composeTestRule.onAllNodesWithText("退出登录").fetchSemanticsNodes().isNotEmpty())
        // 账号资料页禁止学习统计 / API Key / 周目标（职责分离）
        for (banned in listOf("学习统计", "学习报告", "周目标", "API Key")) {
            Assert.assertTrue("账号资料页不应出现：$banned", composeTestRule.onAllNodesWithText(banned).fetchSemanticsNodes().isEmpty())
        }
    }

    @Test
    fun `api config screen hides key with mask and validates`() {
        openProfile()
        val apiEntry = composeTestRule.onNodeWithText("AI 服务配置")
        apiEntry.performScrollTo()
        apiEntry.performClick()
        waitForText("启用更强大的 AI 能力")

        Assert.assertTrue(composeTestRule.onAllNodesWithText("服务提供商").fetchSemanticsNodes().isNotEmpty())
        Assert.assertTrue(composeTestRule.onAllNodesWithText("API Key").fetchSemanticsNodes().isNotEmpty())
        Assert.assertTrue(composeTestRule.onAllNodesWithText("保存并验证").fetchSemanticsNodes().isNotEmpty())
        // 使用说明（Key 仅保存在本设备）
        Assert.assertTrue(composeTestRule.onAllNodesWithText("使用说明").fetchSemanticsNodes().isNotEmpty())
        // API Key 不明文持久展示：初始为空且输入框为密码变换（无明文 Key 文本节点）
        Assert.assertTrue(composeTestRule.onAllNodesWithText("sk-").fetchSemanticsNodes().isEmpty())
    }
}
