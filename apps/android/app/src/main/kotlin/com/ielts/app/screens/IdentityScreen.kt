package com.ielts.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.core.client.formatCNDate
import com.ielts.core.model.ProfileData
import com.ielts.core.service.getProfile
import com.ielts.core.service.saveProfile

private fun colorOf(key: String): Color = when (key) {
    "accent" -> Accent
    "bronze" -> Bronze
    else -> Ink
}

@Composable
fun IdentityScreen(navController: NavController, innerPadding: PaddingValues, onDone: () -> Unit) {
    val date = remember { formatCNDate() }
    val existing = remember { getProfile() }
    var nickname by remember { mutableStateOf(existing.nickname) }
    var colorKey by remember { mutableStateOf(existing.monogramColor.ifBlank { "ink" }) }

    SubPage("先给自己起个名字", { onDone() }, innerPadding) {
        Text("记录会更像「你」的。也可以稍后再说。", style = Type.bodySmall)
        Spacer(Modifier.height(18.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Monogram((nickname.firstOrNull() ?: '灵').toString(), colorOf(colorKey), size = 64.dp)
            Spacer(Modifier.width(16.dp))
            Column {
                Text(nickname.ifBlank { "你的名字" }, style = Type.heading)
                Spacer(Modifier.height(4.dp))
                Text("字母头像会用在「我的」页", style = Type.uiLabel)
            }
        }
        Spacer(Modifier.height(24.dp))

        SectionLabel("昵称")
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(RadiusMedium))
                .background(Paper2)
                .border(1.dp, LineStrong, RoundedCornerShape(RadiusMedium))
                .padding(12.dp, 10.dp),
        ) {
            BasicTextField(
                value = nickname,
                onValueChange = { nickname = it },
                modifier = Modifier.fillMaxWidth(),
                textStyle = Type.body.copy(color = Ink),
                cursorBrush = SolidColor(Accent),
                singleLine = true,
                decorationBox = { inner ->
                    if (nickname.isEmpty()) {
                        Text("给自己起个名字", style = Type.body.copy(color = InkMeta))
                    } else {
                        inner()
                    }
                },
            )
        }
        Spacer(Modifier.height(24.dp))

        SectionLabel("头像颜色")
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ColorChip("墨", Ink, colorKey == "ink", { colorKey = "ink" }, modifier = Modifier.weight(1f))
            ColorChip("印", Accent, colorKey == "accent", { colorKey = "accent" }, modifier = Modifier.weight(1f))
            ColorChip("铜", Bronze, colorKey == "bronze", { colorKey = "bronze" }, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(28.dp))

        PrimaryButton("完成") {
            saveProfile(ProfileData(nickname = nickname, avatarUrl = "", monogramColor = colorKey))
            onDone()
        }
        Spacer(Modifier.height(12.dp))
        GhostButton("稍后再说") { onDone() }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun ColorChip(label: String, color: Color, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .height(46.dp)
            .clip(RoundedCornerShape(RadiusMedium))
            .border(1.dp, if (selected) Accent else LineStrong, RoundedCornerShape(RadiusMedium))
            .background(if (selected) AccentWash else Paper)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(14.dp).clip(CircleShape).background(color))
            Spacer(Modifier.width(8.dp))
            Text(label, style = Type.ui.copy(color = if (selected) Accent else Ink, fontWeight = FontWeight.SemiBold))
        }
    }
}
