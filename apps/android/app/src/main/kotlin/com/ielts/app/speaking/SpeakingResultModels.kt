package com.ielts.app.speaking

/**
 * SPEAKING_RESULT_V2 UI 模型 —— 仅承载 Result 页面需要展示的字段。
 *
 * 来源映射（Content Remap Only，见 docs/product/SPEAKING_RESULT_V2-DESIGN-REVIEW.md §3）：
 * - overall            ← ieltsAnalysis.overallDiagnosis（fallback 时 summary）
 * - wordCount/sentence ← metrics
 * - evidencePoints     ← strong/adequate 维度的 evidence（派生，非 strengths）
 * - mainIssue*         ← mainIssue（major→优先改进 / minor→可以优化）
 * - nextSteps          ← prioritizedSuggestions ≤3，缺失时 mainIssue.suggestion
 * - dimensions         ← ieltsAnalysis 四维（发音无评估数据时 level=null）
 *
 * 禁止：Band 数字 / sentence-level 数据 / 独立词汇表达。
 */
enum class ResultLevel(val label: String) {
    STRONG("强"),
    ADEQUATE("良好"),
    DEVELOPING("发展中"),
    WEAK("待加强");

    companion object {
        /** 与 Web contract 的 level 枚举一一对应；未知值返回 null（= 未评估）。 */
        fun from(level: String?): ResultLevel? = when (level) {
            "strong" -> STRONG
            "adequate" -> ADEQUATE
            "developing" -> DEVELOPING
            "weak" -> WEAK
            else -> null
        }
    }
}

/** 能力分析中的单维度卡片。level=null 表示该维度本次未评估（如发音）。 */
data class ResultDimensionCard(
    val name: String,
    val level: ResultLevel?,
    val evidence: List<String> = emptyList(),
    val issues: List<String> = emptyList(),
    val suggestions: List<String> = emptyList(),
) {
    val assessed: Boolean get() = level != null
}

/** Result Summary / Detail 共用视图状态。 */
data class ResultSummaryModel(
    val overall: String,
    val wordCount: Int,
    val sentenceCount: Int,
    val evidencePoints: List<String> = emptyList(),
    val mainIssueLabel: String,
    val mainIssueDescription: String,
    val nextSteps: List<String> = emptyList(),
    val dimensions: List<ResultDimensionCard> = emptyList(),
    /** fallback：无完整 ieltsAnalysis，无数据模块整卡隐藏 */
    val isFallback: Boolean = false,
    /** needs_review：顶部轻提示，不暴露技术原因 */
    val needsReview: Boolean = false,
) {
    /** 能力分析是否有可评估维度（fallback 时无 → Detail 不渲染「能力分析」tab） */
    val hasAbilityAnalysis: Boolean get() = dimensions.any { it.assessed }
    val hasEvidence: Boolean get() = evidencePoints.isNotEmpty()
}
