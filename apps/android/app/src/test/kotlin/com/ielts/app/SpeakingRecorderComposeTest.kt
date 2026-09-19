package com.ielts.app

import android.Manifest
import android.app.Application
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
import com.ielts.app.screens.SpeakingScreen
import com.ielts.app.speaking.FakePlayer
import com.ielts.app.speaking.FakeRecorder
import com.ielts.app.speaking.QuestionSlot
import com.ielts.app.speaking.SpeakingAudioFactory
import com.ielts.app.speaking.SpeakingAudioSession
import com.ielts.app.speaking.SpeakingInputMode
import com.ielts.app.speaking.SpeakingRecordingState
import com.ielts.app.speaking.SpeakingUiState
import com.ielts.app.theme.IeltsTheme
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.service.SeedData
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * MOBILE-04A Recorder UI 状态验收（Compose）。
 * - 代码阶段 evidence 只证明 UI state wiring / permission state / controller transitions；
 *   不宣称"真实录音成功"（REAL_AUDIO_DEVICE = PENDING）。
 * - 生产 main 的 AndroidRecorder/AndroidMediaPlayer 不参与 Robolectric 测试；
 *   Fake 会话仅存在于 test source（工程规则 1 冻结）。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h851dp-normal-long-notround-port-notnight-440dpi-keyshidden-nonav")
class SpeakingRecorderComposeTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val outDir = "D:/Codex/IELTS-practice/docs/evidence/mobile-03d-today-pilot"
    private lateinit var fakeRecorder: FakeRecorder
    private lateinit var fakePlayer: FakePlayer

    @Before
    fun setUpAudio() {
        // Robolectric 默认拒绝运行时权限；授予 RECORD_AUDIO 走真实权限 GRANTED 分支
        org.robolectric.Shadows.shadowOf(app()).grantPermissions(Manifest.permission.RECORD_AUDIO)
        val dir = Files.createTempDirectory("speaking_fake_recorder_test").toFile()
        fakeRecorder = FakeRecorder()
        fakePlayer = FakePlayer()
        SpeakingAudioFactory.createSession = { _ ->
            SpeakingAudioSession(fakeRecorder, fakePlayer, dir)
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

    private fun slot(index: Int = 0, part: String = "P1"): QuestionSlot {
        val pool = SeedData.questions.filter { it.part == part }
        return QuestionSlot(pool[index], index, pool.size)
    }

    private fun state(
        recording: SpeakingRecordingState = SpeakingRecordingState.IDLE,
        isPlaying: Boolean = false,
        micDenied: Boolean = false,
        micPermanent: Boolean = false,
        error: String? = null,
    ) = SpeakingUiState(
        mode = SpeakingInputMode.VOICE,
        recording = recording,
        slot = slot(),
        isPlaying = isPlaying,
        micPermissionDenied = micDenied,
        micPermissionPermanentlyDenied = micPermanent,
        recordingError = error,
    )

    private fun render(ui: SpeakingUiState, file: String) {
        System.setProperty("roborazzi.test.record", "true")
        System.setProperty("roborazzi.output.dir", outDir)
        val nav = newNav()
        composeTestRule.setContent {
            IeltsTheme {
                Scaffold(bottomBar = { BottomBar(nav) }, containerColor = com.ielts.app.theme.Paper) { innerPadding ->
                    NavHost(nav, startDestination = Routes.SPEAKING, modifier = Modifier.fillMaxSize()) {
                        composable(Routes.SPEAKING) { SpeakingScreen(StudyViewModel(app()), nav, innerPadding, ui) }
                    }
                }
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onRoot().captureRoboImage("$outDir/$file")
        println("ROBORAZZI_RECORDER_WRITTEN: $outDir/$file")
    }

    // ---------------- Permission UI（C 节：非技术提示，不暴露 SecurityException / Manifest 词） ----------------

    @Test
    fun permissionDeniedShowsLightPrompt() {
        render(state(micDenied = true), "speaking-permission-denied.png")
        composeTestRule.onNodeWithText("需要麦克风权限才能录音，请允许后重试").assertIsDisplayed()
    }

    @Test
    fun permissionPermanentlyDeniedShowsSettingsEntry() {
        render(state(micDenied = true, micPermanent = true), "speaking-permission-permanent.png")
        composeTestRule.onNodeWithText("麦克风权限已关闭，请在系统设置中开启后重试").assertIsDisplayed()
        composeTestRule.onNodeWithText("前往系统设置").assertIsDisplayed()
    }

    @Test
    fun recordingStartErrorShowsProductPrompt() {
        render(state(error = "录音启动失败，请重试"), "speaking-recorder-start-error.png")
        composeTestRule.onNodeWithText("录音启动失败，请重试").assertIsDisplayed()
    }

    // ---------------- Playback UI（F 节：RECORDED ⇄ PLAYING） ----------------

    @Test
    fun recordedShowsPlay() {
        render(state(recording = SpeakingRecordingState.RECORDED), "speaking-recorder-recorded.png")
        composeTestRule.onNodeWithText("播放录音").assertIsDisplayed()
    }

    @Test
    fun playingShowsStop() {
        render(state(recording = SpeakingRecordingState.RECORDED, isPlaying = true), "speaking-recorder-playing.png")
        composeTestRule.onNodeWithText("停止播放").assertIsDisplayed()
    }

    // ---------------- 提交中原子性（MOBILE-04E：SUBMITTING 期间禁止切 Part/模式） ----------------

    @Test
    fun partSwitchIgnoredDuringSubmitting() {
        render(state(recording = SpeakingRecordingState.SUBMITTING), "speaking-submitting-guard.png")
        // 提交中：题目与加载提示可见
        composeTestRule.onNodeWithText("正在分析你的回答…").assertIsDisplayed()
        composeTestRule.onNodeWithText("Do you usually have a busy day? What do you typically do?").assertIsDisplayed()

        // 点击 P2 不得切走：避免 rerecord() 删除正在分析的音频
        composeTestRule.onNodeWithText("P2 独白").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("正在分析你的回答…").assertIsDisplayed()
        composeTestRule.onNodeWithText("Do you usually have a busy day? What do you typically do?").assertIsDisplayed()
    }

    // ---------------- 真实点击流（Fake 会话）：录音 → 播放 → 停止 → 重录 ----------------

    @Test
    fun clickFlowRecordPlayStopRerecord() {
        val nav = newNav()
        composeTestRule.setContent {
            IeltsTheme {
                Scaffold(bottomBar = { BottomBar(nav) }, containerColor = com.ielts.app.theme.Paper) { innerPadding ->
                    NavHost(nav, startDestination = Routes.SPEAKING, modifier = Modifier.fillMaxSize()) {
                        composable(Routes.SPEAKING) { SpeakingScreen(StudyViewModel(app()), nav, innerPadding) }
                    }
                }
            }
        }
        composeTestRule.waitForIdle()

        // IDLE → 点击麦克风 → RECORDING
        composeTestRule.onNodeWithText("按下开始录音").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("开始录音").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("结束回答").assertIsDisplayed()
        assertTrue(fakeRecorder.started)

        // 结束回答 → RECORDED（fake durationMs=5s → 00:05）
        composeTestRule.onNodeWithText("结束回答").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("提交分析").assertIsDisplayed()
        composeTestRule.onNodeWithText("00:05").assertIsDisplayed()

        // 播放 → PLAYING → 停止 → RECORDED
        composeTestRule.onNodeWithText("播放录音").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("停止播放").assertIsDisplayed()
        assertTrue(fakePlayer.playing)
        composeTestRule.onNodeWithText("停止播放").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("播放录音").assertIsDisplayed()

        // 重新录制 → IDLE（旧文件删除、player release）
        composeTestRule.onNodeWithText("重新录制").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("按下开始录音").assertIsDisplayed()
        assertTrue(fakePlayer.released)
    }

    // ---------------- 录音启动失败（D 节：start 失败 → 清理 → IDLE + 产品提示） ----------------

    @Test
    fun recordingStartFailureStaysIdleWithPrompt() {
        fakeRecorder.failStart = true
        val nav = newNav()
        composeTestRule.setContent {
            IeltsTheme {
                Scaffold(bottomBar = { BottomBar(nav) }, containerColor = com.ielts.app.theme.Paper) { innerPadding ->
                    NavHost(nav, startDestination = Routes.SPEAKING, modifier = Modifier.fillMaxSize()) {
                        composable(Routes.SPEAKING) { SpeakingScreen(StudyViewModel(app()), nav, innerPadding) }
                    }
                }
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithContentDescription("开始录音").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("按下开始录音").assertIsDisplayed()
        composeTestRule.onNodeWithText("录音启动失败，请重试").assertIsDisplayed()
    }
}
