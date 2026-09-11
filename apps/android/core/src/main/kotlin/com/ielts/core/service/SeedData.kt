package com.ielts.core.service

import com.ielts.core.storage.Store
import com.ielts.core.model.SeedLearningItem
import com.ielts.core.model.SpeakingQuestion

/** 从 classpath 资源加载种子数据（打包进 :core/resources） */
object SeedData {
    val items: List<SeedLearningItem> by lazy { load<List<SeedLearningItem>>("ielts-learning-items.json") ?: emptyList() }
    val questions: List<SpeakingQuestion> by lazy { load<List<SpeakingQuestion>>("speaking-questions.json") ?: emptyList() }

    private inline fun <reified T> load(name: String): T? {
        val stream = SeedData::class.java.classLoader?.getResourceAsStream(name)
            ?: run {
                println("WARN: seed resource not found on classpath: $name")
                return null
            }
        return try {
            val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            Store.json.decodeFromString<T>(text)
        } catch (e: Exception) {
            println("WARN: failed to load seed resource $name: ${e.message}")
            null
        }
    }
}
