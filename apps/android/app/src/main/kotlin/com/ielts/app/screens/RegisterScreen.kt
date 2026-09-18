package com.ielts.app.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.auth.AuthErrorCode
import com.ielts.app.auth.RegisterResult
import com.ielts.app.components.*
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.AuthViewModel
import com.ielts.core.model.ProfileData
import com.ielts.core.service.getProfile
import com.ielts.core.service.saveProfile
import kotlinx.coroutines.launch

/**
 * MOBILE-06 §2 — 注册页（视觉稿 v2.0）。
 *  - 真实 server-mediated 注册（POST /api/auth/mobile/register）
 *  - 注册成功（自动登录）→ Auth Gate 自动进入 Today
 *  - 项目要求邮件确认时 → 不宣称登录，提示前往邮箱验证
 *  - 昵称写入本地档案（users 表无 nickname 字段；昵称是设备端档案）
 */
@Composable
fun RegisterScreen(authVm: AuthViewModel?, navController: NavController, innerPadding: PaddingValues) {
    val scope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var nickname by remember { mutableStateOf("") }
    var agreed by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var confirmationSent by remember { mutableStateOf(false) }

    val canSubmit = !submitting &&
        email.contains("@") &&
        password.length >= 6 &&
        password == confirm &&
        agreed

    AuthPage(innerPadding = innerPadding, onBack = { navController.popBackStack() }) {
        Spacer(Modifier.height(16.dp))
        Text("创建你的灵犀账号", style = Type.displayTitle, color = Ink)
        Spacer(Modifier.height(6.dp))
        Text("开启更高效的 IELTS 学习之旅", style = Type.bodySmall)
        Spacer(Modifier.height(28.dp))

        AuthField("邮箱", email, { email = it }, "请输入邮箱", isPassword = false, tag = "reg_email")
        Spacer(Modifier.height(14.dp))
        AuthField("密码", password, { password = it }, "设置密码（至少 6 位）", isPassword = true, tag = "reg_password")
        Spacer(Modifier.height(14.dp))
        AuthField("确认密码", confirm, { confirm = it }, "再次输入密码", isPassword = true, tag = "reg_confirm")
        Spacer(Modifier.height(14.dp))
        AuthField("昵称（可选）", nickname, { nickname = it }, "给自己起个名字", isPassword = false, tag = "reg_nickname")
        Spacer(Modifier.height(10.dp))

        Row(
            Modifier.fillMaxWidth().clickable { agreed = !agreed },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = agreed,
                onCheckedChange = { agreed = it },
                colors = CheckboxDefaults.colors(
                    checkedColor = Accent,
                    uncheckedColor = InkMeta,
                    checkmarkColor = AccentContrast,
                ),
            )
            Text(
                "我已阅读并同意",
                style = Type.bodySmall,
                color = InkSoft,
            )
            Text("《用户协议》", style = Type.bodySmall.copy(color = Accent))
            Text("和", style = Type.bodySmall, color = InkSoft)
            Text("《隐私政策》", style = Type.bodySmall.copy(color = Accent))
        }
        Spacer(Modifier.height(18.dp))

        PrimaryButton(
            text = when {
                submitting -> "创建中…"
                else -> "创建账号"
            },
            enabled = canSubmit,
            onClick = {
                if (authVm == null) return@PrimaryButton
                errorMessage = null
                submitting = true
                scope.launch {
                    val result = authVm.register(email.trim(), password, nickname)
                    submitting = false
                    when (result) {
                        is RegisterResult.SignedIn -> {
                            // 自动登录成功 → Auth Gate 导航至 Today；昵称写入本地档案
                            val existing = getProfile()
                            saveProfile(existing.copy(nickname = nickname.trim()))
                        }
                        is RegisterResult.EmailConfirmationRequired -> {
                            confirmationSent = true
                            errorMessage = "注册成功，请前往邮箱完成验证后登录"
                        }
                        is RegisterResult.Failed -> {
                            errorMessage = when (result.code) {
                                AuthErrorCode.INVALID_CREDENTIALS -> "邮箱已被注册或密码不正确"
                                else -> result.code.message
                            }
                        }
                    }
                }
            },
        )

        when {
            errorMessage != null && confirmationSent -> {
                Spacer(Modifier.height(12.dp))
                Note(errorMessage.orEmpty(), variant = NoteVariant.ACCENT)
                Spacer(Modifier.height(12.dp))
                GhostButton("去登录", onClick = { navController.popBackStack() })
            }
            errorMessage != null -> {
                Spacer(Modifier.height(12.dp))
                Note(errorMessage.orEmpty(), variant = NoteVariant.BRONZE)
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text("已有账号？", style = Type.bodySmall, color = InkSoft)
            Text(
                "登录",
                style = Type.bodySmall.copy(color = Accent, fontWeight = FontWeight.SemiBold),
                modifier = Modifier
                    .clickable { navController.popBackStack() }
                    .padding(start = 4.dp),
            )
        }

        Spacer(Modifier.weight(1f))
        Text(
            "专注 IELTS · 让每一次练习，都离理想更近",
            style = Type.italic,
            color = InkMeta,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(bottom = 28.dp),
        )
    }
}
