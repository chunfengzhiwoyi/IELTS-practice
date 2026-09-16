package com.ielts.app.speaking

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * MOBILE-04A-PRE-DEVICE 权限逻辑穷举审计（第 7 节）。
 * 覆盖 C 节冻结语义 A–E：
 * A. 已授权 → 开始录音
 * B. 首次请求（launcher 路径，由 granted/denied 两分支代表）
 * C. 拒绝 → IDLE + 非技术提示（DENIED_LIGHT）
 * D. hasRequested=true 且 rationale=false → 系统设置态（DENIED_PERMANENT）
 * E. 从设置返回后 permission=true → 重新进入录音（等价于 granted 分支，UI 层另有点击流验证）
 *
 * 特别验证：首次请求前 rationale=false 不得误判为永久拒绝。
 */
class SpeakingMicPermissionTest {

    private fun decide(
        granted: Boolean,
        hasRequested: Boolean,
        rationale: Boolean,
    ): MicPermissionDecision = resolveMicPermission(granted, hasRequested, rationale)

    // ---- A. permission already granted → recording requested ----

    @Test
    fun `granted always starts recording regardless of history`() {
        assertEquals(MicPermissionDecision.START_RECORDING, decide(granted = true, hasRequested = false, rationale = false))
        assertEquals(MicPermissionDecision.START_RECORDING, decide(granted = true, hasRequested = true, rationale = false))
        assertEquals(MicPermissionDecision.START_RECORDING, decide(granted = true, hasRequested = true, rationale = true))
    }

    // ---- B + C. denied → light prompt（首次拒绝 / 拒绝但系统仍建议理由） ----

    @Test
    fun `first denial is light not permanent`() {
        // 首次请求前 rationale=false 是正常现象（系统尚未显示过理由），不得误判为永久拒绝
        assertEquals(MicPermissionDecision.DENIED_LIGHT, decide(granted = false, hasRequested = false, rationale = false))
        // 首次请求后 rationale=true（系统建议理由）→ 轻量提示
        assertEquals(MicPermissionDecision.DENIED_LIGHT, decide(granted = false, hasRequested = true, rationale = true))
    }

    // ---- D. hasRequested=true && rationale=false → settings-required ----

    @Test
    fun `requested before with no rationale is permanent`() {
        assertEquals(MicPermissionDecision.DENIED_PERMANENT, decide(granted = false, hasRequested = true, rationale = false))
    }

    // ---- E. 设置返回后 permission=true → 可重新进入录音 ----

    @Test
    fun `after settings return granted again recording is reachable`() {
        assertEquals(MicPermissionDecision.START_RECORDING, decide(granted = true, hasRequested = true, rationale = false))
    }

    // ---- 全矩阵穷举（2×2×2）----

    @Test
    fun `exhaustive matrix has no undefined branch`() {
        val cases = mapOf(
            (false to false) to false to MicPermissionDecision.DENIED_LIGHT,
            (false to false) to true to MicPermissionDecision.DENIED_LIGHT,
            (false to true) to false to MicPermissionDecision.DENIED_PERMANENT,
            (false to true) to true to MicPermissionDecision.DENIED_LIGHT,
            (true to false) to false to MicPermissionDecision.START_RECORDING,
            (true to false) to true to MicPermissionDecision.START_RECORDING,
            (true to true) to false to MicPermissionDecision.START_RECORDING,
            (true to true) to true to MicPermissionDecision.START_RECORDING,
        )
        cases.forEach { (key, expected) ->
            val granted = key.first.first
            val hasRequested = key.first.second
            val rationale = key.second
            assertEquals(
                "granted=$granted hasRequested=$hasRequested rationale=$rationale",
                expected,
                decide(granted, hasRequested, rationale),
            )
        }
    }
}
