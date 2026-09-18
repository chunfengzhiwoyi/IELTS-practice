package com.ielts.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import com.ielts.app.nav.AppNavHost
import com.ielts.app.theme.IeltsTheme
import com.ielts.app.viewmodel.AuthViewModel
import com.ielts.app.viewmodel.StudyViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // MOBILE-07 §11：系统栏与 Paper 视觉协调，去掉默认深色状态栏硬切；不启用 edge-to-edge，
        // 内容沿用既有 innerPadding / statusBarsPadding，避免全 App inset 回归。
        val paper = android.graphics.Color.parseColor("#FAF8F4")
        window.statusBarColor = paper
        window.navigationBarColor = paper
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
        WindowCompat.setDecorFitsSystemWindows(window, true)
        setContent {
            IeltsTheme {
                val navController = rememberNavController()
                val vm: StudyViewModel = viewModel()
                val authVm: AuthViewModel = viewModel()
                AppNavHost(navController, vm, authVm)
            }
        }
    }
}
