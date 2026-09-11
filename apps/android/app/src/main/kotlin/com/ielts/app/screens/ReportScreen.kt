package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.components.*
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.model.StatusDistribution
import com.ielts.core.service.*
import com.ielts.core.client.parseIso
import kotlinx.coroutines.launch

@Composable
fun ReportScreen(vm: StudyViewModel, navController: NavController, innerPadding: PaddingValues) {
    var goalVer by remember { mutableStateOf(0) }
    val report = remember(vm.version, goalVer) { generateReport() }
    val goal = remember(vm.version, goalVer) { getWeeklyGoal() }
    val goalProfile = remember(vm.version, goalVer) { getGoalProfile() }
    val plan = remember(vm.version, goalVer) {
        if (goalProfile.examDate != null) generateStudyPlan(
            StudyPlanContext(goalProfile.examDate, goalProfile.targetBand, goalProfile.currentBand, goalProfile.dailyMinutes, getStudyHistory(4)),
        ) else null
    }
    var curPhase = 0
    var elapsedWeeks = 0
    if (plan != null) {
        val planned = goalProfile.plannedWeeks ?: plan.weeksRemaining
        if (goalProfile.setAt != null) {
            elapsedWeeks = ((System.currentTimeMillis() - parseIso(goalProfile.setAt).time) / (7L * 86_400_000L)).toInt().coerceAtLeast(0)
        }
        elapsedWeeks = elapsedWeeks.coerceAtMost(planned)
        var acc = 0
        for (i in plan.phases.indices) {
            val frac = plan.phases[i].weeks.toDouble() / plan.weeksRemaining
            val bound = (acc + frac * planned).toInt()
            if (elapsedWeeks < bound) { curPhase = i; break }
            acc = bound
        }
    }

    val total = report.newThisWeek + report.reviewedThisWeek
    val lastWeek = report.lastWeekTotal
    val deltaPct = if (lastWeek > 0) (total - lastWeek) * 100 / lastWeek else 0

    val studyMin = (report.studySecondsThisWeek / 60).toInt()
    val lastStudyMin = (report.studySecondsLastWeek / 60).toInt()
    val studyDelta = if (lastStudyMin > 0) (studyMin - lastStudyMin) * 100 / lastStudyMin else 0

    SubPage(title = "学习报告", onBack = { navController.popBackStack() }, innerPadding = innerPadding) {
        // 1. 目标（与本周成就联动）
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Paper2)
                .border(1.dp, Line, RoundedCornerShape(RadiusLarge))
                .clickable { navController.navigate(Routes.GOAL) }
                .padding(16.dp),
        ) {
            Column {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("备考目标", style = Type.uiLabel.copy(color = Bronze))
                    Text("查看 / 调整 ›", style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold))
                }
                Spacer(Modifier.height(10.dp))
                if (plan != null) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        val topLine = buildString {
                        append("距考试 ${plan.weeksRemaining} 周")
                        if (goalProfile.setAt != null) append(" · 已坚持 $elapsedWeeks 周")
                        append(" · 每周 $goal 词")
                    }
                    Text(topLine, style = Type.ui.copy(color = InkSoft))
                        val feasText = when (plan.feasibility) {
                            Feasibility.Comfortable -> "从容"
                            Feasibility.Tight -> "偏紧"
                            Feasibility.AtRisk -> "有风险"
                        }
                        Text(feasText, style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold))
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        plan.phases.forEachIndexed { i, ph ->
                            Text(
                                ph.name,
                                style = Type.uiLabel.copy(
                                    color = if (i == curPhase) Accent else InkMeta,
                                    fontSize = 12.sp,
                                    fontWeight = if (i == curPhase) FontWeight.SemiBold else FontWeight.Normal,
                                ),
                            )
                        }
                    }
                } else {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("尚未设定备考目标", style = Type.ui.copy(color = InkSoft))
                        Text("去设定 ›", style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold))
                    }
                }
            }
        }
        Spacer(Modifier.height(22.dp))

        // 2. 学习数据概览
        SectionLabel("学习数据概览")
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OverviewTile("${studyMin}", "分钟", "学习时长", studyDelta, Modifier.weight(1f))
            OverviewTile("${report.newThisWeek}", "词", "新学词", null, Modifier.weight(1f))
            OverviewTile("${report.reviewedThisWeek}", "次", "复习次数", null, Modifier.weight(1f))
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OverviewTile("${report.masteredCount}", "词", "已掌握", null, Modifier.weight(1f))
            OverviewTile("${report.streak}", "天", "连续学习", null, Modifier.weight(1f))
            Spacer(Modifier.weight(1f))
        }
        Spacer(Modifier.height(22.dp))

        // 3. 学习趋势分析（复用本周成就图表语法）
        SectionLabel("学习趋势分析")
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Paper2)
                .border(1.dp, Line, RoundedCornerShape(RadiusLarge))
                .padding(16.dp),
        ) {
            Column {
                AchievementBars(items = report.weeklyActivity, dailyGoal = goal / 7)
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        if (deltaPct >= 0) "▲ $deltaPct%" else "▼ ${-deltaPct}%",
                        style = Type.ui.copy(color = if (deltaPct >= 0) Pos else Amber, fontWeight = FontWeight.SemiBold),
                    )
                    Text("本周总量 $total 词 · 较上周 $lastWeek 词", style = Type.ui.copy(color = InkMeta))
                }
            }
        }
        Spacer(Modifier.height(22.dp))

        // 4. 知识点掌握情况
        SectionLabel("知识点掌握情况")
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Paper2)
                .border(1.dp, Line, RoundedCornerShape(RadiusLarge))
                .padding(16.dp),
        ) {
            Column {
                MasteryStack(dist = report.statusDistribution)
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    MasteryLegend(label = "新学", count = report.statusDistribution.new, color = LineStrong)
                    MasteryLegend(label = "学习中", count = report.statusDistribution.learning, color = Bronze)
                    MasteryLegend(label = "复习中", count = report.statusDistribution.reviewing, color = AccentDeep)
                    MasteryLegend(label = "已掌握", count = report.statusDistribution.mastered, color = Accent)
                }
            }
        }
        Spacer(Modifier.height(22.dp))

        // 5. 复习正确率
        SectionLabel("复习正确率")
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Paper2)
                .border(1.dp, Line, RoundedCornerShape(RadiusLarge))
                .padding(16.dp),
        ) {
            Column {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("${report.reviewCorrectRate}%", style = Type.word.copy(fontSize = 40.sp, color = Ink))
                    Text("本周复习判定通过率", style = Type.ui.copy(color = InkSoft))
                }
                Spacer(Modifier.height(10.dp))
                ProgressRule(progress = (report.reviewCorrectRate / 100f).coerceIn(0f, 1f))
                Spacer(Modifier.height(8.dp))
                Text("基于本周 ${report.reviewedThisWeek} 次复习判定", style = Type.ui.copy(color = InkMeta, fontSize = 13.sp))
            }
        }
        Spacer(Modifier.height(22.dp))

        // 6. 下一步
        SectionLabel("下一步")
        Spacer(Modifier.height(10.dp))
        Note("${report.nextStep.title} —— ${report.nextStep.body}", variant = NoteVariant.BRONZE)
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun OverviewTile(num: String, unit: String, label: String, delta: Int?, modifier: Modifier = Modifier) {
    Column(
        modifier
            .border(1.dp, Line, RoundedCornerShape(RadiusMedium))
            .background(Paper)
            .padding(12.dp, 14.dp),
    ) {
        Box(Modifier.fillMaxWidth().height(3.dp).background(Bronze))
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(num, style = Type.word.copy(fontSize = 30.sp, color = Ink))
            Spacer(Modifier.width(4.dp))
            Text(unit, style = Type.ui.copy(color = InkMeta, fontSize = 13.sp))
        }
        Spacer(Modifier.height(4.dp))
        Text(label, style = Type.ui.copy(color = InkSoft, fontSize = 13.sp))
        Spacer(Modifier.height(2.dp))
        Text(
            when {
                delta == null -> "—"
                delta >= 0 -> "▲ $delta%"
                else -> "▼ ${-delta}%"
            },
            style = Type.uiLabel.copy(
                fontSize = 11.sp,
                color = if (delta == null) LineStrong else if (delta >= 0) Pos else Amber,
            ),
        )
    }
}

@Composable
private fun MasteryStack(dist: StatusDistribution, modifier: Modifier = Modifier) {
    val total = (dist.new + dist.learning + dist.reviewing + dist.mastered).toFloat().coerceAtLeast(1f)
    Row(modifier.fillMaxWidth().height(26.dp).clip(RoundedCornerShape(6.dp))) {
        Box(Modifier.weight(dist.new / total).fillMaxHeight().background(LineStrong))
        Box(Modifier.weight(dist.learning / total).fillMaxHeight().background(Bronze))
        Box(Modifier.weight(dist.reviewing / total).fillMaxHeight().background(AccentDeep))
        Box(Modifier.weight(dist.mastered / total).fillMaxHeight().background(Accent))
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
