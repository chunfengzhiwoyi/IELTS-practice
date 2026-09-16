package com.ielts.app.speaking

import com.ielts.app.auth.LingxiApiClient
import java.io.File
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject

/**
 * MOBILE-04C — Speaking 后端客户端（复用 LingxiApiClient / EncryptedCookieJar）。
 *
 * 契约（与 app/api/speaking 各路由对齐）：
 * - createSession：POST /api/speaking/session（real server session，questionId 复用本地题库展示题）
 * - transcribe：POST /api/speaking/transcribe（multipart field "audio"，m4a 直传 Lingxi backend，禁 base64）
 * - analyze：POST /api/speaking/analyze（canonical Speaking Analyzer，Android/Web 共享同一后端）
 * - complete：POST /api/speaking/complete（失败不销毁 analysis）
 *
 * 错误映射（UI 只显示产品级中文，禁止 401/JWT/Whisper/Supabase/raw JSON）：
 * - 401 → SESSION_EXPIRED（Auth Gate 进入重新登录路径）
 * - IOException → NETWORK_UNAVAILABLE
 * - provider/model 失败 → TRANSCRIPTION_FAILED / ANALYSIS_FAILED / AUDIO_UPLOAD_FAILED
 * - 其余 → SERVER_UNAVAILABLE
 */
enum class SpeakingSubmitError {
    NETWORK_UNAVAILABLE,
    SESSION_EXPIRED,
    AUDIO_UPLOAD_FAILED,
    TRANSCRIPTION_FAILED,
    ANALYSIS_FAILED,
    SERVER_UNAVAILABLE;

    val userMessage: String
        get() = when (this) {
            NETWORK_UNAVAILABLE -> "网络不可用，请检查网络后重试"
            SESSION_EXPIRED -> "登录已过期，请重新登录"
            AUDIO_UPLOAD_FAILED -> "音频上传失败，请重试"
            TRANSCRIPTION_FAILED -> "语音识别失败，请重试或改用文字输入"
            ANALYSIS_FAILED -> "分析没有完成，请再试一次"
            SERVER_UNAVAILABLE -> "服务暂时不可用，请稍后重试"
        }
}

/** createSession 返回的最小 session 摘要（仅后端契约字段）。 */
data class SpeakingServerSession(
    val id: String,
    val questionId: String,
    val part: String,
)

/** 产品级提交失败（携带用户可见中文文案，禁止技术细节）。 */
class SpeakingBackendException(val error: SpeakingSubmitError) : Exception(error.userMessage)

object SpeakingBackendClient {

    private val audioMediaType = "audio/mp4".toMediaType()

    /** 创建真实服务端口语会话（authenticated cookie 自动携带）。 */
    suspend fun createSession(part: String, questionId: String): SpeakingServerSession =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("part", part)
                .put("questionId", questionId)
                .toString()
            LingxiApiClient.postJson("/api/speaking/session", body).use { res ->
                if (!res.isSuccessful) throwMapped(res, SpeakingSubmitError.SERVER_UNAVAILABLE)
                val json = JSONObject(res.body?.string().orEmpty())
                val session = json.getJSONObject("session")
                SpeakingServerSession(
                    id = session.getString("id"),
                    questionId = session.getString("questionId"),
                    part = session.getString("part"),
                )
            }
        }

    /** 上传 .m4a（multipart field "audio"）→ 返回 transcript。 */
    suspend fun transcribe(file: File): String = withContext(Dispatchers.IO) {
        val reqBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("audio", file.name, file.asRequestBody(audioMediaType))
            .build()
        val request = Request.Builder()
            .url(LingxiApiClient.baseUrl() + "/api/speaking/transcribe")
            .post(reqBody)
            .build()
        try {
            LingxiApiClient.client().newCall(request).execute().use { res ->
                if (!res.isSuccessful) throwMapped(res, SpeakingSubmitError.TRANSCRIPTION_FAILED)
                val json = JSONObject(res.body?.string().orEmpty())
                val transcript = json.optString("transcript").trim()
                if (transcript.isEmpty()) {
                    throw SpeakingBackendException(SpeakingSubmitError.TRANSCRIPTION_FAILED)
                }
                transcript
            }
        } catch (e: IOException) {
            throw SpeakingBackendException(SpeakingSubmitError.NETWORK_UNAVAILABLE)
        }
    }

    /** 真实 canonical analyze（VOICE 与 TEXT 共用同一后端路径）。 */
    suspend fun analyze(sessionId: String, answer: String, isSecondAnswer: Boolean = false): ContractSpeakingResult =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("sessionId", sessionId)
                .put("answer", answer)
                .put("isSecondAnswer", isSecondAnswer)
                .toString()
            try {
                LingxiApiClient.postJson("/api/speaking/analyze", body).use { res ->
                    if (!res.isSuccessful) throwMapped(res, SpeakingSubmitError.ANALYSIS_FAILED)
                    val json = JSONObject(res.body?.string().orEmpty())
                    parseAnalysis(json.optJSONObject("analysis"))
                }
            } catch (e: IOException) {
                throw SpeakingBackendException(SpeakingSubmitError.NETWORK_UNAVAILABLE)
            }
        }

    /** 显式完成会话。失败不抛给主流程（analysis 已成功，不销毁）。 */
    suspend fun complete(sessionId: String): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject().put("sessionId", sessionId).toString()
        try {
            LingxiApiClient.postJson("/api/speaking/complete", body).use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }

    // ---------------- JSON 解析（只取 Result V2 UI 需要的字段） ----------------

    private fun parseAnalysis(a: JSONObject?): ContractSpeakingResult {
        if (a == null) return ContractSpeakingResult()
        val metrics = a.optJSONObject("metrics")
        val mainIssue = a.optJSONObject("mainIssue")
        val ielts = a.optJSONObject("ieltsAnalysis")
        val qw = a.optJSONObject("qualityWarning")
        return ContractSpeakingResult(
            summary = a.optString("summary"),
            metrics = ContractSpeakingMetrics(
                wordCount = metrics?.optInt("wordCount") ?: 0,
                sentenceCount = metrics?.optInt("sentenceCount") ?: 0,
            ),
            mainIssue = ContractMainIssue(
                dimension = mainIssue?.optString("dimension").orEmpty(),
                severity = mainIssue?.optString("severity") ?: "major",
                description = mainIssue?.optString("description").orEmpty(),
                suggestion = mainIssue?.optString("suggestion").orEmpty(),
            ),
            ieltsAnalysis = if (ielts == null) null else ContractIeltsAnalysis(
                fluency = parseDimension(ielts.optJSONObject("fluency")),
                lexicalResource = parseDimension(ielts.optJSONObject("lexicalResource")),
                grammaticalRange = parseDimension(ielts.optJSONObject("grammaticalRange")),
                pronunciation = parseDimension(ielts.optJSONObject("pronunciation")),
                overallDiagnosis = ielts.optString("overallDiagnosis"),
                prioritizedSuggestions = stringArray(ielts.optJSONArray("prioritizedSuggestions")),
            ),
            qualityWarning = if (qw == null) null else ContractQualityWarning(
                score = qw.optInt("score"),
                issues = stringArray(qw.optJSONArray("issues")),
            ),
        )
    }

    private fun parseDimension(d: JSONObject?): ContractDimensionAnalysis? {
        if (d == null) return null
        return ContractDimensionAnalysis(
            label = d.optString("label"),
            level = if (d.has("level") && !d.isNull("level")) d.optString("level") else null,
            evidence = stringArray(d.optJSONArray("evidence")),
            issues = stringArray(d.optJSONArray("issues")),
            suggestions = stringArray(d.optJSONArray("suggestions")),
        )
    }

    private fun stringArray(arr: JSONArray?): List<String> {
        if (arr == null) return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val v = arr.optString(i)
                if (v.isNotBlank()) add(v)
            }
        }
    }

    // ---------------- 错误映射 ----------------

    private fun throwMapped(res: Response, fallback: SpeakingSubmitError): Nothing {
        val kind = try {
            JSONObject(res.body?.string().orEmpty()).optJSONObject("error")?.optString("kind")
        } catch (_: Exception) {
            null
        }
        val error = when {
            res.code == 401 -> SpeakingSubmitError.SESSION_EXPIRED
            res.code >= 500 -> fallback
            kind == "INVALID_INPUT" -> fallback
            else -> fallback
        }
        throw SpeakingBackendException(error)
    }
}
