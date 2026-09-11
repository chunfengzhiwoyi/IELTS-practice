package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.client.formatCNDate
import com.ielts.core.llm.getApiConfig
import com.ielts.core.model.SpeakingAnalysisResult
import com.ielts.core.service.SpeakingSessionCreated
import com.ielts.core.service.analyzeSpeaking
import com.ielts.core.service.createSpeakingSession
import kotlinx.coroutines.launch

private val PARTS = listOf(
    Triple("P1", "P1 · 日常", "简短回答，说清观点即可。"),
    Triple("P2", "P2 · 独白", "围绕话题展开 1–2 分钟。"),
    Triple("P3", "P3 · 讨论", "深入分析与论证。"),
)

@Composable
fun SpeakingScreen(vm: StudyViewModel, innerPadding: PaddingValues) {
    val date = remember { formatCNDate() }
    var part by remember { mutableStateOf("P1") }
    var created by remember { mutableStateOf<SpeakingSessionCreated?>(null) }
    var answer by remember { mutableStateOf("") }
    var isSecond by remember { mutableStateOf(false) }
    var analysis by remember { mutableStateOf<SpeakingAnalysisResult?>(null) }

    val newQuestion = {
        created = createSpeakingSession(part, vm.userId)
        answer = ""
        isSecond = false
        analysis = null
    }

    // 切 part / 首次进入自动给一题
    LaunchedEffect(part) { newQuestion() }

    val scope = rememberCoroutineScope()
    var analyzing by remember { mutableStateOf(false) }

    val analyze: () -> Unit = {
        val session = created?.session
        if (session != null && answer.isNotBlank() && !analyzing) {
            analyzing = true
            scope.launch {
                val res = analyzeSpeaking(session.id, answer, isSecond)
                analysis = res.analysis
                analyzing = false
            }
        }
    }

    ScreenScaffold(date, innerPadding, horizontalAlignment = Alignment.CenterHorizontally) {
        // Part 切换器
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PARTS.forEach { (key, label, _) ->
                GhostButton(
                    label,
                    onClick = { part = key },
                    modifier = Modifier.weight(1f),
                    selected = part == key,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        val hint = PARTS.first { it.first == part }.third
        Text(hint, style = Type.bodySmall)
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            ModelStatusBadge(remember { getApiConfig().status() })
        }
        Spacer(Modifier.height(10.dp))

        val q = created?.questionData
        if (q != null) {
            // 题目卡
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(RadiusLarge))
                    .background(Paper)
                    .border(1.dp, LineStrong, RoundedCornerShape(RadiusLarge))
                    .padding(20.dp, 22.dp),
            ) {
                Column(Modifier.fillMaxWidth()) {
                    Text(q.topic, style = Type.uiLabel.copy(color = Bronze, letterSpacing = 0.1.em))
                    Spacer(Modifier.height(8.dp))
                    Text(q.question, style = Type.heading)
                    if (q.followUps.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        q.followUps.forEach { f ->
                            Text("· $f", style = Type.bodySmall)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "建议 ${q.expectedLength.min}–${q.expectedLength.ideal} 词",
                        style = Type.uiLabel.copy(color = InkMeta),
                    )
                }
            }
            Spacer(Modifier.height(18.dp))

            // 作答区
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(RadiusMedium))
                    .background(Paper2)
                    .border(1.dp, LineStrong, RoundedCornerShape(RadiusMedium))
                    .padding(12.dp),
            ) {
                BasicTextField(
                    value = answer,
                    onValueChange = { answer = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp),
                    textStyle = Type.body.copy(color = Ink),
                    cursorBrush = SolidColor(Accent),
                    decorationBox = { inner ->
                        Box(Modifier.fillMaxWidth()) {
                            if (answer.isEmpty()) {
                                Text("在这里用英文作答……", style = Type.bodySmall)
                            }
                            inner()
                        }
                    },
                )
            }
            Spacer(Modifier.height(14.dp))

            if (analysis == null) {
                PrimaryButton(
                    text = if (analyzing) "分析中…" else if (isSecond) "再分析一次" else "分析一下",
                    onClick = analyze,
                    enabled = !analyzing && answer.isNotBlank(),
                )
            } else {
                val a = analysis!!
                // 指标
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Stat(a.metrics.wordCount.toString(), "词数", Modifier.weight(1f))
                    Stat(a.metrics.sentenceCount.toString(), "句数", Modifier.weight(1f))
                    Stat(a.metrics.connectorCount.toString(), "连接词", Modifier.weight(1f))
                }
                Spacer(Modifier.height(16.dp))
                Note(
                    "主要问题 · ${a.mainIssue.dimension}\n${a.mainIssue.description}",
                    variant = NoteVariant.ACCENT,
                )
                Spacer(Modifier.height(10.dp))
                Note("建议 · ${a.mainIssue.suggestion}", variant = NoteVariant.BRONZE)
                Spacer(Modifier.height(10.dp))
                // 微训练
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(RadiusMedium))
                        .background(AccentWash)
                        .border(1.dp, Accent, RoundedCornerShape(RadiusMedium))
                        .padding(12.dp, 14.dp),
                ) {
                    Column(Modifier.fillMaxWidth()) {
                        Text("微训练", style = Type.uiLabel.copy(color = Accent))
                        Spacer(Modifier.height(6.dp))
                        Text(a.microDrill.prompt, style = Type.body)
                        Spacer(Modifier.height(8.dp))
                        Text(a.microDrill.exampleImprovement, style = Type.italic)
                    }
                }
                Spacer(Modifier.height(16.dp))
                if (!isSecond) {
                    GhostButton("再答一次（微训练）", onClick = { isSecond = true; answer = ""; analysis = null })
                    Spacer(Modifier.height(10.dp))
                }
            }
            Spacer(Modifier.height(10.dp))
            GhostButton("换一题", onClick = newQuestion)
            Spacer(Modifier.height(20.dp))
        }
    }
}
