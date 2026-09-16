package com.ielts.app

import android.app.Application
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.navigation.NavHostController
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.ielts.app.screens.SpeakingResultDetailScreen
import com.ielts.app.screens.SpeakingResultScreen
import com.ielts.app.speaking.SpeakingResultFixtures
import com.ielts.app.theme.IeltsTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * SPEAKING_RESULT_V2 截图验收（专用测试）。
 * 覆盖：Summary 正常态 / Fallback 态 / NeedsReview 态；Detail 总览态 / 能力分析态 / Fallback 态；
 * 393dp 与 360dp。渲染已批准视觉稿对应状态，输出到 docs/evidence/mobile-03d-today-pilot/。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h851dp-normal-long-notround-port-notnight-440dpi-keyshidden-nonav")
class SpeakingResultV2ScreenshotTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val outDir = "D:/Codex/IELTS-practice/docs/evidence/mobile-03d-today-pilot"

    private fun nav(): NavHostController =
        NavHostController(ApplicationProvider.getApplicationContext<Application>())

    private fun capture(content: @androidx.compose.runtime.Composable () -> Unit, file: String, setup: () -> Unit = {}) {
        System.setProperty("roborazzi.test.record", "true")
        System.setProperty("roborazzi.output.dir", outDir)
        composeTestRule.setContent { IeltsTheme { content() } }
        composeTestRule.waitForIdle()
        setup()
        composeTestRule.waitForIdle()
        // 直接传绝对路径，避免依赖 output.dir 属性解析（与现有测试一致，确定性落盘）
        composeTestRule.onRoot().captureRoboImage("$outDir/$file")
        println("ROBORAZZI_V2_WRITTEN: $outDir/$file")
    }

    // ---------------- 393dp ----------------

    @Test
    fun v2SummaryFull() {
        capture({ SpeakingResultScreen(nav(), PaddingValues(), SpeakingResultFixtures.fullUi()) }, "v2-summary.png")
        composeTestRule.onNodeWithText("口语练习 · 结果").assertIsDisplayed()
        composeTestRule.onNodeWithText("整体评价").assertIsDisplayed()
        composeTestRule.onNodeWithText("表现证据").assertIsDisplayed()
        composeTestRule.onNodeWithText("优先改进").assertIsDisplayed()
        composeTestRule.onNodeWithText("下一步怎么练").assertIsDisplayed()
    }

    @Test
    fun v2SummaryFallback() {
        capture({ SpeakingResultScreen(nav(), PaddingValues(), SpeakingResultFixtures.fallbackUi()) }, "v2-summary-fallback.png")
        // fallback：表现证据整卡隐藏
        composeTestRule.onNodeWithText("表现证据").assertDoesNotExist()
        composeTestRule.onNodeWithText("优先改进").assertIsDisplayed()
        composeTestRule.onNodeWithText("下一步怎么练").assertIsDisplayed()
    }

    @Test
    fun v2SummaryNeedsReview() {
        capture({ SpeakingResultScreen(nav(), PaddingValues(), SpeakingResultFixtures.needsReviewUi()) }, "v2-summary-needsreview.png")
        composeTestRule.onNodeWithText("这次分析信息不够完整，以下建议仅供参考。重新回答一次可以获得更完整的反馈。").assertIsDisplayed()
    }

    @Test
    fun v2DetailOverview() {
        capture({ SpeakingResultDetailScreen(nav(), PaddingValues(), SpeakingResultFixtures.fullUi()) }, "v2-detail-overview.png")
        composeTestRule.onNodeWithText("总览").assertIsDisplayed()
        composeTestRule.onNodeWithText("能力分析").assertIsDisplayed()
        composeTestRule.onNodeWithText("整体评价").assertIsDisplayed()
        composeTestRule.onNodeWithText("表现证据").assertIsDisplayed()
    }

    @Test
    @Config(sdk = [34], qualifiers = "w393dp-h1400dp-normal-long-notround-port-notnight-440dpi-keyshidden-nonav")
    fun v2DetailAbility() {
        capture(
            { SpeakingResultDetailScreen(nav(), PaddingValues(), SpeakingResultFixtures.fullUi()) },
            "v2-detail-ability.png",
            setup = { composeTestRule.onNodeWithText("能力分析").performClick() },
        )
        composeTestRule.onNodeWithText("流利度").assertIsDisplayed()
        composeTestRule.onNodeWithText("词汇资源").assertIsDisplayed()
        composeTestRule.onNodeWithText("语法范围").assertIsDisplayed()
        composeTestRule.onNodeWithText("发音").assertIsDisplayed()
        composeTestRule.onNodeWithText("本次未评估").assertIsDisplayed()
    }

    @Test
    fun v2DetailFallback() {
        capture({ SpeakingResultDetailScreen(nav(), PaddingValues(), SpeakingResultFixtures.fallbackUi()) }, "v2-detail-fallback.png")
        // fallback：不渲染「能力分析」tab，也不堆空卡
        composeTestRule.onNodeWithText("能力分析").assertDoesNotExist()
        composeTestRule.onNodeWithText("优先改进").assertIsDisplayed()
    }

    // ---------------- 360dp ----------------

    @Test
    @Config(sdk = [34], qualifiers = "w360dp-h800dp-normal-notlong-notround-port-notnight-420dpi-keyshidden-nonav")
    fun v2SummaryFullNarrow() {
        capture({ SpeakingResultScreen(nav(), PaddingValues(), SpeakingResultFixtures.fullUi()) }, "v2-summary-narrow.png")
        composeTestRule.onNodeWithText("口语练习 · 结果").assertIsDisplayed()
    }

    @Test
    @Config(sdk = [34], qualifiers = "w360dp-h800dp-normal-notlong-notround-port-notnight-420dpi-keyshidden-nonav")
    fun v2DetailAbilityNarrow() {
        capture(
            { SpeakingResultDetailScreen(nav(), PaddingValues(), SpeakingResultFixtures.fullUi()) },
            "v2-detail-ability-narrow.png",
            setup = { composeTestRule.onNodeWithText("能力分析").performClick() },
        )
        composeTestRule.onNodeWithText("流利度").assertIsDisplayed()
    }
}
