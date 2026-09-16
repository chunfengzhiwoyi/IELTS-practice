package com.ielts.app.speaking

/**
 * Web contract 的 Kotlin 镜像（仅结果页 UI 使用到的字段）。
 *
 * 与 lib/speaking/types.ts 保持字段一致，禁止发明字段：
 * - SpeakingAnalysisResult{ summary, metrics{wordCount,sentenceCount}, mainIssue, ieltsAnalysis?, qualityWarning? }
 * - IeltsSpeakingAnalysis{ fluency, lexicalResource, grammaticalRange, pronunciation, overallDiagnosis, prioritizedSuggestions[] }
 * - DimensionAnalysis{ label, level?, evidence[], issues[], suggestions[] }
 *
 * level / severity 使用与 Web 相同的字符串值，由 mapper 稳定映射为 UI 枚举。
 */
data class ContractDimensionAnalysis(
    val label: String,
    val level: String?,
    val evidence: List<String> = emptyList(),
    val issues: List<String> = emptyList(),
    val suggestions: List<String> = emptyList(),
)

data class ContractIeltsAnalysis(
    val fluency: ContractDimensionAnalysis? = null,
    val lexicalResource: ContractDimensionAnalysis? = null,
    val grammaticalRange: ContractDimensionAnalysis? = null,
    val pronunciation: ContractDimensionAnalysis? = null,
    val overallDiagnosis: String = "",
    val prioritizedSuggestions: List<String> = emptyList(),
)

data class ContractMainIssue(
    val dimension: String = "",
    val severity: String = "major", // "major" | "minor"
    val description: String = "",
    val suggestion: String = "",
)

data class ContractSpeakingMetrics(
    val wordCount: Int = 0,
    val sentenceCount: Int = 0,
)

data class ContractQualityWarning(
    val score: Int = 0,
    val issues: List<String> = emptyList(),
)

data class ContractSpeakingResult(
    val summary: String = "",
    val metrics: ContractSpeakingMetrics = ContractSpeakingMetrics(),
    val mainIssue: ContractMainIssue = ContractMainIssue(),
    val ieltsAnalysis: ContractIeltsAnalysis? = null,
    val qualityWarning: ContractQualityWarning? = null,
)
