package com.ielts.app.auth

import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Response

// MOBILE-04B AuthRepository：唯一真实 Auth 数据源入口。
// 端点契约（server-mandated，见 app/api/auth/mobile）：
//   login  → 200 {authenticated:true,user:{id,email}} | 400/401 {authenticated:false,error}
//   session→ 200 {authenticated:true,user} | 401 {authenticated:false}
//   logout → 200 {authenticated:false}
// token 永不进入响应 JSON；Android 业务层永不接触 access/refresh token。
class AuthRepository(
    private val client: LingxiApiClient = LingxiApiClient,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {

    suspend fun login(email: String, password: String): AuthResult = withContext(Dispatchers.IO) {
        val payload = "{\"email\":${jsonQuoted(email)}, \"password\":${jsonQuoted(password)}}"
        try {
            client.postJson(LOGIN_PATH, payload).use { resp ->
                when (resp.code) {
                    200 -> parseAuthenticated(resp)
                    400 -> AuthResult.Err(AuthErrorCode.UNKNOWN_RECOVERABLE)
                    401 -> AuthResult.Err(AuthErrorCode.INVALID_CREDENTIALS)
                    else -> AuthResult.Err(AuthErrorCode.SERVER_UNAVAILABLE)
                }
            }
        } catch (e: IOException) {
            AuthResult.Err(AuthErrorCode.NETWORK_UNAVAILABLE)
        } catch (_: Exception) {
            AuthResult.Err(AuthErrorCode.UNKNOWN_RECOVERABLE)
        }
    }

    // 冷启动探活。server 用 Supabase getUser() 真实校验；
    // 401 = 明确未登录；IOException = 网络失败（≠ 登出，调用方保留 cookie）。
    suspend fun session(): AuthResult = withContext(Dispatchers.IO) {
        try {
            client.get(SESSION_PATH).use { resp ->
                when (resp.code) {
                    200 -> parseAuthenticated(resp)
                    401 -> AuthResult.NotAuthenticated()
                    else -> AuthResult.Err(AuthErrorCode.SERVER_UNAVAILABLE)
                }
            }
        } catch (e: IOException) {
            AuthResult.Err(AuthErrorCode.NETWORK_UNAVAILABLE)
        } catch (_: Exception) {
            AuthResult.Err(AuthErrorCode.UNKNOWN_RECOVERABLE)
        }
    }

    // 登出：先尽力通知 server 撤销，然后无条件清空本地 CookieJar
    // （本地 session material 必须清除；server revocation 未确认时返回 false）。
    suspend fun logout(): Boolean = withContext(Dispatchers.IO) {
        var serverOk = false
        try {
            client.postJson(LOGOUT_PATH, "{}").use { resp ->
                serverOk = resp.code == 200
            }
        } catch (_: Exception) {
            serverOk = false
        }
        client.clearCookies()
        serverOk
    }

    private fun parseAuthenticated(resp: Response): AuthResult {
        val body = resp.body?.string().orEmpty()
        val dto = try {
            json.decodeFromString<LoginResponseDto>(body)
        } catch (_: Exception) {
            return AuthResult.Err(AuthErrorCode.UNKNOWN_RECOVERABLE)
        }
        val u = dto.user
        return if (dto.authenticated && u != null && u.id.isNotBlank()) {
            AuthResult.Ok(AuthUser(u.id, u.email))
        } else {
            AuthResult.Err(AuthErrorCode.UNKNOWN_RECOVERABLE)
        }
    }

    private fun jsonQuoted(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""

    companion object {
        const val LOGIN_PATH = "/api/auth/mobile/login"
        const val SESSION_PATH = "/api/auth/mobile/session"
        const val LOGOUT_PATH = "/api/auth/mobile/logout"
    }
}

@Serializable
private data class LoginResponseDto(
    val authenticated: Boolean = false,
    val user: UserDto? = null,
)

@Serializable
private data class UserDto(
    val id: String = "",
    val email: String? = null,
)
