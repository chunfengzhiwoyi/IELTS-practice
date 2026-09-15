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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.ielts.app.speaking.SentenceVerdict
import com.ielts.app.speaking.SpeakingMock
import com.ielts.app.theme.Accent
import com.ielts.app.theme.AccentWash
import com.ielts.app.theme.Bronze
import com.ielts.app.theme.Ink
import com.ielts.app.theme.InkMeta
import com.ielts.app.theme.InkSoft
import com.ielts.app.theme.Line
import com.ielts.app.theme.Paper
import com.ielts.app.theme.Paper2
import com.ielts.app.theme.Type
import com.ielts.app.theme.UiFont

private enum class DetailTab(val label: String) {
    OVERVIEW("总览"),
    SENTENCES("逐句分析"),
    VOCABULARY("词汇表达"),
}

/**
 * 完整分析页 —— 严格按 Approved Board「查看完整分析」：
 * 顶部 tab：总览 / 逐句分析 / 词汇表达。
 * 数据全部来自 SpeakingMock.result fixture（非 AI 生成）。
 */
@Composable
fun SpeakingResultDetailScreen(navController: NavController, innerPadding: PaddingValues) {
    val fixture = SpeakingMock.result
    var tabIndex by remember { mutableIntStateOf(0) }
    val tabs = DetailTab.entries

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
            Text("查看完整分析", style = ResultTitle)
            Spacer(Modifier.height(14.dp))

            // 顶部 tab
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                tabs.forEachIndexed { i, tab ->
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
                            tab.label,
                            style = Type.uiLabel.copy(
                                fontSize = 13.sp,
                                color = if (selected) Accent else InkMeta,
                            ),
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))

            when (tabs[tabIndex]) {
                DetailTab.OVERVIEW -> OverviewTab(fixture)
                DetailTab.SENTENCES -> SentencesTab(fixture.sentences)
                DetailTab.VOCABULARY -> VocabularyTab(fixture.vocabulary)
            }
        }
    }
}

// ----------------------------- 总览 -----------------------------

@Composable
private fun OverviewTab(fixture: com.ielts.app.speaking.SpeakingResultFixture) {
    CardSurface {
        Text("整体评价", style = SectionLabelStyle)
        Spacer(Modifier.height(8.dp))
        Text(fixture.overall, style = OverallComment)
        Spacer(Modifier.height(4.dp))
        Text(fixture.band, style = BandScore)
    }
    Spacer(Modifier.height(12.dp))
    CardSurface {
        Text("内容表现", style = SectionLabelStyle)
        Spacer(Modifier.height(8.dp))
        Text(fixture.overview, style = DetailBody)
    }
    Spacer(Modifier.height(12.dp))
    KeepPointsCard(fixture.keepPoints)
}

// ----------------------------- 逐句分析 -----------------------------

@Composable
private fun SentencesTab(sentences: List<com.ielts.app.speaking.SentenceFixture>) {
    CardSurface {
        Text("逐句分析", style = SectionLabelStyle)
        Spacer(Modifier.height(12.dp))
        sentences.forEachIndexed { i, s ->
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.Top) {
                Text("${i + 1}.", style = DetailBody.copy(color = InkMeta), modifier = Modifier.width(24.dp))
                Column(Modifier.weight(1f)) {
                    Text(s.text, style = DetailBody.copy(fontWeight = FontWeight.SemiBold))
                    Spacer(Modifier.height(4.dp))
                    Text(s.comment, style = DetailSub)
                    Spacer(Modifier.height(6.dp))
                    VerdictBadge(s.verdict)
                }
            }
            if (i != sentences.lastIndex) {
                androidx.compose.material3.HorizontalDivider(
                    modifier = Modifier.padding(vertical = 4.dp),
                    color = Line,
                    thickness = 1.dp,
                )
            }
        }
    }
}

@Composable
private fun VerdictBadge(verdict: SentenceVerdict) {
    val good = verdict == SentenceVerdict.GOOD
    Box(
        Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (good) AccentWash else Paper2)
            .padding(horizontal = 10.dp, vertical = 3.dp),
    ) {
        Text(
            if (good) "优秀" else "建议改进",
            style = Type.uiLabel.copy(
                fontSize = 11.sp,
                color = if (good) Accent else InkSoft,
            ),
        )
    }
}

// ----------------------------- 词汇表达 -----------------------------

@Composable
private fun VocabularyTab(vocabulary: List<com.ielts.app.speaking.VocabularyFixture>) {
    CardSurface {
        Text("词汇表达", style = SectionLabelStyle)
        Spacer(Modifier.height(12.dp))
        vocabulary.forEach { v ->
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Text(v.word, style = VocabWord)
                Spacer(Modifier.height(4.dp))
                Text(v.note, style = DetailSub)
            }
            androidx.compose.material3.HorizontalDivider(
                modifier = Modifier.padding(vertical = 4.dp),
                color = Line,
                thickness = 1.dp,
            )
        }
    }
}

private val DetailBody = TextStyle(
    fontFamily = UiFont,
    fontSize = 14.sp,
    lineHeight = 22.sp,
    color = Ink,
)

private val DetailSub = TextStyle(
    fontFamily = UiFont,
    fontSize = 13.sp,
    lineHeight = 20.sp,
    color = InkSoft,
)

private val VocabWord = TextStyle(
    fontFamily = UiFont,
    fontWeight = FontWeight.SemiBold,
    fontSize = 15.sp,
    lineHeight = 20.sp,
    color = Ink,
)
