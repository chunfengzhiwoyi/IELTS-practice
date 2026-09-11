package com.ielts.core.schedule

import java.time.Instant

/** 复习质量 → 下次复习间隔（单一真源，消除 mini-service 内联 hoursMap 的重复） */
enum class ReviewScheduleQuality { CORRECT_INDEPENDENT, CORRECT_WITH_HINT, INCORRECT, SKIPPED }

/** 首次学习质量 → 下次复习间隔 */
enum class InitialScheduleQuality { INDEPENDENT, HINTED, FAIL, SKIPPED, EXPOSED }

private val REVIEW_HOURS = mapOf(
    ReviewScheduleQuality.CORRECT_INDEPENDENT to 72,  // 3 天
    ReviewScheduleQuality.CORRECT_WITH_HINT to 24,    // 1 天
    ReviewScheduleQuality.INCORRECT to 4,
    ReviewScheduleQuality.SKIPPED to 2,
)

private val INITIAL_HOURS = mapOf(
    InitialScheduleQuality.INDEPENDENT to 24,
    InitialScheduleQuality.HINTED to 8,
    InitialScheduleQuality.FAIL to 2,
    InitialScheduleQuality.SKIPPED to 2,
    InitialScheduleQuality.EXPOSED to 4,
)

fun computeReviewNextAt(quality: ReviewScheduleQuality, nowMs: Long = System.currentTimeMillis()): String =
    Instant.ofEpochMilli(nowMs + (REVIEW_HOURS[quality]!! * 3_600_000L)).toString()

fun computeInitialReviewAt(quality: InitialScheduleQuality, nowMs: Long = System.currentTimeMillis()): String =
    Instant.ofEpochMilli(nowMs + (INITIAL_HOURS[quality]!! * 3_600_000L)).toString()

fun initialIntervalDays(quality: InitialScheduleQuality): Double = INITIAL_HOURS[quality]!! / 24.0
