package com.ielts.app.speaking

import com.ielts.app.screens.formatSpeakingSeconds
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * MOBILE-04A-PRE-DEVICE 深度审计测试（纯逻辑，无 Android UI）：
 * - 第 4 节：文件生命周期机械审计（连续 10 次 record/stop/rerecord，orphan=0）
 * - 第 5 节：计时契约（start=0 → +10s → +30s → stop 冻结 → rerecord 重置 → background finish 冻结）
 * - 第 6 节：状态机穷举（double stop / play after discard / PLAYING 中 rerecord / ERROR 恢复）
 * - 第 13 节：长时长逻辑模拟（10s~600s 无 auto-stop、无 overflow、mm:ss 正确）
 */
class SpeakingAudioSessionDeepTest {

    private lateinit var dir: java.io.File
    private lateinit var recorder: FakeRecorder
    private lateinit var player: FakePlayer

    /** 可控单调时钟（模拟 elapsedRealtime）。 */
    private var now = 0L

    private lateinit var session: SpeakingAudioSession

    @Before
    fun setUp() {
        dir = Files.createTempDirectory("speaking_deep_test").toFile()
        recorder = FakeRecorder()
        player = FakePlayer()
        now = 0L
        session = SpeakingAudioSession(recorder, player, dir, timeSource = { now })
    }

    @After
    fun tearDown() {
        session.release()
        dir.deleteRecursively()
    }

    private fun logicalFiles(): List<java.io.File> =
        dir.listFiles()?.filter { it.isFile && it.name.endsWith(".m4a") } ?: emptyList()

    // ================= 第 4 节：文件生命周期机械审计 =================

    @Test
    fun `ten consecutive record stop rerecord cycles leave zero orphans`() {
        repeat(10) { cycle ->
            // record
            assertTrue("cycle $cycle start", session.startRecording())
            val pathDuring = recorder.lastPath
            assertNotNull(pathDuring)
            assertTrue(java.io.File(pathDuring!!).exists())
            assertEquals(1, logicalFiles().size)

            // stop → RECORDED，文件移交
            recorder.durationMs = 5_000L + cycle * 100L
            assertTrue(session.finishRecording())
            assertEquals(AudioSessionState.RECORDED, session.state)
            assertTrue(java.io.File(pathDuring).exists())
            assertEquals(1, logicalFiles().size)

            // rerecord → 旧文件删除 → IDLE
            session.rerecord()
            assertEquals(AudioSessionState.IDLE, session.state)
            assertFalse(java.io.File(pathDuring).exists())
            assertNull(session.lastRecording)
            assertEquals(0, logicalFiles().size)
        }
        assertEquals("ORPHAN_LOGICAL_FILES", 0, logicalFiles().size)
    }

    @Test
    fun `start failure deletes target and stop failure deletes corrupted target`() {
        // start 失败 → target 删除
        recorder.failStart = true
        session.startRecording()
        assertEquals(0, logicalFiles().size)
        recorder.failStart = false

        // stop 失败 → 损坏文件删除
        assertTrue(session.startRecording())
        val path = recorder.lastPath
        recorder.failStop = true
        assertFalse(session.finishRecording())
        assertEquals(AudioSessionState.IDLE, session.state)
        assertFalse(java.io.File(path!!).exists())
        assertEquals(0, logicalFiles().size)
    }

    @Test
    fun `release after recorded deletes unowned file`() {
        session.startRecording()
        session.finishRecording()
        val path = recorder.lastPath
        session.release()
        assertFalse(java.io.File(path!!).exists())
        assertEquals(0, logicalFiles().size)
    }

    // ================= 第 5 节：计时契约 =================

    @Test
    fun `timer tracks monotonic clock freezes on stop and resets on rerecord`() {
        // start = 0
        assertTrue(session.startRecording())
        assertEquals(0L, session.startedAtElapsed)

        // +10s
        now = 10_000L
        // UI 计时 = now - startedAtElapsed（与生产 SpeakingScreen 同一公式）
        assertEquals(10L, (now - session.startedAtElapsed) / 1_000L)

        // +30s（累计 40s）
        now = 40_000L
        assertEquals(40L, (now - session.startedAtElapsed) / 1_000L)

        // stop → duration 冻结为 recorder 实测
        recorder.durationMs = 42_000L
        assertTrue(session.finishRecording())
        assertEquals(42_000L, session.lastRecording!!.durationMs)

        // 时钟继续前进，但 RECORDED 时长不再变化（冻结）
        now = 120_000L
        assertEquals(42_000L, session.lastRecording!!.durationMs)

        // rerecord → 计时重置（新 session 起点）
        session.rerecord()
        assertTrue(session.startRecording())
        assertEquals(120_000L, session.startedAtElapsed)
        now = 130_000L
        assertEquals(10L, (now - session.startedAtElapsed) / 1_000L)
    }

    @Test
    fun `background finish freezes duration`() {
        session.startRecording()
        now = 55_000L
        recorder.durationMs = 55_000L
        // 等价于 ON_STOP 的 finishRecording 路径（生命周期 JVM 层）
        assertTrue(session.finishRecording())
        assertEquals(55_000L, session.lastRecording!!.durationMs)
        now = 300_000L
        assertEquals(55_000L, session.lastRecording!!.durationMs)
        assertEquals(AudioSessionState.RECORDED, session.state)
    }

    // ================= 第 6 节：状态机穷举 =================

    @Test
    fun `double stop rejected without crash or leak`() {
        session.startRecording()
        assertTrue(session.finishRecording())
        // 第二次 finish（double stop）拒绝，状态不变
        assertFalse(session.finishRecording())
        assertEquals(AudioSessionState.RECORDED, session.state)
        assertNotNull(session.lastRecording)
    }

    @Test
    fun `play after discard rejected`() {
        session.startRecording()
        session.cancelRecording()
        assertEquals(AudioSessionState.IDLE, session.state)
        assertFalse(session.play())
        assertEquals(AudioSessionState.IDLE, session.state)
        assertNull(session.lastRecording)
    }

    @Test
    fun `rerecord while playing releases player and resets`() {
        session.startRecording()
        session.finishRecording()
        session.play()
        assertEquals(AudioSessionState.PLAYING, session.state)
        session.rerecord()
        assertEquals(AudioSessionState.IDLE, session.state)
        assertFalse(player.playing)
        assertTrue(player.released)
        assertFalse(recorder.discarded || recorder.active) // 无残留 native
    }

    @Test
    fun `error state recovers to recording again`() {
        // stop 失败 → IDLE + 产品错误（ERROR 可恢复态）
        session.startRecording()
        recorder.failStop = true
        assertFalse(session.finishRecording())
        assertEquals(AudioSessionState.IDLE, session.state)
        assertEquals("录音保存失败，请重试", session.lastError)

        // 可恢复：再次 startRecording 成功，错误清除
        recorder.failStop = false
        assertTrue(session.startRecording())
        assertEquals(AudioSessionState.RECORDING, session.state)
        assertNull(session.lastError)
    }

    @Test
    fun `recording state rejects playback double start and finish`() {
        session.startRecording()
        // RECORDING 时 play 拒绝（互斥）
        assertFalse(session.play())
        assertEquals(AudioSessionState.RECORDING, session.state)
        // double start 拒绝
        assertFalse(session.startRecording())
        assertEquals(AudioSessionState.RECORDING, session.state)
        // cancel 后 IDLE
        session.cancelRecording()
        assertEquals(AudioSessionState.IDLE, session.state)
    }

    // ================= 第 13 节：长时长逻辑模拟 =================

    @Test
    fun `long duration has no auto stop limit and formats correctly`() {
        val cases = listOf(
            10L to "00:10",
            30L to "00:30",
            60L to "01:00",
            120L to "02:00",
            300L to "05:00",
            600L to "10:00",
        )
        cases.forEach { (seconds, expected) ->
            // 控制器层：无硬编码 auto-stop，长时长可进入 RECORDED
            assertTrue(session.startRecording())
            now = seconds * 1_000L
            recorder.durationMs = seconds * 1_000L
            assertTrue(session.finishRecording())
            assertEquals(seconds * 1_000L, session.lastRecording!!.durationMs)
            // UI formatter：mm:ss 正确、无溢出
            assertEquals("$seconds s", expected, formatSpeakingSeconds(seconds.toInt()))
            session.rerecord()
        }
        // 无 90s 硬限制：600s 已在上方成功
        assertEquals(0, logicalFiles().size)
    }

    @Test
    fun `formatter edge cases`() {
        assertEquals("00:00", formatSpeakingSeconds(0))
        assertEquals("00:59", formatSpeakingSeconds(59))
        assertEquals("59:59", formatSpeakingSeconds(3599))
        assertEquals("100:00", formatSpeakingSeconds(6000))
    }
}
