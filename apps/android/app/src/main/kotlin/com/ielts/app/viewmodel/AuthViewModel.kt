package com.ielts.app.viewmodel

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ielts.app.auth.AuthRepository
import com.ielts.app.auth.AuthResult
import com.ielts.app.auth.AuthState
import com.ielts.app.auth.AuthStatus
import com.ielts.app.auth.ChangePasswordResult
import com.ielts.app.auth.MailSendResult
import com.ielts.app.auth.RegisterResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * MOBILE-04B §8/§10 — Auth 状态机（cold start restore / login / logout）。
 *
 * 状态迁移：
 *   UNKNOWN → RESTORING_SESSION
 *     → AUTHENTICATED（probe 200）
 *     → UNAUTHENTICATED（probe 401）
 *     → RESTORE_NETWORK_ERROR（网络失败；不清 CookieJar，可重试）
 *   AUTHENTICATING → AUTHENTICATED | UNAUTHENTICATED(+error)
 *   AUTHENTICATED → UNAUTHENTICATED（logout：先 server 尽力撤销，再无条件清本地 cookie）
 *
 * 不变量：cookie 存在 ≠ 已登录；网络失败 ≠ 登出。
 */
class AuthViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = AuthRepository()

    var state by mutableStateOf(AuthState(AuthStatus.UNKNOWN))
        private set

    init {
        restoreSession()
    }

    /** 冷启动恢复：GET /api/auth/mobile/session（server 真实校验） */
    fun restoreSession() {
        viewModelScope.launch {
            state = state.copy(status = AuthStatus.RESTORING_SESSION, errorCode = null)
            when (val r = withContext(Dispatchers.IO) { repo.session() }) {
                is AuthResult.Ok -> state = AuthState(AuthStatus.AUTHENTICATED, user = r.user)
                is AuthResult.NotAuthenticated ->
                    state = AuthState(AuthStatus.UNAUTHENTICATED)
                is AuthResult.Err -> state = AuthState(
                    AuthStatus.RESTORE_NETWORK_ERROR,
                    errorCode = r.code,
                )
            }
        }
    }

    /** 邮箱密码登录：POST /api/auth/mobile/login */
    fun login(email: String, password: String) {
        if (email.isBlank() || password.length < 6) return
        viewModelScope.launch {
            state = state.copy(status = AuthStatus.AUTHENTICATING, errorCode = null)
            when (val r = withContext(Dispatchers.IO) { repo.login(email.trim(), password) }) {
                is AuthResult.Ok -> state = AuthState(AuthStatus.AUTHENTICATED, user = r.user)
                is AuthResult.NotAuthenticated -> state = AuthState(
                    AuthStatus.UNAUTHENTICATED,
                    errorCode = r.code,
                )
                is AuthResult.Err -> state = AuthState(
                    AuthStatus.UNAUTHENTICATED,
                    errorCode = r.code,
                )
            }
        }
    }

    /**
     * MOBILE-06 §2 — 注册：server-mediated（自动登录或需邮件确认）。
     * SignedIn → 直接进入 AUTHENTICATED（SSR cookie 已随注册响应写入）。
     * EmailConfirmationRequired → 不宣称登录，返回给 UI 展示确认指引。
     */
    suspend fun register(email: String, password: String, nickname: String): RegisterResult {
        val r = withContext(Dispatchers.IO) { repo.register(email.trim(), password, nickname.trim()) }
        if (r is RegisterResult.SignedIn) {
            state = AuthState(AuthStatus.AUTHENTICATED, user = r.user)
        }
        return r
    }

    /** MOBILE-06 §3-A — 发送密码重置邮件 */
    suspend fun sendRecoveryEmail(email: String): MailSendResult =
        withContext(Dispatchers.IO) { repo.sendRecoveryEmail(email.trim()) }

    /** MOBILE-06 §3-B — 发送邮箱登录链接 */
    suspend fun sendMagicLink(email: String): MailSendResult =
        withContext(Dispatchers.IO) { repo.sendMagicLink(email.trim()) }

    /**
     * 登出：server 尽力撤销 + 无条件清空本地加密 CookieJar。
     * [serverLogoutConfirmed] = server 是否确认撤销（false = 本地已退出、服务端未确认）。
     */
    var serverLogoutConfirmed: Boolean? = null
        private set

    fun logout() {
        viewModelScope.launch {
            serverLogoutConfirmed = withContext(Dispatchers.IO) { repo.logout() }
            state = AuthState(AuthStatus.UNAUTHENTICATED)
        }
    }

    /**
     * MOBILE-04C §4.4 — 业务请求收到 401（session 过期/失效）时由调用方触发：
     * 清空本地 cookie → 状态回 UNAUTHENTICATED → Auth Gate 导航至 Login。
     * 不向 server 发起 logout（session 已无效）。
     */
    fun onSessionExpired() {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { repo.clearLocalSession() }
            state = AuthState(AuthStatus.UNAUTHENTICATED)
        }
    }

    /**
     * MOBILE-07 — 清除错误提示但不改变登录态。
     * 用于在进入登录页 / 用户重新输入时清掉上一次失败残留（错误只在正确生命周期出现）。
     */
    fun clearError() {
        if (state.errorCode != null) state = state.copy(errorCode = null)
    }

    /** MOBILE-07 — 已登录修改密码（server-mediated，成功后保留登录态）。 */
    suspend fun changePassword(newPassword: String): ChangePasswordResult =
        withContext(Dispatchers.IO) { repo.changePassword(newPassword) }
}
