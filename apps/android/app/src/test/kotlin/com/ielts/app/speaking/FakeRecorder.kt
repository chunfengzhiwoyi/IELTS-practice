package com.ielts.app.speaking

/**
 * 测试专用 Fake Recorder（仅存在于 test source；production main 不包含——工程规则 1 冻结）。
 */
class FakeRecorder : SpeakingRecorder {

    var active = false
    var started = false
    var discarded = false
    var released = false
    var failStart = false
    var failStop = false
    var lastPath: String? = null
    var durationMs: Long = 5_000L
    var stopCalls = 0

    override fun start(path: String): Boolean {
        if (failStart) return false
        active = true
        started = true
        lastPath = path
        // 模拟真实 MediaRecorder 落盘行为：创建目标文件，供文件生命周期审计断言
        return try {
            java.io.File(path).createNewFile()
        } catch (e: Exception) {
            active = false
            false
        }
    }

    override fun stop(): RecordingResult {
        if (failStop) {
            active = false
            throw IllegalStateException("fake stop failure")
        }
        active = false
        stopCalls++
        return RecordingResult(lastPath ?: error("no path"), durationMs)
    }

    override fun discard() {
        active = false
        discarded = true
    }

    override fun release() {
        active = false
        released = true
    }
}
