package com.ielts.app.speaking

import com.ielts.core.model.SpeakingQuestion

/**
 * Speaking Shell 状态模型（PILOT-02 冻结）。
 *
 * 状态边界与 Approved Speaking State Board 一致：
 * - 输入方式：语音优先（默认） / 文字辅助
 * - 录音流程：IDLE → RECORDING → RECORDED → SUBMITTING → SUCCESS →（导航至结果页）
 *            └─ ERROR（可重试）
 *
 * MOBILE-04 接入真实 Recorder 时，只替换状态驱动来源（Mock → Real），
 * UI 组件与状态边界保持不变。
 */
enum class SpeakingInputMode { VOICE, TEXT }

enum class SpeakingRecordingState { IDLE, RECORDING, RECORDED, SUBMITTING, SUCCESS, ERROR }

/** 当前问题的展示序号（Question X / Y，X 从 1 起） */
data class QuestionSlot(val question: SpeakingQuestion, val index: Int, val total: Int)

/**
 * Shell 的不可变视图状态。Screen 持有该状态并通过回调驱动变更；
 * 便于测试直接注入任意状态做视觉验收，也与未来真实 Recorder 状态源解耦。
 */
data class SpeakingUiState(
    val mode: SpeakingInputMode = SpeakingInputMode.VOICE,
    val recording: SpeakingRecordingState = SpeakingRecordingState.IDLE,
    val part: String = "P1",
    val slot: QuestionSlot,
    val hintOpen: Boolean = false,
    /** RECORDING 期间已录秒数（Mock 计时，非真实音频） */
    val timerSeconds: Int = 0,
    /** RECORDED 时锁定的时长（Mock） */
    val recordedSeconds: Int = 0,
    /** TEXT 模式输入内容 */
    val text: String = "",
    /** 本轮会话是否已成功提交（仅用于结果页返回语义，不参与录音状态机） */
    val submitted: Boolean = false,
)

/** 状态回调：所有用户动作都以显式回调表达，Screen 层决定如何响应。 */
data class SpeakingEvents(
    val selectPart: (String) -> Unit,
    val toggleHint: () -> Unit,
    val switchMode: (SpeakingInputMode) -> Unit,
    val startRecording: () -> Unit,
    val finishRecording: () -> Unit,
    val cancelRecording: () -> Unit,
    val reRecord: () -> Unit,
    val submit: () -> Unit,
    val retrySubmit: () -> Unit,
    val goResult: () -> Unit,
    val onTextChange: (String) -> Unit,
)
