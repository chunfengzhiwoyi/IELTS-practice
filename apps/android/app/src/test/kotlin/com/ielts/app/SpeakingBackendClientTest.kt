package com.ielts.app

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.ielts.app.auth.EncryptedCookieJar
import com.ielts.app.auth.InMemoryCookieCipher
import com.ielts.app.auth.LingxiApiClient
import com.ielts.app.speaking.SpeakingBackendClient
import com.ielts.app.speaking.SpeakingBackendException
import com.ielts.app.speaking.SpeakingResultMapper
import com.ielts.app.speaking.SpeakingSubmitError
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * MOBILE-04C §9 — Android Speaking 后端客户端测试（MockWebServer）。
 *
 * 覆盖：session create / multipart m4a 上传 / transcript 解析 / analyze 解析 /
 * fallback 结果 / 401 → SESSION_EXPIRED / 网络失败 → NETWORK_UNAVAILABLE /
 * 5xx → TRANSCRIPTION/ANALYSIS_FAILED / complete 失败不抛 / cookie 自动携带。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SpeakingBackendClientTest {

    private lateinit var server: MockWebServer
    private lateinit var app: Application

    @Before
    fun setUp() {
        app = ApplicationProvider.getApplicationContext()
        server = MockWebServer()
        server.start()
        LingxiApiClient.cookieJar = EncryptedCookieJar(app, InMemoryCookieCipher())
        LingxiApiClient.baseUrlOverride = server.url("/").toString().trimEnd('/')
    }

    @After
    fun tearDown() {
        LingxiApiClient.baseUrlOverride = null
        server.shutdown()
    }

    private fun enqueueDispatcher(routes: Map<String, MockResponse>) {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val p = request.path ?: return MockResponse().setResponseCode(404)
                for ((prefix, resp) in routes) {
                    if (p.startsWith(prefix)) return resp
                }
                return MockResponse().setResponseCode(404).setBody("""{"error":{"kind":"NOT_FOUND"}}""")
            }
        }
    }

    @Test
    fun createSessionParsesAndCarriesCookie() = runTest {
        enqueueDispatcher(
            mapOf(
                "/api/speaking/session" to MockResponse()
                    .setResponseCode(200)
                    .setHeader("Set-Cookie", "sb-test=abc123; Path=/; HttpOnly; Max-Age=3600")
                    .setBody(
                        """{"session":{"id":"spk-0001","questionId":"sp-p1-001","part":"P1"},"questionData":{"id":"sp-p1-001","part":"P1","topic":"Study","question":"Q?"}}""",
                    ),
                "/api/speaking/transcribe" to MockResponse()
                    .setResponseCode(200)
                    .setBody("""{"transcript":"hello","duration":1.0}"""),
            ),
        )
        val s = SpeakingBackendClient.createSession("P1", "sp-p1-001")
        assertEquals("spk-0001", s.id)
        assertEquals("sp-p1-001", s.questionId)
        assertEquals("P1", s.part)
        val sessionReq = server.takeRequest(2, TimeUnit.SECONDS) ?: error("no session request")
        assertTrue(sessionReq.path?.startsWith("/api/speaking/session") == true)

        // 后续请求自动携带 cookie（encrypted jar 持久化）
        val tmp = File.createTempFile("rec", ".m4a")
        tmp.writeBytes(byteArrayOf(1, 2, 3))
        try {
            SpeakingBackendClient.transcribe(tmp)
            val req = server.takeRequest(2, TimeUnit.SECONDS) ?: error("no transcribe request")
            assertTrue("request path=${req.path}", req.path?.startsWith("/api/speaking/transcribe") == true)
            assertTrue("cookie 自动携带: ${req.getHeader("Cookie")}", req.getHeader("Cookie")?.contains("sb-test=abc123") == true)
            // multipart 契约：field "audio"，content-type audio/mp4
            assertTrue(req.getHeader("Content-Type")?.contains("multipart/form-data") == true)
            val bodyText = req.body.readUtf8()
            assertTrue(bodyText.contains("name=\"audio\""))
            assertTrue(bodyText.contains("audio/mp4"))
        } finally {
            tmp.delete()
        }
    }

    @Test
    fun transcribe401MapsToSessionExpired() = runTest {
        enqueueDispatcher(
            mapOf(
                "/api/speaking/transcribe" to MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"kind":"AUTH_REQUIRED","message":"请先登录"}}"""),
            ),
        )
        val tmp = File.createTempFile("rec", ".m4a")
        tmp.writeBytes(byteArrayOf(1))
        try {
            val err = runCatching { SpeakingBackendClient.transcribe(tmp) }.exceptionOrNull()
            assertTrue(err is SpeakingBackendException)
            assertEquals(SpeakingSubmitError.SESSION_EXPIRED, (err as SpeakingBackendException).error)
        } finally {
            tmp.delete()
        }
    }

    @Test
    fun transcribe5xxMapsToTranscriptionFailed() = runTest {
        enqueueDispatcher(
            mapOf(
                "/api/speaking/transcribe" to MockResponse()
                    .setResponseCode(502)
                    .setBody("""{"error":{"kind":"MODEL_ERROR","message":"upstream"}}"""),
            ),
        )
        val tmp = File.createTempFile("rec", ".m4a")
        tmp.writeBytes(byteArrayOf(1))
        try {
            val err = runCatching { SpeakingBackendClient.transcribe(tmp) }.exceptionOrNull()
            assertEquals(SpeakingSubmitError.TRANSCRIPTION_FAILED, (err as SpeakingBackendException).error)
        } finally {
            tmp.delete()
        }
    }

    @Test
    fun analyzeParsesRealContractAndMapsToResultV2() = runTest {
        enqueueDispatcher(
            mapOf(
                "/api/speaking/analyze" to MockResponse().setResponseCode(200).setBody(ANALYZE_JSON),
            ),
        )
        val raw = SpeakingBackendClient.analyze("spk-0001", "I like reading books.", false)
        assertEquals("整体表现不错。", raw.summary)
        assertEquals(5, raw.metrics.wordCount)
        assertEquals("fluency", raw.mainIssue.dimension)
        assertTrue(raw.ieltsAnalysis != null)
        assertEquals("流利度", raw.ieltsAnalysis?.fluency?.label)

        val model = SpeakingResultMapper.map(raw)
        assertFalse(model.isFallback)
        assertTrue(model.dimensions.isNotEmpty())
        assertEquals(3, model.nextSteps.size)
    }

    @Test
    fun analyzeFallbackWithoutIeltsAnalysisMarksFallback() = runTest {
        enqueueDispatcher(
            mapOf(
                "/api/speaking/analyze" to MockResponse().setResponseCode(200).setBody(
                    """{"analysis":{"summary":"信息不足","metrics":{"wordCount":3,"sentenceCount":1},"mainIssue":{"dimension":"fluency","severity":"major","description":"回答太短","suggestion":"多说一些"}}}""",
                ),
            ),
        )
        val raw = SpeakingBackendClient.analyze("spk-0001", "I am busy.", false)
        assertTrue(raw.ieltsAnalysis == null)
        val model = SpeakingResultMapper.map(raw)
        assertTrue(model.isFallback)
        assertTrue(model.dimensions.isEmpty())
    }

    @Test
    fun analyze5xxMapsToAnalysisFailed() = runTest {
        enqueueDispatcher(
            mapOf(
                "/api/speaking/analyze" to MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"kind":"INTERNAL","message":"boom"}}"""),
            ),
        )
        val err = runCatching { SpeakingBackendClient.analyze("spk-0001", "answer", false) }.exceptionOrNull()
        assertEquals(SpeakingSubmitError.ANALYSIS_FAILED, (err as SpeakingBackendException).error)
    }

    @Test
    fun completeFailureReturnsFalseAndDoesNotThrow() = runTest {
        enqueueDispatcher(
            mapOf(
                "/api/speaking/complete" to MockResponse().setResponseCode(500).setBody("""{"error":{"kind":"INTERNAL"}}"""),
            ),
        )
        val ok = SpeakingBackendClient.complete("spk-0001")
        assertFalse(ok)
    }

    private companion object {
        val ANALYZE_JSON = """
            {"analysis":{
              "summary":"整体表现不错。",
              "metrics":{"wordCount":5,"sentenceCount":2},
              "mainIssue":{"dimension":"fluency","severity":"major","description":"有停顿","suggestion":"用连接词"},
              "ieltsAnalysis":{
                "fluency":{"label":"流利度","level":"adequate","evidence":["能说完"],"issues":["停顿"],"suggestions":["连接词"]},
                "lexicalResource":{"label":"词汇资源","level":"adequate","evidence":[],"issues":[],"suggestions":[]},
                "grammaticalRange":{"label":"语法范围","level":"developing","evidence":[],"issues":[],"suggestions":[]},
                "pronunciation":{"label":"发音","level":null,"evidence":[],"issues":[],"suggestions":[]},
                "overallDiagnosis":"整体表现不错。",
                "prioritizedSuggestions":["用连接词","多说细节","换复合句"]
              },
              "qualityWarning":null
            }}
        """.trimIndent()
    }
}
