package com.ielts.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.ielts.core.storage.StorageAdapter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.util.concurrent.ConcurrentHashMap

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "ielts_prefs")

/**
 * 将 :core 的 StorageAdapter 实现为 DataStore（字符串偏好）。
 * 读取走内存缓存（同步，满足 Store 的同步语义），写入异步持久化。
 */
class DataStoreStorageAdapter(private val dataStore: DataStore<Preferences>) : StorageAdapter {
    private val cache = ConcurrentHashMap<String, String>()
    private var loaded = false

    init {
        CoroutineScope(Dispatchers.IO).launch {
            dataStore.data.collect { prefs ->
                cache.clear()
                prefs.asMap().forEach { (k, v) -> if (v is String) cache[k.name] = v }
                loaded = true
            }
        }
    }

    fun ensureLoaded() {
        if (!loaded) runBlocking { dataStore.data.first() }
    }

    override fun getString(key: String): String? = cache[key]
    override fun setString(key: String, value: String) {
        cache[key] = value
        CoroutineScope(Dispatchers.IO).launch {
            dataStore.edit { it[stringPreferencesKey(key)] = value }
        }
    }
    override fun remove(key: String) {
        cache.remove(key)
        CoroutineScope(Dispatchers.IO).launch {
            dataStore.edit { it.remove(stringPreferencesKey(key)) }
        }
    }
    override fun keys(): Set<String> = cache.keys.toSet()
}
