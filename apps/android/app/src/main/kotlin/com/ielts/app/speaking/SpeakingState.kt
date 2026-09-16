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
 *
 * MOBILE-04A 扩展（保持 PILOT-02 冻结状态边界不变）：
 * - isPlaying：RECORDED 态本地播放（MediaPlayer 闭环）
 * - micPermissionDenied / micPermissionPermanentlyDenied：麦克风权限产品提示
 * - recordingError：录音启动/保存失败的产品级提示（非技术原因）
 */
data class SpeakingUiState(
    val mode: SpeakingInputMode = SpeakingInputMode.VOICE,
    val recording: SpeakingRecordingState = SpeakingRecordingState.IDLE,
    val part: String = "P1",
    val slot: QuestionSlot,
    val hintOpen: Boolean = false,
    /** RECORDING 期间已录秒数（真实 session 计时） */
    val timerSeconds: Int = 0,
    /** RECORDED 时锁定的时长（真实 recorder 实测） */
    val recordedSeconds: Int = 0,
    /** TEXT 模式输入内容 */
    val text: String = "",
    /** 本轮会话是否已成功提交（仅用于结果页返回语义，不参与录音状态机） */
    val submitted: Boolean = false,
    /** RECORDED 态本地播放中 */
    val isPlaying: Boolean = false,
    /** 麦克风权限被拒（本轮会话）→ IDLE 态非技术提示 */
    val micPermissionDenied: Boolean = false,
    /** 权限被永久拒绝（需系统设置入口） */
    val micPermissionPermanentlyDenied: Boolean = false,
    /** 录音启动/保存失败的产品级提示 */
    val recordingError: String? = null,
    /** 提交分析失败的产品级提示（真实后端路径；仅产品语言，禁止技术文本） */
    val submitError: String? = null,
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
    /** RECORDED 态播放/停止（MOBILE-04A） */
    val togglePlayback: () -> Unit,
    /** 权限被永久拒绝时前往系统设置（MOBILE-04A） */
    val openMicSettings: () -> Unit,
)

// ---------------- 麦克风权限判定（MOBILE-04A，纯逻辑可测） ----------------

/** 权限请求结果的三种产品动作。 */
enum class MicPermissionDecision { START_RECORDING, DENIED_LIGHT, DENIED_PERMANENT }

/**
 * 麦克风权限判定（C 节冻结语义，独立纯函数便于穷举测试）：
 * - granted → 开始录音
 * - 拒绝且「已请求过」且系统不再建议理由 → 永久拒绝（需系统设置入口）
 * - 其余拒绝 → 轻量非技术提示
 *
 * 关键边界：首次请求前 rationale=false 是正常现象，
 * 只有 hasRequestedBefore=true 时才会进入永久拒绝分支，避免误判。
 */
fun resolveMicPermission(
    granted: Boolean,
    hasRequestedBefore: Boolean,
    rationaleAvailable: Boolean,
): MicPermissionDecision = when {
    granted -> MicPermissionDecision.START_RECORDING
    hasRequestedBefore && !rationaleAvailable -> MicPermissionDecision.DENIED_PERMANENT
    else -> MicPermissionDecision.DENIED_LIGHT
}
