package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.components.*
import com.ielts.app.nav.Routes
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.client.formatCNDate
import com.ielts.core.llm.explainWord
import com.ielts.core.llm.getApiConfig
import com.ielts.core.service.LearnSubmitResult
import com.ielts.core.service.getLearnDeck
import com.ielts.core.service.submitLearnAnswer
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

@Composable
fun LearnScreen(vm: StudyViewModel, navController: NavController, innerPadding: PaddingValues) {
    val date = remember { formatCNDate() }
    val deck = remember(vm.version) { getLearnDeck() }
    var idx by remember { mutableStateOf(0) }
    var flipped by remember { mutableStateOf(false) }
    var hint by remember { mutableStateOf(false) }
    var dx by remember { mutableStateOf(0f) }
    var result by remember { mutableStateOf<LearnSubmitResult?>(null) }
    var cardStart by remember { mutableStateOf(System.currentTimeMillis()) }

    val ctx = LocalContext.current
    val pronounce = { android.widget.Toast.makeText(ctx, "示例读音（待接入）", android.widget.Toast.LENGTH_SHORT).show() }

    val scope = rememberCoroutineScope()
    var aiExpanded by remember { mutableStateOf(false) }
    var aiText by remember { mutableStateOf<String?>(null) }
    var aiLoading by remember { mutableStateOf(false) }
    LaunchedEffect(idx) { aiExpanded = false; aiText = null; aiLoading = false; cardStart = System.currentTimeMillis() }

    val judge: (Boolean) -> Unit = { knows ->
        val card = deck.getOrNull(idx)
        if (card != null) {
            val r = submitLearnAnswer(
                itemId = card.itemId,
                answer = if (knows) card.meaning else "",
                usedHint = hint,
                userId = vm.userId,
                durationMs = System.currentTimeMillis() - cardStart,
            )
            result = r
            flipped = true
            dx = 0f
            vm.refresh()
        }
    }
    val next = {
        idx += 1
        flipped = false; hint = false; result = null; dx = 0f
    }

    ScreenScaffold(date, innerPadding, horizontalAlignment = Alignment.CenterHorizontally) {
        if (deck.isEmpty()) {
            Spacer(Modifier.height(40.dp))
            SectionLabel("学习")
            Spacer(Modifier.height(12.dp))
            androidx.compose.material3.Text("本期词库已收完。", style = Type.subHeading)
            Spacer(Modifier.height(10.dp))
            Note("去复习页巩固，或明天再来收新表达。", variant = NoteVariant.BRONZE)
            return@ScreenScaffold
        }

        val done = idx >= deck.size
        if (done) {
            Spacer(Modifier.height(48.dp))
            androidx.compose.material3.Text("一组完成。", style = Type.subHeading)
            Spacer(Modifier.height(10.dp))
            Note("下次复习已按你的判定排好。保持节奏就好。", variant = NoteVariant.BRONZE)
            Spacer(Modifier.height(18.dp))
            PrimaryButton("去看看复习") { navController.navigate(Routes.REVIEW) }
            return@ScreenScaffold
        }

        val card = deck[idx]
        // 进度细线 + 计数
        ProgressRule(progress = idx.toFloat() / deck.size.coerceAtLeast(1))
        Spacer(Modifier.height(8.dp))
        Text("${minOf(idx + 1, deck.size)} / ${deck.size}", style = Type.uiLabel)
        Spacer(Modifier.height(18.dp))

        // 闪卡（可左右拖动判定）
        Box(
            Modifier
                .fillMaxWidth()
                .offset { IntOffset(dx.roundToInt(), 0) }
                .graphicsLayer { rotationZ = dx / 28f }
                .clip(RoundedCornerShape(RadiusLarge))
                .background(Paper)
                .border(1.dp, LineStrong, RoundedCornerShape(RadiusLarge))
                .pointerInput(result == null) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            when {
                                dx > 60f -> judge(true)
                                dx < -60f -> judge(false)
                                else -> dx = 0f
                            }
                        },
                        onHorizontalDrag = { _, amt -> if (result == null) dx += amt },
                    )
                }
                .clickable(enabled = result == null) { flipped = true }
                .padding(20.dp, 28.dp),
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                // 拖拽方向提示
                if (result == null && dx > 12f) {
                    Text("认识", style = Type.uiButton.copy(color = Accent))
                } else if (result == null && dx < -12f) {
                    Text("不认识", style = Type.uiButton.copy(color = InkMeta))
                }
                Spacer(Modifier.height(10.dp))
                Text(card.partOfSpeech, style = Type.uiLabel.copy(color = Bronze, letterSpacing = 0.1.em))
                Spacer(Modifier.height(6.dp))
                Text(card.term, style = Type.word)
                Spacer(Modifier.height(8.dp))
                Text(card.phonetic + " · 点按发音", style = Type.italic, modifier = Modifier.clickable { pronounce() })

                if (!flipped && result == null) {
                    Spacer(Modifier.height(20.dp))
                    Text("先试着回想它的意思", style = Type.bodySmall)
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        GhostButton("查看提示", onClick = { hint = true; flipped = true }, modifier = Modifier.weight(1f))
                        GhostButton("揭晓", onClick = { flipped = true }, modifier = Modifier.weight(1f))
                    }
                }

                if (flipped || result != null) {
                    Spacer(Modifier.height(18.dp))
                    if (hint && result == null) {
                        Text("线索：${card.clue}", style = Type.bodySmall.copy(color = Bronze))
                        Spacer(Modifier.height(10.dp))
                    }
                    Text(card.meaning, style = Type.heading)
                    Spacer(Modifier.height(12.dp))
                    Text(card.exampleSentence, style = Type.italic)
                    Spacer(Modifier.height(4.dp))
                    Text(card.exampleTranslation, style = Type.bodySmall)
                }

                if (getApiConfig().isValid) {
                    Spacer(Modifier.height(12.dp))
                    GhostButton(
                        text = if (aiExpanded) "收起拓展" else "AI 拓展讲解",
                        onClick = {
                            if (aiText == null && !aiLoading) {
                                aiLoading = true
                                scope.launch {
                                    aiText = explainWord(card.term, card.meaning, card.exampleSentence, card.exampleTranslation)
                                    aiLoading = false
                                }
                            }
                            aiExpanded = !aiExpanded
                        },
                    )
                    if (aiExpanded) {
                        Spacer(Modifier.height(10.dp))
                        if (aiLoading) {
                            Text("生成中…", style = Type.bodySmall)
                        } else if (aiText != null) {
                            Note(aiText!!, variant = NoteVariant.PLAIN)
                        } else {
                            Note("暂未生成（接口未返回内容）。", variant = NoteVariant.PLAIN)
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(18.dp))

        if (result != null) {
            Note(result!!.feedback, variant = NoteVariant.ACCENT)
            Spacer(Modifier.height(14.dp))
            PrimaryButton("下一词", onClick = next)
        } else {
            Text("左右滑动判定 · 右滑认识 / 左滑不认识", style = Type.uiLabel)
        }
    }
}
