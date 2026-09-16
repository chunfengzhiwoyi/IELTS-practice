package com.ielts.app.speaking

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock

/**
 * MOBILE-04A 生产实现：Android MediaRecorder → MPEG_4 / AAC / .m4a（D1 冻结）。
 *
 * API 兼容（minSdk 24）：
 * - API 31+ 使用 MediaRecorder(context) 构造；
 * - API < 31 使用无参 MediaRecorder()（deprecated 但可用），两套均走同一 setter 序列。
 *
 * 稳定性优先：不自行添加 bitrate / sample rate 调优（D 节冻结）。
 * stop 失败（旧 API RuntimeException / 新 API IllegalStateException）必须抛出，由上层删除损坏文件。
 */
class AndroidRecorder(private val context: Context) : SpeakingRecorder {

    private var recorder: MediaRecorder? = null
    private var outputPath: String? = null
    private var startedAtElapsed: Long = 0L

    override fun start(path: String): Boolean {
        discard()
        val r = createRecorder()
        return try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setOutputFile(path)
            r.prepare()
            r.start()
            recorder = r
            outputPath = path
            startedAtElapsed = SystemClock.elapsedRealtime()
            true
        } catch (e: Exception) {
            runCatching { r.reset() }
            runCatching { r.release() }
            recorder = null
            false
        }
    }

    override fun stop(): RecordingResult {
        val r = recorder ?: throw IllegalStateException("no active recorder")
        val path = outputPath ?: throw IllegalStateException("no output path")
        val durationMs = SystemClock.elapsedRealtime() - startedAtElapsed
        recorder = null
        outputPath = null
        try {
            r.stop()
            r.release()
        } catch (e: Exception) {
            runCatching { r.reset() }
            runCatching { r.release() }
            throw e
        }
        return RecordingResult(path, durationMs)
    }

    override fun discard() {
        val r = recorder
        recorder = null
        outputPath = null
        if (r != null) {
            runCatching { r.reset() }
            runCatching { r.release() }
        }
    }

    override fun release() = discard()

    @Suppress("DEPRECATION")
    private fun createRecorder(): MediaRecorder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            MediaRecorder()
        }
}
