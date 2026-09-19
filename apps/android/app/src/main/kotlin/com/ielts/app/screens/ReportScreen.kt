package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.components.*
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.model.DayActivity
import com.ielts.core.model.StatusDistribution
import com.ielts.core.service.*

/**
 * MOBILE-08 §7 — 学习报告编辑式重构。
 * 视觉 Hero = 「这周发生了什么变化」：一块暖底周总结（总量 + 一句变化）。
 * 其余降为无框编辑式小节（备考目标行 / 次要数据 / 趋势 / 掌握 / 下一步），
 * 不再是 5 个同权重统计框 + 一堆等权卡片。数据与统计口径完全冻结。
 */
@Composable
fun ReportScreen(vm: StudyViewModel, navController: NavController, innerPadding: PaddingValues) {
    val report = remember(vm.version) { generateReport() }
    val goal = remember(vm.version) { getWeeklyGoal() }
    val goalProfile = remember(vm.version) { getGoalProfile() }
    val plan = remember(vm.version) {
        if (goalProfile.examDate != null) generateStudyPlan(
            StudyPlanContext(goalProfile.examDate, goalProfile.targetBand, goalProfile.currentBand, goalProfile.dailyMinutes, getStudyHistory(4)),
        ) else null
    }

    val total = report.newThisWeek + report.reviewedThisWeek
    val lastWeek = report.lastWeekTotal
    val deltaPct = if (lastWeek > 0) (total - lastWeek) * 100 / lastWeek else 0
    val studyMin = (report.studySecondsThisWeek / 60).toInt()

    val changeSentence = when {
        total == 0 -> "这周还没有学习记录，从今天的第一次复习开始。"
        lastWeek == 0 -> "这是你有记录的第一周，已经迈出第一步。"
        deltaPct > 0 -> "比上周多学了 $deltaPct%，节奏正在变快。"
        deltaPct == 0 -> "和上周持平，保持稳定的学习节奏。"
        else -> "比上周少了 ${-deltaPct}%，这周可以再给自己加一点。"
    }
    val feasText = when (plan?.feasibility) {
        Feasibility.Comfortable -> "从容"
        Feasibility.Tight -> "偏紧"
        Feasibility.AtRisk -> "有风险"
        else -> ""
    }
    val goalSummary = if (plan != null) "距考试 ${plan.weeksRemaining} 周 · 每周 $goal 词 · $feasText" else "尚未设定备考目标"

    SubPage(title = "学习报告", onBack = { navController.popBackStack() }, innerPadding = innerPadding) {
        // 01 —— 本周总结（唯一暖底 Hero：总量 + 一句变化）
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Cream)
                .padding(18.dp),
        ) {
            Text("本周总结", style = Type.editorKicker)
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(total.toString(), style = Type.heroNum.copy(fontSize = 46.sp), color = Ink)
                Spacer(Modifier.width(6.dp))
                Text("词 · 本周学习总量", style = Type.ui.copy(color = InkSoft), modifier = Modifier.padding(bottom = 6.dp))
            }
            Spacer(Modifier.height(8.dp))
            Text(changeSentence, style = Type.body.copy(color = Ink))
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                MetaDot("新学 ${report.newThisWeek}", Bronze)
                MetaDot("复习 ${report.reviewedThisWeek}", Accent)
                MetaDot("$studyMin 分钟", InkMeta)
            }
        }
        Spacer(Modifier.height(Space.section))

        // 02 —— 备考目标（编辑式一行，点击进入 Goal）
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { navController.navigate(Routes.GOAL) }
                .padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("备考目标", style = Type.ui.copy(fontWeight = FontWeight.SemiBold), color = Ink)
                Spacer(Modifier.height(2.dp))
                Text(goalSummary, style = Type.uiLabel.copy(fontSize = 11.sp))
            }
            Text(
                if (plan != null) "查看 / 调整 ›" else "去设定 ›",
                style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
            )
        }
        androidx.compose.material3.HorizontalDivider(color = Line, thickness = 1.dp, modifier = Modifier.padding(vertical = Space.sm))

        // 03 —— 本周数据（无框，编辑式陈列；不再 5 个等权框）
        Text("本周数据", style = Type.editorKicker, modifier = Modifier.padding(top = Space.sm, bottom = Space.sm))
        Row(Modifier.fillMaxWidth()) {
            InlineStat("${report.masteredCount}", "已掌握 · 词", Modifier.weight(1f))
            InlineStat("${report.streak}", "连续 · 天", Modifier.weight(1f))
            InlineStat("${report.reviewCorrectRate}%", "复习正确率", Modifier.weight(1f))
        }
        Spacer(Modifier.height(Space.section))

        // 04 —— 学习趋势（图表直接放素底，弱化为第二节）
        Text("学习趋势", style = Type.editorKicker, modifier = Modifier.padding(bottom = Space.sm))
        AchievementBars(items = weekMonFirst(report.weeklyActivity), dailyGoal = goal / 7)
        Spacer(Modifier.height(Space.sm))
        Text(
            "本周总量 $total 词 · 较上周 $lastWeek 词",
            style = Type.uiLabel.copy(fontSize = 11.sp),
        )
        Spacer(Modifier.height(Space.section))

        // 05 —— 知识掌握（安全的零容忍 stack，数据真实）
        Text("知识掌握", style = Type.editorKicker, modifier = Modifier.padding(bottom = Space.md))
        MasteryStack(dist = report.statusDistribution)
        Spacer(Modifier.height(Space.md))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            MasteryLegend(label = "新学", count = report.statusDistribution.new, color = LineStrong)
            MasteryLegend(label = "学习中", count = report.statusDistribution.learning, color = Bronze)
            MasteryLegend(label = "复习中", count = report.statusDistribution.reviewing, color = AccentDeep)
            MasteryLegend(label = "已掌握", count = report.statusDistribution.mastered, color = Accent)
        }
        Spacer(Modifier.height(Space.section))

        // 06 —— 下一步
        Text("下一步", style = Type.editorKicker, modifier = Modifier.padding(bottom = Space.sm))
        Note("${report.nextStep.title} —— ${report.nextStep.body}", variant = NoteVariant.BRONZE)
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun MetaDot(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(6.dp).clip(RoundedCornerShape(50)).background(color))
        Spacer(Modifier.width(6.dp))
        Text(label, style = Type.uiLabel.copy(fontSize = 11.sp, color = InkSoft))
    }
}

/** 无框编辑式小数据：数字 + 标签，不套卡片。 */
@Composable
private fun InlineStat(num: String, label: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(num, style = Type.heading.copy(fontSize = 26.sp), color = Ink)
        Spacer(Modifier.height(2.dp))
        Text(label, style = Type.statLabel)
    }
}

/** 周序对齐 Today/Profile 母版：周一 → 周日（数据源为周日开头时左移一位）。 */
private fun weekMonFirst(wa: List<DayActivity>): List<DayActivity> {
    val weekOrder = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")
    return wa.sortedBy { weekOrder.indexOf(it.label) }
}

/**
 * MOBILE-P0-REPORT-CRASH-FIX: mastery segments.
 * Only buckets with value > 0 are kept; weights are exact real-count fractions.
 * All-zero returns an empty list and MasteryStack renders a safe empty track.
 * No epsilon is injected into zero buckets and no statistic is fabricated.
 */
internal fun masterySegments(dist: StatusDistribution): List<Pair<Color, Float>> {
    val raw = listOf(
        dist.new to LineStrong,
        dist.learning to Bronze,
        dist.reviewing to AccentDeep,
        dist.mastered to Accent,
    ).filter { it.first > 0 }
    if (raw.isEmpty()) return emptyList()
    val total = raw.sumOf { it.first }.toFloat()
    return raw.map { (value, color) -> color to (value / total) }
}

@Composable
internal fun MasteryStack(dist: StatusDistribution, modifier: Modifier = Modifier) {
    val segments = masterySegments(dist)
    Row(
        modifier
            .fillMaxWidth()
            .height(26.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(Line),
    ) {
        segments.forEach { (color, fraction) ->
            Box(Modifier.weight(fraction).fillMaxHeight().background(color))
        }
    }
}

@Composable
private fun MasteryLegend(label: String, count: Int, color: Color, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(14.dp).clip(RoundedCornerShape(3.dp)).background(color))
        Spacer(Modifier.width(6.dp))
        Text("$label $count", style = Type.uiLabel.copy(fontSize = 11.sp, color = InkSoft))
    }
}
