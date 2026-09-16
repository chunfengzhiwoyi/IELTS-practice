package com.ielts.app.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavController
import com.ielts.app.components.GhostButton
import com.ielts.app.components.PrimaryButton
import com.ielts.app.nav.Routes
import com.ielts.app.speaking.AudioSessionState
import com.ielts.app.speaking.MicPermissionDecision
import com.ielts.app.speaking.SpeakingAudioFactory
import com.ielts.app.speaking.SpeakingAudioSession
import com.ielts.app.speaking.SpeakingEvents
import com.ielts.app.speaking.SpeakingInputMode
import com.ielts.app.speaking.SpeakingMock
import com.ielts.app.speaking.SpeakingRecordingState
import com.ielts.app.speaking.SpeakingUiState
import com.ielts.app.speaking.resolveMicPermission
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

/** mm:ss 格式化（internal：长时长逻辑测试复用，验证 600s 无溢出）。 */
internal fun formatSpeakingSeconds(s: Int): String = "%02d:%02d".format(s / 60, s % 60)

/**
 * 口语练习（PILOT-02 Speaking Frontend Shell · 语音优先）。
 *
 * MOBILE-04A：真实本地 Recorder Loop（MediaRecorder → m4a + MediaPlayer 播放闭环）。
 * - REAL_RECORDING = YES / REAL_PLAYBACK = YES / MOCK_ANALYSIS = YES / REAL_ANALYSIS = NO
 * - 权限：首次点击请求；拒绝 → IDLE 非技术提示；永久拒绝 → 系统设置入口
 * - 真实 timer：以 recorder session / elapsedRealtime 为准，重组不重置
 * - 提交分析仍走 Mock 结果链（不读真实音频时长/内容）；<4s 旧规则已解除
 * - 生命周期：ON_STOP 安全停止录音并保留有效录音；dispose 停止一切并清理 temp
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

    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val session: SpeakingAudioSession = remember {
        SpeakingAudioFactory.createSession(context)
    }

    var part by remember { mutableStateOf(initialState?.part ?: "P1") }
    var slotIndex by remember { mutableIntStateOf((initialState?.slot?.index ?: 0).coerceIn(0, (poolOf(initialState?.part ?: "P1").size - 1).coerceAtLeast(0))) }
    var hintOpen by remember { mutableStateOf(initialState?.hintOpen ?: false) }
    var mode by remember { mutableStateOf(initialState?.mode ?: SpeakingInputMode.VOICE) }
    var recording by remember { mutableStateOf(initialState?.recording ?: SpeakingRecordingState.IDLE) }
    var timerSeconds by remember { mutableIntStateOf(initialState?.timerSeconds ?: 0) }
    var recordedSeconds by remember { mutableIntStateOf(initialState?.recordedSeconds ?: 0) }
    var text by remember { mutableStateOf(initialState?.text ?: "") }

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

    // ---------------- 麦克风权限（MOBILE-04A） ----------------
    var hasRequestedMic by remember { mutableStateOf(false) }
    var micDenied by remember { mutableStateOf(initialState?.micPermissionDenied ?: false) }
    var micPermanent by remember { mutableStateOf(initialState?.micPermissionPermanentlyDenied ?: false) }
    var micError by remember { mutableStateOf(initialState?.recordingError) }

    fun startSessionRecording() {
        if (session.startRecording()) {
            recording = SpeakingRecordingState.RECORDING
            timerSeconds = 0
            micDenied = false
            micPermanent = false
            micError = null
        } else {
            // 录音启动失败：留在 IDLE + 产品级提示（不暴露技术原因）
            recording = SpeakingRecordingState.IDLE
            micError = session.lastError ?: "录音启动失败，请重试"
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        // 先取请求前状态：首次请求前 rationale=false 属正常现象，不得误判永久拒绝；
        // 只有「本次之前已请求过」且系统不再建议理由才视为永久拒绝（resolveMicPermission 语义）。
        val requestedBefore = hasRequestedMic
        hasRequestedMic = true
        val rational = (context as? android.app.Activity)
            ?.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)
            ?: true
        when (resolveMicPermission(granted, requestedBefore, rational)) {
            MicPermissionDecision.START_RECORDING -> startSessionRecording()
            MicPermissionDecision.DENIED_LIGHT -> {
                micDenied = true
                micPermanent = false
            }
            MicPermissionDecision.DENIED_PERMANENT -> {
                micDenied = true
                micPermanent = true
            }
        }
    }

    val settingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        // 返回后重新检查权限
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            micDenied = false
            micPermanent = false
        } else {
            micDenied = true
        }
    }

    // ---------------- 真实 session 计时（E 节：以 elapsedRealtime 为准） ----------------
    LaunchedEffect(recording, part, slotIndex) {
        if (recording == SpeakingRecordingState.RECORDING) {
            while (isActive) {
                delay(250)
                if (session.state == AudioSessionState.RECORDING) {
                    val elapsed = SystemClock.elapsedRealtime() - session.startedAtElapsed
                    timerSeconds = (elapsed / 1_000L).toInt()
                } else {
                    // preview/initialState 注入路径：无真实 session，沿用视觉递增
                    timerSeconds += 1
                }
            }
        }
    }

    // ---------------- 提交（MOCK_ANALYSIS=YES：不读真实音频时长/内容） ----------------
    LaunchedEffect(recording, slotIndex, text) {
        if (recording == SpeakingRecordingState.SUBMITTING) {
            SpeakingMock.submitDelay()
            val fail = if (mode == SpeakingInputMode.TEXT) {
                SpeakingMock.textTooShort(text.length)
            } else {
                SpeakingMock.voiceSubmitFails()
            }
            recording = if (fail) SpeakingRecordingState.ERROR else SpeakingRecordingState.SUCCESS
        }
    }

    // SUCCESS 短暂过渡后允许进入结果页（由用户点「查看结果」）
    LaunchedEffect(recording) {
        if (recording == SpeakingRecordingState.SUCCESS) {
            SpeakingMock.successDelay()
        }
    }

    // ---------------- 生命周期（J 节） ----------------
    DisposableEffect(lifecycleOwner, session) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> {
                    // 后台：RECORDING → 安全停止并保留已生成的有效录音；播放停止
                    if (session.state == AudioSessionState.RECORDING) {
                        if (session.finishRecording()) {
                            recordedSeconds = (session.lastRecording?.durationMs ?: 0L)
                                .div(1_000L).toInt().coerceAtLeast(1)
                            recording = SpeakingRecordingState.RECORDED
                        } else {
                            recording = SpeakingRecordingState.IDLE
                            micError = session.lastError
                        }
                    }
                    session.stopPlayback()
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            // 离开页面：停止录音/播放、release native、删除未交付 temp（A 节 LEAVE SCREEN）
            session.release()
        }
    }

    val events = SpeakingEvents(
        selectPart = { p ->
            if (p != part) {
                // 切 Part 视为放弃当前会话：停止录音/播放、删除未移交 temp（A 节），防止偷偷录音
                session.rerecord()
                part = p
                slotIndex = 0
                hintOpen = false
                recording = SpeakingRecordingState.IDLE
                timerSeconds = 0
                recordedSeconds = 0
                micError = null
            }
        },
        toggleHint = { hintOpen = !hintOpen },
        switchMode = { m ->
            if (m != mode) {
                // 切模式同样放弃当前音频会话（与 selectPart 一致）
                session.rerecord()
                mode = m
                recording = SpeakingRecordingState.IDLE
                timerSeconds = 0
                recordedSeconds = 0
                micError = null
            }
        },
        startRecording = {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                startSessionRecording()
            } else {
                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        },
        finishRecording = {
            if (session.finishRecording()) {
                recordedSeconds = (session.lastRecording?.durationMs ?: 0L)
                    .div(1_000L).toInt().coerceAtLeast(1)
                recording = SpeakingRecordingState.RECORDED
            } else {
                recording = SpeakingRecordingState.IDLE
                micError = session.lastError
            }
        },
        cancelRecording = {
            session.cancelRecording()
            recording = SpeakingRecordingState.IDLE
            timerSeconds = 0
            micError = null
        },
        reRecord = {
            session.rerecord()
            recording = SpeakingRecordingState.IDLE
            timerSeconds = 0
            recordedSeconds = 0
            micError = null
        },
        submit = {
            // 提交前停止本地播放（录音与播放互斥；PLAYING 态不允许带着播放进分析）
            session.stopPlayback()
            if (mode == SpeakingInputMode.TEXT) {
                recordedSeconds = 0
            }
            recording = SpeakingRecordingState.SUBMITTING
        },
        retrySubmit = {
            session.stopPlayback()
            recording = SpeakingRecordingState.SUBMITTING
        },
        goResult = { navController.navigate(Routes.SPEAKING_RESULT) },
        onTextChange = { if (it.length <= 1000) text = it },
        togglePlayback = {
            if (session.state == AudioSessionState.PLAYING) {
                session.stopPlayback()
            } else {
                session.play()
            }
        },
        openMicSettings = {
            settingsLauncher.launch(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", context.packageName, null),
                ),
            )
        },
    )

    val uiState = slot().copy(
        // 测试注入 initialState 时以注入值为准（session 未启动）；生产路径读真实 session 播放态
        isPlaying = initialState?.isPlaying ?: (session.state == AudioSessionState.PLAYING),
        micPermissionDenied = micDenied,
        micPermissionPermanentlyDenied = micPermanent,
        recordingError = micError,
    )
    SpeakingShell(state = uiState, events = events, modifier = Modifier.padding(innerPadding))
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
        SpeakingRecordingState.IDLE -> IdleState(state, events)
        SpeakingRecordingState.RECORDING -> RecordingState(state, events)
        SpeakingRecordingState.RECORDED -> RecordedState(state, events)
        SpeakingRecordingState.SUBMITTING -> SubmittingState()
        SpeakingRecordingState.SUCCESS -> SuccessState(events)
        SpeakingRecordingState.ERROR -> ErrorState(events)
    }
}

// ---- IDLE（含权限/启动失败轻提示） ----

@Composable
private fun IdleState(state: SpeakingUiState, events: SpeakingEvents) {
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
        if (state.micPermissionDenied || state.recordingError != null) {
            Spacer(Modifier.height(14.dp))
            Text(
                when {
                    state.micPermissionPermanentlyDenied -> "麦克风权限已关闭，请在系统设置中开启后重试"
                    state.micPermissionDenied -> "需要麦克风权限才能录音，请允许后重试"
                    else -> state.recordingError.orEmpty()
                },
                style = Type.uiLabel.copy(fontSize = 13.sp, color = InkSoft),
                modifier = Modifier.padding(horizontal = 8.dp),
            )
            if (state.micPermissionPermanentlyDenied) {
                Spacer(Modifier.height(8.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(Paper2)
                        .clickable(onClick = events.openMicSettings)
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("前往系统设置", style = Type.uiLabel.copy(fontSize = 13.sp, color = Accent))
                }
            }
        }
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
        Text(formatSpeakingSeconds(state.timerSeconds), style = TimerBig)
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

/** 视觉动画波形（MOBILE-04A：非真实音频振幅；maxAmplitude 登记为 future enhancement） */
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

// ---- RECORDED（含真实本地播放闭环） ----

@Composable
private fun RecordedState(state: SpeakingUiState, events: SpeakingEvents) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(8.dp))
        Text(formatSpeakingSeconds(state.recordedSeconds), style = TimerBig)
        Spacer(Modifier.height(10.dp))
        // 本地播放闭环：播放 / 停止（MediaPlayer，MOBILE-04A）
        Row(
            Modifier
                .clip(RoundedCornerShape(10.dp))
                .clickable(onClick = events.togglePlayback)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = if (state.isPlaying) Icons.Filled.Stop else Icons.Filled.PlayArrow,
                contentDescription = "播放录音",
                tint = Accent,
                modifier = Modifier.size(22.dp),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                if (state.isPlaying) "停止播放" else "播放录音",
                style = Type.uiLabel.copy(fontSize = 14.sp, color = Ink),
            )
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
