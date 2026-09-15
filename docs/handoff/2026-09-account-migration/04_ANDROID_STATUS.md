# 04_ANDROID_STATUS.md — Android 端当前状态

> SOURCE：`apps/android/` 实时代码 + 本轮实测。TIMESTAMP：2026-09-15。

## 1. 技术栈
- Kotlin + Jetpack Compose（Material3）+ Navigation Compose + kotlinx.serialization
- compileSdk/targetSdk 34，minSdk 24，applicationId `com.ielts.app`
- 测试：Robolectric + Roborazzi（JVM Compose 渲染截图，非模拟器）
- 模块：`:app`（UI）+ `:core`（领域模型：learning/speaking/storage）

## 2. 功能页面状态（`app/src/main/kotlin/com/ielts/app/screens/`）

| 页面 | 文件 | 状态 |
|---|---|---|
| Today（今日） | `TodayScreen.kt` | **IMPLEMENTED + VISUAL_FROZEN（PILOT-01 R3）**；真实数据接线（due/minutes/weekly activity）通过 | 
| Learn（学习） | `LearnScreen.kt` | IMPLEMENTED（既有，非本轮） |
| Review（复习） | `ReviewScreen.kt` | IMPLEMENTED（既有，非本轮） |
| Speaking（口语 Shell） | `SpeakingScreen.kt` + `speaking/SpeakingState.kt` + `SpeakingMock.kt` | **IMPLEMENTED + VISUAL_FROZEN（PILOT-02）**——全部状态为 UI Mock |
| Speaking 结果页 | `SpeakingResultScreen.kt` / `SpeakingResultDetailScreen.kt` | IMPLEMENTED（Mock fixture） |
| Goal / My / Settings / Login / Profile | `GoalScreen.kt` `ProfileScreen.kt` `ProfileEditScreen.kt` `LoginScreen.kt` `ApiConfigScreen.kt` `PrivacyScreen.kt` `IdentityScreen.kt` `ReportScreen.kt` | IMPLEMENTED（既有界面；**登录仅 UI，无真实 Auth 桥**） |
| Bottom Navigation | `nav/Navigation.kt` | 五项：今日/学习/复习/口语/我的；active=酒红（FROZEN） |

## 3. Speaking 状态机（PILOT-02 冻结，`SpeakingState.kt`）

```
SpeakingInputMode   = VOICE | TEXT（Voice First）
SpeakingRecordingState = IDLE → RECORDING → RECORDED → SUBMITTING → SUCCESS →（导航结果页）
                          └────── ERROR（重试）
SpeakingUiState     = 不可变视图状态 + SpeakingEvents（显式回调）
```

- Mock 隔离：`SpeakingMock.kt` 集中所有计时/波形/时长/提交/失败/结果 fixture；`shouldFail()` 演示规则。
- **Mock 结果含 band="6.5"** —— ⚠️ 仅 UI fixture，**canonical 后端无 Band**（见 05）。不得视为真实能力。

## 4. 真实能力清单（禁止混淆）

| 能力 | 状态 | 证据 |
|---|---|---|
| Today 真实数据（due/minutes/weekly） | **IMPLEMENTED** | `TodayScreenScreenshotTest` 用真实 Store 层预置 |
| Speaking UI Shell 全部状态 | **IMPLEMENTED（Mock）** | `SpeakingScreenshotTest` |
| 真实 Recorder（MediaRecorder/AudioRecord） | **NOT_IMPLEMENTED** | 无 RECORD_AUDIO；`SpeakingMock` 计时 |
| 麦克风权限 | **NOT_REQUESTED** | Manifest 无 RECORD_AUDIO |
| 真实 Auth（Supabase 登录桥） | **NOT_IMPLEMENTED** | `LoginScreen` 仅 UI；MOBILE-04-02 审计 BLOCKED |
| 真实 HTTP Client → Web API | **NOT_IMPLEMENTED** | 无 Retrofit/OkHttp 业务调用 |
| 真实 Transcribe / Analyze | **NOT_IMPLEMENTED** | 仅 SpeakingMock 提交延迟 |
| 真实 Result mapping | **NOT_IMPLEMENTED** | 结果页消费 Mock fixture |
| 应用级设置/登录持久化 | DataStore 存在（`data/DataStore.kt`） | 部分实现 |

## 5. 视觉系统（MOBILE_DESIGN_SYSTEM_V1，FROZEN）
- SOURCE：`theme/Theme.kt`（取自小程序 tokens.scss + Approved Visual Reference 取样）
- 颜色：Paper `#FAF8F4`（暖纸白）/ Accent `#7A2E2B`（酒红）/ Bronze `#A07C4A`（暖铜）/ Ink `#2A2723` / InkMeta `#767067`；Hero 暖光 `#F8EDDF`、Blush `#F9EAE5`
- 字体：Fraunces/Newsreader（衬线，仅品牌/重点学习内容）+ Instrument Sans（UI）
- 品牌 Logo：**canonical 印章 `res/drawable/seal.png`**（红褐色篆刻「灵犀」方形；与设计稿 IMAGE B 一致；miniapp 另有 `assets/seal.png` 同源）——**禁止重绘/替代**
- 截图证据：`docs/evidence/mobile-03d-today-pilot/` 下 r2-android-today-*.png（3 张）+ speaking-*.png（11 张）

## 6. 测试
- `app/src/test/kotlin/com/ielts/app/TodayScreenScreenshotTest.kt`（393dp + 360dp 输出）
- `app/src/test/kotlin/com/ielts/app/SpeakingScreenshotTest.kt`（idle/recording/recorded/submitting/error/text/result-summary/result-detail，393dp + 360dp 部分）
- **本轮 NOT_RUN**：JAVA_HOME 指向已删除的 Android Studio 路径（`D:\AI-Models\Andorid Studio\jbr`），全盘无 JDK。历史成功运行证据：`docs/evidence/mobile-03d-today-pilot/final_build.log`（JAVA_HOME=JDK 17.0.20+8 时 assembleDebug 成功）、`final_r3_build.log`。
- 新账号恢复构建：安装 JDK 17 或修复 JAVA_HOME（SDK 已在 local.properties 指向 `C:\Users\34394\AppData\Local\Android\Sdk`）。

## 7. 与 Web 的关系
- Android 复用 Web 后端（MOBILE-04 目标）——目前**未接线**。
- `:core` 模块的领域模型与 Web `lib/learning`、`lib/speaking` 契约对齐（MOBILE-04-00 审计）。
- Android 不得重新实现学习证据系统（证据 writeback 在服务端，见 03 §4）。
