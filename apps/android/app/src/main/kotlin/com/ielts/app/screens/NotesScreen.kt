package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.components.Note
import com.ielts.app.components.NoteVariant
import com.ielts.app.components.RadiusLarge
import com.ielts.app.components.SectionLabel
import com.ielts.app.components.SubPage
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.client.localDayKey
import com.ielts.core.service.TimelineEntry
import com.ielts.core.service.getLearningTimeline
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * MOBILE-07 — 学习手记（真实学习行为时间线）。
 * 完全基于现有 learning_events + speaking_sessions 聚合，不新增 schema、不伪造事实：
 *  - 新学 / 复习（含回忆结果） / 完成的口语练习
 * 按本地日期倒序分组；无数据时给克制空态。
 */
@Composable
fun NotesScreen(studyVm: StudyViewModel?, navController: NavController, innerPadding: PaddingValues) {
    val dataVersion = studyVm?.version
    val entries = remember(dataVersion) { getLearningTimeline() }

    SubPage(title = "学习手记", onBack = { navController.popBackStack() }, innerPadding = innerPadding) {
        if (entries.isEmpty()) {
            Spacer(Modifier.height(8.dp))
            Note(
                "还没有学习记录。去「学习」或「口语」完成第一次练习，这里会如实记录你最近学过什么。",
                variant = NoteVariant.PLAIN,
            )
        } else {
            val grouped = entries.groupBy { it.dayKey }
            grouped.forEach { (day, list) ->
                DayBlock(dayLabel(day), list)
                Spacer(Modifier.height(18.dp))
            }
        }
    }
}

@Composable
private fun DayBlock(label: String, list: List<TimelineEntry>) {
    SectionLabel(label)
    Spacer(Modifier.height(8.dp))
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RadiusLarge))
            .background(Paper2)
            .border(androidx.compose.foundation.BorderStroke(1.dp, Line), RoundedCornerShape(RadiusLarge)),
    ) {
        list.forEachIndexed { index, e ->
            if (index > 0) androidx.compose.material3.HorizontalDivider(color = Line, thickness = 1.dp)
            Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(9.dp)
                        .clip(CircleShape)
                        .background(
                            when (e.kind) {
                                "LEARN" -> Bronze
                                "REVIEW" -> Accent
                                else -> Pos
                            },
                        ),
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(e.title, style = Type.ui.copy(color = Ink, fontWeight = FontWeight.SemiBold))
                    Spacer(Modifier.height(2.dp))
                    Text(e.detail, style = Type.uiLabel)
                }
                Text(
                    timeLabel(e.createdAt),
                    style = Type.uiLabel.copy(color = InkMeta),
                )
            }
        }
    }
}

private fun dayLabel(dayKey: String): String {
    val today = localDayKey(Date())
    if (dayKey == today) return "今天"
    val cal = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -1) }
    if (dayKey == localDayKey(cal.time)) return "昨天"
    return runCatching {
        val d = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(dayKey)
        SimpleDateFormat("M月d日", Locale.CHINA).format(d!!)
    }.getOrDefault(dayKey)
}

private fun timeLabel(iso: String): String =
    runCatching { SimpleDateFormat("HH:mm", Locale.US).format(com.ielts.core.client.parseIso(iso)) }
        .getOrDefault("")
