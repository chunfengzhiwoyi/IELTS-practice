package com.ielts.app.speaking

import android.media.MediaPlayer

/**
 * MOBILE-04A 生产实现：Android 原生 MediaPlayer（D3 冻结，不引入 Media3/ExoPlayer）。
 */
class AndroidMediaPlayer : SpeakingPlayer {

    private var player: MediaPlayer? = null

    override fun play(path: String, onCompletion: () -> Unit): Boolean {
        stopInternal()
        val p = MediaPlayer()
        return try {
            p.setDataSource(path)
            p.prepare()
            p.setOnCompletionListener { onCompletion() }
            p.start()
            player = p
            true
        } catch (e: Exception) {
            runCatching { p.reset() }
            runCatching { p.release() }
            false
        }
    }

    override fun stop() = stopInternal()

    override fun release() = stopInternal()

    private fun stopInternal() {
        val p = player
        player = null
        if (p != null) {
            runCatching { p.stop() }
            runCatching { p.reset() }
            runCatching { p.release() }
        }
    }
}
