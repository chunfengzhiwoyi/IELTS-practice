# MOBILE-04A PRE-DEVICE QA REPORT

- 阶段：MOBILE-04A-PRE-DEVICE — Recorder Pre-Device Freeze
- 项目：D:\Codex\IELTS-practice（branch: dashboard-only）
- 日期：2026-09-16
- 硬件状态：**NO_PHYSICAL_ADB_DEVICE**（本轮无任何真实设备验证）

## 结论

| 项 | 结果 |
| --- | --- |
| PRODUCTION_AUDIO_ARCHITECTURE | PASS |
| MEDIARECORDER_CONFIG | PASS |
| API_24_COMPATIBILITY | PASS |
| FILE_OWNERSHIP_MODEL | PASS |
| ORPHAN_LOGICAL_FILES | 0 |
| TIMER_CONTRACT | PASS |
| STATE_MACHINE_MATRIX | PASS |
| PERMISSION_LOGIC | PASS |
| LIFECYCLE_JVM | PASS |
| PLAYBACK_STATE_CONTRACT | PASS |
| REAL_AUDIO_TO_FAKE_ANALYSIS_COUPLING | NONE |
| RESULT_V2_REGRESSION | NONE |
| TEXT_MODE_REGRESSION | NONE |
| LONG_DURATION_LOGIC | PASS |
| UPLOAD_HANDOFF_CONTRACT | READY |
| DEPENDENCY_SURFACE | MINIMAL |
| STATIC_SAFETY | PASS |
| TEST_COUNT | 69（FAIL=0，NEW_FAIL=0） |
| BUILD | PASS（assembleDebug + testDebugUnitTest） |
| MOBILE_04A_PRE_DEVICE | **VERIFIED** |
| REAL_DEVICE_AUDIO | **DEFERRED**（NO_PHYSICAL_ADB_DEVICE） |
| MOBILE_04A_DEVICE_QA | OPEN |

## 审计摘要

### 生产架构（第 2 节）
- main source 无 FakeRecorder / FakePlayer（Fake 仅 test source）。
- Recorder 层（SpeakingRecorder / AndroidRecorder / SpeakingPlayer / AndroidMediaPlayer / SpeakingAudioSession / SpeakingAudioFactory）不依赖 SpeakingMock、Result V2、网络、Supabase / Auth。
- UI 只消费 SpeakingUiState 与 SpeakingAudioSession 的明确状态（IDLE / RECORDING / RECORDED / PLAYING + lastRecording + lastError）。
- native resource release ownership：session.release() → player.release() + recorder.release() + 未移交 temp 删除；AndroidRecorder / AndroidMediaPlayer 各自持有并释放自身 native 对象。

### MediaRecorder 配置（第 3 节）
- OutputFormat.MPEG_4 / AudioEncoder.AAC / .m4a（D1 冻结）。
- 调用顺序：setAudioSource(MIC) → setOutputFormat → setAudioEncoder → setOutputFile → prepare() → start()；stop() → release()。
- API ≥ 31：MediaRecorder(context)；API < 31：无参构造（deprecated）；minSdk=24。
- start 失败：reset + release → 返回 false → 上层删残留文件。
- stop 失败：异常上抛 → 上层删除损坏文件 → IDLE + 产品提示。
- 仅证明代码配置正确；物理设备编解码支持由 DEVICE QA 验证。

### 文件生命周期（第 4 节）
- 所有权模型：IDLE 无 active file / RECORDING recorder 持有 temp / RECORDED screen 持有 / RERECORD 与 LEAVE 删除未移交文件。
- 连续 10 次 record → stop → rerecord 循环：ORPHAN_LOGICAL_FILES = 0。
- start 失败 / stop 失败 / cancel / rerecord / release 均删除目标文件（测试断言 File.exists()==false）。

### 计时契约（第 5 节）
- 基于注入单调时钟（生产 = SystemClock.elapsedRealtime），非 composition 次数 / wall-clock / delay 累加。
- start=0 → +10s → +30s 线性；stop 后冻结（RECORDED durationMs 不再随时钟前进）；rerecord 重置；background finish 冻结。
- UI 轮询 250ms 仅做显示刷新，不驱动状态。

### 状态机矩阵（第 6 节，见 STATE_MACHINE_MATRIX.md）
- 合法：IDLE→RECORDING、RECORDING→RECORDED、RECORDED→PLAYING、PLAYING→RECORDED（completion / manual stop）、RECORDED→IDLE(rerecord)、RECORDING→IDLE(cancel)、任意→IDLE(release)、ERROR→RECOVER（IDLE→RECORDING）。
- 非法（IDLE→PLAYING、PLAYING→RECORDING、RECORDING→PLAYING、double start、double stop、play after discard）：全部拒绝，无 crash、无资源泄漏、状态可预测（测试断言 state 与资源标志）。

### 权限逻辑（第 7 节，见 PERMISSION_MATRIX.md）
- 纯函数 resolveMicPermission(granted, hasRequestedBefore, rationaleAvailable) 穷举 8 分支。
- 首次请求前 rationale=false 不误判永久拒绝（需 hasRequestedBefore=true）。
- UI 文案不含 RECORD_AUDIO / SecurityException / Manifest / permanently denied / API 技术串。

### 生命周期（第 8 节）
- ON_STOP while RECORDING → finishRecording → RECORDED（stop 失败 → IDLE + 清理）；ON_STOP while PLAYING → stopPlayback。
- Composable dispose → session.release()（recorder + player + temp 清理）。
- lockscreen / phone call / audio focus / OEM background policy：DEVICE_REQUIRED。

### 播放契约（第 9 节）
- RECORDED→PLAYING（play）→completion→RECORDED；replay；rerecord while playing（stop/release player + 旧文件删除）；dispose release；player error → RECORDED + 产品提示。
- PLAYBACK_CODE = IMPLEMENTED；PLAYBACK_STATE_CONTRACT = VERIFIED（代码级）；REAL_MEDIA_PLAYBACK_VERIFIED 不声明。

### Mock 分析分离（第 10 节）
- shouldFail 已移除；voiceSubmitFails()=false（VOICE 永不过 Mock 失败）；textTooShort(<8) 为 TEXT 旧演示规则，与 recorder 独立。
- 真实 duration / path / file size / amplitude 均不进入 Mock 判定：REAL_AUDIO_TO_FAKE_ANALYSIS_COUPLING = NONE。
- 现状：REAL_RECORDING=YES / REAL_PLAYBACK=YES / MOCK_ANALYSIS=YES / REAL_ANALYSIS=NO / BACKEND=NO。

### Result V2 回归（第 11 节）
- SpeakingResult{Screen,DetailScreen,Card,Contract,Mapper,Models,Fixtures}.kt 相对 04f9101 零 diff。
- 关键字扫描：band / 6.5 / 逐句分析 / 词汇表达 tab / 即将上线 仅在禁止性注释中出现，无实际 UI 内容。

### TEXT 边界（第 12 节）
- TextPanel / textTooShort(<8) / TEXT submit（recordedSeconds=0）逻辑保持原样，无新增损坏。
- TEXT_MODE_ISSUE_RELATION = INDEPENDENT（recorder 不参与 TEXT path），DEFER。

### 长时长逻辑（第 13 节）
- 注入单调时钟模拟 10s / 30s / 60s / 120s / 300s / 600s：均可进入 RECORDED，无 auto-stop（90s 非硬限制）。
- mm:ss formatter：00:10 / 00:30 / 01:00 / 02:00 / 05:00 / 10:00 正确；边界 00:00 / 00:59 / 59:59 / 100:00 无溢出。
- 逻辑模拟，非实际音频录制验证。

### Upload Handoff（第 14 节）
- Recorder 最终提供 file/path + durationMs，扩展名 .m4a，足够未来 multipart field `audio`。未实现 Multipart、未引入 OkHttp。
- UPLOAD_HANDOFF_CONTRACT = READY。

### 依赖面（第 15 节）
- 未引入 Media3 / ExoPlayer / FFmpeg / AudioRecord / PCM engine / 第三方权限框架。原生 MediaRecorder + MediaPlayer。DEPENDENCY_SURFACE = MINIMAL。

### 静态安全（第 16 节）
- 本轮改动文件扫描：无硬编码用户路径、无 debug credential / API key / service_role / Supabase URL、无 println 敏感状态、无 raw exception 展示。
- 命中的 ApiConfigScreen / LoginScreen 为既有演示文件，不在本轮改动范围。

## UI Evidence
5 张 Recorder UI 截图（Robolectric 渲染，**ROBOLECTRIC_UI_EVIDENCE**，非真实设备录音）：
- `docs/evidence/mobile-03d-today-pilot/speaking-permission-denied.png`
- `docs/evidence/mobile-03d-today-pilot/speaking-permission-permanent.png`
- `docs/evidence/mobile-03d-today-pilot/speaking-recorder-start-error.png`
- `docs/evidence/mobile-03d-today-pilot/speaking-recorder-recorded.png`
- `docs/evidence/mobile-03d-today-pilot/speaking-recorder-playing.png`

## 设备债务
见 MOBILE_04A_DEVICE_QA_DEFERRED.md。
