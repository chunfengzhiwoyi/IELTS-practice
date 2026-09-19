package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.auth.AuthUser
import com.ielts.app.components.Monogram
import com.ielts.app.components.ProgressRule
import com.ielts.app.components.RadiusLarge
import com.ielts.app.components.ScreenScaffold
import com.ielts.app.components.SectionLabel
import com.ielts.app.components.Space
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.AuthViewModel
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.client.formatCNDate
import com.ielts.core.model.MiniReport
import com.ielts.core.model.ProfileData
import com.ielts.core.service.generateReport
import com.ielts.core.service.getProfile
import com.ielts.core.service.getWeeklyGoal

private fun monogramColorOf(key: String) = when (key) {
    "accent" -> Accent
    "bronze" -> Bronze
    else -> Ink
}

/**
 * MOBILE-08 §5 — 我的页重构为「Personal Learning Portrait」。
 * 首屏是一整块连续 composition：身份 → 长期数字 → 7 日轨迹 → 本周目标，
 * 不再是身份卡 + 三个小统计框 + 目标卡 + 设置卡的 Dashboard stacking。
 * 数据/导航/IA 全部冻结，仅视觉重构。
 */
@Composable
fun ProfileScreen(
    studyVm: StudyViewModel?,
    authVm: AuthViewModel?,
    navController: NavController,
    innerPadding: PaddingValues,
) {
    val date = remember { formatCNDate() }
    val dataVersion = studyVm?.version
    val profile = remember(dataVersion) { getProfile() }
    val report = remember(dataVersion) { generateReport() }
    val goal = remember(dataVersion) { getWeeklyGoal() }
    val user = authVm?.state?.user

    ScreenScaffold(date = date, innerPadding = innerPadding) {
        Spacer(Modifier.height(Space.sm))
        Text("我的", style = Type.editorTitle, color = Ink)
        Spacer(Modifier.height(Space.lg))

        LearningPortrait(
            profile = profile,
            user = user,
            report = report,
            goal = goal,
            onIdentityClick = { navController.navigate(Routes.ACCOUNT_PROFILE) },
            onGoalClick = { navController.navigate(Routes.GOAL) },
        )
        Spacer(Modifier.height(Space.xl))

        ToolsSection(
            onApiConfigClick = { navController.navigate(Routes.API_CONFIG) },
            onAboutClick = { navController.navigate(Routes.ABOUT) },
        )
        Spacer(Modifier.height(28.dp))
    }
}

/**
 * 一整块个人学习肖像：暖米底、无内部嵌套边框。
 */
@Composable
private fun LearningPortrait(
    profile: ProfileData,
    user: AuthUser?,
    report: MiniReport,
    goal: Int,
    onIdentityClick: () -> Unit,
    onGoalClick: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RadiusLarge))
            .background(Cream)
            .padding(18.dp),
    ) {
        // —— 身份行（整行可点 → 账号资料）——
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onIdentityClick),
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
                    profile.nickname.ifBlank { user?.email?.substringBefore("@") ?: "灵犀用户" },
                    style = Type.editorTitleSmall,
                    color = Ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    user?.email ?: "——",
                    style = Type.uiLabel.copy(fontSize = 11.sp),
                    color = InkMeta,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text("›", style = Type.heading.copy(color = Bronze))
        }

        Spacer(Modifier.height(Space.lg))
        androidx.compose.material3.HorizontalDivider(color = Line.copy(alpha = 0.7f), thickness = 1.dp)
        Spacer(Modifier.height(Space.lg))

        // —— 长期学习数字：主数字 + 两个无框次级数字（竖线分隔，不做三个边框框）——
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1.25f)) {
                Text("${report.totalItems}", style = Type.heroNum, color = Ink)
                Spacer(Modifier.height(2.dp))
                Text("累计学习 · 词", style = Type.statLabel)
            }
            VerticalRule()
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${report.streak}", style = Type.heading.copy(fontSize = 26.sp), color = Ink)
                Spacer(Modifier.height(2.dp))
                Text("连续 · 天", style = Type.statLabel)
            }
            VerticalRule()
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${report.speakingCompleted}", style = Type.heading.copy(fontSize = 26.sp), color = Ink)
                Spacer(Modifier.height(2.dp))
                Text("口语 · 次", style = Type.statLabel)
            }
        }

        Spacer(Modifier.height(Space.xl))

        // —— 7 日轨迹（视觉图形，不是表格）——
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("本周 ${report.daysActiveThisWeek}/7 天", style = Type.uiLabel.copy(color = InkSoft))
            Text("轨迹", style = Type.uiLabel)
        }
        Spacer(Modifier.height(Space.md))
        WeekDots(report)

        Spacer(Modifier.height(Space.xl))

        // —— 本周目标（整块可点 → Goal）——
        val done = report.newThisWeek + report.reviewedThisWeek
        val pct = if (goal > 0) (done * 100 / goal).coerceAtMost(999) else 0
        Column(Modifier.fillMaxWidth().clickable(onClick = onGoalClick)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("本周目标 $goal 词", style = Type.ui.copy(color = InkSoft))
                Text("$pct%", style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold))
            }
            Spacer(Modifier.height(8.dp))
            ProgressRule(progress = pct / 100f)
            Spacer(Modifier.height(8.dp))
            Text(
                if (pct >= 100) "已完成本周目标，继续保持。" else "已学习 $done 词 · 点击查看或调整目标",
                style = Type.uiLabel,
                color = InkMeta,
            )
        }
    }
}

@Composable
private fun VerticalRule() {
    Box(
        Modifier
            .padding(horizontal = Space.sm)
            .width(1.dp)
            .height(38.dp)
            .background(Line),
    )
}

/** 7 天圆点轨迹（● 有活动 / ○ 无活动；今日酒红高亮），作为视觉图形。
 *  顺序与 Today 母版对齐：周一 → 周日（数据源为周日开头时左移一位）。 */
@Composable
private fun WeekDots(report: MiniReport) {
    val wa = report.weeklyActivity
    val weekOrder = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")
    val ordered = wa.sortedBy { weekOrder.indexOf(it.label) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        ordered.forEach { d ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier
                        .size(if (d.isToday) 15.dp else 12.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                d.isToday -> Accent
                                d.hasActivity -> Bronze
                                else -> LineStrong.copy(alpha = 0.45f)
                            },
                        ),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    d.label.replace("周", ""),
                    style = Type.uiLabel.copy(
                        fontSize = 10.sp,
                        color = if (d.isToday) Accent else InkMeta,
                    ),
                )
            }
        }
    }
}

// ----------------------------- 工具与设置（编辑式纯行，below the fold） -----------------------------
@Composable
private fun ToolRow(title: String, subtitle: String, onClick: () -> Unit, showDivider: Boolean) {
    Column {
        if (showDivider) androidx.compose.material3.HorizontalDivider(color = Line, thickness = 1.dp)
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 15.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, style = Type.ui.copy(fontWeight = FontWeight.SemiBold), color = Ink)
                Spacer(Modifier.height(2.dp))
                Text(subtitle, style = Type.uiLabel.copy(fontSize = 11.sp))
            }
            Text("›", style = Type.heading.copy(color = Bronze))
        }
    }
}

@Composable
private fun ToolsSection(onApiConfigClick: () -> Unit, onAboutClick: () -> Unit) {
    SectionLabel("工具与设置")
    Spacer(Modifier.height(6.dp))
    // 纯 Paper 上的编辑式列表，不再套灰底卡片。
    ToolRow("AI 服务配置", "配置你的 API Key", onApiConfigClick, showDivider = false)
    ToolRow("关于灵犀 IELTS", "版本与产品理念", onAboutClick, showDivider = true)
}
