package com.ielts.app.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ielts.app.components.*
import com.ielts.app.theme.*
import com.ielts.core.client.formatCNDate

@Composable
fun PrivacyScreen(navController: NavController, innerPadding: PaddingValues, onDone: () -> Unit) {
    val date = remember { formatCNDate() }
    val sections = listOf(
        "我们收集什么" to "本 App 仅在本机记录你的学习行为：学习过的单词、复习评级、口语作答文本，以及你设置的昵称与头像配色。",
        "数据存在哪里" to "所有数据仅保存在你这台设备上的本地存储中，不会上传到任何服务器，也不会与第三方共享。",
        "我们如何使用" to "这些数据只用于为你生成学习排程、复习提醒和练习报告，帮助你更高效地备考，别无他用。",
        "匿名身份" to "每次安装会生成一个本机匿名标识（anon-xxxx），仅用于区分本地数据，不含任何真实身份信息，也不关联微信账号。",
        "你拥有的权利" to "你可以随时在「我的 → 设置 → 清空学习数据」中删除全部本地记录；卸载 App 也会一并清除这些数据。",
        "儿童与未成年人" to "本 App 主要面向雅思备考群体。若你未满 18 岁，建议在监护人指导下使用。",
    )

    SubPage("隐私保护", { onDone() }, innerPadding) {
        Spacer(Modifier.height(12.dp))
        sections.forEach { (title, body) ->
            SectionLabel(title)
            Spacer(Modifier.height(6.dp))
            Text(body, style = Type.bodySmall)
            Spacer(Modifier.height(18.dp))
        }
        Note("你在本 App 的所有学习数据仅存储于本机，不会上传云端。", variant = NoteVariant.BRONZE)
        Spacer(Modifier.height(20.dp))
    }
}
