package com.ielts.app.speaking

import kotlinx.coroutines.delay

/**
 * PILOT-02 Mock 隔离层。
 *
 * 本轮所有"录音/分析"均为本地 UI Mock：
 * - 计时、波形、时长、提交加载、成功过渡、失败触发全部集中在此，
 *   禁止散落在多个 Composable 内。
 * - MOBILE-04 阶段将整体替换：MockRecorder → 真实 Android Recorder，
 *   MockAnalysis → 既有 Speaking Backend，Screen 无需重写。
 * - 结果页数据已迁移至 SpeakingResultFixtures（Result V2 contract 级 fixture）。
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
}
