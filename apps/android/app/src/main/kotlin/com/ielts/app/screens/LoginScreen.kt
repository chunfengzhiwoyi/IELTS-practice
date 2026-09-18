package com.ielts.app.screens

import android.content.Context
import androidx.compose.foundation.Image
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.R
import com.ielts.app.auth.AuthStatus
import com.ielts.app.components.*
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.AuthViewModel

private const val PREFS_AUTH = "ielts_auth"
private const val KEY_REMEMBERED_EMAIL = "remembered_email"

private fun rememberEmail(ctx: Context): String =
    ctx.getSharedPreferences(PREFS_AUTH, Context.MODE_PRIVATE).getString(KEY_REMEMBERED_EMAIL, "").orEmpty()

private fun saveRememberedEmail(ctx: Context, email: String, remember: Boolean) {
    ctx.getSharedPreferences(PREFS_AUTH, Context.MODE_PRIVATE)
        .edit()
        .apply { if (remember && email.isNotBlank()) putString(KEY_REMEMBERED_EMAIL, email) else remove(KEY_REMEMBERED_EMAIL) }
        .apply()
}

/**
 * MOBILE-06 §1 — 登录页（视觉稿 v2.0 单一入口）。
 *  - Logo + 品牌副句 + 邮箱/密码 + 记住我 + 忘记密码？ + [登录] + 注册入口
 *  - 禁止：第二邮箱登录按钮 / 微信扫码桥 / 三端统一身份 / 个人开发者方案 / 注册未开放 / 左上角返回
 *  - 登录是未认证 Auth Root：不显示返回按钮
 */
@Composable
fun LoginScreen(authVm: AuthViewModel?, navController: NavController, innerPadding: PaddingValues) {
    val ctx = LocalContext.current

    var email by remember { mutableStateOf(if (authVm != null) rememberEmail(ctx) else "") }
    var password by remember { mutableStateOf("") }
    var remember by remember { mutableStateOf(email.isNotBlank()) }

    val authState = authVm?.state
    val loading = authState?.status == AuthStatus.AUTHENTICATING
    val errorMessage = authState?.errorMessage
        ?.takeIf { authState.status == AuthStatus.UNAUTHENTICATED }

    AuthPage(innerPadding = innerPadding) {
        Spacer(Modifier.height(32.dp))
        // Logo（篆刻印章）
        Image(
            painter = painterResource(R.drawable.seal),
            contentDescription = "灵犀",
            modifier = Modifier
                .size(64.dp)
                .align(Alignment.CenterHorizontally),
        )
        Spacer(Modifier.height(18.dp))
        Text("灵犀 IELTS", style = Type.displayTitle, color = Ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        Text(
            "更聪明地准备，更从容地表达",
            style = Type.body,
            color = InkSoft,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "A smarter way to a brighter you",
            style = Type.italic,
            color = InkMeta,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(44.dp))

        AuthField("邮箱", email, { email = it }, "请输入邮箱", isPassword = false, tag = "email_field")
        Spacer(Modifier.height(14.dp))
        AuthField("密码", password, { password = it }, "请输入密码", isPassword = true, tag = "password_field")
        Spacer(Modifier.height(8.dp))

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.weight(1f).clickable { remember = !remember },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = remember,
                    onCheckedChange = { remember = it },
                    colors = CheckboxDefaults.colors(
                        checkedColor = Accent,
                        uncheckedColor = InkMeta,
                        checkmarkColor = AccentContrast,
                    ),
                )
                Text("记住我", style = Type.bodySmall, color = InkSoft)
            }
            Text(
                "忘记密码？",
                style = Type.bodySmall.copy(color = Accent, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                modifier = Modifier
                    .clickable { navController.navigate(Routes.FORGOT_PASSWORD) }
                    .padding(vertical = 8.dp),
            )
        }
        Spacer(Modifier.height(14.dp))

        PrimaryButton(
            text = if (loading) "登录中…" else "登录",
            enabled = !loading && email.isNotBlank() && password.length >= 6,
            onClick = {
                if (authVm != null) {
                    saveRememberedEmail(ctx, email, remember)
                    authVm.login(email, password)
                }
            },
        )
        if (errorMessage != null) {
            Spacer(Modifier.height(12.dp))
            Note(errorMessage, variant = NoteVariant.BRONZE)
        }
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text("还没有账号？", style = Type.bodySmall, color = InkSoft)
            Text(
                "注册",
                style = Type.bodySmall.copy(color = Accent, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                modifier = Modifier
                    .clickable { navController.navigate(Routes.REGISTER) }
                    .padding(start = 4.dp),
            )
        }

        Spacer(Modifier.weight(1f))
        Text(
            "A smaller step, a brighter you.",
            style = Type.italic,
            color = InkMeta,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(bottom = 28.dp),
        )
    }
}

/**
 * MOBILE-06 — 未认证 Auth 页面骨架。
 * [onBack] 为 null 时不显示返回（Login 是 Auth Root）；否则显示「‹ 返回登录」。
 */
@Composable
internal fun AuthPage(
    innerPadding: PaddingValues,
    onBack: (() -> Unit)? = null,
    backLabel: String = "返回登录",
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(innerPadding)) {
        Box(
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .height(TopBarHeight)
                .padding(horizontal = PagePadding),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (onBack != null) {
                Row(
                    Modifier.clickable(onClick = onBack),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("‹", style = Type.heading.copy(color = Accent))
                    Spacer(Modifier.width(4.dp))
                    Text(backLabel, style = Type.ui.copy(color = Accent))
                }
            }
        }
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = PagePadding)
                .padding(bottom = 28.dp),
        ) {
            content()
        }
    }
}

@Composable
internal fun AuthField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    isPassword: Boolean,
    tag: String = "",
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, style = Type.bodySmall) },
        placeholder = { Text(placeholder, style = Type.bodySmall, color = InkMeta) },
        singleLine = true,
        visualTransformation = if (isPassword) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        shape = RoundedCornerShape(RadiusMedium),
        textStyle = Type.body,
        modifier = if (tag.isBlank()) Modifier.fillMaxWidth() else Modifier.fillMaxWidth().testTag(tag),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Ink,
            unfocusedTextColor = Ink,
            cursorColor = Accent,
            focusedBorderColor = Accent,
            unfocusedBorderColor = LineStrong,
            focusedLabelColor = Accent,
        ),
    )
}
