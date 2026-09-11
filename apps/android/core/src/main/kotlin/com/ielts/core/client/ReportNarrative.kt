package com.ielts.core.client

import com.ielts.core.model.NextStep

data class NextStepInput(
    val dueNow: Int,
    val topIssueCount: Int,
    val speakingCompleted: Int,
    val totalItems: Int,
)

/** 编辑式「下一步」建议（克制、无百分比、无火焰），与小程序 buildNextStep 一致 */
fun buildNextStep(input: NextStepInput): NextStep {
    val (dueNow, topIssueCount, speakingCompleted, totalItems) = input
    return when {
        dueNow > 0 -> NextStep(
            "先清掉今天的复习",
            "有 $dueNow 个词到了复习时点。一次只做一组，约 ${kotlin.math.ceil(dueNow * 0.5).toInt()} 分钟。",
        )
        totalItems == 0 -> NextStep("从第一个词开始", "今天先收一个表达，主动回想比多看更有效。")
        speakingCompleted == 0 -> NextStep("练一段口语", "本周还没开口。挑一道题，写一段，看一份克制分析。")
        topIssueCount > 0 -> NextStep("针对一个薄弱点", "最近口语反复出现同一类问题，下次作答时有意识地带出来。")
        else -> NextStep("保持节奏", "今天没有紧急任务，按自己的步调学一个新表达即可。")
    }
}
