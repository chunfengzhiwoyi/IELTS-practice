package com.ielts.app

import android.app.Application
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.navigation.NavHostController
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.compose.DialogNavigator
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import com.ielts.app.nav.BottomBar
import com.ielts.app.nav.Routes
import com.ielts.app.screens.SpeakingResultDetailScreen
import com.ielts.app.screens.SpeakingResultScreen
import com.ielts.app.screens.SpeakingScreen
import com.ielts.app.speaking.QuestionSlot
import com.ielts.app.speaking.SpeakingInputMode
import com.ielts.app.speaking.SpeakingRecordingState
import com.ielts.app.speaking.SpeakingUiState
import com.ielts.app.theme.IeltsTheme
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.service.SeedData
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * PILOT-02 Speaking Shell 截图验收。
 * - 393dp：IDLE / RECORDING / RECORDED / SUBMITTING / ERROR / TEXT / RESULT SUMMARY / RESULT DETAIL
 * - 360dp：IDLE / RECORDING / RESULT SUMMARY
 * 真实题库（SeedData）+ 真实 BottomBar（口语 active）；录音/分析均为 SpeakingMock（集中隔离）。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h851dp-normal-long-notround-port-notnight-440dpi-keyshidden-nonav")
class SpeakingScreenshotTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val outDir = "D:/Codex/IELTS-practice/docs/evidence/mobile-03d-today-pilot"

    private fun slot(index: Int = 0, part: String = "P1"): QuestionSlot {
        val pool = SeedData.questions.filter { it.part == part }
        // index 字段为 0-based 池下标；UI 显示层自会 +1 为「Question N / total」
        return QuestionSlot(pool[index], index, pool.size)
    }

    private fun state(
        recording: SpeakingRecordingState = SpeakingRecordingState.IDLE,
        mode: SpeakingInputMode = SpeakingInputMode.VOICE,
        timer: Int = 0,
        recorded: Int = 0,
        text: String = "",
    ) = SpeakingUiState(
        mode = mode,
        recording = recording,
        slot = slot(),
        timerSeconds = timer,
        recordedSeconds = recorded,
        text = text,
    )

    private fun renderSpeaking(
        ui: SpeakingUiState,
        file: String,
        nav: NavHostController,
        vm: StudyViewModel,
    ) {
        System.setProperty("roborazzi.test.record", "true")
        System.setProperty("roborazzi.output.dir", outDir)
        composeTestRule.setContent {
            IeltsTheme {
                Scaffold(bottomBar = { BottomBar(nav) }, containerColor = com.ielts.app.theme.Paper) { innerPadding ->
                    NavHost(nav, startDestination = Routes.SPEAKING, modifier = Modifier.fillMaxSize()) {
                        composable(Routes.SPEAKING) { SpeakingScreen(vm, nav, innerPadding, ui) }
                    }
                }
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onRoot().captureRoboImage(file)
        println("ROBORAZZI_SPK_WRITTEN: " + file)
    }

    private fun renderScreen(
        content: @androidx.compose.runtime.Composable () -> Unit,
        file: String,
    ) {
        System.setProperty("roborazzi.test.record", "true")
        System.setProperty("roborazzi.output.dir", outDir)
        composeTestRule.setContent { IeltsTheme { content() } }
        composeTestRule.waitForIdle()
        composeTestRule.onRoot().captureRoboImage(file)
        println("ROBORAZZI_SPK_WRITTEN: " + file)
    }

    private fun newNav(app: Application): NavHostController =
        NavHostController(app).apply {
            navigatorProvider.addNavigator(ComposeNavigator())
            navigatorProvider.addNavigator(DialogNavigator())
        }

    // ---------------- 393dp：八状态 ----------------

    @Test
    fun captureSpeakingIdle() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderSpeaking(state(), "speaking-idle.png", newNav(app), StudyViewModel(app))
    }

    @Test
    fun captureSpeakingRecording() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderSpeaking(state(recording = SpeakingRecordingState.RECORDING, timer = 24), "speaking-recording.png", newNav(app), StudyViewModel(app))
    }

    @Test
    fun captureSpeakingRecorded() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderSpeaking(state(recording = SpeakingRecordingState.RECORDED, recorded = 67), "speaking-recorded.png", newNav(app), StudyViewModel(app))
    }

    @Test
    fun captureSpeakingSubmitting() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderSpeaking(state(recording = SpeakingRecordingState.SUBMITTING), "speaking-submitting.png", newNav(app), StudyViewModel(app))
    }

    @Test
    fun captureSpeakingError() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderSpeaking(state(recording = SpeakingRecordingState.ERROR), "speaking-error.png", newNav(app), StudyViewModel(app))
    }

    @Test
    fun captureSpeakingText() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderSpeaking(state(mode = SpeakingInputMode.TEXT), "speaking-text.png", newNav(app), StudyViewModel(app))
    }

    @Test
    fun captureSpeakingResultSummary() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderScreen({ SpeakingResultScreen(newNav(app), PaddingValues()) }, "speaking-result-summary.png")
    }

    @Test
    fun captureSpeakingResultDetail() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderScreen({ SpeakingResultDetailScreen(newNav(app), PaddingValues()) }, "speaking-result-detail.png")
    }

    // ---------------- 360dp：窄屏关键状态 ----------------

    @Test
    @Config(sdk = [34], qualifiers = "w360dp-h800dp-normal-notlong-notround-port-notnight-420dpi-keyshidden-nonav")
    fun captureSpeakingIdleNarrow() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderSpeaking(state(), "speaking-idle-narrow.png", newNav(app), StudyViewModel(app))
    }

    @Test
    @Config(sdk = [34], qualifiers = "w360dp-h800dp-normal-notlong-notround-port-notnight-420dpi-keyshidden-nonav")
    fun captureSpeakingRecordingNarrow() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderSpeaking(state(recording = SpeakingRecordingState.RECORDING, timer = 24), "speaking-recording-narrow.png", newNav(app), StudyViewModel(app))
    }

    @Test
    @Config(sdk = [34], qualifiers = "w360dp-h800dp-normal-notlong-notround-port-notnight-420dpi-keyshidden-nonav")
    fun captureSpeakingResultSummaryNarrow() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        renderScreen({ SpeakingResultScreen(newNav(app), PaddingValues()) }, "speaking-result-summary-narrow.png")
    }

    // ---------------- 功能冒烟：真实状态机 IDLE → RECORDING → RECORDED ----------------

    @Test
    fun clickThroughVoiceFlow() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        val nav = newNav(app)
        val vm = StudyViewModel(app)
        composeTestRule.setContent {
            IeltsTheme {
                Scaffold(bottomBar = { BottomBar(nav) }, containerColor = com.ielts.app.theme.Paper) { innerPadding ->
                    NavHost(nav, startDestination = Routes.SPEAKING, modifier = Modifier.fillMaxSize()) {
                        composable(Routes.SPEAKING) { SpeakingScreen(vm, nav, innerPadding) }
                    }
                }
            }
        }
        composeTestRule.onNodeWithText("点击开始录音").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("开始录音").performClick()
        composeTestRule.onNodeWithText("结束回答").assertIsDisplayed()
        composeTestRule.onNodeWithText("取消录音").performClick()
        composeTestRule.onNodeWithText("点击开始录音").assertIsDisplayed()
    }
}
