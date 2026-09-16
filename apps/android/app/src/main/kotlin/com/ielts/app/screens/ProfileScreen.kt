package com.ielts.app.screens

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.auth.AuthStatus
import com.ielts.app.components.*
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.AuthViewModel
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.client.formatCNDate
import com.ielts.core.llm.getApiConfig
import com.ielts.core.service.generateReport
import com.ielts.core.service.generateReportNarrative
import com.ielts.core.service.getProfile
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(
    vm: StudyViewModel,
    authVm: AuthViewModel?,
    navController: NavController,
    innerPadding: PaddingValues,
) {
    val date = remember { formatCNDate() }
    val profile = remember(vm.version) { getProfile() }
    val report = remember(vm.version) { generateReport() }
    var showClear by remember { mutableStateOf(false) }
    var showLogout by remember { mutableStateOf(false) }
    val ctx = LocalContext.current

    val authState = authVm?.state
    val isAuthed = authState?.status == AuthStatus.AUTHENTICATED
    val userEmail = authState?.user?.email

    val scope = rememberCoroutineScope()
    var aiNarrative by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(vm.version) {
        if (getApiConfig().isValid) {
            scope.launch { aiNarrative = generateReportNarrative() }
        } else {
            aiNarrative = null
        }
    }

    val monoColor = when (profile.monogramColor) {
        "accent" -> Accent
        "bronze" -> Bronze
        else -> Ink
    }
    val initial = (profile.nickname.firstOrNull() ?: '灵').toString()

    ScreenScaffold(date, innerPadding) {
        Spacer(Modifier.height(16.dp))

        // 身份行
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { navController.navigate(Routes.PROFILE_EDIT) }
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Monogram(initial, monoColor, size = 52.dp)
            Spacer(Modifier.width(14.dp))
            Column {
                Text(profile.nickname.ifBlank { "未命名学习者" }, style = Type.heading)
                Spacer(Modifier.height(4.dp))
                Text("查看档案 ›", style = Type.uiLabel)
            }
        }
        Spacer(Modifier.height(22.dp))

        WeeklyAchievementCard(report = report, onGoalClick = { navController.navigate(Routes.REPORT) })
        Spacer(Modifier.height(22.dp))

        SectionLabel("最近掌握")
        if (report.recentMastered.isEmpty()) {
            Note("还没有独立掌握的单词，多来几次复习吧。", variant = NoteVariant.BRONZE)
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                report.recentMastered.forEach { m ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Text(m.term, style = Type.body.copy(color = Ink), modifier = Modifier.weight(1f))
                        Text(m.meaning, style = Type.bodySmall, modifier = Modifier.weight(1.2f))
                    }
                }
            }
        }
        Spacer(Modifier.height(22.dp))

        if (aiNarrative != null) {
            SectionLabel("学习手记")
            Note(aiNarrative!!, variant = NoteVariant.BRONZE)
            Spacer(Modifier.height(22.dp))
        }

        SectionLabel("设置")
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // 登录/登出行（MOBILE-04B §11）：真实账号态 → 显示邮箱 + 退出登录
            if (isAuthed) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { showLogout = true }
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "已登录：${userEmail ?: "灵犀账号"}",
                        style = Type.ui.copy(color = Ink, fontWeight = FontWeight.SemiBold),
                    )
                    Spacer(Modifier.weight(1f))
                    Text("退出登录 ›", style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold))
                }
            } else {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { navController.navigate(Routes.LOGIN) }
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("登录灵犀账号", style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold))
                    Spacer(Modifier.weight(1f))
                    Text("三端统一身份 ›", style = Type.ui.copy(color = InkMeta))
                }
            }
            SettingRow("备考目标", onClick = { navController.navigate(Routes.GOAL) })
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { navController.navigate(Routes.REPORT) }
                    .padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("学习报告", style = Type.ui.copy(color = Ink, fontWeight = FontWeight.SemiBold))
                Spacer(Modifier.weight(1f))
                Text("›", style = Type.ui.copy(color = InkMeta))
            }
            SettingRow("编辑档案", onClick = { navController.navigate(Routes.PROFILE_EDIT) })
            SettingRow("隐私保护", onClick = { navController.navigate(Routes.PRIVACY) })
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { navController.navigate(Routes.API_CONFIG) }
                    .padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("API 配置", style = Type.ui.copy(color = Ink, fontWeight = FontWeight.SemiBold))
                Spacer(Modifier.weight(1f))
                ModelStatusBadge(remember(vm.version) { getApiConfig().status() })
                Spacer(Modifier.width(10.dp))
                Text("›", style = Type.ui.copy(color = InkMeta))
            }
            SettingRow("清空学习数据", danger = true, onClick = { showClear = true })
        }
        Spacer(Modifier.height(20.dp))

        Note("下一步 · ${report.nextStep.title} —— ${report.nextStep.body}", variant = NoteVariant.BRONZE)
        Spacer(Modifier.height(20.dp))
    }

    if (showClear) {
        AlertDialog(
            onDismissRequest = { showClear = false },
            confirmButton = {
                TextButton(onClick = {
                    showClear = false
                    vm.clearAll { navController.navigate(Routes.TODAY) }
                }) { Text("清空", color = Accent) }
            },
            dismissButton = {
                TextButton(onClick = { showClear = false }) { Text("取消") }
            },
            title = { Text("清空学习数据？", style = Type.subHeading) },
            text = { Text("所有学习进度、复习排程与口语记录都会被删除，且无法恢复。", style = Type.bodySmall) },
        )
    }

    if (showLogout) {
        AlertDialog(
            onDismissRequest = { showLogout = false },
            confirmButton = {
                TextButton(onClick = {
                    showLogout = false
                    authVm?.logout()
                    Toast.makeText(ctx, "已退出当前设备", Toast.LENGTH_SHORT).show()
                }) { Text("退出登录", color = Accent) }
            },
            dismissButton = {
                TextButton(onClick = { showLogout = false }) { Text("取消") }
            },
            title = { Text("退出登录？", style = Type.subHeading) },
            text = { Text("退出后本机将清除登录状态，下次需要重新登录。", style = Type.bodySmall) },
        )
    }
}

@Composable
private fun SettingRow(label: String, danger: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = Type.ui.copy(
                color = if (danger) Accent else Ink,
                fontWeight = FontWeight.SemiBold,
            ),
        )
        Spacer(Modifier.weight(1f))
        Text("›", style = Type.ui.copy(color = InkMeta))
    }
}
