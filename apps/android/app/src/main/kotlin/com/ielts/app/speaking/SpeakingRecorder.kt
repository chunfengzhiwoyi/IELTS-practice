package com.ielts.app.speaking

/**
 * MOBILE-04A Real Recorder 最小 contract（用户冻结：不过度抽象）。
 *
 * 音频格式（D1 冻结）：
 * - MediaRecorder / OutputFormat.MPEG_4 / AudioEncoder.AAC / .m4a
 * - 禁止 AudioRecord / PCM；Whisper-compatible transcribe 后续可直接接受 m4a。
 *
 * 文件所有权（A 节冻结）：
 * - IDLE：无 active file
 * - RECORDING：recorder owns temp file
 * - RECORDED：screen/controller owns recorded file
 * - RERECORD：停止 playback、删除旧 file、创建新 file
 * - LEAVE SCREEN：停止一切、release、删除尚未交给 upload layer 的 temp file
 * （MOBILE-04C 上传接入后重新定义 ownership transfer，本轮不实现 upload。）
 */
interface SpeakingRecorder {

    /**
     * 开始录制到 [path]。
     * 成功返回 true 后调用方才进入 RECORDING；失败返回 false，调用方负责清理。
     */
    fun start(path: String): Boolean

    /** 停止录制并返回产物（path + durationMs）。失败必须抛异常，由上层清理损坏文件。 */
    fun stop(): RecordingResult

    /** 丢弃当前录制（不产出文件），释放 native 资源。 */
    fun discard()

    /** 释放全部 native 资源。 */
    fun release()
}

/** 单次录音产物。 */
data class RecordingResult(val path: String, val durationMs: Long)
