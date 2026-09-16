# MOBILE-04C — Android 真实链路测试摘要

Robolectric + MockWebServer（非真实设备，REAL_ANDROID_DEVICE_E2E = DEFERRED）。

## SpeakingBackendClientTest（7 tests）

| 用例 | 覆盖 |
|---|---|
| createSessionParsesAndCarriesCookie | session 解析 + Set-Cookie → 下次请求 Cookie 头自动携带（encrypted jar）+ multipart field "audio" / audio/mp4 |
| transcribe401MapsToSessionExpired | 401 → SESSION_EXPIRED（Auth Gate 重新登录路径） |
| transcribe5xxMapsToTranscriptionFailed | 502 → TRANSCRIPTION_FAILED |
| analyzeParsesRealContractAndMapsToResultV2 | 真实契约 JSON → Contract → Result V2 mapper（非 fallback、维度、nextSteps） |
| analyzeFallbackWithoutIeltsAnalysisMarksFallback | 无 ieltsAnalysis → isFallback=true、无能力模块 |
| analyze5xxMapsToAnalysisFailed | 500 → ANALYSIS_FAILED |
| completeFailureReturnsFalseAndDoesNotThrow | complete 失败返回 false，不销毁 analysis |

## SpeakingResultAppShellTest.realFlowVoiceSubmitToResult（改造）

真实 AppNavHost 下 VOICE 全流程（Robolectric 集成）：
IDLE → 开始录音 → RECORDING → 结束回答 → RECORDED → 提交分析 → SUBMITTING
→ MockWebServer（session → transcribe(m4a) → analyze → complete）→ SUCCESS → 查看结果 → Result Summary。

## 全量

Android `testDebugUnitTest` = **112 tests / 0 failures**（含 Auth/Recorder/Result V2/Today/BackendClient/AppShell）。
