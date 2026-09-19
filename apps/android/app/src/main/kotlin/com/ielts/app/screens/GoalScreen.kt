package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberDatePickerState
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
import com.ielts.core.model.GoalProfile
import com.ielts.core.service.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

private val BAND_PRESETS = listOf(6.0, 6.5, 7.0, 7.5)
private val MIN_PRESETS = listOf(
    Pair(5, "纯打卡，太忙也能坚持"),
    Pair(15, "通勤一段，推荐起点"),
    Pair(30, "日常节奏"),
    Pair(60, "留出整块时间"),
)

private fun examMillis(date: String?): Long =
    if (date != null) runCatching {
        LocalDate.parse(date).atStartOfDay(ZoneId.of("UTC")).toInstant().toEpochMilli()
    }.getOrDefault(System.currentTimeMillis()) else System.currentTimeMillis()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalScreen(vm: StudyViewModel, navController: NavController, innerPadding: PaddingValues) {
    val init = getGoalProfile()
    var examDate by remember { mutableStateOf(init.examDate) }
    var targetBand by remember { mutableStateOf(init.targetBand) }
    var currentBand by remember { mutableStateOf(init.currentBand) }
    var dailyMinutes by remember { mutableStateOf(init.dailyMinutes) }
    var target by remember { mutableStateOf(init.weeklyWordTarget) }
    var plan by remember { mutableStateOf<StudyPlan?>(null) }

    val hist = remember(vm.version) { getStudyHistory(4) }
    val learned = hist.learnedWords
    val masteryPct = if (learned > 0) hist.masteredCount * 100 / learned else 0
    val avgDailyMin = (hist.avgWeeklyStudySeconds / 60 / 7).toInt()

    val weeksUntil = examDate?.let {
        val exam = examMillis(it)
        maxOf(1, ((exam - System.currentTimeMillis()).toDouble() / (7 * 86_400_000.0)).toInt())
    }
    val weeklyCap = (dailyMinutes * 7 / 1.5).toInt()
    val customFeasible = target <= weeklyCap

    var showDatePicker by remember { mutableStateOf(false) }
    val dateState = rememberDatePickerState(initialSelectedDateMillis = examMillis(examDate))

    SubPage(title = "备考目标", onBack = { navController.popBackStack() }, innerPadding = innerPadding) {
        Text("设定你想去的方向，灵犀会据此安排每周的学习节奏。", style = Type.bodySmall, color = InkSoft)
        Spacer(Modifier.height(Space.lg))

        // 考试日期（编辑式行，不再是灰卡）
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { showDatePicker = true }
                .padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("考试日期", style = Type.ui.copy(color = InkSoft, fontSize = 14.sp))
                Spacer(Modifier.height(3.dp))
                Text(
                    examDate ?: "未设定",
                    style = Type.editorTitleSmall.copy(fontSize = 19.sp, color = if (examDate != null) Ink else InkMeta),
                )
                if (weeksUntil != null) {
                    Spacer(Modifier.height(2.dp))
                    Text("距今约 $weeksUntil 周", style = Type.uiLabel.copy(color = Bronze, fontSize = 11.sp))
                }
            }
            Text("›", style = Type.ui.copy(color = Bronze, fontSize = 20.sp))
        }
        Spacer(Modifier.height(Space.sm))

        // 目标总分
        Text("目标总分", style = Type.uiLabel.copy(color = InkSoft))
        Spacer(Modifier.height(8.dp))
        PillRow(
            items = BAND_PRESETS.map { it.toString() },
            selectedIndex = BAND_PRESETS.indexOf(targetBand).let { if (it < 0) -1 else it },
            onSelect = { targetBand = BAND_PRESETS[it] },
        )
        Spacer(Modifier.height(14.dp))

        // 当前自估分
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("当前自估分", style = Type.uiLabel.copy(color = InkSoft))
            Text("%.1f".format(currentBand), style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold))
        }
        Slider(
            value = currentBand.toFloat(),
            onValueChange = { currentBand = it.toDouble() },
            valueRange = 4f..7f,
            steps = 6,
            colors = androidx.compose.material3.SliderDefaults.colors(
                thumbColor = Accent,
                activeTrackColor = Accent,
                inactiveTrackColor = LineStrong,
            ),
        )
        Text("凭感觉选即可，用于估算词汇缺口", style = Type.uiLabel.copy(color = Bronze, fontSize = 12.sp))
        Spacer(Modifier.height(14.dp))

        // 每日可投入时间（节奏选择，弱化为一组 chip，不再是 4 个独立表单框）
        Text("每日可投入时间", style = Type.uiLabel.copy(color = InkSoft))
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            MIN_PRESETS.forEach { (min, note) ->
                val on = dailyMinutes == min
                Column(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(RadiusMedium))
                        .background(if (on) AccentWash else Color.Transparent)
                        .clickable { dailyMinutes = min }
                        .padding(horizontal = 6.dp, vertical = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("${min} 分钟", style = Type.ui.copy(color = if (on) Accent else Ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp))
                    Spacer(Modifier.height(3.dp))
                    Text(
                        note,
                        style = Type.uiLabel.copy(color = if (on) Accent else InkMeta, fontSize = 9.sp),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
        Spacer(Modifier.height(Space.xl))

        // 当前情况（编辑式无框数据，不再是 3 张带顶线卡片）
        Text("当前情况", style = Type.editorKicker, modifier = Modifier.padding(bottom = Space.sm))
        Row(Modifier.fillMaxWidth()) {
            GoalInlineStat(learned.toString(), "已学词数", Modifier.weight(1f))
            GoalInlineStat("$masteryPct%", "掌握率", Modifier.weight(1f))
            GoalInlineStat(avgDailyMin.toString(), "近4周日均(分)", Modifier.weight(1f))
        }
        Spacer(Modifier.height(Space.xl))

        PrimaryButton(
            text = "生成我的计划",
            onClick = {
                plan = generateStudyPlan(
                    StudyPlanContext(
                        examDate = examDate,
                        targetBand = targetBand,
                        currentBand = currentBand,
                        dailyMinutes = dailyMinutes,
                        history = hist,
                    ),
                )
            },
        )
        plan?.let { p ->
            Spacer(Modifier.height(12.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(RadiusLarge))
                    .background(Paper2)
                    .border(1.dp, Line, RoundedCornerShape(RadiusLarge))
                    .padding(16.dp),
            ) {
                Column {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${p.recommendedWeeklyWords}", style = Type.word.copy(fontSize = 40.sp, color = Ink))
                        Text("词 / 周", style = Type.ui.copy(color = InkSoft))
                        Spacer(Modifier.weight(1f))
                        val feasColor = when (p.feasibility) {
                            Feasibility.Comfortable -> Pos
                            Feasibility.Tight -> Bronze
                            Feasibility.AtRisk -> Accent
                        }
                        val feasText = when (p.feasibility) {
                            Feasibility.Comfortable -> "从容"
                            Feasibility.Tight -> "偏紧"
                            Feasibility.AtRisk -> "有风险"
                        }
                        Box(
                            Modifier
                                .border(1.dp, feasColor, RoundedCornerShape(999.dp))
                                .padding(horizontal = 12.dp, vertical = 4.dp),
                        ) { Text(feasText, style = Type.uiLabel.copy(color = feasColor, fontSize = 12.sp)) }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text("距考试约 ${p.weeksRemaining} 周 · 建议每日 ${p.dailyMinutes} 分钟", style = Type.ui.copy(color = InkSoft, fontSize = 13.sp))
                    Spacer(Modifier.height(12.dp))
                    // 阶段时间轴
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        p.phases.forEachIndexed { idx, ph ->
                            Column(Modifier.weight(ph.weeks.toFloat())) {
                                Box(Modifier.fillMaxWidth().height(3.dp).background(if (idx == 1) Accent else Bronze))
                                Spacer(Modifier.height(6.dp))
                                Text(ph.name, style = Type.ui.copy(color = Ink, fontSize = 12.sp))
                                Text("${ph.weeks} 周", style = Type.uiLabel.copy(color = InkMeta, fontSize = 10.sp))
                                Text(
                                    if (ph.weeklyWords > 0) "${ph.weeklyWords} 词/周" else "只复习",
                                    style = Type.uiLabel.copy(color = InkSoft, fontSize = 10.sp),
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Note(p.note, variant = NoteVariant.BRONZE)
                    if (p.adaptive) {
                        Spacer(Modifier.height(8.dp))
                        Pill("已按你的习惯自适应", color = Bronze)
                    }
                    Spacer(Modifier.height(12.dp))
                    GhostButton(text = "采用此建议", onClick = {
                        target = p.recommendedWeeklyWords
                        dailyMinutes = p.dailyMinutes
                    })
                }
            }
        }
        Spacer(Modifier.height(22.dp))

        // 4. 自定义
        SectionLabel("自定义")
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
                StepperRow("每周目标词", target) { target = it }
                Spacer(Modifier.height(8.dp))
                StepperRow("每日分钟", dailyMinutes, min = 5, step = 5) { dailyMinutes = it }
                Spacer(Modifier.height(10.dp))
                Text(
                    if (customFeasible) "按当前每日 $dailyMinutes 分钟，每周上限约 $weeklyCap 词，可行。" else "每周 $target 词超过当前投入上限（约 $weeklyCap 词），建议加时间或调低。",
                    style = Type.uiLabel.copy(color = if (customFeasible) InkSoft else Accent, fontSize = 12.sp),
                )
            }
        }
        Spacer(Modifier.height(20.dp))

        PrimaryButton(text = "保存", onClick = {
            saveGoalProfile(
                GoalProfile(
                    examDate = examDate,
                    targetBand = targetBand,
                    currentBand = currentBand,
                    dailyMinutes = dailyMinutes,
                    weeklyWordTarget = maxOf(1, target),
                    setAt = init.setAt,
                    plannedWeeks = init.plannedWeeks,
                ),
            )
            navController.popBackStack()
        })
        Spacer(Modifier.height(14.dp))
        Text("灵犀 · IELTS — 个人主体 · 数据先存于本机", style = Type.uiLabel.copy(color = InkMeta, fontSize = 11.sp), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }

    if (showDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    dateState.selectedDateMillis?.let {
                        examDate = Instant.ofEpochMilli(it).atZone(ZoneId.of("UTC")).toLocalDate().toString()
                    }
                    showDatePicker = false
                }) { Text("确定", color = Accent) }
            },
            dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("取消") } },
        ) { DatePicker(state = dateState) }
    }
}

@Composable
private fun PillRow(items: List<String>, selectedIndex: Int, onSelect: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEachIndexed { i, label ->
            val on = i == selectedIndex
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(RadiusMedium))
                    .background(if (on) AccentWash else Color.Transparent)
                    .clickable { onSelect(i) }
                    .padding(vertical = 13.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = Type.ui.copy(
                        color = if (on) Accent else InkMeta,
                        fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                        fontSize = 16.sp,
                    ),
                )
            }
        }
    }
}

/** Goal 页编辑式无框小数据。 */
@Composable
private fun GoalInlineStat(num: String, label: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(num, style = Type.heading.copy(fontSize = 26.sp), color = Ink)
        Spacer(Modifier.height(2.dp))
        Text(label, style = Type.statLabel)
    }
}

@Composable
private fun StepperRow(label: String, value: Int, min: Int = 1, step: Int = 10, onValueChange: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = Type.ui.copy(color = Ink, fontSize = 15.sp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(RadiusMedium))
                    .border(1.dp, LineStrong, RoundedCornerShape(RadiusMedium))
                    .clickable { onValueChange((value - step).coerceAtLeast(min)) },
                contentAlignment = Alignment.Center,
            ) { Text("−", style = Type.word.copy(fontSize = 22.sp, color = Ink)) }
            Text(value.toString(), style = Type.word.copy(fontSize = 22.sp, color = Accent))
            Box(
                Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(RadiusMedium))
                    .border(1.dp, LineStrong, RoundedCornerShape(RadiusMedium))
                    .clickable { onValueChange(value + step) },
                contentAlignment = Alignment.Center,
            ) { Text("+", style = Type.word.copy(fontSize = 22.sp, color = Ink)) }
        }
    }
}
