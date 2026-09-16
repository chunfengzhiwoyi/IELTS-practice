package com.ielts.app.speaking

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.File

/**
 * MOBILE-04A 录音会话状态机（纯逻辑，可单测；不依赖 Android UI）。
 *
 * 状态：IDLE → RECORDING → RECORDED ⇄ PLAYING；任意时刻可 release 回 IDLE。
 * 文件所有权（A 节冻结）：本会话拥有 dir/ 下的单次录音 temp 文件，
 * 离开页面 / rerecord / cancel 时删除尚未交给 upload layer 的文件。
 *
 * 规则：
 * - start 成功后才进入 RECORDING；失败 → 清理残留 → IDLE + 产品错误
 * - stop 失败 → 删除损坏文件 → IDLE + 产品错误，绝不进入正常 RECORDED
 * - 录音与播放互斥：RECORDING 时不可 play；PLAYING 时不可 startRecording
 * - 真实录音时长以 recorder session / elapsed realtime 为准（E 节冻结）
 */
enum class AudioSessionState { IDLE, RECORDING, RECORDED, PLAYING }

class SpeakingAudioSession(
    private val recorder: SpeakingRecorder,
    private val player: SpeakingPlayer,
    private val dir: File,
    /** 计时锚点（生产 = elapsedRealtime；测试可注入可控时钟）。 */
    private val timeSource: () -> Long = { android.os.SystemClock.elapsedRealtime() },
) {
    var state by mutableStateOf(AudioSessionState.IDLE)
        private set

    /** 最近一次成功录制的产物（RECORDED 后非空）。 */
    var lastRecording: RecordingResult? by mutableStateOf(null)
        private set

    /** 产品级错误文案（非技术原因，禁止暴露异常类型）。 */
    var lastError: String? by mutableStateOf(null)
        private set

    /** RECORDING 的真实起点（elapsedRealtime），供 UI 计时。 */
    var startedAtElapsed: Long = 0L
        private set

    private var currentPath: String? = null

    init {
        dir.mkdirs()
    }

    /** IDLE → RECORDING。成功返回 true。 */
    fun startRecording(): Boolean {
        if (state == AudioSessionState.RECORDING || state == AudioSessionState.PLAYING) return false
        lastError = null
        // nanoTime 单调且高分辨，避免同一毫秒内 rerecord 生成重名文件
        val file = File(dir, "speaking_${System.nanoTime()}.m4a")
        val ok = try {
            recorder.start(file.absolutePath)
        } catch (e: Exception) {
            false
        }
        if (!ok) {
            recorder.discard()
            file.delete()
            currentPath = null
            lastError = "录音启动失败，请重试"
            return false
        }
        currentPath = file.absolutePath
        startedAtElapsed = timeSource()
        state = AudioSessionState.RECORDING
        return true
    }

    /** RECORDING → RECORDED。失败 → 清理损坏文件 → IDLE + 产品错误。 */
    fun finishRecording(): Boolean {
        if (state != AudioSessionState.RECORDING) return false
        val result = try {
            recorder.stop()
        } catch (e: Exception) {
            recorder.discard()
            deleteCurrentFile()
            lastError = "录音保存失败，请重试"
            state = AudioSessionState.IDLE
            return false
        }
        lastRecording = result
        currentPath = result.path
        state = AudioSessionState.RECORDED
        return true
    }

    /** 取消录音（RECORDING → IDLE，删除 temp）。 */
    fun cancelRecording() {
        if (state == AudioSessionState.RECORDING) {
            recorder.discard()
            deleteCurrentFile()
            state = AudioSessionState.IDLE
        }
    }

    /** RECORDED → PLAYING。录音与播放互斥。 */
    fun play(): Boolean {
        if (state != AudioSessionState.RECORDED) return false
        val result = lastRecording ?: return false
        lastError = null
        val ok = try {
            player.play(result.path) { state = AudioSessionState.RECORDED }
        } catch (e: Exception) {
            false
        }
        if (!ok) {
            lastError = "播放失败，请重试"
            return false
        }
        state = AudioSessionState.PLAYING
        return true
    }

    /** PLAYING → RECORDED（手动停止，不触发 completion）。 */
    fun stopPlayback() {
        if (state == AudioSessionState.PLAYING) {
            player.stop()
            state = AudioSessionState.RECORDED
        }
    }

    /** RERECORD：停止 playback → release player → 删除旧文件 → 重置 → IDLE。 */
    fun rerecord() {
        stopPlayback()
        player.release()
        if (state == AudioSessionState.RECORDING) {
            recorder.discard()
        }
        deleteCurrentFile()
        lastRecording = null
        state = AudioSessionState.IDLE
    }

    /**
     * 离开页面：停止播放/录音、release 全部 native 资源、
     * 删除尚未交给 upload layer 的 temp 文件（A 节 LEAVE SCREEN 规则）。
     */
    fun release() {
        stopPlayback()
        player.release()
        if (state == AudioSessionState.RECORDING) {
            recorder.discard()
        }
        recorder.release()
        deleteCurrentFile()
        lastRecording = null
        state = AudioSessionState.IDLE
    }

    private fun deleteCurrentFile() {
        val path = currentPath
        currentPath = null
        if (path != null) {
            runCatching { File(path).delete() }
        }
    }
}
