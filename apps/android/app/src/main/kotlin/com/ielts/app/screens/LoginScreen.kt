package com.ielts.app.screens

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.auth.AuthStatus
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.AuthViewModel
import com.ielts.core.client.formatCNDate

/**
 * 登录页（三入口：邮箱密码 / 邮件登录链接 / 微信扫码桥）。
 *
 * MOBILE-04B §3/§13/§14：MVP 只接「邮箱密码」真实登录。
 *  - 方式二（邮件登录链接）/ 方式三（微信扫码桥）：本期 DEFERRED，UI 明确"暂未开放"，不得伪装可用
 *  - 注册：本期默认 DEFERRED，按钮明示"注册功能暂未开放"
 *  - 错误只显示中文产品级文案（AuthErrorCode），禁止暴露 401/JWT/Supabase/GoTrue/HTTP 500/stack
 *
 * [authVm] 为 null 时是旧视觉模式（无 Auth 接线，仅供历史渲染测试）。
 */
@Composable
fun LoginScreen(authVm: AuthViewModel?, navController: NavController, innerPadding: PaddingValues) {
    val date = remember { formatCNDate() }
    val ctx = LocalContext.current

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var magicLinkEmail by remember { mutableStateOf("") }

    val authState = authVm?.state
    val loading = authState?.status == AuthStatus.AUTHENTICATING
    val errorMessage = authState?.errorMessage
        ?.takeIf { authState.status == AuthStatus.UNAUTHENTICATED }

    SubPage("登录灵犀·IELTS", { navController.popBackStack() }, innerPadding) {
        Spacer(Modifier.height(8.dp))

        // 顶部说明
        SectionLabel("三端统一身份")
        Spacer(Modifier.height(6.dp))
        Text(
            "用同一份账号在网页、微信小程序、安卓端之间无缝切换。个人开发者方案：不接短信 / 手机号 / 一键登录——只走「邮箱密码 / 邮件登录链接 / 微信扫码桥」。",
            style = Type.bodySmall,
        )
        Spacer(Modifier.height(24.dp))

        // ============= 方式 1：邮箱密码（MOBILE-04B MVP 唯一 IN_SCOPE）=============
        SectionLabel("方式一 · 邮箱密码")
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("邮箱", style = Type.bodySmall) },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Accent,
                unfocusedBorderColor = LineStrong,
                focusedLabelColor = Accent,
                cursorColor = Accent,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("密码（至少 6 位）", style = Type.bodySmall) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Accent,
                unfocusedBorderColor = LineStrong,
                focusedLabelColor = Accent,
                cursorColor = Accent,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(14.dp))
        PrimaryButton(
            text = if (loading) "登录中…" else "邮箱密码登录",
            enabled = !loading && email.isNotBlank() && password.length >= 6,
            onClick = {
                if (authVm != null) {
                    authVm.login(email, password)
                } else {
                    Toast.makeText(ctx, "Supabase Auth 接入中（个人开发者方案）", Toast.LENGTH_SHORT).show()
                }
            },
        )
        if (errorMessage != null) {
            Spacer(Modifier.height(10.dp))
            Note(errorMessage, variant = NoteVariant.BRONZE)
        }
        Spacer(Modifier.height(8.dp))
        GhostButton(
            text = "注册功能暂未开放",
        ) {
            Toast.makeText(ctx, "注册功能暂未开放", Toast.LENGTH_SHORT).show()
        }

        Spacer(Modifier.height(28.dp))

        // ============= 方式 2：邮件登录链接（MOBILE-04B DEFERRED）=============
        SectionLabel("方式二 · 邮件登录链接 · 暂未开放")
        Spacer(Modifier.height(6.dp))
        Text(
            "只填邮箱，系统发送一次性登录链接到邮箱，点击即登录——免去记密码。",
            style = Type.bodySmall,
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = magicLinkEmail,
            onValueChange = { magicLinkEmail = it },
            label = { Text("邮箱", style = Type.bodySmall) },
            singleLine = true,
            enabled = false,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Accent,
                unfocusedBorderColor = LineStrong,
                focusedLabelColor = Accent,
                cursorColor = Accent,
                disabledBorderColor = LineStrong,
                disabledLabelColor = InkMeta,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        GhostButton(
            text = "邮件登录 · 暂未开放",
        ) {
            Toast.makeText(ctx, "邮件登录暂未开放", Toast.LENGTH_SHORT).show()
        }

        Spacer(Modifier.height(28.dp))

        // ============= 方式 3：微信扫码桥（MOBILE-04B DEFERRED）=============
        SectionLabel("方式三 · 微信扫码桥 · 暂未开放")
        Spacer(Modifier.height(6.dp))
        Text(
            "在网页端展示小程序码 → 微信扫码 → 小程序 Taro.login() 拿 code → 回调 confirm → 双方绑定同一 openid。本机未装微信时不可用。",
            style = Type.bodySmall,
        )
        Spacer(Modifier.height(10.dp))
        Note(
            "微信扫码桥需要在已部署的网页端使用，本机端暂以「网页端发起」为前提。如需在 App 内触发，请前往网页端登录。",
            variant = NoteVariant.BRONZE,
        )
        Spacer(Modifier.height(12.dp))
        GhostButton(text = "微信扫码 · 暂未开放") {
            Toast.makeText(ctx, "微信扫码登录暂未开放", Toast.LENGTH_SHORT).show()
        }

        Spacer(Modifier.height(28.dp))

        // ============= 为什么不做其他方式 =============
        SectionLabel("为什么不做短信 / 手机号登录")
        Spacer(Modifier.height(6.dp))
        Text(
            "个人开发者无法完成企业认证，微信 getPhoneNumber、短信验证码、手机号一键登录全部不可用。" +
                    "当前零资质可用的方案只有「微信 wx.login（小程序）」与「Supabase 邮箱密码（本机 + 网页 + 安卓）」，与 Web/小程序端同源。",
            style = Type.bodySmall,
        )
        Spacer(Modifier.height(20.dp))

        Note("登录后即可使用真实账号身份；会话由服务端验证并安全保存。", variant = NoteVariant.BRONZE)
        Spacer(Modifier.height(24.dp))
    }
}
