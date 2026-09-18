package com.ielts.app.screens

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.ielts.app.theme.Accent
import com.ielts.app.theme.AccentDeep
import com.ielts.app.theme.Bronze
import com.ielts.app.theme.LineStrong
import com.ielts.core.model.StatusDistribution
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * MOBILE-P0-REPORT-CRASH-FIX — MasteryStack 零权重崩溃回归测试。
 * 覆盖：全正 / 单桶 0 / 多桶 0 / 仅一桶正 / 全 0。
 * 断言：无 crash；比例语义正确；0 桶不渲染、不塞 epsilon、不伪造比例；全 0 安全空态。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class ReportMasteryStackTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val eps = 1e-6f

    // 1. all buckets > 0
    @Test
    fun allBucketsPositive_fractionsAreExact() {
        val segments = masterySegments(StatusDistribution(new = 1, learning = 2, reviewing = 3, mastered = 4))
        assertEquals(4, segments.size)
        assertEquals(LineStrong.value, segments[0].first.value)
        assertEquals(Bronze.value, segments[1].first.value)
        assertEquals(AccentDeep.value, segments[2].first.value)
        assertEquals(Accent.value, segments[3].first.value)
        assertEquals(0.1f, segments[0].second, eps)
        assertEquals(0.2f, segments[1].second, eps)
        assertEquals(0.3f, segments[2].second, eps)
        assertEquals(0.4f, segments[3].second, eps)
        assertEquals(1f, segments.sumOf { it.second.toDouble() }.toFloat(), eps)
    }

    // 2. one bucket = 0
    @Test
    fun oneBucketZero_zeroBucketExcludedAndFractionsRebased() {
        val segments = masterySegments(StatusDistribution(new = 0, learning = 1, reviewing = 1, mastered = 1))
        assertEquals(3, segments.size)
        assertEquals(Bronze.value, segments[0].first.value)
        assertEquals(AccentDeep.value, segments[1].first.value)
        assertEquals(Accent.value, segments[2].first.value)
        segments.forEach { assertEquals(1f / 3f, it.second, eps) }
        assertTrue(segments.none { it.second <= 0f })
    }

    // 3. multiple buckets = 0
    @Test
    fun multipleBucketsZero_onlyPositiveKept() {
        val segments = masterySegments(StatusDistribution(new = 2, learning = 0, reviewing = 0, mastered = 3))
        assertEquals(2, segments.size)
        assertEquals(LineStrong.value, segments[0].first.value)
        assertEquals(Accent.value, segments[1].first.value)
        assertEquals(0.4f, segments[0].second, eps)
        assertEquals(0.6f, segments[1].second, eps)
    }

    // 4. only one bucket > 0
    @Test
    fun onlyOneBucketPositive_singleFullSegment() {
        val segments = masterySegments(StatusDistribution(new = 0, learning = 0, reviewing = 5, mastered = 0))
        assertEquals(1, segments.size)
        assertEquals(AccentDeep.value, segments[0].first.value)
        assertEquals(1f, segments[0].second, eps)
    }

    // 5. all buckets = 0
    @Test
    fun allBucketsZero_emptySegmentsNoFabrication() {
        val segments = masterySegments(StatusDistribution(new = 0, learning = 0, reviewing = 0, mastered = 0))
        assertTrue(segments.isEmpty())
    }

    // ---- Compose: 五种分布均不得崩溃（回归 weight(0f) 崩溃） ----

    @Test
    fun rendersWithoutCrash_allPositive() {
        composeTestRule.setContent {
            MasteryStack(StatusDistribution(new = 1, learning = 2, reviewing = 3, mastered = 4), Modifier.fillMaxWidth().height(26.dp))
        }
        composeTestRule.onRoot().assertExists()
    }

    @Test
    fun rendersWithoutCrash_oneZero() {
        composeTestRule.setContent {
            MasteryStack(StatusDistribution(new = 0, learning = 1, reviewing = 1, mastered = 1), Modifier.fillMaxWidth().height(26.dp))
        }
        composeTestRule.onRoot().assertExists()
    }

    @Test
    fun rendersWithoutCrash_multipleZero() {
        composeTestRule.setContent {
            MasteryStack(StatusDistribution(new = 2, learning = 0, reviewing = 0, mastered = 3), Modifier.fillMaxWidth().height(26.dp))
        }
        composeTestRule.onRoot().assertExists()
    }

    @Test
    fun rendersWithoutCrash_onlyOnePositive() {
        composeTestRule.setContent {
            MasteryStack(StatusDistribution(new = 0, learning = 0, reviewing = 5, mastered = 0), Modifier.fillMaxWidth().height(26.dp))
        }
        composeTestRule.onRoot().assertExists()
    }

    @Test
    fun rendersWithoutCrash_allZero() {
        composeTestRule.setContent {
            MasteryStack(StatusDistribution(new = 0, learning = 0, reviewing = 0, mastered = 0), Modifier.fillMaxWidth().height(26.dp))
        }
        composeTestRule.onRoot().assertExists()
    }
}
