package com.ielts.app.speaking

/**
 * 测试专用 Fake Player（仅存在于 test source；production main 不包含——工程规则 1 冻结）。
 */
class FakePlayer : SpeakingPlayer {

    var playing = false
    var released = false
    var failPlay = false
    var lastPath: String? = null
    var completion: (() -> Unit)? = null

    override fun play(path: String, onCompletion: () -> Unit): Boolean {
        if (failPlay) return false
        playing = true
        lastPath = path
        completion = onCompletion
        return true
    }

    override fun stop() {
        playing = false
    }

    override fun release() {
        playing = false
        released = true
    }

    /** 模拟播放自然结束。 */
    fun complete() {
        playing = false
        completion?.invoke()
    }
}
