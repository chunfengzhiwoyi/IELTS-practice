package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.speaking.ResultDimensionCard
import com.ielts.app.speaking.ResultSummaryModel
import com.ielts.app.speaking.SpeakingResultFixtures
import com.ielts.app.speaking.SpeakingResultHolder
import com.ielts.app.theme.Accent
import com.ielts.app.theme.AccentWash
import com.ielts.app.theme.InkMeta
import com.ielts.app.theme.Paper
import com.ielts.app.theme.Paper2
import com.ielts.app.theme.Type

/**
 * 查看完整分析（RESULT V2 Detail）—— CONTENT REMAP ONLY。
 *
 * Tab：总览 | 能力分析（不保留逐句分析 / 独立词汇表达）。
 * - 总览：整体评价 + 弱化 metrics + 表现证据 + 优先改进 + 下一步怎么练（Summary 的更完整版本）。
 * - 能力分析：流利度 / 词汇资源 / 语法范围 复用 DimensionCard；发音显示「本次未评估」。
 * - fallback（无 ieltsAnalysis）：仅保留总览内容，不渲染「能力分析」tab，不堆空卡。
 * 视觉基线同 Summary（PILOT-02 + RESULT_V2_DETAIL_VISUAL.png）。
 */
@Composable
fun SpeakingResultDetailScreen(
    navController: NavController,
    innerPadding: PaddingValues,
    model: ResultSummaryModel = SpeakingResultHolder.current ?: SpeakingResultFixtures.fullUi(),
) {
    var tabIndex by remember { mutableIntStateOf(0) }
    val showAbility = model.hasAbilityAnalysis
    val tabLabels = if (showAbility) listOf("总览", "能力分析") else listOf("总览")

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
            Text("查看完整分析", style = ResultTitle)
            Spacer(Modifier.height(14.dp))

            if (showAbility) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    tabLabels.forEachIndexed { i, label ->
                        val selected = i == tabIndex
                        Box(
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (selected) AccentWash else Paper2)
                                .clickable { tabIndex = i }
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                label,
                                style = Type.uiLabel.copy(
                                    fontSize = 13.sp,
                                    color = if (selected) Accent else InkMeta,
                                ),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            when (tabIndex) {
                0 -> OverviewContent(model)
                1 -> AbilityContent(model.dimensions)
            }
        }
    }
}

// ----------------------------- 总览（Summary 的更完整版本） -----------------------------

@Composable
private fun OverviewContent(model: ResultSummaryModel) {
    OverallCard(model)
    if (model.hasEvidence) {
        Spacer(Modifier.height(12.dp))
        EvidenceCard(model.evidencePoints)
    }
    Spacer(Modifier.height(12.dp))
    MainIssueCard(model.mainIssueLabel, model.mainIssueDescription)
    Spacer(Modifier.height(12.dp))
    NextStepsCard(model.nextSteps)
}

// ----------------------------- 能力分析（四维卡） -----------------------------

@Composable
private fun AbilityContent(dimensions: List<ResultDimensionCard>) {
    dimensions.forEachIndexed { i, card ->
        DimensionCard(card)
        if (i != dimensions.lastIndex) Spacer(Modifier.height(12.dp))
    }
}
