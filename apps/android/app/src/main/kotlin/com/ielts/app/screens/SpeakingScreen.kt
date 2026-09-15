package com.ielts.app.screens

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.components.GhostButton
import com.ielts.app.components.PrimaryButton
import com.ielts.app.nav.Routes
import com.ielts.app.speaking.SpeakingEvents
import com.ielts.app.speaking.SpeakingInputMode
import com.ielts.app.speaking.SpeakingMock
import com.ielts.app.speaking.SpeakingRecordingState
import com.ielts.app.speaking.SpeakingUiState
import com.ielts.app.theme.Accent
import com.ielts.app.theme.AccentContrast
import com.ielts.app.theme.AccentWash
import com.ielts.app.theme.Bronze
import com.ielts.app.theme.DisplayFont
import com.ielts.app.theme.Ink
import com.ielts.app.theme.InkMeta
import com.ielts.app.theme.InkSoft
import com.ielts.app.theme.Line
import com.ielts.app.theme.LineStrong
import com.ielts.app.theme.Paper
import com.ielts.app.theme.Paper2
import com.ielts.app.theme.Type
import com.ielts.app.theme.UiFont
import com.ielts.app.viewmodel.StudyViewModel
import com.ielts.core.model.SpeakingQuestion
import com.ielts.core.service.SeedData
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

private val PARTS = listOf(
    "P1" to "P1 日常",
    "P2" to "P2 独白",
    "P3" to "P3 讨论",
)

private fun formatSeconds(s: Int): String = "%02d:%02d".format(s / 60, s % 60)

/**
 * 口语练习（PILOT-02 Speaking Frontend Shell · 语音优先）。
 *
 * 严格按 Approved Speaking State Board 施工：
 * IDLE / RECORDING / RECORDED / SUBMITTING / SUCCESS / ERROR + 文字输入辅助模式。
 * 数据使用现有真实口语题库（SeedData.questions），不写回任何业务存储；
 * 录音与分析全部为本地 Mock（SpeakingMock），UI 与 Mock 状态源分离。
 *
 * @param initialState 仅测试/预览注入；生产调用不传（默认 null 走完整状态机）。
 */
@Composable
fun SpeakingScreen(
    vm: StudyViewModel,
    navController: NavController,
    innerPadding: PaddingValues,
    initialState: SpeakingUiState? = null,
) {
    // ---------------- 真实题库（只读，不写回） ----------------
    val poolOf = { part: String -> SeedData.questions.filter { it.part == part } }

    var part by remember { mutableStateOf(initialState?.part ?: "P1") }
    var slotIndex by remember { mutableIntStateOf((initialState?.slot?.index ?: 0).coerceIn(0, (poolOf(initialState?.part ?: "P1").size - 1).coerceAtLeast(0))) }
    var hintOpen by remember { mutableStateOf(initialState?.hintOpen ?: false) }
    var mode by remember { mutableStateOf(initialState?.mode ?: SpeakingInputMode.VOICE) }
    var recording by remember { mutableStateOf(initialState?.recording ?: SpeakingRecordingState.IDLE) }
    var timerSeconds by remember { mutableIntStateOf(initialState?.timerSeconds ?: 0) }
    var recordedSeconds by remember { mutableIntStateOf(initialState?.recordedSeconds ?: 0) }
    var text by remember { mutableStateOf(initialState?.text ?: "") }

    val scope = rememberCoroutineScope()

    fun slot(): SpeakingUiState {
        val list = poolOf(part)
        val index = slotIndex.coerceIn(0, (list.size - 1).coerceAtLeast(0))
        val q = list.getOrNull(index) ?: list.first()
        return SpeakingUiState(
            mode = mode,
            recording = recording,
            part = part,
            slot = com.ielts.app.speaking.QuestionSlot(q, index + 1, list.size),
            hintOpen = hintOpen,
            timerSeconds = timerSeconds,
            recordedSeconds = recordedSeconds,
            text = text,
        )
    }

    // RECORDING 计时（Mock 视觉计时）
    LaunchedEffect(recording, part, slotIndex) {
        if (recording == SpeakingRecordingState.RECORDING) {
            while (isActive) {
                delay(1_000)
                timerSeconds += 1
            }
        }
    }

    // SUBMITTING 模拟提交
    LaunchedEffect(recording, slotIndex, text) {
        if (recording == SpeakingRecordingState.SUBMITTING) {
            SpeakingMock.submitDelay()
            val fail = SpeakingMock.shouldFail(recordedSeconds, text.length, mode)
            recording = if (fail) SpeakingRecordingState.ERROR else SpeakingRecordingState.SUCCESS
        }
    }

    // SUCCESS 短暂过渡后允许进入结果页（由用户点「查看结果」）
    LaunchedEffect(recording) {
        if (recording == SpeakingRecordingState.SUCCESS) {
            SpeakingMock.successDelay()
        }
    }

    val events = SpeakingEvents(
        selectPart = { p ->
            if (p != part) {
                part = p
                slotIndex = 0
                hintOpen = false
                recording = SpeakingRecordingState.IDLE
                timerSeconds = 0
                recordedSeconds = 0
            }
        },
        toggleHint = { hintOpen = !hintOpen },
        switchMode = { m ->
            mode = m
            recording = SpeakingRecordingState.IDLE
            timerSeconds = 0
            recordedSeconds = 0
        },
        startRecording = { recording = SpeakingRecordingState.RECORDING; timerSeconds = 0 },
        finishRecording = {
            recordedSeconds = timerSeconds.coerceAtLeast(1)
            recording = SpeakingRecordingState.RECORDED
        },
        cancelRecording = { recording = SpeakingRecordingState.IDLE; timerSeconds = 0 },
        reRecord = { recording = SpeakingRecordingState.IDLE; timerSeconds = 0; recordedSeconds = 0 },
        submit = {
            if (mode == SpeakingInputMode.TEXT) {
                recordedSeconds = 0
            }
            recording = SpeakingRecordingState.SUBMITTING
        },
        retrySubmit = { recording = SpeakingRecordingState.SUBMITTING },
        goResult = { navController.navigate(Routes.SPEAKING_RESULT) },
        onTextChange = { if (it.length <= 1000) text = it },
    )

    SpeakingShell(state = slot(), events = events, modifier = Modifier.padding(innerPadding))
}

// =====================================================================
//  Shell（纯 UI，逐状态对照 Approved Speaking State Board）
// =====================================================================

@Composable
internal fun SpeakingShell(state: SpeakingUiState, events: SpeakingEvents, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().background(Paper)) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Spacer(Modifier.height(10.dp))
            Text("口语练习", style = ShellTitle)
            Spacer(Modifier.height(12.dp))
            PartTabs(state.part, events.selectPart)
            Spacer(Modifier.height(12.dp))
            QuestionCard(state, events.toggleHint)
            Spacer(Modifier.height(16.dp))
            ModeSwitch(state.mode, events.switchMode)
            Spacer(Modifier.height(12.dp))
            when (state.mode) {
                SpeakingInputMode.VOICE -> VoicePanel(state, events)
                SpeakingInputMode.TEXT -> TextPanel(state, events)
            }
        }
    }
}

// ----------------------------- 顶部标题 -----------------------------

private val ShellTitle = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 20.sp,
    lineHeight = 26.sp,
    color = Ink,
)

// ----------------------------- P1 / P2 / P3 分段 tab -----------------------------

@Composable
private fun PartTabs(current: String, onSelect: (String) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PARTS.forEach { (key, label) ->
            val selected = key == current
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (selected) AccentWash else Paper2)
                    .clickable { onSelect(key) }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = Type.uiLabel.copy(
                        fontSize = 13.sp,
                        color = if (selected) Accent else InkMeta,
                    ),
                )
            }
        }
    }
}

// ----------------------------- Question Card -----------------------------

@Composable
private fun QuestionCard(state: SpeakingUiState, toggleHint: () -> Unit) {
    val q = state.slot.question
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Paper)
            .border(1.dp, Line, RoundedCornerShape(16.dp))
            .padding(16.dp),
    ) {
        Text(
            "Question ${state.slot.index} / ${state.slot.total}",
            style = Type.uiLabel.copy(color = Bronze, fontSize = 12.sp),
        )
        Spacer(Modifier.height(8.dp))
        Text(q.question, style = QuestionMain)
        if (q.followUps.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            q.followUps.forEach { f ->
                Text("· $f", style = QuestionFollow)
                Spacer(Modifier.height(4.dp))
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            if (state.hintOpen) "收起提示" else "查看提示",
            style = Type.uiLabel.copy(color = Accent, fontSize = 12.sp),
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .clickable(onClick = toggleHint)
                .padding(vertical = 4.dp),
        )
        if (state.hintOpen) {
            Spacer(Modifier.height(6.dp))
            if (q.questionZh.isNotBlank()) {
                Text(q.questionZh, style = QuestionHint)
                Spacer(Modifier.height(4.dp))
            }
            Text(
                "建议 ${q.expectedLength.min}–${q.expectedLength.ideal} 秒",
                style = QuestionHint,
            )
        }
    }
}

private val QuestionMain = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 18.sp,
    lineHeight = 26.sp,
    color = Ink,
)

private val QuestionFollow = TextStyle(
    fontFamily = UiFont,
    fontSize = 13.sp,
    lineHeight = 20.sp,
    color = InkSoft,
)

private val QuestionHint = TextStyle(
    fontFamily = UiFont,
    fontSize = 12.sp,
    lineHeight = 18.sp,
    color = InkMeta,
)

// ----------------------------- 录音回答 / 文字输入 切换 -----------------------------

@Composable
private fun ModeSwitch(current: SpeakingInputMode, onSwitch: (SpeakingInputMode) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ModePill("录音回答", SpeakingInputMode.VOICE, current, onSwitch, Modifier.weight(1f))
        ModePill("文字输入", SpeakingInputMode.TEXT, current, onSwitch, Modifier.weight(1f))
    }
}

@Composable
private fun ModePill(
    label: String,
    value: SpeakingInputMode,
    current: SpeakingInputMode,
    onSwitch: (SpeakingInputMode) -> Unit,
    modifier: Modifier,
) {
    val selected = value == current
    Box(
        modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) Accent else Paper2)
            .clickable { onSwitch(value) }
            .padding(vertical = 11.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = Type.uiButton.copy(fontSize = 14.sp, color = if (selected) AccentContrast else InkSoft),
        )
    }
}

// ----------------------------- VOICE：六状态 -----------------------------

@Composable
private fun VoicePanel(state: SpeakingUiState, events: SpeakingEvents) {
    when (state.recording) {
        SpeakingRecordingState.IDLE -> IdleState(events)
        SpeakingRecordingState.RECORDING -> RecordingState(state, events)
        SpeakingRecordingState.RECORDED -> RecordedState(state, events)
        SpeakingRecordingState.SUBMITTING -> SubmittingState()
        SpeakingRecordingState.SUCCESS -> SuccessState(events)
        SpeakingRecordingState.ERROR -> ErrorState(events)
    }
}

// ---- IDLE ----

@Composable
private fun IdleState(events: SpeakingEvents) {
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(12.dp))
        Box(
            Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(AccentWash)
                .clickable(onClick = events.startRecording),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.Mic,
                contentDescription = "开始录音",
                tint = Accent,
                modifier = Modifier.size(44.dp),
            )
        }
        Spacer(Modifier.height(16.dp))
        Text("点击开始录音", style = IdleMain)
        Spacer(Modifier.height(4.dp))
        Text("建议 40–80 秒", style = IdleSub)
        Spacer(Modifier.height(20.dp))
        Box(
            Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(Paper2)
                .clickable { events.switchMode(SpeakingInputMode.TEXT) }
                .padding(horizontal = 20.dp, vertical = 10.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text("文字输入", style = Type.uiLabel.copy(fontSize = 13.sp, color = InkMeta))
        }
    }
}

private val IdleMain = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 17.sp,
    lineHeight = 24.sp,
    color = Ink,
)

private val IdleSub = TextStyle(
    fontFamily = UiFont,
    fontSize = 13.sp,
    lineHeight = 18.sp,
    color = InkMeta,
)

// ---- RECORDING ----

@Composable
private fun RecordingState(state: SpeakingUiState, events: SpeakingEvents) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(8.dp))
        Text(formatSeconds(state.timerSeconds), style = TimerBig)
        Spacer(Modifier.height(16.dp))
        Waveform()
        Spacer(Modifier.height(24.dp))
        PrimaryButton(text = "结束回答", onClick = events.finishRecording)
        Spacer(Modifier.height(10.dp))
        GhostButton(text = "取消录音", onClick = events.cancelRecording)
    }
}

private val TimerBig = TextStyle(
    fontFamily = DisplayFont,
    fontWeight = FontWeight.Medium,
    fontSize = 44.sp,
    lineHeight = 52.sp,
    color = Ink,
)

/** 视觉动画波形（非真实音频波形，仅状态氛围） */
@Composable
private fun Waveform() {
    val transition = rememberInfiniteTransition(label = "wave")
    val t by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1_400, easing = LinearEasing)),
        label = "wave-t",
    )
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 24.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(20) { i ->
            val phase = i * 0.55
            val v = abs(sin(t * 2 * PI.toFloat() + phase))
            val h = (8 + 18 * v).dp
            Box(
                Modifier
                    .padding(horizontal = 3.dp)
                    .width(4.dp)
                    .height(h)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Accent.copy(alpha = 0.38f)),
            )
        }
    }
}

// ---- RECORDED ----

@Composable
private fun RecordedState(state: SpeakingUiState, events: SpeakingEvents) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(8.dp))
        Text(formatSeconds(state.recordedSeconds), style = TimerBig)
        Spacer(Modifier.height(10.dp))
        // 播放录音：UI placeholder，不制造假音频文件
        Row(
            Modifier
                .clip(RoundedCornerShape(10.dp))
                .clickable { /* placeholder：MOBILE-04 接入真实播放 */ }
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.PlayArrow,
                contentDescription = "播放录音",
                tint = Accent,
                modifier = Modifier.size(22.dp),
            )
            Spacer(Modifier.width(6.dp))
            Text("播放录音", style = Type.uiLabel.copy(fontSize = 14.sp, color = Ink))
        }
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            GhostButton("重新录制", Modifier.weight(1f), onClick = events.reRecord)
            PrimaryButton("提交分析", Modifier.weight(1f), onClick = events.submit)
        }
    }
}

// ---- SUBMITTING ----

@Composable
private fun SubmittingState() {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(
            color = Accent,
            strokeWidth = 3.dp,
            modifier = Modifier.size(44.dp),
        )
        Spacer(Modifier.height(18.dp))
        Text("正在分析你的回答…", style = SubmitMain)
        Spacer(Modifier.height(4.dp))
        Text("请稍候", style = IdleSub)
    }
}

private val SubmitMain = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.Medium,
    fontSize = 16.sp,
    lineHeight = 22.sp,
    color = Ink,
)

// ---- SUCCESS（短暂过渡，不长期停留） ----

@Composable
private fun SuccessState(events: SpeakingEvents) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = Accent,
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(14.dp))
        Text("分析完成", style = SubmitMain)
        Spacer(Modifier.height(4.dp))
        Text("正在为你生成详细报告...", style = IdleSub)
        Spacer(Modifier.height(20.dp))
        PrimaryButton(text = "查看结果", onClick = events.goResult)
    }
}

// ---- ERROR ----

@Composable
private fun ErrorState(events: SpeakingEvents) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Filled.ErrorOutline,
            contentDescription = null,
            tint = Accent,
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(14.dp))
        Text("分析没有完成", style = SubmitMain)
        Spacer(Modifier.height(4.dp))
        Text("请再试一次", style = IdleSub)
        Spacer(Modifier.height(20.dp))
        PrimaryButton(text = "重新提交", onClick = events.retrySubmit)
        Spacer(Modifier.height(10.dp))
        GhostButton(text = "重新录制", onClick = events.reRecord)
    }
}

// ----------------------------- TEXT 辅助模式 -----------------------------

@Composable
private fun TextPanel(state: SpeakingUiState, events: SpeakingEvents) {
    Column(Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Paper2)
                .border(1.dp, Line, RoundedCornerShape(14.dp))
                .padding(14.dp),
        ) {
            BasicTextField(
                value = state.text,
                onValueChange = events.onTextChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 140.dp),
                textStyle = Type.body.copy(color = Ink),
                cursorBrush = SolidColor(Accent),
                decorationBox = { inner ->
                    Box(Modifier.fillMaxWidth()) {
                        if (state.text.isEmpty()) {
                            Text("在这里输入你的回答…", style = Type.bodySmall)
                        }
                        inner()
                    }
                },
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            "${state.text.length} / 1000",
            style = Type.uiLabel.copy(fontSize = 12.sp, color = InkMeta),
            modifier = Modifier.align(Alignment.End),
        )
        Spacer(Modifier.height(14.dp))
        PrimaryButton(
            text = "分析一下",
            onClick = events.submit,
            enabled = state.text.isNotBlank(),
        )
        Spacer(Modifier.height(4.dp))
    }
}
