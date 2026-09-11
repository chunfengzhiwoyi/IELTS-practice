package com.ielts.core.model

import kotlinx.serialization.Serializable

// ----------------------------- 持久化实体（可序列化） -----------------------------

enum class LearningStatus {
    NEW, EXPOSED, RECALLED_WITH_HELP, RECALLED_INDEPENDENTLY
}

enum class EventCorrectness {
    FAIL, HINTED, INDEPENDENT, SKIPPED
}

@Serializable
data class UserItemState(
    val userId: String,
    val itemId: String,
    val status: LearningStatus,
    val recognitionLevel: Int,
    val recallLevel: Int,
    val applicationLevel: Int,
    val consecutiveCorrect: Int,
    val currentIntervalDays: Double,
    val nextReviewAt: String,
    val updatedAt: String,
)

@Serializable
data class LearningEvent(
    val id: String,
    val userId: String,
    val itemId: String,
    val eventType: String,           // "NEW" | "REVIEW"
    val taskType: String,
    val answer: String,
    val correctness: EventCorrectness,
    val hintLevel: Int,
    val resultJson: Map<String, String> = emptyMap(),
    val clientEventId: String,
    val traceId: String,
    val createdAt: String,
    val durationMs: Long = 0,
)

@Serializable
data class SpeakingIssue(
    val dimension: String,           // "fluency" | "coherence" | "development"
    val severity: String,            // "minor" | "major"
    val description: String,
    val suggestion: String,
)

@Serializable
data class MicroDrill(
    val prompt: String,
    val exampleImprovement: String,
    val targetDimension: String,
)

@Serializable
data class SpeakingMetrics(
    val wordCount: Int,
    val sentenceCount: Int,
    val connectorCount: Int,
    val uniqueWordRatio: Double = 0.0,
    val paraphraseScore: Double = 0.0,
)

@Serializable
data class SpeakingAnalysisResult(
    val candidateIssues: List<SpeakingIssue>,
    val mainIssue: SpeakingIssue,
    val microDrill: MicroDrill,
    val metrics: SpeakingMetrics,
    val summary: String,
)

@Serializable
data class SpeakingSession(
    val id: String,
    val userId: String,
    val questionId: String,
    val part: String,
    val topic: String,
    val question: String,
    val firstAnswer: String? = null,
    val firstAnalysis: SpeakingAnalysisResult? = null,
    val secondAnswer: String? = null,
    val secondAnalysis: SpeakingAnalysisResult? = null,
    val status: String,             // "IN_PROGRESS" | "COMPLETED"
    val createdAt: String,
    val updatedAt: String,
    val durationMs: Long = 0,
)

@Serializable
data class ProfileData(
    val nickname: String = "",
    val avatarUrl: String = "",
    val monogramColor: String = "ink", // "ink" | "accent" | "bronze"
)

// ----------------------------- 种子数据 -----------------------------

@Serializable
data class ExpectedLength(val min: Int, val ideal: Int, val max: Int = 200)

@Serializable
data class SpeakingQuestion(
    val questionId: String,
    val part: String,
    val topic: String,
    val question: String,
    val questionZh: String = "",
    val followUps: List<String> = emptyList(),
    val expectedLength: ExpectedLength,
    val keyTopicWords: List<String> = emptyList(),
    val goodConnectors: List<String> = emptyList(),
    val dimensions: List<String> = emptyList(),
)

@Serializable
data class SeedLearningItem(
    val itemId: String,
    val term: String,
    val normalizedTerm: String,
    val itemType: String,
    val phonetic: String = "",
    val partOfSpeech: String = "",
    val coreMeaning: String = "",
    val usageContext: String = "",
    val collocations: List<String> = emptyList(),
    val exampleSentence: String = "",
    val exampleTranslation: String = "",
    val commonMistake: String = "",
    val topicTags: List<String> = emptyList(),
    val acceptedAnswers: List<String> = emptyList(),
    val answerKeywords: List<String> = emptyList(),
)

// ----------------------------- UI 用 DTO（运行时计算，非持久化） -----------------------------

data class NextStep(val title: String, val body: String)

data class TodaySummary(
    val dayNumber: Int,
    val streak: Int,
    val due: Int,
    val newCount: Int,
    val speakingCount: Int,
    val minutes: Int,
    val hasDue: Boolean,
    val nextStep: NextStep,
)

data class LearnCard(
    val itemId: String,
    val term: String,
    val phonetic: String,
    val partOfSpeech: String,
    val clue: String,
    val meaning: String,
    val exampleSentence: String,
    val exampleTranslation: String,
    val alreadyLearned: Boolean,
    val totalInDeck: Int,
    val indexInDeck: Int,
)

data class ReviewTask(
    val itemId: String,
    val term: String,
    val prompt: String,
    val coreMeaning: String,
    val clue: String,
    val acceptedAnswers: List<String>,
    val answerKeywords: List<String>,
)

data class MasteredItem(val term: String, val meaning: String)

data class DayActivity(
    val key: String,
    val label: String,
    val hasActivity: Boolean,
    val isToday: Boolean,
    val count: Int,
)

/** 知识点掌握分布（四态互斥，合计 = totalItems） */
data class StatusDistribution(
    val new: Int = 0,
    val learning: Int = 0,
    val reviewing: Int = 0,
    val mastered: Int = 0,
)

data class MiniReport(
    val totalItems: Int,
    val dueNow: Int,
    val streak: Int,
    val speakingCompleted: Int,
    val newThisWeek: Int,
    val reviewedThisWeek: Int,
    val masteredCount: Int,
    val daysActiveThisWeek: Int,
    val recentMastered: List<MasteredItem>,
    val weeklyActivity: List<DayActivity>,
    val weeklyGoal: Int,
    val lastWeekTotal: Int,
    /** 本周学习时长（秒）：NEW+REVIEW 事件 + 完成口语会话的 durationMs 之和 */
    val studySecondsThisWeek: Long = 0,
    /** 上周同期学习时长（秒） */
    val studySecondsLastWeek: Long = 0,
    /** 知识点掌握分布（四态） */
    val statusDistribution: StatusDistribution = StatusDistribution(),
    /** 复习正确率 0–100（本周 REVIEW 事件中非 FAIL/SKIPPED 占比） */
    val reviewCorrectRate: Int = 0,
    val nextStep: NextStep,
)

/** 备考目标档案（独立 JSON，不污染昵称/头像 ProfileData） */
@Serializable
data class GoalProfile(
    /** 考试日期 ISO yyyy-mm-dd；未设定为 null */
    val examDate: String? = null,
    /** 目标总分（如 6.5） */
    val targetBand: Double = 6.5,
    /** 当前自估分（4.0–7.0） */
    val currentBand: Double = 5.0,
    /** 每日可投入学习分钟 */
    val dailyMinutes: Int = 30,
    /** 生成或自定义得到的周目标词数；回填 K_GOAL，与本周成就/报告共享 */
    val weeklyWordTarget: Int = 200,
    /** 首次设定时间 ISO；用于按真实流逝周数推进阶段进度 */
    val setAt: String? = null,
    /** 设定时的总周数快照（考试日→设定日）；阶段进度分母 */
    val plannedWeeks: Int? = null,
)
