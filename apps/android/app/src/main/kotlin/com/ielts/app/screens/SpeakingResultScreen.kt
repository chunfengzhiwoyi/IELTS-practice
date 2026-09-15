package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.components.GhostButton
import com.ielts.app.components.PrimaryButton
import com.ielts.app.nav.Routes
import com.ielts.app.speaking.SpeakingMock
import com.ielts.app.theme.Accent
import com.ielts.app.theme.Bronze
import com.ielts.app.theme.DisplayFont
import com.ielts.app.theme.Ink
import com.ielts.app.theme.InkMeta
import com.ielts.app.theme.InkSoft
import com.ielts.app.theme.Line
import com.ielts.app.theme.Paper
import com.ielts.app.theme.Type
import com.ielts.app.theme.UiFont

/**
 * 口语练习 · 结果（简化版）—— 严格按 Approved Board「分析结果页（简化版）」。
 * 数据全部来自 SpeakingMock.result fixture（集中定义，非 AI 生成）。
 */
@Composable
fun SpeakingResultScreen(navController: NavController, innerPadding: PaddingValues) {
    val fixture = SpeakingMock.result
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
            Text("口语练习 · 结果", style = ResultTitle)
            Spacer(Modifier.height(16.dp))

            // 整体评价卡
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Paper)
                    .border(1.dp, Line, RoundedCornerShape(16.dp))
                    .padding(16.dp),
            ) {
                Text("整体评价", style = SectionLabelStyle)
                Spacer(Modifier.height(8.dp))
                Text(fixture.overall, style = OverallComment)
                Spacer(Modifier.height(4.dp))
                Text(fixture.band, style = BandScore)
            }

            Spacer(Modifier.height(16.dp))
            KeepPointsCard(fixture.keepPoints)
            Spacer(Modifier.height(12.dp))
            IssuesCard(fixture.issues)
            Spacer(Modifier.height(12.dp))
            SuggestionsCard(fixture.suggestions)
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

@Composable
internal fun KeepPointsCard(points: List<String>) {
    ResultListCard("值得保留", points, marker = "✓", markerColor = Accent)
}

@Composable
internal fun IssuesCard(issues: List<String>) {
    ResultListCard("主要问题", issues, marker = "—", markerColor = InkSoft)
}

@Composable
internal fun SuggestionsCard(suggestions: List<String>) {
    ResultListCard("改进建议", suggestions, marker = "→", markerColor = Bronze)
}

@Composable
private fun ResultListCard(title: String, items: List<String>, marker: String, markerColor: androidx.compose.ui.graphics.Color) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Paper)
            .border(1.dp, Line, RoundedCornerShape(16.dp))
            .padding(16.dp),
    ) {
        Text(title, style = SectionLabelStyle)
        Spacer(Modifier.height(10.dp))
        items.forEach { item ->
            Row(Modifier.padding(vertical = 3.dp)) {
                Text(marker, style = Type.body.copy(color = markerColor))
                Spacer(Modifier.width(8.dp))
                Text(item, style = ListItem)
            }
        }
    }
}

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

internal val BandScore = TextStyle(
    fontFamily = DisplayFont,
    fontWeight = FontWeight.Medium,
    fontSize = 40.sp,
    lineHeight = 48.sp,
    color = Accent,
)

internal val ListItem = TextStyle(
    fontFamily = UiFont,
    fontSize = 14.sp,
    lineHeight = 20.sp,
    color = Ink,
)

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
