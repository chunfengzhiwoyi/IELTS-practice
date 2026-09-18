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

    /**
     * MOBILE-04C — session 已过期/失效（业务请求 401）时的本地清理：
     * 只清本地 CookieJar，不发 server logout（session 本身已无效）。
     */
    suspend fun clearLocalSession(): Unit = withContext(Dispatchers.IO) {
        client.clearCookies()
    }

    /**
     * MOBILE-06 §2 — 注册：POST /api/auth/mobile/register。
     * 响应契约：
     *   200 {authenticated:true, user:{id,email}}          → 自动登录（SSR cookie 已写入）
     *   200 {authenticated:false, requiresEmailConfirmation:true, user} → 需先收确认邮件
     *   400/401 {authenticated:false, error}                → 产品级错误
     */
    suspend fun register(email: String, password: String, nickname: String): RegisterResult =
        withContext(Dispatchers.IO) {
            val payload = buildString {
                append("{\"email\":${jsonQuoted(email)}, \"password\":${jsonQuoted(password)}")
                if (nickname.isNotBlank()) append(", \"nickname\":${jsonQuoted(nickname)}")
                append("}")
            }
            try {
                client.postJson(REGISTER_PATH, payload).use { resp ->
                    when (resp.code) {
                        200 -> {
                            val body = resp.body?.string().orEmpty()
                            val dto = try {
                                json.decodeFromString<RegisterResponseDto>(body)
                            } catch (_: Exception) {
                                return@withContext RegisterResult.Failed(AuthErrorCode.UNKNOWN_RECOVERABLE)
                            }
                            val u = dto.user
                            when {
                                dto.authenticated && u != null && u.id.isNotBlank() ->
                                    RegisterResult.SignedIn(AuthUser(u.id, u.email))
                                dto.requiresEmailConfirmation ->
                                    RegisterResult.EmailConfirmationRequired(dto.user?.email ?: email)
                                else -> RegisterResult.Failed(AuthErrorCode.UNKNOWN_RECOVERABLE)
                            }
                        }
                        else -> RegisterResult.Failed(mapRegisterError(resp))
                    }
                }
            } catch (e: IOException) {
                RegisterResult.Failed(AuthErrorCode.NETWORK_UNAVAILABLE)
            } catch (_: Exception) {
                RegisterResult.Failed(AuthErrorCode.UNKNOWN_RECOVERABLE)
            }
        }

    /**
     * MOBILE-06 §3-A — 发送密码重置邮件：POST /api/auth/mobile/recovery。
     * 无论账号是否存在均返回 sent（防枚举）。
     */
    suspend fun sendRecoveryEmail(email: String): MailSendResult = withContext(Dispatchers.IO) {
        val payload = "{\"email\":${jsonQuoted(email)}}"
        try {
            client.postJson(RECOVERY_PATH, payload).use { resp ->
                when (resp.code) {
                    200 -> MailSendResult.Sent
                    400 -> MailSendResult.Failed(AuthErrorCode.UNKNOWN_RECOVERABLE)
                    else -> MailSendResult.Failed(AuthErrorCode.SERVER_UNAVAILABLE)
                }
            }
        } catch (e: IOException) {
            MailSendResult.Failed(AuthErrorCode.NETWORK_UNAVAILABLE)
        } catch (_: Exception) {
            MailSendResult.Failed(AuthErrorCode.UNKNOWN_RECOVERABLE)
        }
    }

    /**
     * MOBILE-06 §3-B — 发送邮箱登录链接：POST /api/auth/mobile/magic-link。
     * 无论账号是否存在均返回 sent（防枚举）。
     */
    suspend fun sendMagicLink(email: String): MailSendResult = withContext(Dispatchers.IO) {
        val payload = "{\"email\":${jsonQuoted(email)}}"
        try {
            client.postJson(MAGIC_LINK_PATH, payload).use { resp ->
                when (resp.code) {
                    200 -> MailSendResult.Sent
                    400 -> MailSendResult.Failed(AuthErrorCode.UNKNOWN_RECOVERABLE)
                    else -> MailSendResult.Failed(AuthErrorCode.SERVER_UNAVAILABLE)
                }
            }
        } catch (e: IOException) {
            MailSendResult.Failed(AuthErrorCode.NETWORK_UNAVAILABLE)
        } catch (_: Exception) {
            MailSendResult.Failed(AuthErrorCode.UNKNOWN_RECOVERABLE)
        }
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
        const val REGISTER_PATH = "/api/auth/mobile/register"
        const val RECOVERY_PATH = "/api/auth/mobile/recovery"
        const val MAGIC_LINK_PATH = "/api/auth/mobile/magic-link"
        const val CHANGE_PASSWORD_PATH = "/api/auth/mobile/change-password"
    }

    /**
     * MOBILE-07 — 已登录修改密码：POST /api/auth/mobile/change-password（server-mediated）。
     * 身份由当前有效登录 cookie 授权；不下发/不读取任何 token。
     */
    suspend fun changePassword(newPassword: String): ChangePasswordResult = withContext(Dispatchers.IO) {
        val payload = "{\"newPassword\":${jsonQuoted(newPassword)}}"
        try {
            client.postJson(CHANGE_PASSWORD_PATH, payload).use { resp ->
                when (resp.code) {
                    200 -> ChangePasswordResult.Success
                    401 -> ChangePasswordResult.Failed(AuthErrorCode.SESSION_EXPIRED)
                    else -> {
                        val code = errorCodeOf(resp)
                        ChangePasswordResult.Failed(
                            when (code) {
                                "WEAK_PASSWORD" -> AuthErrorCode.WEAK_PASSWORD
                                "SESSION_EXPIRED" -> AuthErrorCode.SESSION_EXPIRED
                                else -> AuthErrorCode.SERVER_UNAVAILABLE
                            },
                        )
                    }
                }
            }
        } catch (e: IOException) {
            ChangePasswordResult.Failed(AuthErrorCode.NETWORK_UNAVAILABLE)
        } catch (_: Exception) {
            ChangePasswordResult.Failed(AuthErrorCode.UNKNOWN_RECOVERABLE)
        }
    }

    /** 从 {error:{code}} 响应中提取产品级 code（解析失败返回空串）。 */
    private fun errorCodeOf(resp: Response): String = runCatching {
        json.decodeFromString<ErrorEnvelopeDto>(resp.body?.string().orEmpty()).error?.code.orEmpty()
    }.getOrDefault("")

    /** 注册失败：HTTP + 服务端产品 code 双重映射，区分邮箱已注册 / 格式 / 密码规则 / 服务。 */
    private fun mapRegisterError(resp: Response): AuthErrorCode {
        val code = errorCodeOf(resp)
        return when {
            resp.code == 409 || code == "EMAIL_ALREADY_REGISTERED" -> AuthErrorCode.EMAIL_ALREADY_REGISTERED
            code == "INVALID_EMAIL" -> AuthErrorCode.INVALID_EMAIL
            code == "WEAK_PASSWORD" -> AuthErrorCode.WEAK_PASSWORD
            resp.code == 401 -> AuthErrorCode.INVALID_CREDENTIALS
            resp.code in 500..599 -> AuthErrorCode.SERVER_UNAVAILABLE
            else -> AuthErrorCode.UNKNOWN_RECOVERABLE
        }
    }
}

/** MOBILE-07 — 已登录改密结果 */
sealed interface ChangePasswordResult {
    data object Success : ChangePasswordResult
    data class Failed(val code: AuthErrorCode) : ChangePasswordResult
}

/** MOBILE-06 §2 — 注册结果：自动登录 / 需邮件确认 / 失败 */
sealed interface RegisterResult {
    data class SignedIn(val user: AuthUser) : RegisterResult
    data class EmailConfirmationRequired(val email: String) : RegisterResult
    data class Failed(val code: AuthErrorCode) : RegisterResult
}

/** MOBILE-06 §3 — 邮件发送结果（重置密码 / 邮箱登录链接） */
sealed interface MailSendResult {
    data object Sent : MailSendResult
    data class Failed(val code: AuthErrorCode) : MailSendResult
}

@Serializable
private data class RegisterResponseDto(
    val authenticated: Boolean = false,
    val requiresEmailConfirmation: Boolean = false,
    val user: UserDto? = null,
)

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

@Serializable
internal data class ErrorEnvelopeDto(
    val error: ErrorBodyDto? = null,
)

@Serializable
internal data class ErrorBodyDto(
    val code: String = "",
    val message: String? = null,
)
