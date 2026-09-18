package com.ielts.app.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.BuildConfig
import com.ielts.app.R
import com.ielts.app.components.Note
import com.ielts.app.components.NoteVariant
import com.ielts.app.components.SubPage
import com.ielts.app.nav.Routes
import com.ielts.app.theme.Accent
import com.ielts.app.theme.Ink
import com.ielts.app.theme.InkMeta
import com.ielts.app.theme.Type

/**
 * MOBILE-07 — 关于灵犀 IELTS（克制品牌页）。
 * 只放：Logo / 名称 / 版本 / 一句产品理念 / 隐私政策入口。
 * 不做公司墙、开发者信息墙、技术栈页。
 */
@Composable
fun AboutScreen(navController: NavController, innerPadding: PaddingValues) {
    SubPage(title = "关于灵犀 IELTS", onBack = { navController.popBackStack() }, innerPadding = innerPadding) {
        Spacer(Modifier.height(24.dp))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Image(
                painter = painterResource(R.drawable.seal),
                contentDescription = "灵犀",
                modifier = Modifier.size(64.dp),
            )
            Spacer(Modifier.height(14.dp))
            Text("灵犀 IELTS", style = Type.displayTitle, color = Ink)
            Spacer(Modifier.height(6.dp))
            Text("版本 ${BuildConfig.VERSION_NAME}", style = Type.bodySmall, color = InkMeta)
        }
        Spacer(Modifier.height(28.dp))
        Note(
            "让每一次学习影响下一次学习。\nA smaller step, a brighter you.",
            variant = NoteVariant.PLAIN,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            "隐私政策",
            style = Type.bodySmall.copy(color = Accent),
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clickable { navController.navigate(Routes.PRIVACY) }
                .padding(vertical = 10.dp),
        )
    }
}
