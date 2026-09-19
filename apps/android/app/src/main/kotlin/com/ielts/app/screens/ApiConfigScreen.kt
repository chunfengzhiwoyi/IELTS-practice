package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.core.llm.*
import kotlinx.coroutines.launch

/** AI 服务的四种产品化状态（视觉用，不映射任何工程错误码）。 */
internal enum class ApiStatusMode { UNCONFIGURED, VALIDATING, CONNECTED, SAVED_PENDING, FAILED }

/**
 * MOBILE-08F §11–17 — AI 服务配置最后收口（逻辑冻结）。
 * STATUS-FIRST：顶部状态 Hero（徽标 + 大状态标题 + 产品化副文案，连接态附 已验证/服务商）明显强于下方表单；
 * 表单归入「服务配置」次级分组；高级默认折叠；清除降为底部酒红 text-style；说明收敛为两行小字。
 * BYOK 安全边界不变：Key 仅本机 DataStore，不回显完整值/不上传/不打日志，与 Lingxi 服务端 key 隔离。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApiConfigScreen(innerPadding: PaddingValues, onDone: () -> Unit) {
    val initial = remember { getApiConfig() }
    val matched = remember {
        PROVIDER_CATALOG.firstOrNull { it.baseUrl == initial.baseUrl && it.model == initial.model }
    }

    var selectedKey by remember { mutableStateOf(matched?.key ?: "") }
    var search by remember { mutableStateOf(matched?.label ?: "") }
    var baseUrl by remember { mutableStateOf(initial.baseUrl) }
    var apiKey by remember { mutableStateOf(initial.apiKey) }
    var model by remember { mutableStateOf(initial.model) }
    var protocol by remember { mutableStateOf(initial.protocol) }
    var lastTestOk by remember { mutableStateOf(initial.lastTestOk) }

    var expanded by remember { mutableStateOf(false) }
    var advanced by remember { mutableStateOf(false) }
    var testing by remember { mutableStateOf(false) }
    var testMsg by remember { mutableStateOf<String?>(null) }
    var showKey by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()
    val protocolEnum = runCatching { LlmProtocol.valueOf(protocol) }.getOrDefault(LlmProtocol.OPENAI)
    val isCustom = selectedKey == "custom" || selectedKey == ""

    val onSelectProvider: (LlmProvider) -> Unit = { p ->
        selectedKey = p.key
        search = p.label
        if (p.key != "custom") {
            baseUrl = p.baseUrl
            model = p.model
            protocol = p.protocol.name
        } else {
            // 自定义服务商需要用户自行填写 Endpoint，自动展开高级选项，避免空 URL 静默无法验证
            advanced = true
        }
        testMsg = null
    }

    // —— 当前状态（视觉主角）——
    val configured = apiKey.isNotBlank() && baseUrl.isNotBlank()
    val mode = when {
        testing -> ApiStatusMode.VALIDATING
        !configured -> ApiStatusMode.UNCONFIGURED
        lastTestOk -> ApiStatusMode.CONNECTED
        testMsg != null -> ApiStatusMode.FAILED
        else -> ApiStatusMode.SAVED_PENDING
    }
    val stateTitle = when (mode) {
        ApiStatusMode.VALIDATING -> "正在验证连接…"
        ApiStatusMode.UNCONFIGURED -> "尚未连接"
        ApiStatusMode.CONNECTED -> "连接正常"
        ApiStatusMode.FAILED -> "连接异常"
        ApiStatusMode.SAVED_PENDING -> "密钥已保存 · 待验证"
    }
    val stateSub = when (mode) {
        ApiStatusMode.VALIDATING -> "正在向所选服务发起一次测试请求，请稍候。"
        ApiStatusMode.UNCONFIGURED -> "配置你的个人 AI 服务后，即可在口语与写作中启用相关 AI 能力。"
        ApiStatusMode.CONNECTED -> "密钥有效，当前可以使用你配置的模型。"
        ApiStatusMode.FAILED -> testMsg ?: "暂时无法连接服务，请稍后再试。"
        ApiStatusMode.SAVED_PENDING -> "密钥已保存在本机，尚未通过连接测试。"
    }

    SubPage("AI 服务配置", onBack = { onDone() }, innerPadding = innerPadding) {
        // 01 —— 状态 Hero（页面视觉主角，明显强于表单）
        ApiStatusHero(
            mode = mode,
            title = stateTitle,
            subtitle = stateSub,
            providerLabel = if (mode == ApiStatusMode.CONNECTED) search.ifBlank { "自定义端点" } else null,
        )
        Spacer(Modifier.height(Space.xl))

        // 02 —— 服务配置（次级分组）
        Text("服务配置", style = Type.editorKicker)
        Spacer(Modifier.height(Space.sm))

        // 服务提供商
        Text("服务提供商", style = Type.uiLabel)
        Spacer(Modifier.height(8.dp))
        ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it; expanded = true },
                modifier = Modifier.menuAnchor().fillMaxWidth(),
                placeholder = { Text("DeepSeek（推荐）", style = Type.bodySmall, color = InkMeta) },
                singleLine = true,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                textStyle = Type.body,
                shape = RoundedCornerShape(RadiusMedium),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Ink,
                    unfocusedTextColor = Ink,
                    cursorColor = Accent,
                    focusedBorderColor = Accent,
                    unfocusedBorderColor = LineStrong,
                    focusedLabelColor = Accent,
                ),
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                val filtered = PROVIDER_CATALOG.filter {
                    it.label.contains(search, ignoreCase = true) || it.key.contains(search, ignoreCase = true)
                }
                ProviderGroup.entries.forEach { g ->
                    val inGroup = filtered.filter { it.group == g }
                    if (inGroup.isNotEmpty()) {
                        DropdownMenuItem(
                            text = { Text(g.label, style = Type.uiLabel.copy(color = Bronze)) },
                            enabled = false,
                            onClick = {},
                        )
                        inGroup.forEach { p ->
                            DropdownMenuItem(
                                text = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(p.label, style = Type.body, modifier = Modifier.weight(1f))
                                        if (p.key == "deepseek") Pill("推荐", color = Bronze)
                                    }
                                },
                                onClick = { onSelectProvider(p); expanded = false },
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(Space.lg))

        // API Key
        Text("API Key", style = Type.uiLabel)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = apiKey,
            onValueChange = { apiKey = it; testMsg = null },
            placeholder = { Text("请输入你的 API Key", style = Type.bodySmall, color = InkMeta) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { showKey = !showKey }) {
                    Icon(
                        imageVector = if (showKey) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                        contentDescription = if (showKey) "隐藏密钥" else "显示密钥",
                        tint = InkMeta,
                    )
                }
            },
            textStyle = Type.body,
            shape = RoundedCornerShape(RadiusMedium),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Ink,
                unfocusedTextColor = Ink,
                cursorColor = Accent,
                focusedBorderColor = Accent,
                unfocusedBorderColor = LineStrong,
                focusedLabelColor = Accent,
            ),
        )
        Spacer(Modifier.height(Space.lg))

        // 保存并验证（真实验证逻辑不变，仅在输入满足要求时 enabled）
        val valid = baseUrl.isNotBlank() && apiKey.isNotBlank() && model.isNotBlank()
        PrimaryButton(
            text = if (testing) "正在验证连接…" else "保存并验证",
            enabled = valid && !testing,
            onClick = {
                if (!valid) return@PrimaryButton
                testing = true
                testMsg = null
                val cfg = ApiConfig(baseUrl.trim(), apiKey.trim(), model.trim(), protocol, lastTestOk)
                scope.launch {
                    val r = callUserModel(
                        cfg,
                        "你是配置测试助手，只回复两个字：ok",
                        "ping",
                        jsonMode = false,
                        connectTimeout = 8_000,
                        readTimeout = 15_000,
                    )
                    testing = false
                    if (r != null) {
                        lastTestOk = true
                        testMsg = null
                        saveApiConfig(cfg.copy(lastTestOk = true))
                    } else {
                        lastTestOk = false
                        // callUserModel 仅返回成败，不暴露 HTTP/异常；按可判定的配置问题给产品化中文原因
                        testMsg = if (!baseUrl.trim().startsWith("http")) {
                            "配置地址不完整，请检查接口地址后重试"
                        } else {
                            "无法连接服务或密钥无效，请核对密钥与所选服务后重试"
                        }
                        saveApiConfig(cfg.copy(lastTestOk = false))
                    }
                }
            },
        )

        // 高级选项（Base URL / 模型名 / 协议）——默认折叠，一行编辑式入口
        Spacer(Modifier.height(Space.md))
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { advanced = !advanced }
                .padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("高级选项", style = Type.uiLabel)
            Text(if (advanced) "收起" else "展开", style = Type.uiLabel.copy(color = Accent))
        }
        if (advanced) {
            Spacer(Modifier.height(Space.sm))
            if (isCustom) {
                Text("接口协议", style = Type.uiLabel)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LlmProtocol.entries.forEach { pr ->
                        GhostButton(
                            text = pr.label,
                            modifier = Modifier.weight(1f),
                            selected = protocolEnum == pr,
                            onClick = { protocol = pr.name; testMsg = null },
                        )
                    }
                }
                Spacer(Modifier.height(Space.md))
                ApiField("接口地址 Endpoint URL", baseUrl, { baseUrl = it; testMsg = null }, "https://api.example.com/v1")
                Spacer(Modifier.height(Space.md))
            }
            ApiField("模型名", model, { model = it; testMsg = null }, "deepseek-chat")
            Spacer(Modifier.height(Space.md))
        }
        Spacer(Modifier.height(Space.xl))

        // 清除配置（底部 text-style 次级危险操作，不与主 CTA 同级）
        Text(
            "清除当前配置",
            style = Type.uiLabel.copy(color = Accent, letterSpacing = 0.04.em),
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clickable {
                    saveApiConfig(ApiConfig())
                    selectedKey = ""
                    search = ""
                    baseUrl = ""
                    apiKey = ""
                    model = ""
                    protocol = LlmProtocol.OPENAI.name
                    lastTestOk = false
                    testing = false
                    testMsg = null
                }
                .padding(vertical = 10.dp),
        )
        Spacer(Modifier.height(Space.lg))

        // 使用说明（两行小字，不做说明文字墙，不暴露工程实现）
        Text(
            "你的 API Key 仅保存在这台设备，不会上传到灵犀服务器；口语评测的内置通道不受影响。",
            style = Type.uiLabel.copy(fontSize = 11.sp, color = InkMeta),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))
    }
}

/**
 * AI 服务状态 Hero：状态徽标 + 大状态标题 + 产品化副文案；连接态附「已验证」与服务商名。
 * 抽成独立 composable，便于在确定性截图测试中渲染全部状态（ROBOLECTRIC_ONLY 证据）。
 */
@Composable
internal fun ApiStatusHero(
    mode: ApiStatusMode,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    providerLabel: String? = null,
) {
    val color: Color = when (mode) {
        ApiStatusMode.VALIDATING -> Bronze
        ApiStatusMode.UNCONFIGURED -> InkMeta
        ApiStatusMode.CONNECTED -> Pos
        ApiStatusMode.SAVED_PENDING -> Amber
        ApiStatusMode.FAILED -> Amber
    }
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(RadiusLarge))
            .background(color.copy(alpha = 0.09f))
            .padding(horizontal = 20.dp, vertical = 22.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ApiStatusBadge(mode = mode, color = color)
            Spacer(Modifier.width(12.dp))
            Text("AI 服务状态", style = Type.editorKicker.copy(color = color))
        }
        Spacer(Modifier.height(14.dp))
        Text(title, style = Type.editorTitle.copy(color = color))
        Spacer(Modifier.height(5.dp))
        Text(subtitle, style = Type.bodySmall, color = InkSoft)
        if (providerLabel != null) {
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Pill("已验证", color = Pos)
                Spacer(Modifier.width(8.dp))
                Text(providerLabel, style = Type.uiLabel.copy(color = InkSoft))
            }
        }
    }
}

@Composable
private fun ApiStatusBadge(mode: ApiStatusMode, color: Color) {
    Box(
        Modifier
            .size(42.dp)
            .clip(CircleShape)
            .background(color.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        when (mode) {
            ApiStatusMode.VALIDATING -> CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.5.dp,
                color = color,
            )
            ApiStatusMode.CONNECTED, ApiStatusMode.SAVED_PENDING ->
                Box(Modifier.size(13.dp).clip(CircleShape).background(color))
            ApiStatusMode.UNCONFIGURED ->
                Box(
                    Modifier
                        .size(17.dp)
                        .clip(CircleShape)
                        .border(2.dp, color, CircleShape),
                )
            ApiStatusMode.FAILED ->
                Text(
                    "!",
                    style = Type.uiButton.copy(color = color, fontSize = 20.sp),
                )
        }
    }
}

@Composable
private fun ApiField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
) {
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = Type.uiLabel)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, style = Type.bodySmall, color = InkMeta) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            textStyle = Type.body,
            shape = RoundedCornerShape(RadiusMedium),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Ink,
                unfocusedTextColor = Ink,
                cursorColor = Accent,
                focusedBorderColor = Accent,
                unfocusedBorderColor = LineStrong,
                focusedLabelColor = Accent,
            ),
        )
    }
}
