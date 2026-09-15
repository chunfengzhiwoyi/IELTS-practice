package com.ielts.app

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollTo
import androidx.navigation.NavHostController
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.compose.DialogNavigator
import com.github.takahirom.roborazzi.captureRoboImage
import com.ielts.app.nav.AppNavHost
import com.ielts.app.theme.IeltsTheme
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.model.EventCorrectness
import com.ielts.core.model.LearningEvent
import com.ielts.core.model.LearningStatus
import com.ielts.core.model.UserItemState
import com.ielts.core.storage.MemoryStorageAdapter
import com.ielts.core.storage.Store
import java.time.Instant
import java.time.temporal.ChronoUnit
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * R2 视觉验收截图（JVM Compose 渲染，非模拟器）。
 * 数据通过真实存储层（Store → MemoryStorageAdapter）以真实 schema 预置，
 * 页面展示完全由既有 getTodaySummary / generateReport 逻辑产出。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "w393dp-h851dp-normal-long-notround-port-notnight-440dpi-keyshidden-nonav",
)
class TodayScreenScreenshotTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val outDir = "D:/Codex/IELTS-practice/docs/evidence/mobile-03d-today-pilot"

    /** 通过真实 Store 层写入 5 个到期词 + 3 天周记录（今天/昨天/3 天前） */
    private fun seedRealData() {
        Store.adapter = MemoryStorageAdapter()
        val past = "2020-01-01T00:00:00Z"
        val states = (1..5).associate { i ->
            "item-$i" to UserItemState(
                userId = "u1",
                itemId = "item-$i",
                status = LearningStatus.RECALLED_WITH_HELP,
                recognitionLevel = 1,
                recallLevel = 1,
                applicationLevel = 0,
                consecutiveCorrect = 1,
                currentIntervalDays = 1.0,
                nextReviewAt = past,
                updatedAt = past,
            )
        }
        Store.setJSON("states", states)

        val now = Instant.now()
        fun event(id: String, itemId: String, offsetDays: Long) = LearningEvent(
            id = id,
            userId = "u1",
            itemId = itemId,
            eventType = "NEW",
            taskType = "MEANING_RECALL",
            answer = "x",
            correctness = EventCorrectness.INDEPENDENT,
            hintLevel = 0,
            clientEventId = id,
            traceId = "trc-$id",
            createdAt = now.minus(offsetDays, ChronoUnit.DAYS).toString(),
            durationMs = 30000,
        )
        Store.setJSON(
            "events",
            listOf(
                event("e1", "item-1", 0),
                event("e2", "item-2", 0),
                event("e3", "item-3", 0),
                event("e4", "item-4", 1),
                event("e5", "item-5", 3),
            ),
        )
    }

    private fun renderToday(screenshotPath: String) {
        // Roborazzi：无系统属性时 taskType 默认为 None（静默不写文件），此处显式开启记录并指定输出目录
        System.setProperty("roborazzi.test.record", "true")
        System.setProperty("roborazzi.output.dir", outDir)
        seedRealData()
        val app = ApplicationProvider.getApplicationContext<Application>()
        val vm = StudyViewModel(app)
        val nav = NavHostController(app).apply {
            navigatorProvider.addNavigator(ComposeNavigator())
            navigatorProvider.addNavigator(DialogNavigator())
        }
        composeTestRule.setContent {
            IeltsTheme {
                // 渲染真实生产入口：Scaffold + BottomBar + NavHost(TODAY)
                AppNavHost(navController = nav, vm = vm)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onRoot().captureRoboImage(screenshotPath)
        println("ROBORAZZI_WRITTEN: " + screenshotPath + " cwd=" + java.io.File(".").absolutePath)
    }

    @Test
    fun captureTodayTargetSize() {
        renderToday("r2-android-today-pixel5.png")
    }

    @Test
    @Config(
        sdk = [34],
        qualifiers = "w360dp-h800dp-normal-notlong-notround-port-notnight-420dpi-keyshidden-nonav",
    )
    fun captureTodayNarrow() {
        renderToday("r2-android-today-narrow.png")
    }

    @Test
    @Config(
        sdk = [34],
        qualifiers = "w360dp-h800dp-normal-notlong-notround-port-notnight-420dpi-keyshidden-nonav",
    )
    fun captureTodayNarrowScrolledToBottom() {
        renderToday("r2-android-today-narrow-scrolled.png")
        // 滚动到底：第二排快捷入口必须完整可见、不被 BottomBar 遮挡
        composeTestRule.onNodeWithText("学习报告").performScrollTo()
        composeTestRule.waitForIdle()
        composeTestRule.onRoot().captureRoboImage("r2-android-today-narrow-scrolled.png")
        println("ROBORAZZI_WRITTEN_SCROLLED: r2-android-today-narrow-scrolled.png")
    }
}
