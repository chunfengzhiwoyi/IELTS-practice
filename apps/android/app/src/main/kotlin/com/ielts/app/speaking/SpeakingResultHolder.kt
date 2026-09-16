package com.ielts.app.speaking

/**
 * MOBILE-04C — 真实结果持有器。
 * SpeakingScreen 提交成功后写入真实映射结果；Result Summary / Detail 读取。
 * 无真实结果时回退 Fixture（测试/预览路径），生产路径必然先写入再导航。
 */
object SpeakingResultHolder {
    @Volatile
    var current: ResultSummaryModel? = null

    @Volatile
    var rawContract: ContractSpeakingResult? = null

    fun set(result: ResultSummaryModel, raw: ContractSpeakingResult) {
        current = result
        rawContract = raw
    }

    /** 新一轮练习开始时清空，防止旧结果残留显示。 */
    fun clear() {
        current = null
        rawContract = null
    }
}
