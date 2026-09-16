package com.ielts.app.speaking

import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * MOBILE-04A SpeakingAudioSession 状态机单元测试（纯逻辑，无 Android UI）。
 * 覆盖 K 节要求的转换：IDLE→RECORDING / RECORDING→RECORDED / RECORDED→PLAYING /
 * PLAYING→RECORDED / rerecord / cleanup / error / illegal transitions。
 */
class SpeakingAudioSessionTest {

    private lateinit var dir: java.io.File
    private lateinit var recorder: FakeRecorder
    private lateinit var player: FakePlayer
    private lateinit var session: SpeakingAudioSession

    @Before
    fun setUp() {
        dir = Files.createTempDirectory("speaking_session_test").toFile()
        recorder = FakeRecorder()
        player = FakePlayer()
        session = SpeakingAudioSession(recorder, player, dir, timeSource = { 0L })
    }

    @After
    fun tearDown() {
        session.release()
        dir.deleteRecursively()
    }

    // ---------------- IDLE → RECORDING ----------------

    @Test
    fun `idle to recording`() {
        assertTrue(session.startRecording())
        assertEquals(AudioSessionState.RECORDING, session.state)
        assertTrue(recorder.active)
        assertNotNull(recorder.lastPath)
        assertTrue(recorder.lastPath!!.endsWith(".m4a"))
        assertNull(session.lastError)
    }

    @Test
    fun `recording start failure cleans up and returns to idle with product error`() {
        recorder.failStart = true
        assertFalse(session.startRecording())
        assertEquals(AudioSessionState.IDLE, session.state)
        assertNotNull(session.lastError)
        assertEquals("录音启动失败，请重试", session.lastError)
        // 残留文件被清理
        assertTrue(dir.listFiles().isNullOrEmpty())
    }

    // ---------------- RECORDING → RECORDED ----------------

    @Test
    fun `recording to recorded keeps path and duration`() {
        session.startRecording()
        recorder.durationMs = 7_200L
        assertTrue(session.finishRecording())
        assertEquals(AudioSessionState.RECORDED, session.state)
        val result = session.lastRecording
        assertNotNull(result)
        assertEquals(7_200L, result!!.durationMs)
        assertEquals(recorder.lastPath, result.path)
        assertFalse(recorder.active)
    }

    @Test
    fun `stop failure deletes damaged file and returns to idle with product error`() {
        session.startRecording()
        recorder.failStop = true
        assertFalse(session.finishRecording())
        assertEquals(AudioSessionState.IDLE, session.state)
        assertNotNull(session.lastError)
        assertEquals("录音保存失败，请重试", session.lastError)
        // 损坏文件已删除
        assertTrue(dir.listFiles().isNullOrEmpty())
    }

    // ---------------- RECORDING → cancel ----------------

    @Test
    fun `cancel recording discards temp file`() {
        session.startRecording()
        val path = recorder.lastPath
        session.cancelRecording()
        assertEquals(AudioSessionState.IDLE, session.state)
        assertTrue(recorder.discarded)
        assertFalse(java.io.File(path!!).exists())
    }

    // ---------------- RECORDED → PLAYING → RECORDED ----------------

    @Test
    fun `recorded to playing then completion returns to recorded`() {
        session.startRecording()
        session.finishRecording()
        assertTrue(session.play())
        assertEquals(AudioSessionState.PLAYING, session.state)
        assertTrue(player.playing)
        player.complete()
        assertEquals(AudioSessionState.RECORDED, session.state)
        assertFalse(player.playing)
    }

    @Test
    fun `playing to recorded via manual stop`() {
        session.startRecording()
        session.finishRecording()
        session.play()
        session.stopPlayback()
        assertEquals(AudioSessionState.RECORDED, session.state)
        assertFalse(player.playing)
    }

    @Test
    fun `play failure keeps recorded with product error`() {
        session.startRecording()
        session.finishRecording()
        player.failPlay = true
        assertFalse(session.play())
        assertEquals(AudioSessionState.RECORDED, session.state)
        assertEquals("播放失败，请重试", session.lastError)
    }

    // ---------------- rerecord ----------------

    @Test
    fun `rerecord stops playback releases player deletes old file and resets`() {
        session.startRecording()
        session.finishRecording()
        val oldPath = recorder.lastPath
        session.play()
        assertTrue(player.playing)

        session.rerecord()
        assertEquals(AudioSessionState.IDLE, session.state)
        assertFalse(player.playing)
        assertTrue(player.released)
        assertNull(session.lastRecording)
        assertFalse(java.io.File(oldPath!!).exists())
        // 再次录音创建全新文件
        assertTrue(session.startRecording())
        assertNotNull(recorder.lastPath)
        assertNotEquals(oldPath, recorder.lastPath)
    }

    // ---------------- release / cleanup ----------------

    @Test
    fun `release stops everything and deletes unowned temp`() {
        session.startRecording()
        session.finishRecording()
        val path = recorder.lastPath
        session.play()
        session.release()
        assertEquals(AudioSessionState.IDLE, session.state)
        assertTrue(player.released)
        assertTrue(recorder.released)
        assertFalse(java.io.File(path!!).exists())
    }

    @Test
    fun `release while recording discards recorder`() {
        session.startRecording()
        session.release()
        assertEquals(AudioSessionState.IDLE, session.state)
        assertTrue(recorder.discarded)
        assertTrue(recorder.released)
    }

    // ---------------- illegal transitions ----------------

    @Test
    fun `illegal transitions are rejected`() {
        // IDLE 时 finish / play / stopPlayback 拒绝
        assertFalse(session.finishRecording())
        assertFalse(session.play())
        session.stopPlayback() // 无操作，状态不变
        assertEquals(AudioSessionState.IDLE, session.state)

        // RECORDING 时 play 拒绝（录音与播放互斥）
        session.startRecording()
        assertFalse(session.play())
        assertEquals(AudioSessionState.RECORDING, session.state)
        // RECORDING 时重复 start 拒绝
        assertFalse(session.startRecording())

        // PLAYING 时 startRecording 拒绝（先停止 playback 才能新录音）
        session.finishRecording()
        session.play()
        assertEquals(AudioSessionState.PLAYING, session.state)
        assertFalse(session.startRecording())
        assertEquals(AudioSessionState.PLAYING, session.state)
    }
}
