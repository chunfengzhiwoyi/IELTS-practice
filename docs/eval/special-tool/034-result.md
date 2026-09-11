# ELS-EVAL-034 — Special Tool Result（E2E browser journey）

**Run**: `m3-20260910-081624`（39/39 registered，44 tests PASS）
**Result**: **UNVERIFIED**（核心断言行全部 PASS；1 个 uncovered trace 字段缺口 → 诚实保留 UNVERIFIED）
**Tool**: `tests/eval/tools/speaking-e2e.ts`（Eval-only：真实路由驱动 + Playwright 浏览器旅程）
**Product 依赖**: `app/api/speaking/transcribe/route.ts`（503 CONFIG_ERROR / 502 MODEL_ERROR / fail() 埋点）+ `components/speaking/answer-input.tsx`（文字默认，语音失败 alert）+ `audio-recorder.tsx` + `speaking-page.tsx`（TOPIC_SELECT → 选 Part 1 → FIRST_ANSWER）

## 1. Frozen Gold 契约（ELS_EVALUATION_V1_1）

- **语义**: S3 / FALLBACK_FAILURE / CURRENT=PASS
- **pass_criteria**:
  1. 行1：无 Whisper Key → `503 CONFIG_ERROR`
  2. 行2：上游 5xx → `502`（或 fallback 文案）
  3. 错误响应结构化
  4. 前端存在**文字输入回退路径**（可达）
  5. 错误日志含 `trace_id` 与 `audio_metadata` 摘要
- **failure_criteria**: 错误未分类 或 用户无回退路径
- **Gold 明确**: route handler test ≠ E2E（需要真实浏览器旅程）

## 2. 执行设计

**API 行（确定性）**: 真实 transcribe 路由 + 内存 provider。
- 行1：env 无 OPENAI/DEEPSEEK Key → 期望 `503 CONFIG_ERROR`
- 行2：`WHISPER_BASE_URL` → 本地 node http 5xx mock（`start5xxServer` + `findFreePort`）→ 期望 `502 MODEL_ERROR` + ui_fallback_offered

**E2E 行（真实浏览器）**: `isAppBuilt`（.next/BUILD_ID 存在，已 `next build`）→ `startNextServer`（`next start` 空闲端口，120s 就绪探活，env 清空 STT Key）→ Playwright chromium headless + fake media stream（`--use-fake-device-for-media-stream`）：
1. 打开 /speaking → 题型选择 → 点击 **Part 1** 卡片（关键顺序：页面初始 TOPIC_SELECT，textArea 在会话创建后才出现）
2. textarea 输入样本 → 断言可达
3. 切语音 tab → 开始录音（假麦克风 ~1.6s）→ 结束 → 提交 → transcribe 503 → **alert 出现**
4. 切回文字 tab → textarea 仍可达（回退不阻塞流程）

## 3. 实测证据（run m3-20260910-081624）

| Row | 断言 | Actual |
|---|---|---|
| r1-no-key-503 | 无 Key → 503 CONFIG_ERROR | `{status:503, kind:"CONFIG_ERROR"}` |
| r2-upstream-5xx-502 | 上游 5xx → 502 MODEL_ERROR + fallback 文案 | `{status:502, kind:"MODEL_ERROR", ui_fallback_offered:true}` |
| r2-structured-error | 错误结构化、不冒充口语分析错误 | `{structured:true, noAnalysisFields:true}` |
| r3-e2e-text-fallback | **真实浏览器**文字回退路径可达 | `{textareaReachable:true, voiceRecorderVisible:true, fallbackAfterError:true}`；evidence：`voiceErrorAlert="未配置 STT API Key（OPENAI_API_KEY 或 DEEPSEEK_API_KEY）"`、typedValue=样本、error=null |
| r4-error-log-trace-id | 错误日志含 trace_id | `{traceIdPresent:true}` |

**Uncovered（诚实记录）**:
> 错误日志未含 audio_metadata 摘要（产品错误路径仅记录 message/status，无输入音频元数据）——**trace 字段缺口**，非决定性语义 FAIL。

## 4. 判定

- 行1/行2/结构化/回退路径/E2E 全部 PASS；failure_criteria（错误未分类 / 无回退路径）未命中。
- Gold pass_criteria 行3的 audio_metadata 日志摘要在产品侧缺失 → **UNVERIFIED**（不降级断言、不把 Integration/API 测试冒充 E2E）。
- 该缺口是**产品 trace 字段能力缺口**（记录于 m3-special-tools.md / m3-p3-summary.md），非 Eval 工具缺失、非 FAIL → 不登记 Bad Case（§10 仅 FAIL 登记）。
