package com.ielts.app.screens

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
 * MOBILE-08 §4 — 登录页向批准 Auth V3 收敛。
 * 视觉 Hero：暖光留白 + 克制远山（仅 Auth）+ 篆刻 Logo + 品牌句；表单紧凑、无底部死白、无重复标语。
 * 功能冻结：单一邮箱/密码入口，登录是 Auth Root（无返回），不新增登录方式/说明/卡片。
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

    // MOBILE-07：进入登录页即清掉上一次失败残留（错误只在本次会话内、离开后不残留）。
    LaunchedEffect(Unit) { authVm?.clearError() }

    Column(Modifier.fillMaxSize().padding(innerPadding)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            LoginBrandHero()

            Column(Modifier.padding(horizontal = 20.dp).padding(top = 4.dp, bottom = 32.dp)) {
                AuthField("邮箱", email, { email = it; authVm?.clearError() }, "请输入邮箱", isPassword = false, tag = "email_field")
                Spacer(Modifier.height(14.dp))
                AuthField("密码", password, { password = it; authVm?.clearError() }, "请输入密码", isPassword = true, tag = "password_field")
                Spacer(Modifier.height(6.dp))

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
                Spacer(Modifier.height(20.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    Text("还没有账号？", style = Type.bodySmall, color = InkSoft)
                    Text(
                        "创建账号",
                        style = Type.bodySmall.copy(color = Accent, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                        modifier = Modifier
                            .clickable { navController.navigate(Routes.REGISTER) }
                            .padding(start = 4.dp),
                    )
                }
            }
        }
    }
}

/**
 * Auth 品牌 Hero：暖光渐变 + 底部克制远山 + 篆刻 Logo + 品牌句。山水仅服务 Auth。
 */
@Composable
internal fun LoginBrandHero() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(344.dp)
            .background(Brush.verticalGradient(listOf(HeroWarm, Paper))),
    ) {
        Image(
            painter = painterResource(R.drawable.auth_ridge),
            contentDescription = null,
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter),
        )
        Column(
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(top = 44.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.drawable.seal),
                contentDescription = "灵犀",
                modifier = Modifier.size(58.dp),
            )
            Spacer(Modifier.height(14.dp))
            Text(
                "灵犀 IELTS",
                style = Type.editorTitle,
                color = Ink,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "让每一次学习影响下一次学习",
                style = Type.body.copy(fontSize = 15.sp),
                color = InkSoft,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "A smaller step, a brighter you.",
                style = Type.italic.copy(fontSize = 12.sp),
                color = InkMeta,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/**
 * MOBILE-06 — 未认证 Auth 页面骨架。
 * [onBack] 为 null 时不显示返回（Login 是 Auth Root）；否则显示「‹ 返回登录」。
 * [brandRidge] = true 时在顶部铺一条出血的克制远山品牌带（MOBILE-08，仅 Auth）。
 */
@Composable
internal fun AuthPage(
    innerPadding: PaddingValues,
    onBack: (() -> Unit)? = null,
    backLabel: String = "返回登录",
    brandRidge: Boolean = false,
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
                .padding(bottom = 28.dp),
        ) {
            if (brandRidge) AuthRidgeBand()
            Column(Modifier.padding(horizontal = PagePadding)) {
                content()
            }
        }
    }
}

/** 二级 Auth 页（注册 / 找回）顶部的克制远山品牌带，满宽出血，不重复 Logo 与标题。 */
@Composable
internal fun AuthRidgeBand() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(104.dp)
            .background(Brush.verticalGradient(listOf(HeroWarm, Paper))),
    ) {
        Image(
            painter = painterResource(R.drawable.auth_ridge),
            contentDescription = null,
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter),
        )
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
