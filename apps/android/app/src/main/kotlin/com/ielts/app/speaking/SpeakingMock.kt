package com.ielts.app.speaking

import kotlinx.coroutines.delay

/**
 * PILOT-02 Mock 隔离层。
 *
 * 本轮所有"录音/分析"均为本地 UI Mock：
 * - 计时、波形、时长、提交加载、成功过渡、失败触发、结果 fixture 全部集中在此，
 *   禁止散落在多个 Composable 内。
 * - MOBILE-04 阶段将整体替换：MockRecorder → 真实 Android Recorder，
 *   MockAnalysis → 既有 Speaking Backend，Screen 无需重写。
 */
object SpeakingMock {

    // ---------------- 提交行为（Mock） ----------------

    /** 分析加载时长（模拟提交延迟，不调用任何真实接口） */
    suspend fun submitDelay() = delay(1_600)

    /** 提交成功后的短暂过渡时长 */
    suspend fun successDelay() = delay(900)

    /** Mock 失败规则：录音过短 / 文字过短 → 进入 ERROR 状态。仅用于演示状态机。 */
    fun shouldFail(recordedSeconds: Int, textLength: Int, mode: SpeakingInputMode): Boolean {
        val tooShort = if (mode == SpeakingInputMode.VOICE) recordedSeconds < 4 else textLength < 8
        return tooShort
    }

    // ---------------- 结果 fixture（集中定义，非 AI 生成） ----------------

    val result = SpeakingResultFixture(
        overall = "表达较流畅，观点清晰",
        band = "6.5",
        overview = "你在回答中展示了对阅读的兴趣，能够给出具体的例子。整体表达较为流畅，语法错误较少。",
        keepPoints = listOf("表达自然", "例子比较清楚"),
        issues = listOf("时态切换不够稳定", "个别句子太长"),
        suggestions = listOf("练习一般现在时与一般过去时的切换", "把长句拆成两三个短句"),
        sentences = listOf(
            SentenceFixture("Do you enjoy reading?", "很好，直接回答了问题，表达自然。", SentenceVerdict.GOOD),
            SentenceFixture("I usually read fiction books before going to bed.", "句子较长，建议拆分。", SentenceVerdict.IMPROVE),
            SentenceFixture("I prefer paper books because they feel real.", "表达清晰，理由充分。", SentenceVerdict.GOOD),
            SentenceFixture("I read about 3-4 times a week.", "可以使用更具体的频率表达。", SentenceVerdict.IMPROVE),
        ),
        vocabulary = listOf(
            VocabularyFixture("fiction", "fiction 在阅读话题中很常用，可用 novel / non-fiction 替换避免重复。"),
            VocabularyFixture("get into the habit of", "比 always 更具体，适合描述阅读频率。"),
            VocabularyFixture("well-written", "形容书写质量的地道表达，可替代 good。"),
        ),
    )
}

// ---------------- 结果页 fixture 类型 ----------------

enum class SentenceVerdict { GOOD, IMPROVE }

data class SentenceFixture(val text: String, val comment: String, val verdict: SentenceVerdict)

data class VocabularyFixture(val word: String, val note: String)

data class SpeakingResultFixture(
    val overall: String,
    val band: String,
    val overview: String,
    val keepPoints: List<String>,
    val issues: List<String>,
    val suggestions: List<String>,
    val sentences: List<SentenceFixture>,
    val vocabulary: List<VocabularyFixture>,
)
