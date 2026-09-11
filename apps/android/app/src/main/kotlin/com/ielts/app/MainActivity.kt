package com.ielts.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import com.ielts.app.nav.AppNavHost
import com.ielts.app.theme.IeltsTheme
import com.ielts.app.viewmodel.StudyViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            IeltsTheme {
                val navController = rememberNavController()
                val vm: StudyViewModel = viewModel()
                AppNavHost(navController, vm)
            }
        }
    }
}
