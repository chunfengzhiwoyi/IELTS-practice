package com.ielts.app.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.auth.AuthUser
import com.ielts.app.components.*
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.AuthViewModel
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.model.ProfileData
import com.ielts.core.service.getProfile

private fun monogramColorOf(key: String) = when (key) {
    "accent" -> Accent
    "bronze" -> Bronze
    else -> Ink
}

/**
 * MOBILE-06 §8 — 账号资料页（视觉稿 v2.0）。
 * 只负责：头像 / 昵称 / 邮箱 / 账号状态 / 账号安全（修改密码）/ 退出登录。
 * 禁止：学习统计 / 学习报告 / API Key / 周目标 / 学习进度（与「我的」首页职责分离）。
 */
@Composable
fun AccountProfileScreen(
    studyVm: StudyViewModel?,
    authVm: AuthViewModel?,
    navController: NavController,
    innerPadding: PaddingValues,
) {
    val dataVersion = studyVm?.version
    val profile = remember(dataVersion) { getProfile() }
    val user = authVm?.state?.user
    var logoutSending by remember { mutableStateOf(false) }
    var showLogoutDialog by remember { mutableStateOf(false) }

    SubPage("账号资料", { navController.popBackStack() }, innerPadding) {
        // 头像 + 昵称 + 邮箱（点击昵称区 → 编辑昵称/头像颜色）
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Paper2)
                .border(BorderStroke(1.dp, Line), RoundedCornerShape(RadiusLarge))
                .clickable { navController.navigate(Routes.IDENTITY) }
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Monogram(
                (profile.nickname.firstOrNull() ?: '灵').toString(),
                monogramColorOf(profile.monogramColor),
                size = 56.dp,
            )
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    profile.nickname.ifBlank { "给自己起个名字" },
                    style = Type.heading,
                    color = Ink,
                )
                Spacer(Modifier.height(2.dp))
                Text(user?.email ?: "——", style = Type.bodySmall)
            }
            Text("›", style = Type.heading.copy(color = Bronze))
        }
        Spacer(Modifier.height(8.dp))
        Text("点击可修改昵称与头像", style = Type.uiLabel, modifier = Modifier.padding(start = 4.dp))
        Spacer(Modifier.height(22.dp))

        // 账号状态
        InfoRow(label = "账号状态") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(Pos))
                Spacer(Modifier.width(6.dp))
                Text("正常使用", style = Type.bodySmall, color = Pos)
            }
        }
        Spacer(Modifier.height(10.dp))
        InfoRow(label = "邮箱") { Text(user?.email ?: "——", style = Type.bodySmall) }
        Spacer(Modifier.height(22.dp))

        SectionLabel("账号安全")
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Paper2)
                .border(BorderStroke(1.dp, Line), RoundedCornerShape(RadiusLarge)),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { navController.navigate(Routes.CHANGE_PASSWORD) }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("修改密码", style = Type.body, color = Ink)
                    Spacer(Modifier.height(2.dp))
                    Text("为当前账号设置新密码", style = Type.bodySmall)
                }
                Text("›", style = Type.heading.copy(color = Bronze))
            }
        }
        Spacer(Modifier.height(24.dp))

        // 退出登录（真实 logout：server signOut + 清本地 CookieJar → Auth Gate 回 Login）
        if (logoutSending) {
            Note("正在退出登录…", variant = NoteVariant.PLAIN)
            Spacer(Modifier.height(12.dp))
        } else {
            PrimaryButton(text = "退出登录", onClick = { showLogoutDialog = true })
        }
        Spacer(Modifier.height(20.dp))
    }

    if (showLogoutDialog) {
        LogoutConfirmDialog(
            sending = logoutSending,
            onCancel = { if (!logoutSending) showLogoutDialog = false },
            onConfirm = {
                if (authVm != null) {
                    logoutSending = true
                    showLogoutDialog = false
                    authVm.logout()
                }
            },
        )
    }
}

/** MOBILE-07 — 品牌化退出登录确认弹窗：不再一键即登出。 */
@Composable
private fun LogoutConfirmDialog(
    sending: Boolean,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
) {
    androidx.compose.ui.window.Dialog(onDismissRequest = { if (!sending) onCancel() }) {
        Column(
            Modifier
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Paper)
                .border(BorderStroke(1.dp, Line), RoundedCornerShape(RadiusLarge))
                .padding(20.dp),
        ) {
            Text("退出登录", style = Type.subHeading, color = Ink)
            Spacer(Modifier.height(8.dp))
            Text("确定退出当前账号吗？退出后需要重新登录。", style = Type.bodySmall)
            Spacer(Modifier.height(20.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(
                    Modifier
                        .weight(1f)
                        .height(46.dp)
                        .clip(RoundedCornerShape(RadiusMedium))
                        .border(BorderStroke(1.dp, LineStrong), RoundedCornerShape(RadiusMedium))
                        .clickable(enabled = !sending, onClick = onCancel),
                    contentAlignment = Alignment.Center,
                ) { Text("取消", style = Type.uiButton, color = Ink) }
                Box(
                    Modifier
                        .testTag("logout_confirm")
                        .weight(1f)
                        .height(46.dp)
                        .clip(RoundedCornerShape(RadiusMedium))
                        .background(Accent)
                        .clickable(enabled = !sending, onClick = onConfirm),
                    contentAlignment = Alignment.Center,
                ) { Text("退出登录", style = Type.uiButton, color = AccentContrast) }
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, content: @Composable () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RadiusLarge))
            .background(Paper2)
            .border(BorderStroke(1.dp, Line), RoundedCornerShape(RadiusLarge))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = Type.bodySmall, modifier = Modifier.weight(1f))
        content()
    }
}
