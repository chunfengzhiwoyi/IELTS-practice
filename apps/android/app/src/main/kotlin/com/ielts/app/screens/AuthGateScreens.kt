package com.ielts.app.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ielts.app.auth.AuthState
import com.ielts.app.auth.AuthStatus
import com.ielts.app.components.GhostButton
import com.ielts.app.components.Note
import com.ielts.app.components.NoteVariant
import com.ielts.app.theme.Type

/**
 * MOBILE-04B §9/§14 — 冷启动 Auth Bootstrap（Auth Gate 起始页）。
 * UNKNOWN / RESTORING_SESSION → 恢复中；
 * RESTORE_NETWORK_ERROR → 网络失败（可重试，不清 CookieJar，不强制登出）。
 */
@Composable
fun AuthBootstrapScreen(state: AuthState, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (state.status) {
            AuthStatus.UNKNOWN, AuthStatus.RESTORING_SESSION -> {
                Text("灵犀·IELTS", style = Type.heading)
                Spacer(Modifier.height(10.dp))
                Text("正在恢复登录状态…", style = Type.bodySmall)
            }

            AuthStatus.RESTORE_NETWORK_ERROR -> {
                Text("灵犀·IELTS", style = Type.heading)
                Spacer(Modifier.height(14.dp))
                Note(
                    state.errorMessage ?: "网络不可用，请检查网络后重试",
                    variant = NoteVariant.BRONZE,
                )
                Spacer(Modifier.height(16.dp))
                GhostButton(text = "重试", onClick = onRetry)
            }

            else -> {
                // AUTHENTICATED / UNAUTHENTICATED 由 Auth Gate 立即导航离开，本页不渲染
            }
        }
    }
}
