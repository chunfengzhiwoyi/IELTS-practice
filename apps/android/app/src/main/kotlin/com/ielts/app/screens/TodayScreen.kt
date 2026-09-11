package com.ielts.app.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.components.*
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.client.formatCNDate
import com.ielts.core.llm.getApiConfig
import com.ielts.core.llm.suggestToday
import com.ielts.core.service.generateReport
import com.ielts.core.service.getProfile
import com.ielts.core.service.getTodaySummary
import kotlinx.coroutines.launch

@Composable
fun TodayScreen(vm: StudyViewModel, navController: NavController, innerPadding: PaddingValues) {
    val date = remember { formatCNDate() }
    val summary = remember(vm.version) { getTodaySummary() }
    val profile = remember(vm.version) { getProfile() }
    val needSetup = profile.nickname.isBlank()

    val scope = rememberCoroutineScope()
    var aiTip by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(vm.version) {
        if (getApiConfig().isValid) {
            scope.launch { aiTip = suggestToday(summary) }
        } else {
            aiTip = null
        }
    }

    ScreenScaffold(date, innerPadding) {
        Spacer(Modifier.height(18.dp))

        // 模型在线状态（全局提示，仿网页 Masthead 药丸）
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            ModelStatusBadge(remember(vm.version) { getApiConfig().status() })
            Spacer(Modifier.weight(1f))
            Text(
                "去配置 ›",
                style = Type.uiLabel.copy(color = Accent),
                modifier = Modifier.clickable { navController.navigate(Routes.API_CONFIG) },
            )
        }
        Spacer(Modifier.height(14.dp))

        // 周节奏刻度
        SectionLabel("本周节奏")
        val week = remember(vm.version) { generateReport().weeklyActivity }
        WeekRule(items = week.map { DayActivityLike(it.label, it.hasActivity, it.isToday) })
        Spacer(Modifier.height(24.dp))

        // 今日主区块
        Box(
            Modifier
                .fillMaxWidth()
                .drawBehind {
                    val stroke = 4.dp.toPx()
                    drawLine(Accent, Offset(0f, 0f), Offset(0f, size.height), strokeWidth = stroke)
                }
                .padding(start = 14.dp, top = 4.dp, bottom = 4.dp),
        ) {
            Column {
                Text("Today · 第 ${summary.dayNumber} 天", style = Type.uiLabel)
                Spacer(Modifier.height(8.dp))
                val title = if (summary.hasDue) "继续复习" else "学一个新表达"
                Text(title, style = Type.displayTitle)
                Spacer(Modifier.height(8.dp))
                val sub = if (summary.hasDue) {
                    "有 ${summary.due} 个词到了复习时点，一次只做一组。"
                } else {
                    "今天没有紧急任务，按自己的步调来。"
                }
                Text(sub, style = Type.bodySmall, modifier = Modifier.fillMaxWidth(0.85f))
                Spacer(Modifier.height(16.dp))
                PrimaryButton(
                    text = if (summary.hasDue) "开始复习" else "开始学习",
                    onClick = { navController.navigate(if (summary.hasDue) Routes.REVIEW else Routes.LEARN) },
                )
            }
        }
        Spacer(Modifier.height(18.dp))

        // 三个文字链接
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            LinkRow("去复习", Routes.REVIEW, navController)
            LinkRow("口语练习", Routes.SPEAKING, navController)
            LinkRow("学习手记", Routes.LEARN, navController)
        }
        Spacer(Modifier.height(18.dp))

        // 下一步建议
        Note(
            text = "下一步 · ${summary.nextStep.title} —— ${summary.nextStep.body}",
            variant = NoteVariant.BRONZE,
        )
        Spacer(Modifier.height(14.dp))

        if (aiTip != null) {
            Note("AI 今日建议 · ${aiTip!!}", variant = NoteVariant.ACCENT)
            Spacer(Modifier.height(14.dp))
        }

        // 首设档案引导
        if (needSetup) {
            Note(
                text = "先给自己起个名字，记录会更像「你」的。",
                variant = NoteVariant.ACCENT,
                modifier = Modifier.clickable { navController.navigate(Routes.IDENTITY) },
            )
            Spacer(Modifier.height(14.dp))
        }

        // 底部统计
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Stat(summary.streak.toString(), "连续天数", Modifier.weight(1f))
            Stat(summary.newCount.toString(), "本期已学", Modifier.weight(1f))
            Stat(summary.speakingCount.toString(), "口语已练", Modifier.weight(1f))
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun LinkRow(label: String, route: String, navController: NavController) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { navController.navigate(route) }
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = Type.ui.copy(color = Accent, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold))
        Spacer(Modifier.weight(1f))
        Text("›", style = Type.ui.copy(color = InkMeta))
    }
}
