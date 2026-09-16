package com.ielts.app.speaking

/**
 * contract → Result V2 UI 的稳定映射（CONTENT REMAP ONLY）。
 * 不改底层 analyzer contract；只做字段重映射与派生，禁止发明字段。
 */
object SpeakingResultMapper {

    /** 固定维度展示名（与已批准视觉稿一致：流利度 / 词汇资源 / 语法范围 / 发音）。 */
    private val dimensionKeys = listOf("fluency", "lexicalResource", "grammaticalRange", "pronunciation")

    private val maxNextSteps = 3
    private val maxEvidencePerDimension = 2

    fun map(r: ContractSpeakingResult): ResultSummaryModel {
        val ia = r.ieltsAnalysis
        val isFallback = ia == null

        // 整体评价：优先整体诊断，fallback 用 summary
        val overall = ia?.overallDiagnosis?.takeIf { it.isNotBlank() } ?: r.summary

        // 表现证据：从 strong/adequate 维度 evidence 中稳定抽取（不是 strengths）
        val evidence = buildList {
            if (ia != null) {
                // 展示顺序与已批准视觉稿一致：词汇资源在前
                val dims = listOf(
                    dimensionOf(ia, "lexicalResource"),
                    dimensionOf(ia, "fluency"),
                    dimensionOf(ia, "grammaticalRange"),
                    dimensionOf(ia, "pronunciation"),
                )
                for ((name, d) in dims) {
                    val lvl = ResultLevel.from(d?.level)
                    if (lvl == ResultLevel.STRONG || lvl == ResultLevel.ADEQUATE) {
                        d?.evidence?.take(maxEvidencePerDimension)?.forEach { e ->
                            if (e.isNotBlank()) add("$name · $e")
                        }
                    }
                }
            }
        }

        // 下一步怎么练：prioritizedSuggestions ≤3，缺失则 mainIssue.suggestion
        val nextSteps = if (ia != null && ia.prioritizedSuggestions.isNotEmpty()) {
            ia.prioritizedSuggestions.filter { it.isNotBlank() }.take(maxNextSteps)
        } else {
            listOfNotNull(r.mainIssue.suggestion.takeIf { it.isNotBlank() })
        }

        return ResultSummaryModel(
            overall = overall,
            wordCount = r.metrics.wordCount,
            sentenceCount = r.metrics.sentenceCount,
            evidencePoints = evidence,
            mainIssueLabel = if (r.mainIssue.severity == "minor") "可以优化" else "优先改进",
            mainIssueDescription = r.mainIssue.description,
            nextSteps = nextSteps,
            dimensions = if (ia == null) emptyList() else dimensionCards(ia),
            isFallback = isFallback,
            needsReview = r.qualityWarning != null,
        )
    }

    private fun dimensionOf(ia: ContractIeltsAnalysis, key: String): Pair<String, ContractDimensionAnalysis?> =
        when (key) {
            "fluency" -> "流利度" to ia.fluency
            "lexicalResource" -> "词汇资源" to ia.lexicalResource
            "grammaticalRange" -> "语法范围" to ia.grammaticalRange
            else -> "发音" to ia.pronunciation
        }

    private fun dimensionCards(ia: ContractIeltsAnalysis): List<ResultDimensionCard> =
        dimensionKeys.map { key ->
            val (name, d) = dimensionOf(ia, key)
            ResultDimensionCard(
                name = name,
                level = ResultLevel.from(d?.level),
                evidence = d?.evidence ?: emptyList(),
                issues = d?.issues ?: emptyList(),
                suggestions = d?.suggestions ?: emptyList(),
            )
        }
}
