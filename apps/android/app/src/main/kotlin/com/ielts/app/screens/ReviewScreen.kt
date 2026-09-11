package com.ielts.app.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.navigation.NavController
import com.ielts.app.components.*
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.client.formatCNDate
import com.ielts.core.service.ReviewRating
import com.ielts.core.service.ReviewSubmitResult
import com.ielts.core.service.getReviewQueue
import com.ielts.core.service.submitReviewRating
import java.time.Instant

private fun whenText(iso: String): String {
    val t = runCatching { Instant.parse(iso).toEpochMilli() }.getOrElse { return "稍后" }
    val diff = t - System.currentTimeMillis()
    if (diff <= 0) return "稍后"
    val hours = diff / 3_600_000
    return when {
        hours < 1 -> "不到 1 小时"
        hours < 24 -> "$hours 小时后"
        else -> "${hours / 24} 天后"
    }
}

@Composable
fun ReviewScreen(vm: StudyViewModel, navController: NavController, innerPadding: PaddingValues) {
    val date = remember { formatCNDate() }
    val queue = remember(vm.version) { getReviewQueue() }
    val tasks = queue.tasks
    var idx by remember { mutableStateOf(0) }
    var showHint by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<ReviewSubmitResult?>(null) }
    var itemStart by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(idx) { itemStart = System.currentTimeMillis() }

    val rate: (ReviewRating) -> Unit = { rating ->
        val task = tasks[idx]
        result = submitReviewRating(
            itemId = task.itemId,
            rating = rating,
            userId = vm.userId,
            task = task,
            usedHint = showHint,
            durationMs = System.currentTimeMillis() - itemStart,
        )
        vm.refresh()
    }

    ScreenScaffold(date, innerPadding) {
        if (tasks.isEmpty()) {
            Spacer(Modifier.height(40.dp))
            SectionLabel("复习")
            Spacer(Modifier.height(12.dp))
            Text("没有到期词。", style = Type.subHeading)
            Spacer(Modifier.height(10.dp))
            Note("去「学习」收新表达，或明天再来巩固。", variant = NoteVariant.BRONZE)
            return@ScreenScaffold
        }

        val done = idx >= tasks.size
        if (done) {
            Spacer(Modifier.height(48.dp))
            Text("复习完成。", style = Type.subHeading)
            Spacer(Modifier.height(10.dp))
            Note("这一组都收下了。保持节奏就好。", variant = NoteVariant.BRONZE)
            Spacer(Modifier.height(18.dp))
            PrimaryButton("回到今日") { navController.navigate(Routes.TODAY) }
            return@ScreenScaffold
        }

        val task = tasks[idx]
        ProgressRule(progress = idx.toFloat() / tasks.size.coerceAtLeast(1))
        Spacer(Modifier.height(8.dp))
        Text("${minOf(idx + 1, tasks.size)} / ${tasks.size}", style = Type.uiLabel)
        Spacer(Modifier.height(18.dp))

        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Paper)
                .border(1.dp, LineStrong, RoundedCornerShape(RadiusLarge))
                .padding(20.dp, 24.dp),
        ) {
            Column(Modifier.fillMaxWidth()) {
                Text("回想", style = Type.uiLabel.copy(color = Bronze, letterSpacing = 0.1.em))
                Spacer(Modifier.height(8.dp))
                Text(task.prompt, style = Type.heading)
                Spacer(Modifier.height(16.dp))

                if (result == null) {
                    if (showHint) {
                        Text("线索：${task.clue}", style = Type.bodySmall.copy(color = Bronze))
                        Spacer(Modifier.height(14.dp))
                    }
                    GhostButton(if (showHint) "已看提示" else "查看提示", onClick = { showHint = true })
                    Spacer(Modifier.height(16.dp))
                    Text("凭记忆答完后，给自己一个评级：", style = Type.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        GhostButton("生疏", onClick = { rate(ReviewRating.ROUGH) }, modifier = Modifier.weight(1f))
                        GhostButton("模糊", onClick = { rate(ReviewRating.FUZZY) }, modifier = Modifier.weight(1f))
                        GhostButton("熟练", onClick = { rate(ReviewRating.SKILLED) }, modifier = Modifier.weight(1f))
                    }
                } else {
                    val r = result!!
                    Text(r.feedback, style = Type.body)
                    Spacer(Modifier.height(10.dp))
                    Text("下次复习 · ${whenText(r.nextReviewAt)}", style = Type.uiLabel.copy(color = Accent))
                    Spacer(Modifier.height(16.dp))
                    PrimaryButton("下一词") { idx += 1; showHint = false; result = null }
                }
            }
        }
    }
}
