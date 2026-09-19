package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.auth.MailSendResult
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.AuthViewModel
import kotlinx.coroutines.launch

/**
 * MOBILE-06 §3 — 忘记密码页（视觉稿 v2.0 双场景）。
 *  A. 重置密码：发送密码重置链接，设置新密码
 *  B. 邮箱登录链接：不想重置密码？发送一次性登录链接到邮箱
 *  邮箱登录链接入口只允许出现在本页（登录首页不出现第二套邮箱登录按钮）。
 *  真实调用后端（recovery / magic-link），不得伪装成已发送成功。
 */
@Composable
fun ForgotPasswordScreen(authVm: AuthViewModel?, navController: NavController, innerPadding: PaddingValues) {
    val scope = rememberCoroutineScope()

    var resetEmail by remember { mutableStateOf("") }
    var linkEmail by remember { mutableStateOf("") }
    var resetSending by remember { mutableStateOf(false) }
    var linkSending by remember { mutableStateOf(false) }
    var resetMessage by remember { mutableStateOf<String?>(null) }
    var linkMessage by remember { mutableStateOf<String?>(null) }

    AuthPage(innerPadding = innerPadding, onBack = { navController.popBackStack() }, brandRidge = true) {
        Spacer(Modifier.height(20.dp))
        Text("找回账号", style = Type.editorTitle, color = Ink)
        Spacer(Modifier.height(6.dp))
        Text("输入你的邮箱，我们会发送相应的链接到你的邮箱。", style = Type.bodySmall)
        Spacer(Modifier.height(28.dp))

        // A. 重置密码
        SectionLabel("重置密码")
        Spacer(Modifier.height(4.dp))
        Text("发送密码重置链接，设置新密码。", style = Type.bodySmall)
        Spacer(Modifier.height(12.dp))
        AuthField("邮箱", resetEmail, { resetEmail = it }, "请输入邮箱", isPassword = false, tag = "recovery_email")
        Spacer(Modifier.height(12.dp))
        PrimaryButton(
            text = if (resetSending) "发送中…" else "发送重置链接",
            enabled = !resetSending && resetEmail.contains("@"),
            onClick = {
                if (authVm == null) return@PrimaryButton
                resetMessage = null
                resetSending = true
                scope.launch {
                    val result = authVm.sendRecoveryEmail(resetEmail)
                    resetSending = false
                    resetMessage = when (result) {
                        is MailSendResult.Sent -> "已发送，请查收邮件完成重置"
                        is MailSendResult.Failed -> result.code.message
                    }
                }
            },
        )
        if (resetMessage != null) {
            Spacer(Modifier.height(12.dp))
            val sent = resetMessage == "已发送，请查收邮件完成重置"
            Note(
                resetMessage.orEmpty(),
                variant = if (sent) NoteVariant.ACCENT else NoteVariant.BRONZE,
            )
        }

        Spacer(Modifier.height(24.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Box(Modifier.weight(1f).height(1.dp).background(Line))
            Spacer(Modifier.width(12.dp))
            Text("或", style = Type.uiLabel)
            Spacer(Modifier.width(12.dp))
            Box(Modifier.weight(1f).height(1.dp).background(Line))
        }
        Spacer(Modifier.height(24.dp))

        // B. 邮箱登录链接（唯一入口：本页）
        SectionLabel("邮箱登录链接")
        Spacer(Modifier.height(4.dp))
        Text("不想重置密码？发送一次性登录链接到邮箱，点击即可登录。", style = Type.bodySmall)
        Spacer(Modifier.height(12.dp))
        AuthField("邮箱", linkEmail, { linkEmail = it }, "请输入邮箱", isPassword = false, tag = "magiclink_email")
        Spacer(Modifier.height(12.dp))
        PrimaryButton(
            text = if (linkSending) "发送中…" else "发送登录链接",
            enabled = !linkSending && linkEmail.contains("@"),
            onClick = {
                if (authVm == null) return@PrimaryButton
                linkMessage = null
                linkSending = true
                scope.launch {
                    val result = authVm.sendMagicLink(linkEmail)
                    linkSending = false
                    linkMessage = when (result) {
                        is MailSendResult.Sent -> "已发送，请查收邮件完成登录"
                        is MailSendResult.Failed -> result.code.message
                    }
                }
            },
        )
        if (linkMessage != null) {
            Spacer(Modifier.height(12.dp))
            val sent = linkMessage == "已发送，请查收邮件完成登录"
            Note(
                linkMessage.orEmpty(),
                variant = if (sent) NoteVariant.ACCENT else NoteVariant.BRONZE,
            )
        }

        Spacer(Modifier.height(32.dp))
        Text(
            "如长时间未收到邮件，请检查垃圾箱或稍后重试",
            style = Type.uiLabel,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
