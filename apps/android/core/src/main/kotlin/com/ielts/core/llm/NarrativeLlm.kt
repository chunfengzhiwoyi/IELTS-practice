package com.ielts.core.llm

import com.ielts.core.model.TodaySummary

/**
 * 用用户接口给单词做更地道的拓展讲解；无配置或调用失败返回 null，由界面隐藏入口。
 */
suspend fun explainWord(
    term: String,
    meaning: String,
    exampleSentence: String,
    exampleTranslation: String,
): String? {
    val cfg = getApiConfig()
    if (!cfg.isValid) return null
    val system = "你是英语词典编辑，请用中文为雅思学习者讲解一个单词。只返回纯文本（不超过 160 字），分两段：第一段给出更地道的用法辨析与常见搭配；第二段给出一句新的原创例句，并在句后用『』括起中文翻译。不要 markdown、不要表情符号、不要额外前缀。"
    val user = "单词：$term\n核心含义：$meaning\n教材例句：$exampleSentence\n教材例句翻译：$exampleTranslation\n请讲解。"
    return callUserModel(cfg, system, user, temperature = 0.5, maxTokens = 500, jsonMode = false)
}

/**
 * 用用户接口生成一句「今日学习建议」；无配置或调用失败返回 null。
 */
suspend fun suggestToday(summary: TodaySummary): String? {
    val cfg = getApiConfig()
    if (!cfg.isValid) return null
    val system = "你是雅思学习教练，请用中文给学习者一句 40 字内的今日学习建议，具体、可执行，不要套话，不要表情符号，不要额外前缀。"
    val user = "今日情况：第 ${summary.dayNumber} 天，连续 ${summary.streak} 天，待复习 ${summary.due} 个，本期已学 ${summary.newCount} 个，口语已练 ${summary.speakingCount} 次。下一步方向：${summary.nextStep.title}。"
    return callUserModel(cfg, system, user, temperature = 0.6, maxTokens = 200, jsonMode = false)
}
