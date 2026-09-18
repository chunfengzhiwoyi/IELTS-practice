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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.auth.AuthUser
import com.ielts.app.components.Monogram
import com.ielts.app.components.PagePadding
import com.ielts.app.components.PrimaryButton
import com.ielts.app.components.ProgressRule
import com.ielts.app.components.RadiusLarge
import com.ielts.app.components.RadiusMedium
import com.ielts.app.components.ScreenScaffold
import com.ielts.app.components.SectionLabel
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
 * MOBILE-06 §4/§5/§6/§7/§11 — 我的页（视觉稿 v2.0）。
 * 职责：「我是谁 + 我学到哪里了 + 常用个人工具」。
 *  - 顶部身份卡（点击整卡 → 账号资料页；不出现重复「账号信息」入口）
 *  - 我的学习：本周 7 天轻量轨迹 + 累计学习 / 连续学习 / 口语练习 + 本周目标进度条（真实数据）
 *  - 下方：工具与设置 → AI 服务配置（BELOW_THE_FOLD）
 *  - 无右上角 gear 图标
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
        Spacer(Modifier.height(4.dp))
        Text("我的", style = Type.displayTitle, color = Ink)
        Spacer(Modifier.height(18.dp))

        IdentityCard(profile, user, onClick = { navController.navigate(Routes.ACCOUNT_PROFILE) })
        Spacer(Modifier.height(22.dp))

        LearningSection(report, goal)
        Spacer(Modifier.height(22.dp))

        ToolsSection(onApiConfigClick = { navController.navigate(Routes.API_CONFIG) })
        Spacer(Modifier.height(28.dp))

        Text("关于灵犀 IELTS", style = Type.uiLabel, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(6.dp))
        Text(
            "灵犀 IELTS · A smaller step, a brighter you.",
            style = Type.uiLabel,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

// ----------------------------- 顶部身份卡 -----------------------------
@Composable
private fun IdentityCard(profile: ProfileData, user: AuthUser?, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RadiusLarge))
            .background(Paper2)
            .border(BorderStroke(1.dp, Line), RoundedCornerShape(RadiusLarge))
            .clickable(onClick = onClick)
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
                profile.nickname.ifBlank { user?.email?.substringBefore("@") ?: "灵犀用户" },
                style = Type.heading,
                color = Ink,
            )
            Spacer(Modifier.height(2.dp))
            Text(user?.email ?: profile.nickname.ifBlank { "——" }, style = Type.bodySmall)
            Spacer(Modifier.height(6.dp))
            Text("持续学习，遇见更好的自己", style = Type.uiLabel.copy(color = InkMeta))
        }
        Text("›", style = Type.heading.copy(color = Bronze))
    }
}

// ----------------------------- 我的学习 -----------------------------
@Composable
private fun LearningSection(report: MiniReport, goal: Int) {
    SectionLabel("我的学习")
    Spacer(Modifier.height(8.dp))
    Box(
        Modifier
            .fillMaxWidth()
            .background(Paper2)
            .border(BorderStroke(1.dp, Line), RoundedCornerShape(RadiusLarge))
            .padding(16.dp),
    ) {
        if (report.totalItems == 0 && report.speakingCompleted == 0 && report.streak == 0) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(16.dp))
                Text("还没有学习记录", style = Type.subHeading, color = Ink)
                Spacer(Modifier.height(6.dp))
                Text("去「今日」开始第一次练习吧", style = Type.bodySmall)
                Spacer(Modifier.height(18.dp))
            }
        } else {
            Column {
                // 本周轨迹：一二三四五六日 + 圆点
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("本周 ${report.daysActiveThisWeek}/7 天", style = Type.ui.copy(color = InkSoft, fontWeight = FontWeight.SemiBold))
                    Text("连续学习 ${report.streak} 天", style = Type.uiLabel)
                }
                Spacer(Modifier.height(10.dp))
                WeekDots(report)
                Spacer(Modifier.height(16.dp))

                // 三项真实指标
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MiniStat("${report.totalItems}", "累计学习（词/表达）", Modifier.weight(1f))
                    MiniStat("${report.streak}", "连续学习（天）", Modifier.weight(1f))
                    MiniStat("${report.speakingCompleted}", "口语练习（次）", Modifier.weight(1f))
                }
                Spacer(Modifier.height(18.dp))

                // 本周目标 / 周进度
                val done = report.newThisWeek + report.reviewedThisWeek
                val pct = if (goal > 0) (done * 100 / goal).coerceAtMost(999) else 0
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("本周目标 $goal 词", style = Type.ui.copy(color = InkSoft))
                    Text("$pct%", style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold))
                }
                Spacer(Modifier.height(6.dp))
                ProgressRule(progress = pct / 100f)
                Spacer(Modifier.height(8.dp))
                Text(
                    if (pct >= 100) "继续加油！你已经完成了本周的学习目标。" else "已学习 $done 词，继续加油！",
                    style = Type.uiLabel,
                    color = InkMeta,
                )
            }
        }
    }
}

/** 7 天圆点轨迹（● 有活动 / ○ 无活动；今日高亮） */
@Composable
private fun WeekDots(report: MiniReport) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        report.weeklyActivity.forEach { d ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier
                        .size(14.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                d.isToday -> Accent
                                d.hasActivity -> Bronze
                                else -> LineStrong.copy(alpha = 0.5f)
                            },
                        ),
                )
                Spacer(Modifier.height(4.dp))
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

@Composable
private fun MiniStat(num: String, label: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .border(BorderStroke(1.dp, LineStrong), RoundedCornerShape(RadiusMedium))
            .background(Paper)
            .padding(10.dp, 12.dp),
    ) {
        Text(num, style = Type.word.copy(fontSize = 26.sp, color = Ink))
        Spacer(Modifier.height(2.dp))
        Text(label, style = Type.uiLabel.copy(fontSize = 10.sp, color = InkMeta))
    }
}

// ----------------------------- 工具与设置 -----------------------------
@Composable
private fun ToolsSection(onApiConfigClick: () -> Unit) {
    SectionLabel("工具与设置")
    Spacer(Modifier.height(8.dp))
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RadiusLarge))
            .background(Paper2)
            .border(BorderStroke(1.dp, Line), RoundedCornerShape(RadiusLarge)),
    ) {
        Column {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onApiConfigClick)
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("AI 服务配置", style = Type.body, color = Ink, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(2.dp))
                    Text("配置你的 API Key", style = Type.bodySmall)
                }
                Text("›", style = Type.heading.copy(color = Bronze))
            }
        }
    }
}
