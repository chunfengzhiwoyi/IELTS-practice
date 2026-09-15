package com.ielts.app.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.ielts.app.R

// ----------------------------- 颜色令牌（精确取自小程序 tokens.scss） -----------------------------
val Paper = Color(0xFFFAF8F4)
val Paper2 = Color(0xFFF3F0EA)
val Paper3 = Color(0xFFECE8E0)
val Ink = Color(0xFF2A2723)
val InkSoft = Color(0xFF5C574F)
val InkMeta = Color(0xFF767067)
val Line = Color(0xFFE0DBD2)
val LineStrong = Color(0xFFC4BDB1)
val Accent = Color(0xFF7A2E2B)
val AccentDeep = Color(0xFF5E211F)
val AccentWash = Color(0xFFF4EAEA)
val AccentContrast = Color(0xFFFAF7F2)
val Bronze = Color(0xFFA07C4A)
val Pos = Color(0xFF3F7A4F)      // 在线 / 就绪（沉静绿）
val Amber = Color(0xFFB07A2A)    // 已配置未测（琥珀）
val Bar = Color(0xFFC4BCAE)      // 柱状图非今日柱（沉静灰褐）

// ----------------------------- 今日页环境色（取自 Approved Visual Reference 取样） -----------------------------
val HeroWarm = Color(0xFFF8EDDF)  // Hero 顶部暖光（轻环境光）
val Cream = Color(0xFFFBEEE2)     // 本周学习卡暖米底
val Blush = Color(0xFFF9EAE5)     // 快捷入口浅暖红底

// ----------------------------- 字体（内置 OFL 衬线 + 中文回退） -----------------------------
val DisplayFont = FontFamily(
    Font(R.font.fraunces, FontWeight.Normal),
    Font(R.font.fraunces, FontWeight.Medium),
    Font(R.font.fraunces, FontWeight.SemiBold),
)
val TextFont = FontFamily(
    Font(R.font.newsreader, FontWeight.Normal),
    Font(R.font.newsreader, FontWeight.Medium),
)
// 用 regular Newsreader + 合成斜体，避免依赖独立的斜体 TTF（该文件在安卓资源加载器里会拉不起来）
val TextFontItalic = FontFamily(Font(R.font.newsreader, FontWeight.Normal, FontStyle.Italic))
val UiFont = FontFamily(
    Font(R.font.instrument_sans, FontWeight.Normal),
    Font(R.font.instrument_sans, FontWeight.SemiBold),
)

// ----------------------------- 排版（sp 来自小程序 750 基准 /2） -----------------------------
object Type {
    val displayTitle = TextStyle(fontFamily = DisplayFont, fontWeight = FontWeight.Medium, fontSize = 30.sp, lineHeight = 34.sp)
    val word = TextStyle(fontFamily = DisplayFont, fontWeight = FontWeight.Medium, fontSize = 42.sp, lineHeight = 44.sp)
    val heading = TextStyle(fontFamily = DisplayFont, fontWeight = FontWeight.Medium, fontSize = 22.sp, lineHeight = 28.sp)
    val subHeading = TextStyle(fontFamily = DisplayFont, fontWeight = FontWeight.Medium, fontSize = 18.sp, lineHeight = 24.sp)
    val body = TextStyle(fontFamily = TextFont, fontSize = 16.sp, lineHeight = 26.sp, color = Ink)
    val bodySmall = TextStyle(fontFamily = TextFont, fontSize = 14.sp, lineHeight = 22.sp, color = InkSoft)
    val italic = TextStyle(fontFamily = TextFontItalic, fontSize = 16.sp, lineHeight = 24.sp, color = InkSoft)
    val ui = TextStyle(fontFamily = UiFont, fontSize = 15.sp, color = Ink)
    val uiButton = TextStyle(fontFamily = UiFont, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
    val uiLabel = TextStyle(fontFamily = UiFont, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, letterSpacing = 0.08.em, color = InkMeta)
    val statNum = TextStyle(fontFamily = DisplayFont, fontWeight = FontWeight.Medium, fontSize = 32.sp, color = Ink)
    val statLabel = TextStyle(fontFamily = UiFont, fontSize = 12.sp, letterSpacing = 0.04.em, color = InkMeta)
}

private val LightColorScheme = lightColorScheme(
    primary = Accent,
    onPrimary = AccentContrast,
    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = Paper2,
    onSurfaceVariant = InkSoft,
    outline = LineStrong,
    outlineVariant = Line,
    tertiary = Bronze,
)

@Composable
fun IeltsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        content = content,
    )
}
