package com.ielts.app.speaking

import android.content.Context
import java.io.File

/**
 * MOBILE-04A 会话注入点。
 *
 * 生产默认构造真实 Recorder / Player；
 * 测试（src/test）可整体替换为 FakeRecorder + FakePlayer 构造的会话，
 * Fake 实现仅存在于 test source（工程规则 1 冻结），不进入 production main。
 */
object SpeakingAudioFactory {

    /** 可替换的会话构造点：生产默认真实实现；测试注入 fake 会话。 */
    var createSession: (Context) -> SpeakingAudioSession = { context ->
        SpeakingAudioSession(
            recorder = AndroidRecorder(context),
            player = AndroidMediaPlayer(),
            dir = File(context.cacheDir, "speaking"),
        )
    }
}
