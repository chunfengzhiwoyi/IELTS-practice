package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ielts.app.speaking.ResultDimensionCard
import com.ielts.app.speaking.ResultLevel
import com.ielts.app.speaking.ResultSummaryModel
import com.ielts.app.theme.Accent
import com.ielts.app.theme.AccentWash
import com.ielts.app.theme.Blush
import com.ielts.app.theme.Bronze
import com.ielts.app.theme.Ink
import com.ielts.app.theme.InkMeta
import com.ielts.app.theme.InkSoft
import com.ielts.app.theme.Line
import com.ielts.app.theme.Paper
import com.ielts.app.theme.Paper2
import com.ielts.app.theme.Type
import com.ielts.app.theme.UiFont

// ----------------------------- 结果页共用排版（PILOT-02 视觉语言） -----------------------------

internal val ResultTitle = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 20.sp,
    lineHeight = 26.sp,
    color = Ink,
)

internal val SectionLabelStyle = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 13.sp,
    lineHeight = 18.sp,
    color = InkMeta,
)

internal val OverallComment = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.Medium,
    fontSize = 16.sp,
    lineHeight = 22.sp,
    color = Ink,
)

internal val ListItem = TextStyle(
    fontFamily = UiFont,
    fontSize = 14.sp,
    lineHeight = 20.sp,
    color = Ink,
)

/** 弱化 metrics：非 Hero，不放大。 */
internal val MetricsLabel = TextStyle(
    fontFamily = UiFont,
    fontSize = 12.sp,
    lineHeight = 16.sp,
    color = InkMeta,
)

internal val DetailBody = TextStyle(
    fontFamily = UiFont,
    fontSize = 14.sp,
    lineHeight = 22.sp,
    color = Ink,
)

internal val DetailSub = TextStyle(
    fontFamily = UiFont,
    fontSize = 13.sp,
    lineHeight = 20.sp,
    color = InkSoft,
)

/** 暖铜浅底（仅结果页「下一步怎么练」序号圆点 / 「良好」徽标；已批准视觉稿取样 #F3E5D5）。 */
internal val BronzeWash = Color(0xFFF3E5D5)

// ----------------------------- 卡片外壳（原 CardSurface，白卡 + 轻边框 + 大圆角） -----------------------------

@Composable
internal fun CardSurface(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Paper)
            .border(1.dp, Line, RoundedCornerShape(16.dp))
            .padding(16.dp),
        content = content,
    )
}

// ----------------------------- NEEDS_REVIEW 轻提示 -----------------------------

/** 页面顶部轻提示：不暴露技术原因 / error code / provider / debug 文案。 */
@Composable
internal fun NeedsReviewBanner(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Paper2)
            .border(1.dp, Line, RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        Text(
            "这次分析信息不够完整，以下建议仅供参考。重新回答一次可以获得更完整的反馈。",
            style = Type.uiLabel.copy(fontSize = 12.sp, lineHeight = 17.sp, color = InkMeta),
        )
    }
}

// ----------------------------- 卡片 1：整体评价（overallDiagnosis / summary + 弱化 metrics） -----------------------------

@Composable
internal fun OverallCard(model: ResultSummaryModel) {
    CardSurface {
        Text("整体评价", style = SectionLabelStyle)
        Spacer(Modifier.height(8.dp))
        Text(model.overall, style = OverallComment)
        Spacer(Modifier.height(8.dp))
        Text("词数 ${model.wordCount} · 句数 ${model.sentenceCount}", style = MetricsLabel)
    }
}

// ----------------------------- 卡片 2：表现证据（仅 evidence 存在时显示；不是 strengths） -----------------------------

@Composable
internal fun EvidenceCard(points: List<String>) {
    CardSurface {
        Text("表现证据", style = SectionLabelStyle)
        Spacer(Modifier.height(10.dp))
        points.forEach { point ->
            Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                Text("✓", style = Type.body.copy(color = Accent))
                Spacer(Modifier.width(8.dp))
                Text(point, style = ListItem)
            }
        }
    }
}

// ----------------------------- 卡片 3：优先改进 / 可以优化（mainIssue） -----------------------------

@Composable
internal fun MainIssueCard(label: String, description: String) {
    CardSurface {
        Text(label, style = SectionLabelStyle)
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.Top) {
            Box(
                Modifier
                    .width(3.dp)
                    .height(21.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Accent),
            )
            Spacer(Modifier.width(9.dp))
            Text(description, style = ListItem)
        }
    }
}

// ----------------------------- 卡片 4：下一步怎么练（prioritizedSuggestions ≤3 / mainIssue.suggestion） -----------------------------

@Composable
internal fun NextStepsCard(steps: List<String>) {
    CardSurface {
        Text("下一步怎么练", style = SectionLabelStyle)
        Spacer(Modifier.height(10.dp))
        steps.forEachIndexed { index, step ->
            Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                Box(
                    Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(BronzeWash),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "${index + 1}",
                        style = Type.uiLabel.copy(fontSize = 11.sp, color = Bronze, fontWeight = FontWeight.Bold),
                    )
                }
                Spacer(Modifier.width(9.dp))
                Text(step, style = ListItem)
            }
        }
    }
}

// ----------------------------- 能力分析：维度卡 -----------------------------

/** level 徽标（良好/发展中/待加强；strong=强 采用 AccentWash+Accent，与产品既有徽标一致）。 */
@Composable
private fun LevelBadge(level: ResultLevel) {
    val (bg, fg) = when (level) {
        ResultLevel.STRONG -> AccentWash to Accent
        ResultLevel.ADEQUATE -> BronzeWash to Bronze
        ResultLevel.DEVELOPING -> Paper2 to InkMeta
        ResultLevel.WEAK -> Blush to Ink
    }
    Box(
        Modifier
            .clip(CircleShape)
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(level.label, style = Type.uiLabel.copy(fontSize = 11.sp, color = fg))
    }
}

@Composable
private fun SubLabel(text: String) {
    Text(text, style = Type.uiLabel.copy(fontSize = 11.sp, color = InkMeta))
    Spacer(Modifier.height(4.dp))
}

@Composable
private fun BulletList(items: List<String>, dotColor: Color) {
    items.forEach { item ->
        Row(Modifier.padding(vertical = 1.5.dp), verticalAlignment = Alignment.Top) {
            Box(
                Modifier
                    .padding(top = 8.dp)
                    .size(4.dp)
                    .clip(CircleShape)
                    .background(dotColor),
            )
            Spacer(Modifier.width(7.dp))
            Text(item, style = DetailBody, modifier = Modifier.weight(1f))
        }
    }
}

/** 前三维共用卡片结构：维度名 + level badge + 判断依据 + 发现问题 + 改善建议。 */
@Composable
internal fun DimensionCard(card: ResultDimensionCard) {
    CardSurface {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(card.name, style = DetailBody.copy(fontWeight = FontWeight.SemiBold, fontSize = 15.sp))
            if (card.assessed) LevelBadge(card.level!!)
        }
        Spacer(Modifier.height(10.dp))
        if (card.assessed) {
            if (card.evidence.isNotEmpty()) {
                SubLabel("判断依据")
                BulletList(card.evidence, dotColor = InkMeta)
            }
            if (card.issues.isNotEmpty()) {
                Spacer(Modifier.height(9.dp))
                SubLabel("发现问题")
                BulletList(card.issues, dotColor = Bronze)
            }
            if (card.suggestions.isNotEmpty()) {
                Spacer(Modifier.height(9.dp))
                SubLabel("改善建议")
                BulletList(card.suggestions, dotColor = Accent)
            }
        } else {
            // 发音：本次未评估（禁止「即将上线」，禁止空卡堆叠）
            Text("本次未评估", style = DetailBody.copy(color = InkMeta))
        }
    }
}
