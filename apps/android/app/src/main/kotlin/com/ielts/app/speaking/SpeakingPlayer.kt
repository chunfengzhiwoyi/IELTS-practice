package com.ielts.app.speaking

/**
 * MOBILE-04A 本地播放 contract（D3 冻结：Android 原生 MediaPlayer 闭环，不引入 Media3/ExoPlayer）。
 *
 * 必须支持：play / completion / replay / stop before rerecord / release。
 */
interface SpeakingPlayer {

    /**
     * 从头播放 [path]。[onCompletion] 在播放自然结束时回调一次。
     * 成功返回 true；失败返回 false（上层负责产品提示）。
     */
    fun play(path: String, onCompletion: () -> Unit): Boolean

    /** 停止当前播放（不触发 completion 回调）。 */
    fun stop()

    /** 释放 native 资源（离开页面 / rerecord 前调用）。 */
    fun release()
}
