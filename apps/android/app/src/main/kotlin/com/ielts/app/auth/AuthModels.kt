package com.ielts.app.auth

/**
 * MOBILE-04B §8/§15 — Auth 状态机与用户层错误分类。
 * 禁止 Screen 直接解析 raw exception / HTTP 状态码。
 * 用户可见文案只允许来自 [AuthErrorCode.message]（中文产品级）。
 */
enum class AuthStatus {
    /** 冷启动初始态：尚未确认任何 session */
    UNKNOWN,

    /** 正在通过 server 探活恢复 session（GET /api/auth/mobile/session） */
    RESTORING_SESSION,

    /** 确认未登录（session probe 401 / 登出完成） */
    UNAUTHENTICATED,

    /** 登录请求进行中 */
    AUTHENTICATING,

    /** 已通过 server 验证的真实登录态 */
    AUTHENTICATED,

    /** 冷启动恢复失败（网络不可用等）：可重试，绝不自动登出 */
    RESTORE_NETWORK_ERROR,

    /** 登录/会话其他不可恢复错误（保留位） */
    AUTH_ERROR,
}

enum class AuthErrorCode(val message: String) {
    INVALID_CREDENTIALS("邮箱或密码错误"),
    NETWORK_UNAVAILABLE("网络不可用，请检查网络后重试"),
    SESSION_EXPIRED("登录已过期，请重新登录"),
    SERVER_UNAVAILABLE("服务暂时不可用，请稍后重试"),
    UNKNOWN_RECOVERABLE("出错了，请重试"),
}

data class AuthUser(val id: String, val email: String?)

data class AuthState(
    val status: AuthStatus,
    val user: AuthUser? = null,
    val errorCode: AuthErrorCode? = null,
) {
    val errorMessage: String? get() = errorCode?.message
}

/** Repository 返回结果：成功 / 明确未认证 / 产品级错误 */
sealed interface AuthResult {
    data class Ok(val user: AuthUser) : AuthResult

    /** session probe 401 / 未登录态（非错误） */
    data class NotAuthenticated(val code: AuthErrorCode = AuthErrorCode.SESSION_EXPIRED) : AuthResult

    data class Err(val code: AuthErrorCode) : AuthResult
}
