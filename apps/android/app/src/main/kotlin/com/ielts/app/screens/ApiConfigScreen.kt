package com.ielts.app.screens

import androidx.compose.foundation.background
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
import androidx.compose.ui.unit.sp
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.core.llm.*
import kotlinx.coroutines.launch

/**
 * MOBILE-08 §6 — AI 服务配置视觉重构（逻辑冻结）。
 * 视觉 Hero = 顶部「AI 服务状态」状态卡，强于下方表单；说明精简；清除配置降为低层级。
 * BYOK 安全边界不变：Key 仅本机 DataStore，不显示/上传/打日志，与 Lingxi 服务端 key 隔离。
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
    val stateColor: Color = when {
        testing -> Bronze
        !configured -> InkMeta
        lastTestOk -> Pos
        else -> Amber
    }
    val stateTitle = when {
        testing -> "正在验证连接…"
        !configured -> "尚未配置"
        lastTestOk -> "连接正常"
        testMsg != null -> "连接异常"
        else -> "密钥已保存 · 待验证"
    }
    val stateSub = when {
        testing -> "正在向所选服务发起一次测试请求，请稍候。"
        !configured -> "配置你自己的 API Key 后，可在口语与写作中调用更强的模型。"
        lastTestOk -> "密钥有效，当前可以使用你配置的模型。"
        testMsg != null -> testMsg.orEmpty()
        else -> "密钥已保存在本机，尚未通过连接测试。"
    }

    SubPage("AI 服务配置", onBack = { onDone() }, innerPadding = innerPadding) {
        // 01 —— 状态 Hero（强于表单）
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusLarge))
                .background(stateColor.copy(alpha = 0.08f))
                .padding(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(stateColor))
                Spacer(Modifier.width(7.dp))
                Text("AI 服务状态", style = Type.editorKicker.copy(color = stateColor))
            }
            Spacer(Modifier.height(12.dp))
            Text(stateTitle, style = Type.editorTitleSmall, color = stateColor)
            Spacer(Modifier.height(4.dp))
            Text(stateSub, style = Type.bodySmall, color = InkSoft)
        }
        Spacer(Modifier.height(Space.xl))

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

        // 保存并验证
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

        // 高级选项（Base URL / 模型名 / 协议）——默认折叠
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
        Spacer(Modifier.height(Space.lg))

        // 清除配置（降为低风险层级，不像主操作）
        Text(
            "清除配置，回退离线",
            style = Type.uiLabel.copy(color = InkMeta),
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

        // 使用说明（精简两句话，不做文字墙）
        Text(
            "你的 API Key 仅保存在这台设备，不会上传到灵犀服务器；口语评测的内置通道不受影响。",
            style = Type.uiLabel.copy(fontSize = 11.sp, color = InkMeta),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))
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
