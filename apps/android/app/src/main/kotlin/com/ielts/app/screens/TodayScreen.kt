package com.ielts.app.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CollectionsBookmark
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.R
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.client.formatCNDate
import com.ielts.core.model.DayActivity
import com.ielts.core.model.TodaySummary
import com.ielts.core.service.generateReport
import com.ielts.core.service.getTodaySummary
import java.util.Calendar

/**
 * 今日页（Today Pilot · R2 Visual Fidelity）。
 * 严格按 Approved Visual Reference 施工：Hero 暖光 / 今日复习紧凑横卡 / 本周学习暖米卡 /
 * 四个快捷入口浅暖红卡 / 固定五项 Bottom Navigation。
 * 数据全部来自既有真实逻辑：summary.due、summary.minutes、weeklyActivity、导航。
 */
@Composable
fun TodayScreen(vm: StudyViewModel, navController: NavController, innerPadding: PaddingValues) {
    val date = remember { formatCNDate().replace(" ", "·") }
    val summary = remember(vm.version) { getTodaySummary() }
    val report = remember(vm.version) { generateReport() }
    val week = report.weeklyActivity.sortedBy { weekdayIndex(it.label) }
    val daysActive = week.count { it.hasActivity }
    val hour = remember { Calendar.getInstance().get(Calendar.HOUR_OF_DAY) }

    Column(Modifier.fillMaxSize().padding(innerPadding)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            // ---------- Hero：品牌区 + 问候区 + 激励语（暖光环境） ----------
            Box(
                Modifier
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(HeroWarm, Paper))),
            ) {
                Column(Modifier.padding(horizontal = 20.dp)) {
                    BrandHeader()
                    Spacer(Modifier.height(10.dp))
                    GreetingBlock(hour, date)
                    Spacer(Modifier.height(20.dp))
                }
            }

            // ---------- 内容区：卡片 ----------
            Column(
                Modifier
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
            ) {
                TodayCard(summary, navController)
                Spacer(Modifier.height(20.dp))
                WeekCard(week, daysActive)
                Spacer(Modifier.height(20.dp))
                QuickEntries(navController)
            }
        }
    }
}

// ----------------------------- Hero：品牌区 -----------------------------

@Composable
private fun BrandHeader() {
    Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Image(
            painter = painterResource(R.drawable.seal),
            contentDescription = "灵犀",
            modifier = Modifier.size(30.dp),
        )
        Spacer(Modifier.width(10.dp))
        Column {
            Text("灵犀 IELTS", style = BrandWordmark)
            Spacer(Modifier.height(2.dp))
            Text("让每一次学习影响下一次学习", style = BrandSlogan)
        }
    }
}

// ----------------------------- Hero：问候区 + 装饰 -----------------------------

private fun greetingText(hour: Int): String = when {
    hour < 6 -> "夜深了"
    hour < 12 -> "早上好"
    hour < 14 -> "中午好"
    hour < 18 -> "下午好"
    else -> "晚上好"
}

@Composable
private fun GreetingBlock(hour: Int, date: String) {
    Column {
        Text("${greetingText(hour)}，", style = GreetingTitle)
        Spacer(Modifier.height(2.dp))
        Text("继续你的小小进步吧。", style = GreetingSub)
        Spacer(Modifier.height(6.dp))
        Text(date, style = DateLabel)
    }
}

// ----------------------------- 今日复习卡（紧凑横向构图） -----------------------------

@Composable
private fun TodayCard(summary: TodaySummary, navController: NavController) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Paper)
            .border(1.dp, Line, RoundedCornerShape(20.dp))
            .padding(16.dp),
    ) {
        Text("今日复习", style = CardTitleLabel)
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Outlined.CollectionsBookmark,
                contentDescription = null,
                tint = InkSoft,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (summary.hasDue) "${summary.due} 个词待复习" else "今天没有待复习的词",
                    style = TaskMain,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    if (summary.hasDue) "预计 ${summary.minutes} 分钟" else "学一个新表达，保持节奏",
                    style = TaskSub,
                )
            }
            Spacer(Modifier.width(12.dp))
            CompactCta(
                text = if (summary.hasDue) "开始复习" else "开始学习",
                onClick = {
                    navController.navigate(if (summary.hasDue) Routes.REVIEW else Routes.LEARN)
                },
            )
        }
    }
}

@Composable
private fun CompactCta(text: String, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Accent)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("$text →", style = CtaText)
    }
}

// ----------------------------- 本周学习卡（暖米底 + 圆点） -----------------------------

/** 周一到周日排序键：周一=0 … 周日=6 */
private fun weekdayIndex(label: String): Int = when (label) {
    "周一" -> 0
    "周二" -> 1
    "周三" -> 2
    "周四" -> 3
    "周五" -> 4
    "周六" -> 5
    else -> 6
}

@Composable
private fun WeekCard(week: List<DayActivity>, daysActive: Int) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Cream)
            .padding(horizontal = 16.dp, vertical = 18.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("本周学习", style = WeekTitle)
            Spacer(Modifier.width(8.dp))
            Text("$daysActive/7 天", style = WeekCount)
        }
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            week.forEach { day ->
                val isToday = day.isToday
                val learned = day.hasActivity
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier
                            .size(if (isToday) 11.dp else 8.dp)
                            .then(
                                when {
                                    isToday && learned -> Modifier.background(Accent, CircleShape)
                                    isToday -> Modifier.border(1.5.dp, Accent, CircleShape)
                                    learned -> Modifier.background(Accent, CircleShape)
                                    else -> Modifier.border(1.dp, LineStrong, CircleShape)
                                },
                            ),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        day.label.removePrefix("周"),
                        style = WeekDayLabel.copy(color = if (isToday) Accent else InkMeta),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

// ----------------------------- 四个快捷入口（2×2 浅暖红卡） -----------------------------

private data class QuickEntry(
    val label: String,
    val caption: String,
    val route: String,
    val icon: ImageVector,
)

private val quickEntries = listOf(
    QuickEntry("新词学习", "探索新表达", Routes.LEARN, Icons.AutoMirrored.Outlined.MenuBook),
    QuickEntry("口语练习", "开口说英语", Routes.SPEAKING, Icons.Outlined.Mic),
    QuickEntry("学习手记", "记录与回顾", Routes.NOTES, Icons.Outlined.EditNote),
    QuickEntry("学习报告", "本周进步", Routes.REPORT, Icons.Outlined.BarChart),
)

@Composable
private fun QuickEntries(navController: NavController) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        quickEntries.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { entry ->
                    QuickEntryCard(entry, Modifier.weight(1f), navController)
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun QuickEntryCard(entry: QuickEntry, modifier: Modifier, navController: NavController) {
    Column(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Blush)
            .clickable { navController.navigate(entry.route) }
            .padding(12.dp),
    ) {
        Icon(
            imageVector = entry.icon,
            contentDescription = entry.label,
            tint = Ink,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.height(8.dp))
        Text(entry.label, style = QuickLabel)
        Spacer(Modifier.height(2.dp))
        Text(entry.caption, style = QuickCaption)
    }
}

// ----------------------------- 今日页排版令牌（无衬线优先；Serif 仅品牌字标与轻装饰） -----------------------------

private val BrandWordmark = TextStyle(
    fontFamily = DisplayFont,
    fontWeight = FontWeight.Medium,
    fontSize = 18.sp,
    lineHeight = 22.sp,
    color = Ink,
)

private val BrandSlogan = TextStyle(
    fontFamily = UiFont,
    fontSize = 12.sp,
    lineHeight = 16.sp,
    color = InkSoft,
)

private val GreetingTitle = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 24.sp,
    lineHeight = 30.sp,
    color = Ink,
)

private val GreetingSub = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.Medium,
    fontSize = 24.sp,
    lineHeight = 30.sp,
    color = Ink,
)

private val DateLabel = TextStyle(
    fontFamily = UiFont,
    fontSize = 12.sp,
    lineHeight = 16.sp,
    color = InkMeta,
)

private val CardTitleLabel = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 13.sp,
    lineHeight = 18.sp,
    color = InkSoft,
)

private val TaskMain = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 18.sp,
    lineHeight = 24.sp,
    color = Ink,
)

private val TaskSub = TextStyle(
    fontFamily = UiFont,
    fontSize = 13.sp,
    lineHeight = 18.sp,
    color = InkSoft,
)

private val CtaText = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 15.sp,
    lineHeight = 20.sp,
    color = AccentContrast,
)

private val WeekTitle = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 15.sp,
    lineHeight = 20.sp,
    color = Ink,
)

private val WeekCount = TextStyle(
    fontFamily = UiFont,
    fontSize = 13.sp,
    lineHeight = 18.sp,
    color = InkSoft,
)

private val WeekDayLabel = TextStyle(
    fontFamily = UiFont,
    fontSize = 10.sp,
    lineHeight = 14.sp,
    color = InkMeta,
)

private val QuickLabel = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 15.sp,
    lineHeight = 20.sp,
    color = Ink,
)

private val QuickCaption = TextStyle(
    fontFamily = UiFont,
    fontSize = 11.sp,
    lineHeight = 16.sp,
    color = InkMeta,
)
