package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.components.GhostButton
import com.ielts.app.components.PrimaryButton
import com.ielts.app.nav.Routes
import com.ielts.app.speaking.ResultSummaryModel
import com.ielts.app.speaking.SpeakingResultFixtures
import com.ielts.app.theme.Paper

/**
 * 口语练习 · 结果（RESULT V2 Summary）—— CONTENT REMAP ONLY。
 *
 * 视觉基线：PILOT-02 Approved Board（docs/evidence/mobile-03d-today-pilot/pilot02-speaking-board.png）
 * 与已批准视觉稿 RESULT_V2_SUMMARY_VISUAL.png（docs/product/RESULT_V2_VISUALS/）。
 * 内容映射见 docs/product/SPEAKING_RESULT_V2-DESIGN-REVIEW.md §3。
 *
 * 结构：整体评价（+弱化 metrics）→ 表现证据（仅 evidence 存在）→ 优先改进（mainIssue）
 *      → 下一步怎么练（prioritizedSuggestions ≤3 / mainIssue.suggestion）→ 双 CTA。
 * 禁止 Band；fallback 无数据模块整卡隐藏；NEEDS_REVIEW 顶部轻提示。
 */
@Composable
fun SpeakingResultScreen(
    navController: NavController,
    innerPadding: PaddingValues,
    model: ResultSummaryModel = SpeakingResultFixtures.fullUi(),
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Paper)
            .padding(innerPadding),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Spacer(Modifier.height(10.dp))
            if (model.needsReview) {
                NeedsReviewBanner()
                Spacer(Modifier.height(12.dp))
            }
            Text("口语练习 · 结果", style = ResultTitle)
            Spacer(Modifier.height(16.dp))

            OverallCard(model)

            if (model.hasEvidence) {
                Spacer(Modifier.height(12.dp))
                EvidenceCard(model.evidencePoints)
            }

            Spacer(Modifier.height(12.dp))
            MainIssueCard(model.mainIssueLabel, model.mainIssueDescription)

            Spacer(Modifier.height(12.dp))
            NextStepsCard(model.nextSteps)

            Spacer(Modifier.height(24.dp))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                GhostButton(
                    "再练一次",
                    Modifier.weight(1f),
                    onClick = {
                        navController.navigate(Routes.SPEAKING) {
                            popUpTo(Routes.SPEAKING) { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                )
                PrimaryButton(
                    "查看完整分析",
                    Modifier.weight(1f),
                    onClick = { navController.navigate(Routes.SPEAKING_RESULT_DETAIL) },
                )
            }
        }
    }
}
