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
 * MOBILE-08F §4–10 — 我的页最后收口：强化「我的长期学习状态」。
 * 单块 Cream 连续 composition：身份 → 一个主长期数字（12）+ 两个弱辅助状态 → 7 日轨迹（主图形）→ 本周目标。
 * 不做三个等权 KPI、不加坐标轴/图例/多卡片；数据/导航/IA 全部冻结，仅视觉重构。
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
 * 一整块个人学习肖像：暖米底、无内部嵌套边框，靠留白与细线自然分层。
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
        // —— 身份行（整行可点 → 账号资料；昵称优先，长邮箱单行省略为次级识别）——
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

        // —— 长期学习主视觉：一个主数字（12）+ 右侧两个安静的辅助状态（不做三个等权 KPI）——
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("${report.totalItems}", style = Type.heroNum, color = Ink)
                Spacer(Modifier.height(2.dp))
                Text("累计学习 · 词", style = Type.statLabel)
            }
            Spacer(Modifier.width(18.dp))
            Box(
                Modifier
                    .width(1.dp)
                    .height(46.dp)
                    .background(Line),
            )
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                SecondaryStat("连续学习", "${report.streak} 天")
                Spacer(Modifier.height(9.dp))
                SecondaryStat("口语练习", "${report.speakingCompleted} 次")
            }
        }

        Spacer(Modifier.height(Space.xl))

        // —— 7 日轨迹：本肖像的主图形（克制柱节奏，无坐标轴 / 无数值标注 / 无图例）——
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("本周 ${report.daysActiveThisWeek}/7 天", style = Type.uiLabel.copy(color = InkSoft))
            Text("近 7 日", style = Type.uiLabel)
        }
        Spacer(Modifier.height(Space.md))
        WeekBars(report)

        Spacer(Modifier.height(Space.xl))
        androidx.compose.material3.HorizontalDivider(color = Line.copy(alpha = 0.7f), thickness = 1.dp)
        Spacer(Modifier.height(Space.lg))

        // —— 本周目标：标签 + 完成度 + 轻量 progress + 已学习 x/y（整块可点 → Goal，逻辑不变）——
        val done = report.newThisWeek + report.reviewedThisWeek
        val pct = if (goal > 0) (done * 100 / goal).coerceAtMost(999) else 0
        Column(Modifier.fillMaxWidth().clickable(onClick = onGoalClick)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("本周目标", style = Type.ui.copy(color = InkSoft), modifier = Modifier.weight(1f))
                Text(
                    "$pct%",
                    style = Type.ui.copy(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Accent),
                )
            }
            Spacer(Modifier.height(10.dp))
            ProgressRule(progress = pct / 100f)
            Spacer(Modifier.height(9.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (goal > 0) "已学习 $done / $goal 词" else "尚未设定本周目标",
                    style = Type.uiLabel.copy(color = InkSoft),
                    modifier = Modifier.weight(1f),
                )
                Text("去设置 ›", style = Type.uiLabel.copy(color = Bronze))
            }
        }
    }
}

/** 弱辅助状态：标签次级、数值安静，不与主数字争视觉。 */
@Composable
private fun SecondaryStat(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = Type.uiLabel, color = InkMeta, modifier = Modifier.weight(1f))
        Text(value, style = Type.bodySmall.copy(color = InkSoft, fontWeight = FontWeight.Medium))
    }
}

/**
 * 7 天克制柱节奏（底部对齐的圆角小柱 / 无活动为淡点；今日酒红，有活动暖铜），作为视觉图形而非图表。
 * 顺序与 Today 母版对齐：周一 → 周日（数据源为周日开头时左移一位）。
 */
@Composable
private fun WeekBars(report: MiniReport) {
    val wa = report.weeklyActivity
    val weekOrder = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")
    val ordered = wa.sortedBy { weekOrder.indexOf(it.label) }
    val maxCount = (ordered.maxOfOrNull { it.count } ?: 0).coerceAtLeast(1)
    val trackH = 42.dp
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        ordered.forEach { d ->
            Column(
                Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.fillMaxWidth().height(trackH), contentAlignment = Alignment.BottomCenter) {
                    if (d.count > 0) {
                        val frac = d.count.toFloat() / maxCount
                        Box(
                            Modifier
                                .fillMaxWidth(0.6f)
                                .height((8 + frac * 28f).dp)
                                .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                                .background(if (d.isToday) Accent else Bronze),
                        )
                    } else {
                        Box(
                            Modifier
                                .padding(bottom = 1.dp)
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(LineStrong.copy(alpha = 0.45f)),
                        )
                    }
                }
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
    // 纯 Paper 上的编辑式列表，不套灰底卡片；AI 配置保持 below the fold，无齿轮。
    ToolRow("AI 服务配置", "配置你的 API Key", onApiConfigClick, showDivider = false)
    ToolRow("关于灵犀 IELTS", "版本与产品理念", onAboutClick, showDivider = true)
}
