package com.ielts.core.service

import com.ielts.core.storage.Store
import com.ielts.core.llm.callUserModel
import com.ielts.core.llm.extractJsonObject
import com.ielts.core.llm.getApiConfig
import com.ielts.core.client.computeStreak
import com.ielts.core.client.buildNextStep
import com.ielts.core.client.NextStepInput
import com.ielts.core.client.formatCNDate
import com.ielts.core.client.localDayKey
import com.ielts.core.client.parseIso
import com.ielts.core.client.normalizeTerm
import com.ielts.core.client.stableItemId
import com.ielts.core.model.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import com.ielts.core.schedule.InitialScheduleQuality
import com.ielts.core.schedule.ReviewScheduleQuality
import com.ielts.core.schedule.computeInitialReviewAt
import com.ielts.core.schedule.computeReviewNextAt
import java.time.Instant
import java.util.Calendar
import java.util.Date
import kotlin.math.*

// ---------------- 存储键（沿用小程序约定） ----------------
private const val K_STATES = "states"
private const val K_EVENTS = "events"
private const val K_SESSIONS = "speaking_sessions"
private const val K_ITEMS = "items"
private const val K_PROFILE = "profile"

// ---------------- 基础读写 ----------------
private fun getStates(): MutableMap<String, UserItemState> =
    Store.getJSON<MutableMap<String, UserItemState>>(K_STATES) ?: mutableMapOf()

private fun saveStates(s: Map<String, UserItemState>) = Store.setJSON(K_STATES, s)

private fun getEvents(): MutableList<LearningEvent> =
    Store.getJSON<MutableList<LearningEvent>>(K_EVENTS) ?: mutableListOf()

private fun saveEvents(e: List<LearningEvent>) = Store.setJSON(K_EVENTS, e)

private fun getSessions(): MutableList<SpeakingSession> =
    Store.getJSON<MutableList<SpeakingSession>>(K_SESSIONS) ?: mutableListOf()

private fun saveSessions(s: List<SpeakingSession>) = Store.setJSON(K_SESSIONS, s)

fun getProfile(): ProfileData = Store.getJSON<ProfileData>(K_PROFILE) ?: ProfileData()
fun saveProfile(p: ProfileData) = Store.setJSON(K_PROFILE, p)

// ---------------- 周目标（与本周成就、学习报告共享，本端持久化；云端缝合缝已留） ----------------
private const val K_GOAL = "weeklyGoal"
private const val K_GOAL_PROFILE = "goalProfile"
private const val DEFAULT_WEEKLY_GOAL = 200
private const val MS_WEEK = 7L * 86_400_000L

/** 备考目标档案（独立 JSON，不污染昵称/头像） */
fun getGoalProfile(): GoalProfile {
    val p = Store.getJSON<GoalProfile>(K_GOAL_PROFILE)
    if (p != null) {
        return p.copy(
            weeklyWordTarget = if (p.weeklyWordTarget > 0) p.weeklyWordTarget else legacyGoal(),
            setAt = p.setAt,
            plannedWeeks = p.plannedWeeks,
        )
    }
    return GoalProfile(weeklyWordTarget = legacyGoal())
}
fun saveGoalProfile(p: GoalProfile) {
    val prev = Store.getJSON<GoalProfile>(K_GOAL_PROFILE)
    val setAt = p.setAt ?: prev?.setAt ?: Instant.now().toString()
    val plannedWeeks = if (p.examDate != null) {
        val exam = parseIso(p.examDate + "T00:00:00").time
        maxOf(1, ceil((exam - System.currentTimeMillis()).toDouble() / MS_WEEK).toInt())
    } else null
    Store.setJSON(K_GOAL_PROFILE, p.copy(setAt = setAt, plannedWeeks = plannedWeeks))
}

private fun legacyGoal(): Int = Store.getJSON<Int>(K_GOAL) ?: DEFAULT_WEEKLY_GOAL

fun getWeeklyGoal(): Int = getGoalProfile().weeklyWordTarget.takeIf { it > 0 } ?: DEFAULT_WEEKLY_GOAL
fun setWeeklyGoal(n: Int) {
    val v = maxOf(1, n.takeIf { it > 0 } ?: DEFAULT_WEEKLY_GOAL)
    val p = getGoalProfile()
    saveGoalProfile(p.copy(weeklyWordTarget = v))
}

// ---------------- 备考目标：智能生成（纯函数，逻辑对齐小程序 @ielts/core/plan.ts） ----------------
data class StudyHistory(
    val avgWeeklyStudySeconds: Long,
    val learnedWords: Int,
    val masteredCount: Int,
    val streak: Int,
)

enum class Feasibility { Comfortable, Tight, AtRisk }

data class StudyPlanPhase(val name: String, val weeks: Int, val weeklyWords: Int, val focus: String)

data class StudyPlan(
    val weeksRemaining: Int,
    val recommendedWeeklyWords: Int,
    val dailyMinutes: Int,
    val phases: List<StudyPlanPhase>,
    val feasibility: Feasibility,
    val note: String,
    val adaptive: Boolean,
)

data class StudyPlanContext(
    val examDate: String?,
    val targetBand: Double,
    val currentBand: Double,
    val dailyMinutes: Int,
    val history: StudyHistory,
)

/** 近 N 周学习概况，供「备考目标」页的「当前情况」与智能生成使用 */
fun getStudyHistory(weeks: Int = 4): StudyHistory {
    val states = getStates()
    val events = getEvents()
    val sessions = getSessions()
    val totalItems = states.size
    val masteredCount = states.values.count { it.status == LearningStatus.RECALLED_INDEPENDENTLY }
    val streak = computeStreak(events)
    val cutoff = System.currentTimeMillis() - weeks * 7L * 86_400_000L
    val secSum =
        events.filter { (it.eventType == "NEW" || it.eventType == "REVIEW") && parseIso(it.createdAt).time >= cutoff }
            .sumOf { it.durationMs } +
        sessions.filter { it.status == "COMPLETED" && parseIso(it.updatedAt).time >= cutoff }
            .sumOf { it.durationMs }
    val avgWeeklyStudySeconds = if (weeks > 0) secSum / 1000 / weeks else 0L
    return StudyHistory(avgWeeklyStudySeconds, totalItems, masteredCount, streak)
}

fun generateStudyPlan(ctx: StudyPlanContext): StudyPlan {
    val now = System.currentTimeMillis()
    val weeksRemaining = if (ctx.examDate != null) {
        val exam = parseIso(ctx.examDate + "T00:00:00").time
        maxOf(1, ceil((exam - now).toDouble() / (7 * 86_400_000.0)).toInt())
    } else 12

    val targetVocab = max(500, ((ctx.targetBand - ctx.currentBand) * 1000).roundToInt())
    val rawNeeded = ceil(targetVocab.toDouble() / weeksRemaining).toInt()

    val historyDailyMin = ctx.history.avgWeeklyStudySeconds / 60.0 / 7.0
    var adaptive = false
    var effectiveDaily = ctx.dailyMinutes
    if (historyDailyMin > 0 && historyDailyMin < ctx.dailyMinutes * 0.6) {
        effectiveDaily = max(5, historyDailyMin.roundToInt())
        adaptive = true
    }
    val weeklyCap = floor((effectiveDaily * 7) / 1.5).toInt()
    val recommended = min(rawNeeded, weeklyCap)
    val clamped = recommended.coerceIn(20, 400)

    val total = weeksRemaining
    val baseWeeks = max(1, (total * 0.4).roundToInt())
    val sprintWeeks = max(1, (total * 0.4).roundToInt())
    val finalWeeks = max(1, total - baseWeeks - sprintWeeks)
    val stopNewWeeks = if (ctx.examDate != null) min(2, finalWeeks) else 0
    val finalNewWeeks = max(0, finalWeeks - stopNewWeeks)
    val finalWeekly = if (finalNewWeeks > 0) (clamped * 0.6).roundToInt() else 0

    val phases = listOf(
        StudyPlanPhase("基础巩固", baseWeeks, (clamped * 0.8).roundToInt(), "建立词汇底子，每天少量但稳定"),
        StudyPlanPhase("专项突破", sprintWeeks, clamped, "按薄弱项加量，冲词汇峰值"),
        StudyPlanPhase("考前冲刺", finalWeeks, finalWeekly, if (stopNewWeeks > 0) "停止加新词，只复习已学，稳住记忆" else "巩固已学，保持手感"),
    )

    val (feasibility, baseNote) = if (rawNeeded <= weeklyCap * 0.8) {
        Feasibility.Comfortable to "按你设定的 ${effectiveDaily} 分钟/天，考前能从容覆盖目标词汇。"
    } else if (rawNeeded <= weeklyCap) {
        Feasibility.Tight to "节奏偏紧，需稳定保持 ${effectiveDaily} 分钟/天才能覆盖目标词汇。"
    } else {
        val extra = max(5, (((rawNeeded * 1.5) / 7) - effectiveDaily).roundToInt())
        Feasibility.AtRisk to "按当前投入，考前估计只能覆盖约 ${(weeklyCap * 100 / rawNeeded)}% 的目标词汇。建议每天再加 ${extra} 分钟，或把目标分调低 0.5。"
    }
    var note = baseNote
    if (adaptive) note = "按你近 4 周习惯（日均约 ${historyDailyMin.roundToInt()} 分钟），已把每日时长调到 ${effectiveDaily} 分钟，更容易坚持。${note}"
    if (ctx.examDate == null) note = "未设定考试日期，已按默认 ${weeksRemaining} 周给出建议。设定考试日期后计划会更精准。"

    return StudyPlan(weeksRemaining, clamped, effectiveDaily, phases, feasibility, note, adaptive)
}

fun resetAll() {
    Store.remove(K_STATES); Store.remove(K_EVENTS); Store.remove(K_SESSIONS)
    Store.remove(K_ITEMS); Store.remove(K_PROFILE)
}

fun formatCNDateNow(): String = formatCNDate()

// ---------------- 今日概览 ----------------
fun getTodaySummary(): TodaySummary {
    val states = getStates()
    val events = getEvents()
    val nowIso = Instant.now().toString()
    val due = states.values.count { it.nextReviewAt <= nowIso }
    val streak = computeStreak(events)

    val newEvents = events.filter { it.eventType == "NEW" }
    var dayNumber = 1
    if (newEvents.isNotEmpty()) {
        val first = newEvents.minByOrNull { it.createdAt }!!
        val days = kotlin.math.floor((System.currentTimeMillis() - parseIso(first.createdAt).time) / 86_400_000.0).toInt()
        dayNumber = days + 1
    }
    val newCount = newEvents.map { it.itemId }.toSet().size
    val speakingCount = getSessions().count { it.status == "COMPLETED" }

    val nextStep = buildNextStep(
        NextStepInput(
            dueNow = due,
            topIssueCount = 0,
            speakingCompleted = speakingCount,
            totalItems = states.size,
        ),
    )

    return TodaySummary(
        dayNumber = dayNumber,
        streak = streak,
        due = due,
        newCount = newCount,
        speakingCount = speakingCount,
        minutes = kotlin.math.max(1, kotlin.math.ceil(due * 0.5).toInt()),
        hasDue = due > 0,
        nextStep = nextStep,
    )
}

// ---------------- 学习（单卡主动回忆） ----------------
fun getLearnDeck(): List<LearnCard> {
    val states = getStates()
    val nowIso = Instant.now().toString()
    val deck = SeedData.items.filter { seed ->
        val st = states[seed.itemId]
        if (st == null) true
        else if (st.nextReviewAt > nowIso) false
        else st.status != LearningStatus.RECALLED_INDEPENDENTLY
    }.take(12)
    return deck.mapIndexed { i, s ->
        LearnCard(
            itemId = s.itemId,
            term = s.term,
            phonetic = s.phonetic,
            partOfSpeech = s.partOfSpeech,
            clue = s.collocations.firstOrNull() ?: s.topicTags.firstOrNull() ?: "",
            meaning = s.coreMeaning,
            exampleSentence = s.exampleSentence,
            exampleTranslation = s.exampleTranslation,
            alreadyLearned = states.containsKey(s.itemId),
            totalInDeck = deck.size,
            indexInDeck = i,
        )
    }
}

private fun judgeCorrect(answer: String, seed: SeedLearningItem): Boolean {
    val normalized = normalizeTerm(answer)
        .replace(Regex("[；;、，,。.（）()：:\"\'!！?？\\-—\\s]+"), "")
    if (normalized.isEmpty()) return false
    if (seed.acceptedAnswers.any {
            normalizeTerm(it).replace(Regex("[；;、，,。.（）()：:\"\'!！?？\\-—\\s]+"), "") == normalized
        }) return true
    if (seed.answerKeywords.isNotEmpty() &&
        seed.answerKeywords.all { normalized.contains(normalizeTerm(it).replace(Regex("\\s+"), "")) }
    ) return true
    return false
}

data class LearnSubmitResult(
    val correctness: EventCorrectness,
    val status: LearningStatus,
    val feedback: String,
    val nextReviewAt: String,
    val state: UserItemState,
)

fun submitLearnAnswer(
    itemId: String,
    answer: String,
    usedHint: Boolean,
    userId: String,
    durationMs: Long = 0,
): LearnSubmitResult {
    val content = SeedData.items.firstOrNull { it.itemId == itemId }
    val term = content?.term ?: itemId
    val coreMeaning = content?.coreMeaning ?: ""

    val isCorrect = content?.let { judgeCorrect(answer, it) } ?: false
    val (correctness, status, feedback, quality) = when {
        answer.isBlank() -> Quad(EventCorrectness.FAIL, LearningStatus.EXPOSED, "未提供答案，建议再试一次。", InitialScheduleQuality.EXPOSED)
        isCorrect && usedHint -> Quad(EventCorrectness.HINTED, LearningStatus.RECALLED_WITH_HELP, "正确！「$term」= $coreMeaning（用了提示，下次试着独立回忆）", InitialScheduleQuality.HINTED)
        isCorrect -> Quad(EventCorrectness.INDEPENDENT, LearningStatus.RECALLED_INDEPENDENTLY, "非常好！无提示正确回忆。「$term」= $coreMeaning", InitialScheduleQuality.INDEPENDENT)
        else -> Quad(EventCorrectness.FAIL, LearningStatus.EXPOSED, "不太对。「$term」的核心含义是：$coreMeaning", InitialScheduleQuality.FAIL)
    }
    val nextReviewAt = computeInitialReviewAt(quality)

    val event = LearningEvent(
        id = "evt-${System.currentTimeMillis()}",
        userId = userId,
        itemId = itemId,
        eventType = "NEW",
        taskType = "MEANING_RECALL",
        answer = answer,
        correctness = correctness,
        hintLevel = if (usedHint) 1 else 0,
        resultJson = emptyMap(),
        clientEventId = "$itemId-${System.currentTimeMillis()}",
        traceId = "trc-${System.currentTimeMillis()}",
        createdAt = Instant.now().toString(),
        durationMs = durationMs,
    )
    val events = getEvents().apply { add(event) }
    saveEvents(events)

    val states = getStates()
    val prev = states[itemId]
    val newState = UserItemState(
        userId = userId,
        itemId = itemId,
        status = status,
        recognitionLevel = if (correctness == EventCorrectness.INDEPENDENT) 1 else prev?.recognitionLevel ?: 0,
        recallLevel = if (correctness == EventCorrectness.INDEPENDENT) 1 else if (correctness == EventCorrectness.HINTED) 1 else 0,
        applicationLevel = 0,
        consecutiveCorrect = if (correctness == EventCorrectness.INDEPENDENT) (prev?.consecutiveCorrect ?: 0) + 1 else 0,
        currentIntervalDays = if (quality == InitialScheduleQuality.INDEPENDENT) 1.0 else if (quality == InitialScheduleQuality.HINTED) 8.0 / 24 else 2.0 / 24,
        nextReviewAt = nextReviewAt,
        updatedAt = Instant.now().toString(),
    )
    states[itemId] = newState
    saveStates(states)

    return LearnSubmitResult(correctness, status, feedback, nextReviewAt, newState)
}

private data class Quad<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)

// ---------------- 复习（间隔重复队列） ----------------
data class ReviewTaskWithTotal(val tasks: List<ReviewTask>, val totalDue: Int)

fun getReviewQueue(): ReviewTaskWithTotal {
    val states = getStates()
    val nowIso = Instant.now().toString()
    val dueItems = states.values
        .filter { it.nextReviewAt <= nowIso }
        .sortedBy { it.nextReviewAt }
        .take(10)

    val tasks = dueItems.mapNotNull { s ->
        val content = SeedData.items.firstOrNull { it.itemId == s.itemId } ?: return@mapNotNull null
        ReviewTask(
            itemId = s.itemId,
            term = content.term,
            prompt = "请回忆「${content.term}」的核心含义（中文）。",
            coreMeaning = content.coreMeaning,
            clue = content.collocations.firstOrNull() ?: content.topicTags.firstOrNull() ?: "",
            acceptedAnswers = content.acceptedAnswers,
            answerKeywords = content.answerKeywords,
        )
    }
    return ReviewTaskWithTotal(tasks, dueItems.size)
}

enum class ReviewRating { SKILLED, FUZZY, ROUGH }

data class ReviewSubmitResult(
    val result: ReviewScheduleQuality,
    val feedback: String,
    val status: LearningStatus,
    val nextReviewAt: String,
    val remaining: Int,
)

private val RATING_QUALITY: Map<ReviewRating, ReviewScheduleQuality> = mapOf(
    ReviewRating.SKILLED to ReviewScheduleQuality.CORRECT_INDEPENDENT, // 3 天
    ReviewRating.FUZZY to ReviewScheduleQuality.CORRECT_WITH_HINT,     // 1 天
    ReviewRating.ROUGH to ReviewScheduleQuality.INCORRECT,             // 4 小时
)

fun submitReviewRating(
    itemId: String,
    rating: ReviewRating,
    userId: String,
    task: ReviewTask,
    usedHint: Boolean = rating == ReviewRating.FUZZY,
    durationMs: Long = 0,
): ReviewSubmitResult {
    val baseResult = RATING_QUALITY[rating]!!
    // 实际点开过提示 → 即便自评“熟练”，也按“借助提示”排程（间隔更短）
    val result = if (usedHint && baseResult == ReviewScheduleQuality.CORRECT_INDEPENDENT)
        ReviewScheduleQuality.CORRECT_WITH_HINT else baseResult
    val nextReviewAt = computeReviewNextAt(result)
    val status = when (result) {
        ReviewScheduleQuality.CORRECT_INDEPENDENT -> LearningStatus.RECALLED_INDEPENDENTLY
        ReviewScheduleQuality.CORRECT_WITH_HINT -> LearningStatus.RECALLED_WITH_HELP
        ReviewScheduleQuality.INCORRECT -> LearningStatus.EXPOSED
        ReviewScheduleQuality.SKIPPED -> LearningStatus.EXPOSED
    }
    val feedback = when (result) {
        ReviewScheduleQuality.CORRECT_INDEPENDENT -> "完美！独立回忆「${task.term}」= ${task.coreMeaning}"
        ReviewScheduleQuality.CORRECT_WITH_HINT -> "正确！「${task.term}」= ${task.coreMeaning}。下次试试独立回忆。"
        ReviewScheduleQuality.INCORRECT -> "还需加强。「${task.term}」的含义是：${task.coreMeaning}"
        ReviewScheduleQuality.SKIPPED -> "已跳过。「${task.term}」= ${task.coreMeaning}"
    }

    val events = getEvents().apply {
        add(LearningEvent(
            id = "evt-${System.currentTimeMillis()}",
            userId = userId,
            itemId = itemId,
            eventType = "REVIEW",
            taskType = "MEANING_RECALL",
            answer = "",
            correctness = when (result) {
                ReviewScheduleQuality.CORRECT_INDEPENDENT -> EventCorrectness.INDEPENDENT
                ReviewScheduleQuality.CORRECT_WITH_HINT -> EventCorrectness.HINTED
                ReviewScheduleQuality.SKIPPED -> EventCorrectness.SKIPPED
                ReviewScheduleQuality.INCORRECT -> EventCorrectness.FAIL
            },
            hintLevel = if (usedHint) 1 else 0,
            resultJson = mapOf("reviewResult" to result.name, "rating" to rating.name),
            clientEventId = "rev-$itemId-${System.currentTimeMillis()}",
            traceId = "trc-${System.currentTimeMillis()}",
            createdAt = Instant.now().toString(),
            durationMs = durationMs,
        ))
    }
    saveEvents(events)

    val states = getStates()
    val prev = states[itemId]
    states[itemId] = UserItemState(
        userId = userId,
        itemId = itemId,
        status = status,
        recognitionLevel = prev?.recognitionLevel ?: 1,
        recallLevel = if (result == ReviewScheduleQuality.CORRECT_INDEPENDENT) {
            val r = (prev?.recallLevel ?: 0) + 1
            if (r < 5) r else 5
        } else prev?.recallLevel ?: 0,
        applicationLevel = 0,
        consecutiveCorrect = if (result == ReviewScheduleQuality.CORRECT_INDEPENDENT || result == ReviewScheduleQuality.CORRECT_WITH_HINT)
            (prev?.consecutiveCorrect ?: 0) + 1 else 0,
        currentIntervalDays = when (result) {
            ReviewScheduleQuality.CORRECT_INDEPENDENT -> 3.0
            ReviewScheduleQuality.CORRECT_WITH_HINT -> 1.0
            ReviewScheduleQuality.INCORRECT -> 4.0 / 24
            ReviewScheduleQuality.SKIPPED -> 2.0 / 24
        },
        nextReviewAt = nextReviewAt,
        updatedAt = Instant.now().toString(),
    )
    saveStates(states)

    val remaining = getStates().values.count { it.nextReviewAt <= Instant.now().toString() }
    return ReviewSubmitResult(result, feedback, status, nextReviewAt, remaining)
}

// ---------------- 口语（本地启发式兜底） ----------------
data class SpeakingSessionCreated(val session: SpeakingSession, val questionData: SpeakingQuestion)

fun createSpeakingSession(part: String, userId: String): SpeakingSessionCreated {
    val pool = SeedData.questions.filter { it.part == part }
    val questionData = pool.randomOrNull() ?: SeedData.questions.first()
    val now = Instant.now().toString()
    val session = SpeakingSession(
        id = "spk-${System.currentTimeMillis()}",
        userId = userId,
        questionId = questionData.questionId,
        part = questionData.part,
        topic = questionData.topic,
        question = questionData.question,
        status = "IN_PROGRESS",
        createdAt = now,
        updatedAt = now,
    )
    val sessions = getSessions().apply { add(session) }
    saveSessions(sessions)
    return SpeakingSessionCreated(session, questionData)
}

private fun computeMetrics(answer: String, q: SpeakingQuestion): SpeakingMetrics {
    val words = answer.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val wordCount = words.size
    val sentences = answer.split(Regex("[.!?]+")).filter { it.trim().isNotEmpty() }
    val lower = answer.lowercase()
    val allConnectors = (q.goodConnectors + listOf(
        "however", "moreover", "furthermore", "therefore",
        "firstly", "secondly", "finally", "for example", "for instance",
    )).distinct()
    val connectorCount = allConnectors.count { lower.contains(it.lowercase()) }
    val uniqueRatio = if (wordCount == 0) 0.0 else words.toSet().size.toDouble() / wordCount
    return SpeakingMetrics(
        wordCount = wordCount,
        sentenceCount = sentences.size,
        connectorCount = connectorCount,
        uniqueWordRatio = uniqueRatio,
        paraphraseScore = 0.0,
    )
}

private fun analyzeLocally(answer: String, q: SpeakingQuestion): SpeakingAnalysisResult {
    val metrics = computeMetrics(answer, q)
    val wordCount = metrics.wordCount
    val sentences = answer.split(Regex("[.!?]+")).filter { it.trim().isNotEmpty() }
    val connectorCount = metrics.connectorCount

    var mainDim = "fluency"
    var mainSev = "minor"
    var mainDesc = "整体表达不错，继续保持！"
    var mainSugg = "尝试在关键观点前加入过渡语。"

    when {
        wordCount < q.expectedLength.min -> {
            mainDim = "fluency"; mainSev = "major"
            mainDesc = "回答过短（${wordCount} 词，建议至少 ${q.expectedLength.min} 词）。"
            mainSugg = "尝试展开回答：加入原因、例子或个人经历。目标 ${q.expectedLength.ideal} 词左右。"
        }
        connectorCount == 0 -> {
            mainDim = "coherence"; mainSev = "major"
            mainDesc = "未检测到连接词 / 过渡语，回答可能显得跳跃。"
            mainSugg = "试着加入过渡词，如：${q.goodConnectors.take(3).joinToString("、")}。"
        }
        sentences.isNotEmpty() && wordCount / sentences.size < 8 -> {
            mainDim = "development"; mainSev = "minor"
            mainDesc = "句子普遍较短，缺乏复合句式。"
            mainSugg = "尝试用 because / although / which 构建复合句。"
        }
    }

    val issue = SpeakingIssue(mainDim, mainSev, mainDesc, mainSugg)
    return SpeakingAnalysisResult(
        candidateIssues = listOf(issue),
        mainIssue = issue,
        microDrill = MicroDrill(
            prompt = when (mainDim) {
                "fluency" -> "请补充一个具体例子来支撑你的观点。"
                "coherence" -> "请用 ${q.goodConnectors.getOrNull(0) ?: "firstly"} 和 ${q.goodConnectors.getOrNull(1) ?: "moreover"} 重新组织回答。"
                else -> "请用一个从句改写你回答中的简单句。"
            },
            exampleImprovement = "For example, I remember when... This experience taught me that...",
            targetDimension = mainDim,
        ),
        metrics = metrics,
        summary = if (mainSev == "major")
            "本次回答 ${wordCount} 词，需改善「${mainDim}」。"
        else "表达基本到位（${wordCount} 词），可优化「${mainDim}」。",
    )
}

data class SpeakingAnalysisResultWithSession(
    val analysis: SpeakingAnalysisResult,
    val session: SpeakingSession,
)

fun analyzeSpeakingLocally(
    sessionId: String,
    answer: String,
    isSecondAnswer: Boolean,
): SpeakingAnalysisResultWithSession {
    val sessions = getSessions()
    val idx = sessions.indexOfFirst { it.id == sessionId }
    require(idx != -1) { "Session not found" }
    val session = sessions[idx]
    val q = SeedData.questions.first { it.questionId == session.questionId }
    val analysis = analyzeLocally(answer, q)
    val elapsed = System.currentTimeMillis() - parseIso(session.createdAt).time
    val updated = if (isSecondAnswer) {
        session.copy(
            secondAnswer = answer,
            secondAnalysis = analysis,
            status = "COMPLETED",
            updatedAt = Instant.now().toString(),
            durationMs = elapsed.coerceAtLeast(0),
        )
    } else {
        session.copy(
            firstAnswer = answer,
            firstAnalysis = analysis,
            updatedAt = Instant.now().toString(),
            durationMs = elapsed.coerceAtLeast(0),
        )
    }
    sessions[idx] = updated
    saveSessions(sessions)
    return SpeakingAnalysisResultWithSession(analysis, updated)
}

// ---------------- 口语（优先 API，失败回退离线） ----------------
private val llmJson = Json { ignoreUnknownKeys = true }

@Serializable
private data class LlmIssue(
    val dimension: String = "",
    val severity: String = "",
    val description: String = "",
    val suggestion: String = "",
) {
    fun toModel() = SpeakingIssue(
        dimension = dimension.ifBlank { "fluency" },
        severity = severity.ifBlank { "minor" },
        description = description.ifBlank { "整体表达尚可，继续练习。" },
        suggestion = suggestion.ifBlank { "尝试加入具体例子支撑观点。" },
    )
}

@Serializable
private data class LlmMicroDrill(
    val prompt: String = "",
    val exampleImprovement: String = "",
    val targetDimension: String = "",
) {
    fun toModel() = MicroDrill(
        prompt = prompt.ifBlank { "请补充一个具体例子。" },
        exampleImprovement = exampleImprovement.ifBlank { "For example, I remember when..." },
        targetDimension = targetDimension.ifBlank { "fluency" },
    )
}

@Serializable
private data class LlmSpeakingPayload(
    val candidateIssues: List<LlmIssue> = emptyList(),
    val mainIssue: LlmIssue = LlmIssue(),
    val microDrill: LlmMicroDrill = LlmMicroDrill(),
    val summary: String = "",
)

/**
 * 优先用用户配置的 OpenAI 兼容接口做口语诊断；无配置或调用/解析失败则回退离线启发式。
 * 不论走哪条路径，都会把分析写入 session（与原 analyzeSpeakingLocally 行为一致）。
 */
suspend fun analyzeSpeaking(
    sessionId: String,
    answer: String,
    isSecondAnswer: Boolean,
): SpeakingAnalysisResultWithSession {
    val sessions = getSessions()
    val idx = sessions.indexOfFirst { it.id == sessionId }
    require(idx != -1) { "Session not found" }
    val session = sessions[idx]
    val q = SeedData.questions.first { it.questionId == session.questionId }

    val analysis = analyzeSpeakingViaLlm(answer, q) ?: analyzeLocally(answer, q)

    val elapsed = System.currentTimeMillis() - parseIso(session.createdAt).time
    val updated = if (isSecondAnswer) {
        session.copy(
            secondAnswer = answer,
            secondAnalysis = analysis,
            status = "COMPLETED",
            updatedAt = Instant.now().toString(),
            durationMs = elapsed.coerceAtLeast(0),
        )
    } else {
        session.copy(
            firstAnswer = answer,
            firstAnalysis = analysis,
            updatedAt = Instant.now().toString(),
            durationMs = elapsed.coerceAtLeast(0),
        )
    }
    sessions[idx] = updated
    saveSessions(sessions)
    return SpeakingAnalysisResultWithSession(analysis, updated)
}

private suspend fun analyzeSpeakingViaLlm(answer: String, q: SpeakingQuestion): SpeakingAnalysisResult? {
    val cfg = getApiConfig()
    if (!cfg.isValid) return null
    val system = """
你是一位严格的雅思口语考官与语言教练。请基于考生作答给出诊断式反馈。
你必须只返回一个 JSON 对象，不要任何额外文字、不要 markdown 代码块。
字段说明：
- candidateIssues: 数组，列出 1–3 个问题，每个含 dimension(取值 fluency|coherence|development|vocabulary|grammar)、severity(major|minor)、description(中文，具体指出问题)、suggestion(中文，可操作的改进建议)
- mainIssue: 最重要的一个问题，结构同 candidateIssues 的单项
- microDrill: 对象，含 prompt(中文，给考生的一句微训练指令)、exampleImprovement(英文，示范改写或补充，1–2 句)、targetDimension(取值同 dimension)
- summary: 一句话中文总评（可含词数等客观信息）
""".trimIndent()
    val user = """
口语题目（${q.part}）：${q.question}
话题：${q.topic}
${if (q.followUps.isNotEmpty()) "追问：" + q.followUps.joinToString("；") + "\n" else ""}建议词数：${q.expectedLength.min}–${q.expectedLength.ideal}

考生作答：
$answer

请返回 JSON。
""".trimIndent()
    val raw = callUserModel(cfg, system, user, temperature = 0.4, maxTokens = 1200, jsonMode = true) ?: return null
    return parseSpeakingAnalysis(raw, answer, q)
}

private fun parseSpeakingAnalysis(raw: String, answer: String, q: SpeakingQuestion): SpeakingAnalysisResult? {
    return try {
        val jsonText = extractJsonObject(raw) ?: return null
        val payload = llmJson.decodeFromString<LlmSpeakingPayload>(jsonText)
        val mainIssue = payload.mainIssue.toModel()
        val metrics = computeMetrics(answer, q)
        SpeakingAnalysisResult(
            candidateIssues = payload.candidateIssues.map { it.toModel() }.ifEmpty { listOf(mainIssue) },
            mainIssue = mainIssue,
            microDrill = payload.microDrill.toModel(),
            metrics = metrics,
            summary = payload.summary.ifBlank { "已完成分析（${metrics.wordCount} 词）。" },
        )
    } catch (_: Exception) {
        null
    }
}

// ---------------- 我的 / 报告 ----------------
fun generateReport(): MiniReport {
    val states = getStates()
    val events = getEvents()
    val nowIso = Instant.now().toString()
    val dueNow = states.values.count { it.nextReviewAt <= nowIso }
    val streak = computeStreak(events)
    val sessions = getSessions()
    val speakingCompleted = sessions.count { it.status == "COMPLETED" }

    val newEvents = events.filter { it.eventType == "NEW" }
    val weekAgo = System.currentTimeMillis() - 7 * 86_400_000L
    val newThisWeek = newEvents.filter { parseIso(it.createdAt).time >= weekAgo }.map { it.itemId }.toSet().size

    val reviewedThisWeek = events.count {
        it.eventType == "REVIEW" && parseIso(it.createdAt).time >= weekAgo
    }
    val masteredCount = states.values.count { it.status == LearningStatus.RECALLED_INDEPENDENTLY }

    val studyEvents = events.filter { it.eventType == "NEW" || it.eventType == "REVIEW" }
    val dayCountMap = studyEvents.groupingBy { localDayKey(it.createdAt) }.eachCount()
    val today = Calendar.getInstance()
    val weeklyActivity = (6 downTo 0).map { offset ->
        val d = Calendar.getInstance().apply { time = today.time; add(Calendar.DATE, -offset) }
        val key = localDayKey(d.time)
        val count = dayCountMap[key] ?: 0
        DayActivity(
            key = key,
            label = "周" + arrayOf("日", "一", "二", "三", "四", "五", "六")[d.get(Calendar.DAY_OF_WEEK) - 1],
            hasActivity = count > 0,
            isToday = offset == 0,
            count = count,
        )
    }
    val daysActiveThisWeek = weeklyActivity.count { it.hasActivity }

    val twoWeeksAgo = System.currentTimeMillis() - 14 * 86_400_000L
    val lastWeekTotal = studyEvents.count {
        val t = parseIso(it.createdAt).time
        t >= twoWeeksAgo && t < weekAgo
    }
    val weeklyGoal = getWeeklyGoal()

    // 学习时长（秒）：本周 NEW+REVIEW 事件 durationMs + 完成口语会话 durationMs 之和
    val studySecondsThisWeek = (
        events.filter { (it.eventType == "NEW" || it.eventType == "REVIEW") && parseIso(it.createdAt).time >= weekAgo }
            .sumOf { it.durationMs } +
        sessions.filter { it.status == "COMPLETED" && parseIso(it.updatedAt).time >= weekAgo }.sumOf { it.durationMs }
        ) / 1000

    val studySecondsLastWeek = (
        events.filter { (it.eventType == "NEW" || it.eventType == "REVIEW") && run { val t = parseIso(it.createdAt).time; t >= twoWeeksAgo && t < weekAgo } }
            .sumOf { it.durationMs } +
        sessions.filter { run { val t = parseIso(it.updatedAt).time; t >= twoWeeksAgo && t < weekAgo } }.sumOf { it.durationMs }
        ) / 1000

    // 知识点掌握分布（四态互斥，合计 = totalItems）
    var sdNew = 0
    var sdLearning = 0
    var sdReviewing = 0
    var sdMastered = 0
    for (s in states.values) {
        when (s.status) {
            LearningStatus.EXPOSED -> sdNew++
            LearningStatus.RECALLED_WITH_HELP -> sdLearning++
            LearningStatus.RECALLED_INDEPENDENTLY -> if (s.nextReviewAt <= nowIso) sdReviewing++ else sdMastered++
            else -> sdNew++ // NEW 或其他归新学
        }
    }
    val statusDistribution = StatusDistribution(sdNew, sdLearning, sdReviewing, sdMastered)

    // 复习正确率（本周 REVIEW 事件中非 FAIL/SKIPPED 占比）
    val reviewEvents = events.filter { it.eventType == "REVIEW" && parseIso(it.createdAt).time >= weekAgo }
    val reviewCorrect = reviewEvents.count { it.correctness == EventCorrectness.INDEPENDENT || it.correctness == EventCorrectness.HINTED }
    val reviewCorrectRate = if (reviewEvents.isNotEmpty()) reviewCorrect * 100 / reviewEvents.size else 0

    val recentMastered = states.values
        .filter { it.status == LearningStatus.RECALLED_INDEPENDENTLY }
        .sortedByDescending { it.updatedAt }
        .take(5)
        .map { s ->
            val seed = SeedData.items.firstOrNull { it.itemId == s.itemId }
            MasteredItem(seed?.term ?: s.itemId, seed?.coreMeaning ?: "")
        }

    val nextStep = buildNextStep(
        NextStepInput(
            dueNow = dueNow,
            topIssueCount = 0,
            speakingCompleted = speakingCompleted,
            totalItems = states.size,
        ),
    )

    return MiniReport(
        totalItems = states.size,
        dueNow = dueNow,
        streak = streak,
        speakingCompleted = speakingCompleted,
        newThisWeek = newThisWeek,
        reviewedThisWeek = reviewedThisWeek,
        masteredCount = masteredCount,
        daysActiveThisWeek = daysActiveThisWeek,
        recentMastered = recentMastered,
        weeklyActivity = weeklyActivity,
        weeklyGoal = weeklyGoal,
        lastWeekTotal = lastWeekTotal,
        studySecondsThisWeek = studySecondsThisWeek,
        studySecondsLastWeek = studySecondsLastWeek,
        statusDistribution = statusDistribution,
        reviewCorrectRate = reviewCorrectRate,
        nextStep = nextStep,
    )
}

/**
 * 用用户接口把统计数字写成一段「学习手记」式总结；无配置或调用失败返回 null，由界面回退到离线文案。
 */
suspend fun generateReportNarrative(): String? {
    val cfg = getApiConfig()
    if (!cfg.isValid) return null
    val r = generateReport()
    val system = "你是一位雅思学习教练，请用中文写一段 80–120 字的「学习手记」式总结，语气冷静、像编辑手记，不要列清单、不要使用表情符号。基于以下数据。"
    val user = """
学习数据：
- 已学词条总数：${r.totalItems}
- 当前待复习：${r.dueNow}
- 连续学习：${r.streak} 天
- 本周新增：${r.newThisWeek} 词条，本周复习：${r.reviewedThisWeek} 次
- 已掌握：${r.masteredCount} 个
- 本周活跃：${r.daysActiveThisWeek} / 7 天
- 最近掌握：${r.recentMastered.joinToString("、") { it.term }}
- 下一步：${r.nextStep.title} —— ${r.nextStep.body}
请写一段学习手记。
""".trimIndent()
    return callUserModel(cfg, system, user, temperature = 0.6, maxTokens = 400, jsonMode = false)
}
