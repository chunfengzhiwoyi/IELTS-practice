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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
 * MOBILE-08 §10 — 账号资料页紧凑化（逻辑/IA 冻结）。
 * 去重复邮箱框、去满宽酒红退出按钮；身份用暖底块，信息改编辑式行。
 * 只负责：头像 / 昵称 / 邮箱 / 账号状态 / 修改密码 / 退出登录。
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
        // 身份块（暖底无边框；邮箱单行 ellipsis，不再换行撑破卡片）
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Cream)
                .clickable { navController.navigate(Routes.IDENTITY) }
                .padding(18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Monogram(
                (profile.nickname.firstOrNull() ?: '灵').toString(),
                monogramColorOf(profile.monogramColor),
                size = 52.dp,
            )
            Spacer(Modifier.width(Space.md))
            Column(Modifier.weight(1f)) {
                Text(
                    profile.nickname.ifBlank { "给自己起个名字" },
                    style = Type.editorTitleSmall,
                    color = Ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    user?.email ?: "——",
                    style = Type.uiLabel.copy(fontSize = 11.sp, color = InkMeta),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text("›", style = Type.heading.copy(color = Bronze))
        }
        Spacer(Modifier.height(Space.sm))
        Text("点击可修改昵称与头像", style = Type.uiLabel.copy(fontSize = 11.sp), modifier = Modifier.padding(start = 4.dp))
        Spacer(Modifier.height(Space.lg))

        // 账号信息（编辑式行，不再是灰底边框框；邮箱已在身份块展示，不重复）
        AccountRow(label = "账号状态", showDivider = false) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(Pos))
                Spacer(Modifier.width(6.dp))
                Text("正常使用", style = Type.bodySmall, color = Pos)
            }
        }
        Spacer(Modifier.height(Space.xl))

        // 账号安全
        Text("账号安全", style = Type.editorKicker, modifier = Modifier.padding(bottom = Space.xs))
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { navController.navigate(Routes.CHANGE_PASSWORD) }
                .padding(vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("修改密码", style = Type.ui.copy(color = Ink))
                Spacer(Modifier.height(2.dp))
                Text("为当前账号设置新密码", style = Type.uiLabel.copy(fontSize = 11.sp))
            }
            Text("›", style = Type.heading.copy(color = Bronze))
        }
        Spacer(Modifier.height(Space.xl))

        // 退出登录：降视觉权重（描边次按钮，不再满宽酒红）；仍有确认弹窗
        if (logoutSending) {
            Note("正在退出登录…", variant = NoteVariant.PLAIN)
        } else {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clip(RoundedCornerShape(RadiusMedium))
                    .border(BorderStroke(1.dp, LineStrong), RoundedCornerShape(RadiusMedium))
                    .clickable { showLogoutDialog = true },
                contentAlignment = Alignment.Center,
            ) {
                Text("退出登录", style = Type.uiButton, color = Accent)
            }
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
            Text("退出登录", style = Type.editorTitleSmall, color = Ink)
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

/** 无卡片背景的编辑式信息行。 */
@Composable
private fun AccountRow(
    label: String,
    showDivider: Boolean,
    subtitle: String? = null,
    content: @Composable () -> Unit,
) {
    Column {
        if (showDivider) androidx.compose.material3.HorizontalDivider(color = Line, thickness = 1.dp)
        Row(
            Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(label, style = Type.ui.copy(color = Ink))
                if (subtitle != null) {
                    Spacer(Modifier.height(2.dp))
                    Text(subtitle, style = Type.uiLabel.copy(fontSize = 11.sp))
                }
            }
            content()
        }
    }
}
