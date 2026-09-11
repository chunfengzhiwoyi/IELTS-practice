package com.ielts.core.client

import com.ielts.core.model.EventCorrectness
import com.ielts.core.model.LearningEvent
import java.util.Calendar
import java.util.Date

/** 连续活跃天数（截至今天，按本地日键） */
fun computeStreak(events: List<LearningEvent>): Int {
    if (events.isEmpty()) return 0
    val days = events.map { localDayKey(it.createdAt) }.toSet()
    val cal = Calendar.getInstance()
    if (!days.contains(localDayKey(cal.time))) cal.add(Calendar.DATE, -1)
    var streak = 0
    while (days.contains(localDayKey(cal.time))) {
        streak += 1
        cal.add(Calendar.DATE, -1)
    }
    return streak
}

/** 指定窗口内的复习准确率（独立+提示 / 总数），无数据返回 null */
fun computeReviewAccuracy(
    events: List<LearningEvent>,
    fromMs: Long,
    toMs: Long,
): Double? {
    val inWindow = events.filter {
        it.eventType == "REVIEW" &&
            run { val t = parseIso(it.createdAt).time; t >= fromMs && t < toMs }
    }
    if (inWindow.isEmpty()) return null
    val correct = inWindow.count { it.correctness == EventCorrectness.INDEPENDENT || it.correctness == EventCorrectness.HINTED }
    return correct.toDouble() / inWindow.size
}
