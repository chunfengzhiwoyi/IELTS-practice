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
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.core.client.formatCNDate

/**
 * 登录页（三入口：邮箱密码 / 邮件登录链接 / 微信扫码桥）。
 *
 * 设计原则：个人开发者零资质约束——不接短信/手机号/一键登录，
 * 只用 Supabase 邮箱密码 + 邮件 Magic Link + 网页↔小程序扫码桥。
 *
 * 当前实现：UI 完整可用；Supabase 后端调用 / 扫码桥服务端签发会话
 * 留待后续接入（点击后 toast 提示"接入中"）。结构与 Web/小程序同源。
 */
@Composable
fun LoginScreen(navController: NavController, innerPadding: PaddingValues) {
    val date = remember { formatCNDate() }
    val ctx = LocalContext.current

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var magicLinkEmail by remember { mutableStateOf("") }

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

        // ============= 方式 1：邮箱密码 =============
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
            text = "邮箱密码登录",
            enabled = email.isNotBlank() && password.length >= 6,
            onClick = {
                Toast.makeText(ctx, "Supabase Auth 接入中（个人开发者方案）", Toast.LENGTH_SHORT).show()
            },
        )
        Spacer(Modifier.height(8.dp))
        GhostButton(text = "注册新账号") {
            Toast.makeText(ctx, "注册流程：邮箱 + 密码提交至 Supabase Auth", Toast.LENGTH_SHORT).show()
        }

        Spacer(Modifier.height(28.dp))

        // ============= 方式 2：邮件登录链接 =============
        SectionLabel("方式二 · 邮件登录链接")
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
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Accent,
                unfocusedBorderColor = LineStrong,
                focusedLabelColor = Accent,
                cursorColor = Accent,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        GhostButton(
            text = "发送邮件登录链接",
        ) {
            if (magicLinkEmail.isBlank()) {
                Toast.makeText(ctx, "请先填写邮箱", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(ctx, "Magic Link 已发送（接入 Supabase 后生效）", Toast.LENGTH_SHORT).show()
            }
        }

        Spacer(Modifier.height(28.dp))

        // ============= 方式 3：微信扫码桥 =============
        SectionLabel("方式三 · 微信扫码桥")
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
        GhostButton(text = "在网页端发起微信扫码登录") {
            Toast.makeText(ctx, "请在网页端打开登录页，使用微信扫码入口", Toast.LENGTH_SHORT).show()
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

        Note("下一步 · 接入 Supabase 项目后即可真实登录；当前为 UI 演示版。", variant = NoteVariant.BRONZE)
        Spacer(Modifier.height(24.dp))
    }
}
