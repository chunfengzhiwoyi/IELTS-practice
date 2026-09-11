package com.ielts.app.viewmodel

import android.app.Application
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ielts.app.data.dataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.util.UUID
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue

/**
 * 全局学习状态：持有匿名 userId（等价替换小程序 Taro.login 的匿名登录），
 * 并用 [version] 触发各屏在数据变更后重算。
 */
class StudyViewModel(app: Application) : AndroidViewModel(app) {
    private val ds = app.dataStore
    val userId: String = runBlocking { getOrCreateUserId() }

    var version by mutableStateOf(0)
        private set

    fun refresh() {
        version++
    }

    private suspend fun getOrCreateUserId(): String {
        val key = stringPreferencesKey("anon_user_id")
        val existing = ds.data.first()[key]
        if (existing != null) return existing
        val newId = "anon-${UUID.randomUUID()}"
        ds.edit { it[key] = newId }
        return newId
    }

    fun clearAll(onDone: () -> Unit) {
        viewModelScope.launch {
            com.ielts.core.service.resetAll()
            // 重置匿名身份
            ds.edit { it.remove(stringPreferencesKey("anon_user_id")) }
            refresh()
            onDone()
        }
    }
}
