package com.ielts.app.speaking

import kotlinx.coroutines.delay

/**
 * PILOT-02 Mock 隔离层（MOBILE-04A 修订）。
 *
 * 本轮状态：
 * - REAL_RECORDING = YES（真实 MediaRecorder）
 * - REAL_PLAYBACK = YES（真实 MediaPlayer）
 * - MOCK_ANALYSIS = YES（提交分析仍走 Mock 链，保证 UI Journey 可测试）
 * - REAL_ANALYSIS = NO / BACKEND_CONNECTED = NO
 *
 * 明确隔离（D4/H 节冻结）：
 * - Mock success/failure 不得读取真实音频内容、时长、振幅作判断。
 * - VOICE 提交无条件进入 SUCCESS（Mock 结果链）；真实录音 <4s 不再被判失败。
 * - TEXT <8 字规则为旧演示规则，与 recorder 完全独立（TEXT_MODE_RESULT_FLOW = OPEN_PRE_EXISTING_ISSUE），保留不动。
 *
 * MOBILE-04C 接入真实后端时，替换 submit adapter 即可（不把 Mock 写进 recorder 层）。
 */
object SpeakingMock {

    // ---------------- 提交行为（Mock，非真实接口） ----------------

    /** 分析加载时长（模拟提交延迟） */
    suspend fun submitDelay() = delay(1_600)

    /** 提交成功后的短暂过渡时长 */
    suspend fun successDelay() = delay(900)

    /** VOICE 提交：Mock 分析永不因真实音频失败（REAL_AUDIO=YES / MOCK_ANALYSIS=YES / REAL_ANALYSIS=NO）。 */
    fun voiceSubmitFails(): Boolean = false

    /** TEXT 模式旧演示规则（与 recorder 独立，保留原语义）。 */
    fun textTooShort(textLength: Int): Boolean = textLength < 8
}
