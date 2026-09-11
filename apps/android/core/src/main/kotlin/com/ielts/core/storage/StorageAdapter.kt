package com.ielts.core.storage

import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

/**
 * 平台无关的键值存储抽象。对应小程序的 StorageAdapter。
 * Android 端由 :app 注入 DataStore 实现。
 */
interface StorageAdapter {
    fun getString(key: String): String?
    fun setString(key: String, value: String)
    fun remove(key: String)
    fun keys(): Set<String>
}

/** 内存实现，仅用于测试 / 无持久化场景。 */
class MemoryStorageAdapter : StorageAdapter {
    private val map = HashMap<String, String>()
    override fun getString(key: String): String? = map[key]
    override fun setString(key: String, value: String) { map[key] = value }
    override fun remove(key: String) { map.remove(key) }
    override fun keys(): Set<String> = map.keys.toSet()
}

/**
 * 全局存储单例。对应小程序 `store`。持有 [StorageAdapter] 并提供 JSON 读写。
 */
object Store {
    lateinit var adapter: StorageAdapter

    val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true }

    inline fun <reified T> getJSON(key: String): T? {
        val raw = adapter.getString(key) ?: return null
        return try { json.decodeFromString<T>(raw) } catch (_: Exception) { null }
    }

    inline fun <reified T> setJSON(key: String, value: T) {
        adapter.setString(key, json.encodeToString(serializer<T>(), value))
    }

    fun remove(key: String) = adapter.remove(key)
    fun keys() = adapter.keys()
}
