package com.ielts.app

import android.app.Application
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.navigation.NavHostController
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.compose.DialogNavigator
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.ielts.app.nav.AppNavHost
import com.ielts.app.nav.BottomBar
import com.ielts.app.nav.Routes
import com.ielts.app.screens.SpeakingResultScreen
import com.ielts.app.speaking.FakePlayer
import com.ielts.app.speaking.FakeRecorder
import com.ielts.app.speaking.ResultSummaryModel
import com.ielts.app.speaking.SpeakingAudioFactory
import com.ielts.app.speaking.SpeakingAudioSession
import com.ielts.app.speaking.SpeakingResultFixtures
import com.ielts.app.theme.IeltsTheme
import com.ielts.app.theme.Paper
import com.ielts.app.viewmodel.StudyViewModel
import java.nio.file.Files
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * SPEAKING_RESULT_V2 App Shell 集成验证（真实 AppNavHost / Scaffold / BottomBar / Navigation Compose）。
 *
 * - 正常态：完整 AppNavHost 真实导航渲染（今日→口语→结果→详情），截图含 real page container + Bottom Navigation。
 * - Fallback / NEEDS_REVIEW：无真实后端注入路径，采用与 AppNavHost 相同的 Scaffold+BottomBar+NavHost
 *   容器注入 fixture 渲染（real page container / safe-area 处理一致），非裸 setContent。
 * - 导航契约：Summary→Detail→back→Summary→back→Speaking；「再练一次」回新起点且不产生重复 back stack。
 * - 真实手机高度（393dp/851dp、360dp/800dp）验证滚动与 CTA 可达性。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h851dp-normal-long-notround-port-notnight-440dpi-keyshidden-nonav")
class SpeakingResultAppShellTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val outDir = "D:/Codex/IELTS-practice/docs/evidence/mobile-03d-today-pilot"

    /** MOBILE-04A：真实 VOICE 流程测试注入 Fake 会话（Robolectric 无真实 MediaRecorder）。 */
    @Before
    fun setUpAudio() {
        // Robolectric 默认拒绝运行时权限；授予 RECORD_AUDIO 走真实权限 GRANTED 分支
        org.robolectric.Shadows.shadowOf(app())
            .grantPermissions(android.Manifest.permission.RECORD_AUDIO)
        val dir = Files.createTempDirectory("speaking_fake_shell").toFile()
        SpeakingAudioFactory.createSession = { _ ->
            SpeakingAudioSession(FakeRecorder(), FakePlayer(), dir)
        }
    }

    @After
    fun tearDownAudio() {
        SpeakingAudioFactory.createSession = { context ->
            SpeakingAudioSession(
                com.ielts.app.speaking.AndroidRecorder(context),
                com.ielts.app.speaking.AndroidMediaPlayer(),
                java.io.File(context.cacheDir, "speaking"),
            )
        }
    }

    private fun app(): Application = ApplicationProvider.getApplicationContext()

    private fun newNav(): NavHostController = NavHostController(app()).apply {
        navigatorProvider.addNavigator(ComposeNavigator())
        navigatorProvider.addNavigator(DialogNavigator())
    }

    private fun capture(file: String) {
        System.setProperty("roborazzi.test.record", "true")
        composeTestRule.waitForIdle()
        composeTestRule.onRoot().captureRoboImage("$outDir/$file")
        println("ROBORAZZI_APP_SHELL_WRITTEN: $outDir/$file")
    }

    private fun withAppShell(block: (NavHostController, StudyViewModel) -> Unit) {
        val nav = newNav()
        val vm = StudyViewModel(app())
        composeTestRule.setContent { IeltsTheme { AppNavHost(nav, vm) } }
        block(nav, vm)
    }

    /** 与 AppNavHost 相同的 Scaffold+BottomBar+NavHost 容器，注入指定结果 model（fallback / needs_review）。 */
    private fun withShellRoute(model: ResultSummaryModel, route: String, file: String) {
        val nav = newNav()
        composeTestRule.setContent {
            IeltsTheme {
                Scaffold(bottomBar = { BottomBar(nav) }, containerColor = Paper) { inner ->
                    NavHost(nav, startDestination = route, modifier = Modifier.fillMaxSize()) {
                        composable(route) { SpeakingResultScreen(nav, inner, model) }
                    }
                }
            }
        }
        capture(file)
    }

    // ---------------- App Shell 渲染：393dp ----------------

    @Test
    fun appShellSummary393() {
        withAppShell { nav, _ ->
            nav.navigate(Routes.SPEAKING)
            nav.navigate(Routes.SPEAKING_RESULT)
        }
        capture("v2-app-summary-393.png")
        composeTestRule.onNodeWithText("口语练习 · 结果").assertIsDisplayed()
        // Bottom Navigation 存在（5 个冻结 tab）
        composeTestRule.onNodeWithText("今日").assertIsDisplayed()
        composeTestRule.onNodeWithText("学习").assertIsDisplayed()
        composeTestRule.onNodeWithText("复习").assertIsDisplayed()
        composeTestRule.onNodeWithText("口语").assertIsDisplayed()
        composeTestRule.onNodeWithText("我的").assertIsDisplayed()
    }

    @Test
    fun appShellDetailOverview393() {
        withAppShell { nav, _ ->
            nav.navigate(Routes.SPEAKING)
            nav.navigate(Routes.SPEAKING_RESULT)
            composeTestRule.onNodeWithText("查看完整分析").performClick()
        }
        capture("v2-app-detail-overview-393.png")
        composeTestRule.onNodeWithText("查看完整分析").assertIsDisplayed()
        composeTestRule.onNodeWithText("总览").assertIsDisplayed()
        composeTestRule.onNodeWithText("能力分析").assertIsDisplayed()
        composeTestRule.onNodeWithText("整体评价").assertIsDisplayed()
    }

    @Test
    fun appShellDetailAbility393() {
        withAppShell { nav, _ ->
            nav.navigate(Routes.SPEAKING)
            nav.navigate(Routes.SPEAKING_RESULT)
            composeTestRule.onNodeWithText("查看完整分析").performClick()
            composeTestRule.onNodeWithText("能力分析").performClick()
        }
        capture("v2-app-detail-ability-393.png")
        composeTestRule.onNodeWithText("流利度").assertIsDisplayed()
        // 第四张卡（发音）不在首屏：滚动可达即可，不要求首屏可见
        composeTestRule.onNodeWithText("发音").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("本次未评估").performScrollTo().assertIsDisplayed()
    }

    // ---------------- App Shell 渲染：360dp ----------------

    @Test
    @Config(sdk = [34], qualifiers = "w360dp-h800dp-normal-notlong-notround-port-notnight-420dpi-keyshidden-nonav")
    fun appShellSummary360() {
        withAppShell { nav, _ ->
            nav.navigate(Routes.SPEAKING)
            nav.navigate(Routes.SPEAKING_RESULT)
        }
        capture("v2-app-summary-360.png")
        composeTestRule.onNodeWithText("口语练习 · 结果").assertIsDisplayed()
        // CTA 可滚动触达、不被 BottomBar 遮挡
        composeTestRule.onNodeWithText("再练一次").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("查看完整分析").performScrollTo().assertIsDisplayed()
    }

    @Test
    @Config(sdk = [34], qualifiers = "w360dp-h800dp-normal-notlong-notround-port-notnight-420dpi-keyshidden-nonav")
    fun appShellDetailAbility360() {
        withAppShell { nav, _ ->
            nav.navigate(Routes.SPEAKING)
            nav.navigate(Routes.SPEAKING_RESULT)
            composeTestRule.onNodeWithText("查看完整分析").performClick()
            composeTestRule.onNodeWithText("能力分析").performClick()
        }
        capture("v2-app-detail-ability-360.png")
        composeTestRule.onNodeWithText("流利度").assertIsDisplayed()
        composeTestRule.onNodeWithText("发音").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("本次未评估").performScrollTo().assertIsDisplayed()
    }

    // ---------------- 特殊状态（真实 Shell 容器 + fixture 注入） ----------------

    @Test
    fun appShellFallback393() {
        withShellRoute(SpeakingResultFixtures.fallbackUi(), Routes.SPEAKING_RESULT, "v2-app-fallback-393.png")
        composeTestRule.onNodeWithText("表现证据").assertDoesNotExist()
        composeTestRule.onNodeWithText("优先改进").assertIsDisplayed()
        composeTestRule.onNodeWithText("下一步怎么练").assertIsDisplayed()
    }

    @Test
    fun appShellNeedsReview393() {
        withShellRoute(SpeakingResultFixtures.needsReviewUi(), Routes.SPEAKING_RESULT, "v2-app-needs-review-393.png")
        composeTestRule.onNodeWithText("这次分析信息不够完整，以下建议仅供参考。重新回答一次可以获得更完整的反馈。").assertIsDisplayed()
    }

    // ---------------- 导航契约 ----------------

    @Test
    fun navFlowResultJourney() {
        withAppShell { nav, _ ->
            // 口语 → 结果 Summary
            nav.navigate(Routes.SPEAKING)
            nav.navigate(Routes.SPEAKING_RESULT)
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("口语练习 · 结果").assertIsDisplayed()

            // Summary → Detail（点真实 CTA）
            composeTestRule.onNodeWithText("查看完整分析").performClick()
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("总览").assertIsDisplayed()

            // Detail back → Summary
            nav.popBackStack()
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("口语练习 · 结果").assertIsDisplayed()

            // Summary back → Speaking
            nav.popBackStack()
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("口语练习").assertIsDisplayed()

            // 「再练一次」→ 新 Speaking 起点，无重复 back stack、不回首页
            nav.navigate(Routes.SPEAKING_RESULT)
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("再练一次").performClick()
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("口语练习").assertIsDisplayed()
            composeTestRule.onNodeWithText("口语练习 · 结果").assertDoesNotExist()
        }
    }

    /** 真实 AppNavHost：切文字模式 → 输入 → 提交按钮被启用（真实用户路径的确定性部分）。 */
    @Test
    fun textInputArmsSubmitInShell() {
        withAppShell { nav, _ ->
            nav.navigate(Routes.SPEAKING)
            composeTestRule.waitForIdle()

            composeTestRule.onAllNodesWithText("文字输入")[0].performClick()
            composeTestRule.waitForIdle()
            composeTestRule.onNode(hasSetTextAction()).performTextInput("I usually read fiction books before going to bed.")
            composeTestRule.waitForIdle()

            composeTestRule.onNodeWithText("分析一下").assertIsEnabled()
        }
    }

    /**
     * 真实 AppNavHost 下的真实用户路径（VOICE 主流程，与 PILOT-02 六状态机一致）：
     * IDLE → 点击开始录音 → RECORDING（Fake 会话；真实 timer 以 elapsedRealtime 为准）
     * → 结束回答 → RECORDED → 提交分析 → SUBMITTING → mainClock 推进 Mock 延迟 → SUCCESS
     * → 查看结果（真实导航）→ Result Summary。
     *
     * MOBILE-04A：VOICE 提交不再读取录音时长判失败（D4 解耦，REAL_AUDIO=YES / MOCK_ANALYSIS=YES）。
     * 注：TEXT 模式提交后 UI 恒渲染 TextPanel（SUBMITTING/SUCCESS 态仅在 VOICE 面板展示），
     * 属 V1 既有行为、独立于 Recorder（TEXT_MODE_ISSUE_RELATION = INDEPENDENT，DEFER）。
     */
    @Test
    fun realFlowVoiceSubmitToResult() {
        withAppShell { nav, _ ->
            nav.navigate(Routes.SPEAKING)
            composeTestRule.waitForIdle()

            // IDLE → 点击麦克风（contentDescription，与 V1 clickThroughVoiceFlow 一致）→ RECORDING
            composeTestRule.onNodeWithContentDescription("开始录音").performClick()
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("结束回答").assertExists()
            // 推进会话计时（驱动 RECORDING 计时 effect；提交成功不依赖录音时长）
            composeTestRule.mainClock.advanceTimeBy(5_000)
            composeTestRule.waitForIdle()

            // 结束回答 → RECORDED
            composeTestRule.onNodeWithText("结束回答").performClick()
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("提交分析").assertExists()

            // 提交分析 → SUBMITTING
            composeTestRule.onNodeWithText("提交分析").performClick()
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("正在分析你的回答…").assertExists()

            // 推进 Mock 延迟（1.6s + 0.9s）→ SUCCESS
            composeTestRule.mainClock.advanceTimeBy(3_000)
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("查看结果").assertExists()

            // 查看结果 → 真实导航 → Result Summary
            composeTestRule.onNodeWithText("查看结果").performClick()
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithText("口语练习 · 结果").assertIsDisplayed()
        }
    }
}
