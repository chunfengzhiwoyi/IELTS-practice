package com.ielts.app.nav

import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import com.ielts.app.R
import com.ielts.app.screens.*
import com.ielts.app.theme.*
import com.ielts.app.viewmodel.StudyViewModel

object Routes {
    const val TODAY = "today"
    const val LEARN = "learn"
    const val REVIEW = "review"
    const val SPEAKING = "speaking"
    const val PROFILE = "profile"
    const val PROFILE_EDIT = "profile_edit"
    const val IDENTITY = "identity"
    const val PRIVACY = "privacy"
    const val API_CONFIG = "api_config"
    const val REPORT = "report"
    const val SPEAKING_RESULT = "speaking_result"
    const val SPEAKING_RESULT_DETAIL = "speaking_result_detail"
    const val GOAL = "goal"
    const val LOGIN = "login"
}

data class TabItem(val route: String, val label: String, val icon: Int, val iconActive: Int)

val tabs = listOf(
    TabItem(Routes.TODAY, "今日", R.drawable.today, R.drawable.today_active),
    TabItem(Routes.LEARN, "学习", R.drawable.learn, R.drawable.learn_active),
    TabItem(Routes.REVIEW, "复习", R.drawable.review, R.drawable.review_active),
    TabItem(Routes.SPEAKING, "口语", R.drawable.speaking, R.drawable.speaking_active),
    TabItem(Routes.PROFILE, "我的", R.drawable.profile, R.drawable.profile_active),
)

@Composable
private fun currentRoute(navController: NavController): String? =
    navController.currentBackStackEntryAsState().value?.destination?.route

@Composable
fun BottomBar(navController: NavController) {
    val current = currentRoute(navController)
    NavigationBar(
        containerColor = Paper,
        contentColor = InkMeta,
        modifier = Modifier.height(72.dp),
    ) {
        tabs.forEach { tab ->
            // Result V2：口语结果路由（Summary/Detail）隶属「口语」tab，
            // 保持 active 高亮（与已批准 Result V2 视觉稿底部导航一致）。
            val selected = current == tab.route ||
                (tab.route == Routes.SPEAKING &&
                    (current == Routes.SPEAKING_RESULT || current == Routes.SPEAKING_RESULT_DETAIL))
            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(tab.route) {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = {
                    Icon(
                        painter = painterResource(if (selected) tab.iconActive else tab.icon),
                        contentDescription = tab.label,
                        tint = if (selected) Accent else InkMeta,
                        modifier = Modifier.size(24.dp),
                    )
                },
                label = {
                    Text(
                        tab.label,
                        style = Type.uiLabel.copy(fontSize = 10.sp, color = if (selected) Accent else InkMeta),
                    )
                },
                colors = NavigationBarItemDefaults.colors(indicatorColor = Color.Transparent),
            )
        }
    }
}

@Composable
fun AppNavHost(navController: NavHostController, vm: StudyViewModel) {
    Scaffold(
        bottomBar = { BottomBar(navController) },
        containerColor = Paper,
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Routes.TODAY,
            modifier = Modifier.fillMaxSize(),
        ) {
            composable(Routes.TODAY) { TodayScreen(vm, navController, innerPadding) }
            composable(Routes.LEARN) { LearnScreen(vm, navController, innerPadding) }
            composable(Routes.REVIEW) { ReviewScreen(vm, navController, innerPadding) }
            composable(Routes.SPEAKING) { SpeakingScreen(vm, navController, innerPadding) }
            composable(Routes.SPEAKING_RESULT) { SpeakingResultScreen(navController, innerPadding) }
            composable(Routes.SPEAKING_RESULT_DETAIL) { SpeakingResultDetailScreen(navController, innerPadding) }
            composable(Routes.PROFILE) { ProfileScreen(vm, navController, innerPadding) }
            composable(Routes.PROFILE_EDIT) { ProfileEditScreen(navController, innerPadding) { navController.popBackStack() } }
            composable(Routes.IDENTITY) { IdentityScreen(navController, innerPadding) { navController.popBackStack() } }
            composable(Routes.PRIVACY) { PrivacyScreen(navController, innerPadding) { navController.popBackStack() } }
            composable(Routes.API_CONFIG) { ApiConfigScreen(innerPadding) { navController.popBackStack() } }
            composable(Routes.REPORT) { ReportScreen(vm, navController, innerPadding) }
            composable(Routes.GOAL) { GoalScreen(vm, navController, innerPadding) }
            composable(Routes.LOGIN) { LoginScreen(navController, innerPadding) }
        }
    }
}
