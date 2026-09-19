package com.ielts.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.ielts.app.screens.ApiStatusHero
import com.ielts.app.screens.ApiStatusMode
import com.ielts.app.theme.IeltsTheme
import com.ielts.app.theme.Paper
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * MOBILE-08F §19 — AI 服务状态 Hero 的确定性状态截图（无真实用户 Key，真机无法安全触发连接/验证/失败态）。
 * 仅渲染 ApiStatusHero 视觉组件，不调用任何网络/存储；输出一律标注 ROBOLECTRIC_ONLY，不得冒充真机。
 * 真机唯一取证为 API_CONFIG__UNCONFIGURED__PHYSICAL_DEVICE.png。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h851dp-normal-long-notround-port-notnight-440dpi-keyshidden-nonav")
class ApiConfigStatusScreenshotTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val outDir = "D:/Codex/IELTS-practice/docs/evidence/mobile-08f-final-three-screen"

    @Before
    fun setOutDir() {
        // 基准图统一存放本轮证据目录；captureRoboImage 使用绝对路径，避免 cwd 漂移。
        java.io.File(outDir).mkdirs()
    }

    private fun capture(fileName: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        composeTestRule.setContent {
            IeltsTheme {
                Box(Modifier.fillMaxWidth().background(Paper).padding(16.dp)) { content() }
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onRoot().captureRoboImage("$outDir/$fileName")
    }

    @Test
    fun statusUnconfigured() {
        capture("API_CONFIG__UNCONFIGURED__ROBOLECTRIC_ONLY.png") {
            ApiStatusHero(
                mode = ApiStatusMode.UNCONFIGURED,
                title = "尚未连接",
                subtitle = "配置你的个人 AI 服务后，即可在口语与写作中启用相关 AI 能力。",
            )
        }
    }

    @Test
    fun statusValidating() {
        capture("API_CONFIG__VALIDATING__ROBOLECTRIC_ONLY.png") {
            ApiStatusHero(
                mode = ApiStatusMode.VALIDATING,
                title = "正在验证连接…",
                subtitle = "正在向所选服务发起一次测试请求，请稍候。",
            )
        }
    }

    @Test
    fun statusConnected() {
        capture("API_CONFIG__CONNECTED__ROBOLECTRIC_ONLY.png") {
            ApiStatusHero(
                mode = ApiStatusMode.CONNECTED,
                title = "连接正常",
                subtitle = "密钥有效，当前可以使用你配置的模型。",
                providerLabel = "DeepSeek",
            )
        }
    }

    @Test
    fun statusSavedPending() {
        capture("API_CONFIG__SAVED_PENDING__ROBOLECTRIC_ONLY.png") {
            ApiStatusHero(
                mode = ApiStatusMode.SAVED_PENDING,
                title = "密钥已保存 · 待验证",
                subtitle = "密钥已保存在本机，尚未通过连接测试。",
            )
        }
    }

    @Test
    fun statusFailed() {
        capture("API_CONFIG__FAILED__ROBOLECTRIC_ONLY.png") {
            ApiStatusHero(
                mode = ApiStatusMode.FAILED,
                title = "连接异常",
                subtitle = "无法连接服务或密钥无效，请核对密钥与所选服务后重试",
            )
        }
    }
}
