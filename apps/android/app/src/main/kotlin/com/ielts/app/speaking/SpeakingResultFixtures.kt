package com.ielts.app.speaking

/**
 * Result V2 结果页专用 fixture —— contract 级（非 UI 级），经 SpeakingResultMapper 映射。
 * 内容为示例数据，仅用于视觉验收；字段与 Web contract 对齐，禁止发明字段、禁止 Band。
 */
object SpeakingResultFixtures {

    /** 正常态：完整 ieltsAnalysis（四维，发音未评估）+ major 问题 + 3 条建议。 */
    fun full(): ContractSpeakingResult = ContractSpeakingResult(
        summary = "回答围绕阅读话题展开，观点清楚，理由具体。整体表达较为流畅，语法错误较少。",
        metrics = ContractSpeakingMetrics(wordCount = 87, sentenceCount = 9),
        mainIssue = ContractMainIssue(
            dimension = "grammaticalRange",
            severity = "major",
            description = "时态切换不够稳定，一般现在时与一般过去时混用影响表达准确度。",
            suggestion = "先确定时间框架再开口，练习一般现在时与过去时的切换",
        ),
        ieltsAnalysis = ContractIeltsAnalysis(
            fluency = ContractDimensionAnalysis(
                label = "流利度",
                level = "adequate",
                evidence = listOf(
                    "回答长度约 87 词，符合 Part 1 建议范围",
                    "句间使用 of course、to be honest 自然过渡",
                ),
                issues = listOf("个别句子之间停顿略长"),
                suggestions = listOf("在观点前保持简短停顿，让节奏更自然"),
            ),
            lexicalResource = ContractDimensionAnalysis(
                label = "词汇资源",
                level = "developing",
                evidence = listOf(
                    "使用 paper books、reading habit 等话题词汇",
                    "对 fiction 有同义替换的尝试",
                ),
                issues = listOf("部分重复题目原词，替换幅度有限"),
                suggestions = listOf("用 novel、non-fiction 替换重复表达"),
            ),
            grammaticalRange = ContractDimensionAnalysis(
                label = "语法范围",
                level = "weak",
                evidence = listOf(
                    "能使用 because、which 连接从句",
                    "出现一般现在时与一般过去时混用",
                ),
                issues = listOf("时态切换不够稳定"),
                suggestions = listOf("先确定时间框架再开口，专项练习时态切换"),
            ),
            pronunciation = null,
            overallDiagnosis = "回答围绕阅读话题展开，观点清楚，理由具体。整体表达较为流畅，语法错误较少。",
            prioritizedSuggestions = listOf(
                "先确定时间框架再开口，练习一般现在时与过去时的切换",
                "把长句拆成两三个短句，用 because / which 连接",
                "用更具体的频率表达，如 three or four times a week",
            ),
        ),
        qualityWarning = null,
    )

    /** 正常态映射后的 UI 模型（默认注入给结果页）。 */
    fun fullUi(): ResultSummaryModel = SpeakingResultMapper.map(full())

    /** Fallback：无 ieltsAnalysis —— 仅保留整体评价 / 优先改进 / 下一步怎么练。 */
    fun fallback(): ContractSpeakingResult = ContractSpeakingResult(
        summary = "回答围绕阅读话题展开，观点清楚，理由具体。整体表达较为流畅，语法错误较少。",
        metrics = ContractSpeakingMetrics(wordCount = 87, sentenceCount = 9),
        mainIssue = ContractMainIssue(
            dimension = "grammaticalRange",
            severity = "major",
            description = "时态切换不够稳定，一般现在时与一般过去时混用影响表达准确度。",
            suggestion = "先确定时间框架再开口，练习一般现在时与过去时的切换",
        ),
        ieltsAnalysis = null,
        qualityWarning = null,
    )

    fun fallbackUi(): ResultSummaryModel = SpeakingResultMapper.map(fallback())

    /** NEEDS_REVIEW：qualityWarning 存在（分析信息不完整），其余与正常态一致。 */
    fun needsReview(): ContractSpeakingResult = full().copy(
        qualityWarning = ContractQualityWarning(score = 60, issues = listOf("evidence 信息不完整")),
    )

    fun needsReviewUi(): ResultSummaryModel = SpeakingResultMapper.map(needsReview())

    /** minor 严重度：优先改进卡标题应映射为「可以优化」。 */
    fun minorIssueUi(): ResultSummaryModel =
        SpeakingResultMapper.map(full().copy(mainIssue = full().mainIssue.copy(severity = "minor")))
}
