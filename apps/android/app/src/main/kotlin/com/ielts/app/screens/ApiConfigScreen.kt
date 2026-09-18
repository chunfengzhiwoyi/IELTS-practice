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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.core.llm.*
import kotlinx.coroutines.launch

/**
 * MOBILE-06 §9/§10 — AI 服务配置页（视觉稿 v2.0）。
 *  - 服务提供商（DeepSeek 推荐）+ API Key（掩码 + 👁）+ [保存并验证] + 状态
 *  - 真实 BYOK 逻辑保留：DataStore 本地存储（getApiConfig/saveApiConfig），验证走 callUserModel ping
 *  - Key 仅保存在本设备；不展示完整 Key；日志不输出；不上传 analytics
 *  - 边界：本页配置的是「用户自己的 API Key」（客户端 LLM 能力）；与 Lingxi server-side
 *    DashScope/DeepSeek service key 是两回事，绝不把服务端 key 下发 Android，也不影响 Speaking backend E2E
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

    SubPage("AI 服务配置", onBack = { onDone() }, innerPadding = innerPadding) {
        Spacer(Modifier.height(12.dp))
        Text("启用更强大的 AI 能力", style = Type.subHeading, color = Ink)
        Spacer(Modifier.height(6.dp))
        Note(
            "配置你自己的 API Key，即可调用你选择的 AI 模型进行口语评分、写作批改等功能。",
            variant = NoteVariant.PLAIN,
        )
        Spacer(Modifier.height(20.dp))

        // 服务提供商（DeepSeek 推荐）
        Text("服务提供商", style = Type.uiLabel)
        Spacer(Modifier.height(6.dp))
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
        Spacer(Modifier.height(16.dp))

        // API Key（掩码 + 👁）
        Text("API Key", style = Type.uiLabel)
        Spacer(Modifier.height(6.dp))
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
        Spacer(Modifier.height(16.dp))

        // 保存并验证
        val valid = baseUrl.isNotBlank() && apiKey.isNotBlank() && model.isNotBlank()
        PrimaryButton(
            text = when {
                testing -> "验证中…"
                else -> "保存并验证"
            },
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
                        testMsg = "连接正常，当前配置可以使用。"
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
        Spacer(Modifier.height(12.dp))

        // 状态
        when {
            testing -> StatusLine(Bronze, "正在验证连接…")
            apiKey.isBlank() || baseUrl.isBlank() -> StatusLine(InkMeta, "尚未配置")
            lastTestOk -> StatusLine(Pos, "连接正常")
            else -> StatusLine(Amber, if (testMsg != null) "连接未通过，可查看下方提示" else "密钥已保存，可进行连接测试")
        }
        if (testMsg != null) {
            Spacer(Modifier.height(8.dp))
            Note(testMsg.orEmpty(), variant = if (lastTestOk) NoteVariant.ACCENT else NoteVariant.BRONZE)
        }
        Spacer(Modifier.height(16.dp))

        // 高级选项（Base URL / 模型名 / 协议）——默认折叠，视觉稿不展示
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { advanced = !advanced },
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("高级选项", style = Type.uiLabel)
            Text(if (advanced) "收起" else "展开", style = Type.uiLabel.copy(color = Accent))
        }
        if (advanced) {
            Spacer(Modifier.height(12.dp))
            if (isCustom) {
                Text("接口协议", style = Type.uiLabel)
                Spacer(Modifier.height(6.dp))
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
                Spacer(Modifier.height(12.dp))
            } else {
                Note("协议 · ${protocolEnum.label}（选择厂商已自动设定）", variant = NoteVariant.PLAIN)
                Spacer(Modifier.height(12.dp))
            }
            if (isCustom) {
                ApiField("接口地址 Endpoint URL", baseUrl, { baseUrl = it; testMsg = null }, "https://api.example.com/v1")
            } else {
                Note(
                    "接口地址 · ${baseUrl.ifBlank { "选择自定义服务商后可设置" }}（由所选服务商自动设定）",
                    variant = NoteVariant.PLAIN,
                )
            }
            Spacer(Modifier.height(12.dp))
            ApiField("模型名", model, { model = it; testMsg = null }, "deepseek-chat")
            Spacer(Modifier.height(12.dp))
        }
        Spacer(Modifier.height(16.dp))

        GhostButton("清除配置（回退离线）", onClick = {
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
        })
        Spacer(Modifier.height(20.dp))

        // 使用说明
        SectionLabel("使用说明")
        Spacer(Modifier.height(8.dp))
        Note(
            buildString {
                appendLine("· 你的 API Key 仅保存在本设备")
                appendLine("· 不会上传到我们的服务器")
                appendLine("· 建议使用官方渠道的 API Key")
                append("· 如遇问题可在关于页面查看帮助")
            },
            variant = NoteVariant.PLAIN,
        )
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun StatusLine(color: androidx.compose.ui.graphics.Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(text, style = Type.bodySmall.copy(color = color))
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
        Spacer(Modifier.height(6.dp))
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
