package com.ielts.app.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.core.llm.*
import kotlinx.coroutines.launch

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
    var testing by remember { mutableStateOf(false) }
    var testMsg by remember { mutableStateOf<String?>(null) }
    var saved by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()
    val protocolEnum = runCatching { LlmProtocol.valueOf(protocol) }.getOrDefault(LlmProtocol.OPENAI)
    val isCustom = selectedKey == "custom" || selectedKey == ""
    val authHint = remember(protocolEnum) {
        when (protocolEnum) {
            LlmProtocol.OPENAI -> "OpenAI 兼容接口：请求头带 Authorization: Bearer <你的 Key>。"
            LlmProtocol.ANTHROPIC -> "Anthropic 原生接口：以 x-api-key 头传递密钥，并需 anthropic-version: 2023-06-01。"
            LlmProtocol.GEMINI -> "Google 原生接口：API Key 直接拼入 URL（?key=...），无需 Bearer。"
        }
    }

    val onSelectProvider: (LlmProvider) -> Unit = { p ->
        selectedKey = p.key
        search = p.label
        if (p.key != "custom") {
            baseUrl = p.baseUrl
            model = p.model
            protocol = p.protocol.name
        }
        saved = false
        testMsg = null
    }

    SubPage("API 配置", onBack = { onDone() }, innerPadding = innerPadding) {
        Spacer(Modifier.height(12.dp))
        Note(
            "接入你自己的模型接口（支持市场上绝大多数厂商）。密钥仅保存在本机，不会上传，也不会写入安装包。",
            variant = NoteVariant.BRONZE,
        )
        Spacer(Modifier.height(20.dp))

        // 模型提供商下拉（搜索 + 国内/海外/自定义分组）
        Text("模型提供商", style = Type.uiLabel)
        Spacer(Modifier.height(6.dp))
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it },
        ) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it; expanded = true },
                modifier = Modifier.menuAnchor().fillMaxWidth(),
                placeholder = { Text("搜索或选择厂商", style = Type.bodySmall, color = InkMeta) },
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
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
            ) {
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
                                text = { Text(p.label, style = Type.body) },
                                onClick = { onSelectProvider(p); expanded = false },
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        // 自定义时暴露协议选择
        if (isCustom) {
            Text("接口协议", style = Type.uiLabel)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LlmProtocol.entries.forEach { pr ->
                    GhostButton(
                        text = pr.label,
                        modifier = Modifier.weight(1f),
                        selected = protocolEnum == pr,
                        onClick = { protocol = pr.name; saved = false; testMsg = null },
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        } else {
            Note("协议 · ${protocolEnum.label}（选择厂商已自动设定）", variant = NoteVariant.PLAIN)
            Spacer(Modifier.height(16.dp))
        }

        ApiField("API Base URL", baseUrl, { baseUrl = it; saved = false; testMsg = null }, "https://api.siliconflow.cn/v1", true)
        Spacer(Modifier.height(16.dp))
        ApiField("API Key", apiKey, { apiKey = it; saved = false; testMsg = null }, "sk-...", true, password = true)
        Spacer(Modifier.height(16.dp))
        ApiField("模型名", model, { model = it; saved = false; testMsg = null }, "deepseek-chat", true)
        Spacer(Modifier.height(16.dp))

        Note(authHint, variant = NoteVariant.BRONZE)
        Spacer(Modifier.height(20.dp))

        val valid = baseUrl.isNotBlank() && apiKey.isNotBlank() && model.isNotBlank()
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PrimaryButton(
                text = if (testing) "测试中…" else "测试连接",
                modifier = Modifier.weight(1f),
                enabled = valid && !testing,
                onClick = {
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
                            testMsg = "连接成功，已记录为可用。"
                            saveApiConfig(cfg.copy(lastTestOk = true))
                        } else {
                            lastTestOk = false
                            testMsg = "连接失败：请检查端点、密钥与模型名是否匹配所选协议。"
                            saveApiConfig(cfg.copy(lastTestOk = false))
                        }
                    }
                },
            )
            GhostButton(
                text = "保存",
                modifier = Modifier.weight(1f),
                onClick = {
                    saveApiConfig(ApiConfig(baseUrl.trim(), apiKey.trim(), model.trim(), protocol, lastTestOk))
                    saved = true
                    testMsg = null
                },
            )
        }
        Spacer(Modifier.height(12.dp))
        if (saved) {
            Note(
                "配置已保存。口语分析、报告生成、单词释义与学习建议将优先使用你的接口；未填写或调用失败时，自动回退到本机离线逻辑。",
                variant = NoteVariant.PLAIN,
            )
            Spacer(Modifier.height(12.dp))
        }
        if (testMsg != null) {
            Note(testMsg!!, variant = if (lastTestOk) NoteVariant.ACCENT else NoteVariant.BRONZE)
            Spacer(Modifier.height(12.dp))
        }
        GhostButton(
            text = "清除配置（回退离线）",
            onClick = {
                saveApiConfig(ApiConfig())
                selectedKey = ""
                search = ""
                baseUrl = ""
                apiKey = ""
                model = ""
                protocol = LlmProtocol.OPENAI.name
                lastTestOk = false
                saved = false
                testMsg = null
            },
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
    singleLine: Boolean = true,
    password: Boolean = false,
) {
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = Type.uiLabel)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, style = Type.bodySmall, color = InkMeta) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = singleLine,
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
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
