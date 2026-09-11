package com.ielts.core.client

import java.text.SimpleDateFormat
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** 归一化词条：小写、去首尾空白、压缩内部空白 */
fun normalizeTerm(term: String): String =
    term.trim().lowercase().replace(Regex("\\s+"), " ")

/**
 * 由归一化词条生成稳定 id（FNV-1a 32 位哈希，十六进制）。
 * 逐字符按 UTF-16 code unit（Char.code）异或，与小程序 charCodeAt 行为一致。
 */
fun stableItemId(normalizedTerm: String): String {
    val s = normalizeTerm(normalizedTerm)
    var h: Int = 0x811c9dc5.toInt()
    for (ch in s) {
        h = (h xor ch.code) * 0x01000193
    }
    return "it-" + h.toUInt().toString(16).padStart(8, '0')
}

/**
 * 解析 ISO-8601 时间戳（如 2026-08-13T02:41:20.123Z 或带偏移 2026-08-13T10:41:20+08:00）。
 * 用 java.time 正确解析；失败不抛异常（回落到纪元时间），避免 Date(String) 废弃构造器崩溃。
 */
fun parseIso(iso: String?): Date {
    if (iso.isNullOrBlank()) return Date(0)
    val s = iso.trim()
    return try {
        Date.from(Instant.parse(s))
    } catch (_: Exception) {
        try {
            Date.from(OffsetDateTime.parse(s).toInstant())
        } catch (_: Exception) {
            try {
                Date.from(LocalDateTime.parse(s).atZone(ZoneId.systemDefault()).toInstant())
            } catch (_: Exception) {
                Date(0)
            }
        }
    }
}

/** 本地日期键（按设备时区），格式 yyyy-MM-dd */
fun localDayKey(iso: String): String = localDayKey(parseIso(iso))
fun localDayKey(date: Date): String {
    val f = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    return f.format(date)
}

/** 中文日期，如「8月11日 周二」 */
fun formatCNDate(d: Date = Date()): String {
    val week = arrayOf("日", "一", "二", "三", "四", "五", "六")[d.day]
    return "${d.month + 1}月${d.date}日 周${week}"
}

/** 今天 0 点之后的本地日键集合辅助：返回截止某天的连续活跃天数所需的日历工具 */
internal fun Calendar.dayKey(): String = localDayKey(this.time)
