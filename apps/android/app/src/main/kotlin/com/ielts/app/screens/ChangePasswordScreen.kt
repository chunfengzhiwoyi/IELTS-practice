package com.ielts.app.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.auth.AuthErrorCode
import com.ielts.app.auth.ChangePasswordResult
import com.ielts.app.components.Note
import com.ielts.app.components.NoteVariant
import com.ielts.app.components.PrimaryButton
import com.ielts.app.components.SubPage
import com.ielts.app.theme.Accent
import com.ielts.app.theme.Type
import com.ielts.app.viewmodel.AuthViewModel
import kotlinx.coroutines.launch

/**
 * MOBILE-07 — 已登录修改密码（真实 SIGNED-IN CHANGE PASSWORD）。
 * 与"忘记密码"邮件找回是两条路径：本页由当前有效登录会话授权（server-mediated），
 * 用户输入并确认新密码即可，不退出到 Auth 找回页，不接触 token / service_role。
 */
@Composable
fun ChangePasswordScreen(authVm: AuthViewModel?, navController: NavController, innerPadding: PaddingValues) {
    val scope = rememberCoroutineScope()
    var newPassword by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf(false) }

    val canSubmit = !submitting && newPassword.length >= 6 && newPassword == confirm

    SubPage(title = "修改密码", onBack = { navController.popBackStack() }, innerPadding = innerPadding) {
        Spacer(Modifier.height(8.dp))
        Text("为当前账号设置一个新密码，修改后仍保持登录。", style = Type.bodySmall)
        Spacer(Modifier.height(20.dp))

        AuthField("新密码", newPassword, { newPassword = it; errorMsg = null }, "至少 6 位", isPassword = true, tag = "new_password")
        Spacer(Modifier.height(14.dp))
        AuthField("确认新密码", confirm, { confirm = it; errorMsg = null }, "再次输入新密码", isPassword = true, tag = "confirm_password")

        if (newPassword.isNotEmpty() && newPassword.length < 6) {
            Spacer(Modifier.height(8.dp))
            Text("密码至少 6 位", style = Type.bodySmall.copy(color = Accent))
        }
        if (confirm.isNotEmpty() && newPassword != confirm) {
            Spacer(Modifier.height(8.dp))
            Text("两次输入的密码不一致", style = Type.bodySmall.copy(color = Accent))
        }

        Spacer(Modifier.height(20.dp))

        if (success) {
            Note("密码修改成功，下次登录请使用新密码。", variant = NoteVariant.ACCENT)
            Spacer(Modifier.height(16.dp))
            PrimaryButton(text = "完成", onClick = { navController.popBackStack() })
        } else {
            PrimaryButton(
                text = if (submitting) "保存中…" else "保存新密码",
                enabled = canSubmit,
                onClick = {
                    if (authVm == null) return@PrimaryButton
                    errorMsg = null
                    submitting = true
                    scope.launch {
                        when (val r = authVm.changePassword(newPassword)) {
                            is ChangePasswordResult.Success -> {
                                submitting = false
                                success = true
                            }
                            is ChangePasswordResult.Failed -> {
                                submitting = false
                                if (r.code == AuthErrorCode.SESSION_EXPIRED) {
                                    authVm.onSessionExpired()
                                } else {
                                    errorMsg = r.code.message
                                }
                            }
                        }
                    }
                },
            )
            if (errorMsg != null) {
                Spacer(Modifier.height(14.dp))
                Note(errorMsg.orEmpty(), variant = NoteVariant.BRONZE)
            }
        }
    }
}
