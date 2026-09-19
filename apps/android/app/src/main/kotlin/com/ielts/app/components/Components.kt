package com.ielts.app.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import com.ielts.core.llm.ModelStatus
import com.ielts.core.model.DayActivity
import com.ielts.core.model.MiniReport
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ielts.app.R
import com.ielts.app.theme.*

// ----------------------------- 尺寸令牌 -----------------------------
val PagePadding = 14.dp
val RadiusSmall = 4.dp
val RadiusMedium = 7.dp
val RadiusLarge = 12.dp
val TopBarHeight = 44.dp

/**
 * MOBILE-07 统一间距令牌（克制 7 档）。
 * 不做机械全局替换；仅在本轮收敛的页面逐步采用，避免已批准页面（Today/Learn/Review）视觉漂移。
 * page 与 [PagePadding] 对齐（学习/复习主操作页）；Today Hero / Auth 品牌页刻意用 20dp，不强行回改。
 */
object Space {
    val xs = 4.dp      // 元素内紧凑（图标与文字、单位与数值）
    val sm = 8.dp      // 相关小间距
    val md = 12.dp     // 卡片内分组
    val lg = 16.dp     // 卡片内边距 / 卡片间
    val xl = 24.dp     // 区块内留白
    val section = 22.dp // 区块之间
    val page = 14.dp   // 页面左右安全边距（= PagePadding）
}

// ----------------------------- 顶部导航栏（复刻小程序 NavBar：印章 + 中文日期） -----------------------------
@Composable
fun TopBar(date: String, modifier: Modifier = Modifier) {
    Surface(
        color = Paper,
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding(),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(TopBarHeight)
                .border(1.dp, Line, RoundedCornerShape(0.dp))
                .padding(horizontal = PagePadding),
        ) {
            Image(
                painter = painterResource(R.drawable.seal),
                contentDescription = "灵犀印章",
                modifier = Modifier
                    .size(26.dp)
                    .align(Alignment.CenterStart),
            )
            androidx.compose.material3.Text(
                text = date,
                style = Type.uiLabel,
                color = InkMeta,
                modifier = Modifier.align(Alignment.CenterEnd),
            )
        }
    }
}

// ----------------------------- 区块标题 -----------------------------
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    androidx.compose.material3.Text(
        text = text.uppercase(),
        style = Type.uiLabel,
        modifier = modifier.padding(vertical = 4.dp),
    )
}

// ----------------------------- 按钮 -----------------------------
@Composable
fun PrimaryButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val bg = if (enabled) Accent else LineStrong
    val contentColor = if (enabled) AccentContrast else InkMeta
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(RadiusMedium))
            .background(bg)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(text = text, style = Type.uiButton, color = contentColor)
    }
}

@Composable
fun GhostButton(
    text: String,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    onClick: () -> Unit,
) {
    val border = if (selected) Accent else LineStrong
    val contentColor = if (selected) Accent else Ink
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(46.dp)
            .clip(RoundedCornerShape(RadiusMedium))
            .border(BorderStroke(1.dp, border), RoundedCornerShape(RadiusMedium))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(text = text, style = Type.uiButton, color = contentColor)
    }
}

// ----------------------------- Pill / 徽标 -----------------------------
@Composable
fun Pill(text: String, modifier: Modifier = Modifier, color: Color = Bronze) {
    Box(
        modifier = modifier
            .clip(CircleShape)
            .border(BorderStroke(1.dp, color), CircleShape)
            .padding(horizontal = 9.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(
            text = text,
            style = Type.uiLabel.copy(color = color, fontSize = 11.sp),
            textAlign = TextAlign.Center,
        )
    }
}

// ----------------------------- 模型在线状态徽标（READY 绿 / CONFIGURED 琥珀 / OFF 灰） -----------------------------
@Composable
fun ModelStatusBadge(status: ModelStatus, modifier: Modifier = Modifier) {
    val (color, label) = when (status) {
        ModelStatus.READY -> Pos to "模型已就绪"
        ModelStatus.CONFIGURED -> Amber to "已配置未测"
        ModelStatus.OFF -> InkMeta to "未配置模型"
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        androidx.compose.material3.Text(
            label,
            style = Type.uiLabel.copy(color = color, fontSize = 11.sp),
        )
    }
}

// ----------------------------- Note（编辑式左侧竖线） -----------------------------
enum class NoteVariant { PLAIN, ACCENT, BRONZE }

@Composable
fun Note(
    text: String,
    modifier: Modifier = Modifier,
    variant: NoteVariant = NoteVariant.PLAIN,
) {
    val borderColor = when (variant) {
        NoteVariant.PLAIN -> Line
        NoteVariant.ACCENT -> Accent
        NoteVariant.BRONZE -> Bronze
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RadiusMedium))
            .background(Paper2)
            .then(
                if (variant == NoteVariant.PLAIN)
                    Modifier.border(1.dp, Line, RoundedCornerShape(RadiusMedium))
                else
                    Modifier.border(BorderStroke(4.dp, borderColor), RoundedCornerShape(RadiusMedium))
            )
            .padding(12.dp, 14.dp)
            .then(if (variant != NoteVariant.PLAIN) Modifier.padding(start = 10.dp) else Modifier),

    ) {
        androidx.compose.material3.Text(text = text, style = Type.bodySmall, color = InkSoft)
    }
}

// ----------------------------- 进度细线 -----------------------------
@Composable
fun ProgressRule(progress: Float, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(Line),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(progress.coerceIn(0f, 1f))
                .fillMaxHeight()
                .clip(RoundedCornerShape(2.dp))
                .background(Accent),
        )
    }
}

// ----------------------------- 周节奏刻度（替代火焰/贡献格） -----------------------------
@Composable
fun WeekRule(
    items: List<DayActivityLike>,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        items.forEach { day ->
            val color = when {
                day.isToday -> Accent
                day.hasActivity -> Bronze
                else -> LineStrong
            }
            val height = if (day.isToday) 22.dp else 14.dp
            Box(
                Modifier
                    .weight(1f)
                    .height(height)
                    .border(BorderStroke(3.dp, color)),
            )
            Spacer(Modifier.height(0.dp))
        }
    }
}

data class DayActivityLike(val label: String, val hasActivity: Boolean, val isToday: Boolean)

// ----------------------------- 本周成就卡片（柱状图 + 目标 + 连续 + 打卡 + 里程碑） -----------------------------
private fun weekRangeLabel(report: MiniReport): String {
    val list = report.weeklyActivity
    if (list.size < 2) return "近 7 天"
    val fmt = { key: String ->
        val p = key.split("-")
        if (p.size == 3) "${p[1].toInt()}.${p[2].toInt()}" else key
    }
    return "${fmt(list.first().key)} – ${fmt(list.last().key)}"
}

@Composable
fun WeeklyAchievementCard(report: MiniReport, modifier: Modifier = Modifier, onGoalClick: () -> Unit = {}) {
    val total = report.newThisWeek + report.reviewedThisWeek
    val goal = report.weeklyGoal
    val goalPct = if (goal > 0) (total * 100 / goal) else 0
    val dailyGoal = goal / 7
    val deltaPct = if (report.lastWeekTotal > 0) ((total - report.lastWeekTotal) * 100 / report.lastWeekTotal) else 0
    val allActive = report.daysActiveThisWeek >= 7

    Box(
        modifier
            .fillMaxWidth()
            .background(Paper2)
            .border(BorderStroke(1.dp, Line), RoundedCornerShape(12.dp))
            .padding(16.dp),
    ) {
        Column {
            // 头部：标题 + 区间
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                Text("本周成就", style = Type.uiLabel.copy(color = Bronze))
                Text(weekRangeLabel(report), style = Type.uiLabel)
            }
            Spacer(Modifier.height(12.dp))
            // 巨数（Apple Health 语法：数值与模式分离）
            Row(verticalAlignment = Alignment.Bottom) {
                Text(total.toString(), style = Type.word.copy(fontSize = 44.sp, color = Ink))
                Spacer(Modifier.width(6.dp))
                Text("词", style = Type.ui.copy(color = InkSoft))
            }
            Text("本周学习总量", style = Type.ui.copy(color = InkSoft))
            Spacer(Modifier.height(8.dp))
            // 对比注脚 + 新学/复习聚合
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    if (deltaPct >= 0) "▲ $deltaPct%" else "▼ ${-deltaPct}%",
                    style = Type.ui.copy(
                        color = if (deltaPct >= 0) Pos else Amber,
                        fontWeight = FontWeight.SemiBold,
                    ),
                )
                Text("较上周", style = Type.ui.copy(color = InkMeta))
                Text(
                    "新学 ${report.newThisWeek} · 复习 ${report.reviewedThisWeek}",
                    style = Type.ui.copy(color = InkMeta),
                )
            }
            Spacer(Modifier.height(18.dp))
            // 柱状图
            AchievementBars(items = report.weeklyActivity, dailyGoal = dailyGoal)
            Spacer(Modifier.height(18.dp))
            // 目标完成
            Column(
                Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onGoalClick),
            ) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("本周目标 $goal 词", style = Type.ui.copy(color = InkSoft))
                    Text("已完成 ${goalPct}%", style = Type.ui.copy(color = Accent, fontWeight = FontWeight.SemiBold))
                }
                Spacer(Modifier.height(6.dp))
                ProgressRule(progress = (goalPct / 100f).coerceIn(0f, 1f))
            }
            Spacer(Modifier.height(18.dp))
            // 连续学习 + 今日打卡
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("连续学习", style = Type.ui.copy(color = InkSoft))
                    Text("${report.streak} 天", style = Type.word.copy(fontSize = 26.sp, color = Ink))
                }
                CheckinPill()
            }
            Spacer(Modifier.height(16.dp))
            // 本周每日打卡
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("本周每日打卡", style = Type.ui.copy(color = InkMeta))
                Text(
                    if (allActive) "7 天全勤" else "${report.daysActiveThisWeek} 天活跃",
                    style = Type.ui.copy(color = InkSoft, fontWeight = FontWeight.SemiBold),
                )
            }
            Spacer(Modifier.height(8.dp))
            WeekCheckin(items = report.weeklyActivity)
            Spacer(Modifier.height(16.dp))
            // 里程碑（3 项互不重复）
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MilestoneChip("本周达标", "$total / $goal", hot = goalPct >= 100, Modifier.weight(1f))
                MilestoneChip("满勤本周", "${report.daysActiveThisWeek} 天全学", hot = false, Modifier.weight(1f))
                MilestoneChip("新学词", "${report.newThisWeek} 词", hot = false, Modifier.weight(1f))
            }
        }
    }
}

@Composable
fun AchievementBars(items: List<DayActivity>, dailyGoal: Int, modifier: Modifier = Modifier) {
    val maxCount = (items.maxOfOrNull { it.count } ?: 0).coerceAtLeast(dailyGoal).coerceAtLeast(1)
    val chartH = 150.dp
    val barMaxH = 120.dp
    val goalFrac = dailyGoal.toFloat() / maxCount
    Box(modifier.fillMaxWidth().height(chartH), contentAlignment = Alignment.BottomStart) {
        // 日目标虚线（用细实线近似，避免自定义 draw）
        HorizontalDivider(
            modifier = Modifier.align(Alignment.BottomCenter)
                .fillMaxWidth()
                .offset(y = -(chartH * goalFrac)),
            color = LineStrong,
            thickness = 1.dp,
        )
        Row(
            Modifier.fillMaxWidth().height(chartH),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            items.forEach { d ->
                Column(
                    Modifier.weight(1f).fillMaxHeight(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    Text(
                        d.count.toString(),
                        style = Type.uiLabel.copy(fontSize = 10.sp, color = if (d.isToday) Accent else InkMeta),
                    )
                    Spacer(Modifier.height(4.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height((d.count.toFloat() / maxCount * barMaxH.value).dp)
                            .background(
                                if (d.isToday) Accent else Bar,
                                RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp),
                            ),
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        d.label.replace("周", ""),
                        style = Type.uiLabel.copy(fontSize = 10.sp, color = if (d.isToday) Accent else InkMeta),
                    )
                }
            }
        }
    }
}

@Composable
fun CheckinPill(modifier: Modifier = Modifier) {
    Box(
        modifier
            .clip(CircleShape)
            .background(AccentWash)
            .border(BorderStroke(1.dp, Accent), CircleShape)
            .padding(horizontal = 12.dp, vertical = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("✓ 今日已打卡", style = Type.uiLabel.copy(color = Accent, fontSize = 12.sp))
    }
}

@Composable
fun WeekCheckin(items: List<DayActivity>, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEach { d ->
            val on = d.count > 0
            Box(
                Modifier
                    .weight(1f)
                    .height(30.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (on) Bronze else Color.Transparent)
                    .border(
                        BorderStroke(1.dp, if (d.isToday) Accent else LineStrong),
                        RoundedCornerShape(6.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    d.label.replace("周", ""),
                    style = Type.uiLabel.copy(fontSize = 10.sp, color = if (on) Paper else InkMeta),
                )
            }
        }
    }
}

@Composable
fun MilestoneChip(kicker: String, title: String, hot: Boolean, modifier: Modifier = Modifier) {
    val border = if (hot) Accent else LineStrong
    val bg = if (hot) AccentWash else Paper
    val titleColor = if (hot) Accent else Ink
    Column(
        modifier
            .border(BorderStroke(1.dp, border), RoundedCornerShape(10.dp))
            .background(bg)
            .padding(10.dp, 12.dp),
    ) {
        Text(kicker.uppercase(), style = Type.uiLabel.copy(fontSize = 10.sp))
        Spacer(Modifier.height(4.dp))
        Text(title, style = Type.word.copy(fontSize = 18.sp, color = titleColor))
    }
}

// ----------------------------- 统计（古铜顶线 + 大衬线数字） -----------------------------
@Composable
fun Stat(num: String, label: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Box(Modifier.fillMaxWidth().height(3.dp).background(Bronze))
        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.Text(text = num, style = Type.statNum)
        Spacer(Modifier.height(2.dp))
        androidx.compose.material3.Text(text = label, style = Type.statLabel)
    }
}

// ----------------------------- 字母头像（本地档案，替代微信头像） -----------------------------
@Composable
fun Monogram(initial: String, color: Color, modifier: Modifier = Modifier, size: androidx.compose.ui.unit.Dp = 48.dp) {
    val bg = when (color) {
        Accent -> Accent
        Bronze -> Bronze
        else -> Ink
    }
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(bg),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(
            text = initial,
            style = Type.heading.copy(color = Paper, fontSize = (size.value * 0.5).sp),
        )
    }
}

// ----------------------------- 空态 -----------------------------
@Composable
fun EmptyState(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxWidth().padding(vertical = 40.dp),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(text = text, style = Type.bodySmall, color = InkMeta, textAlign = TextAlign.Center)
    }
}

// ----------------------------- 子页骨架（返回头 + 滚动 + 底部 tab 避让） -----------------------------
@Composable
fun SubPage(
    title: String,
    onBack: () -> Unit,
    innerPadding: PaddingValues,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(innerPadding)) {
        Box(
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .height(TopBarHeight)
                .padding(horizontal = PagePadding),
            contentAlignment = Alignment.CenterStart,
        ) {
            Row(
                Modifier.clickable(onClick = onBack),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                androidx.compose.material3.Text("‹", style = Type.heading.copy(color = Accent))
                Spacer(Modifier.width(4.dp))
                androidx.compose.material3.Text("返回", style = Type.ui.copy(color = Accent))
            }
        }
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = PagePadding)
                .padding(bottom = 28.dp),
        ) {
            androidx.compose.material3.Text(title, style = Type.editorTitle)
            Spacer(Modifier.height(14.dp))
            content()
        }
    }
}
