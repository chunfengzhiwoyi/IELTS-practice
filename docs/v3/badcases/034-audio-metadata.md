# Bad Case 034 — audio_metadata 错误路径 Trace 摘要

**Task**: BC-034（TASK_LOCK: ELS-EVAL-034）
**Product Base**: `55806ba815579bbc4d1aabc80d3ba9be8f5b25c2`
**Eval System Ref**: `d3e4edf`
**Latest Eval Run**: `m3-20260910-081624`（ELS-EVAL-034 = UNVERIFIED）

---

## 1. Problem

ELS-EVAL-034 = UNVERIFIED。M3-P3 已真实执行（Playwright E2E + API 行）并证明：
- 文字输入可用、fake mic/STT unavailable、结构化 503 alert、切回文字模式可达（全部 PASS）。

唯一 uncovered requirement：
> 错误路径 Trace / log 缺少 Frozen Gold 要求的 **audio_metadata** 摘要。

## 2. Frozen Gold（ELS_EVALUATION_V1_1 §6.9，Case 034）

- **Category**: FALLBACK_FAILURE；**Failure Layer**: FALLBACK（STT）；**Severity**: S3
- **Pass Criteria**:
  1. http_status/app_error_code 符合上表；
  2. 前端存在文字输入回退路径（可达）；
  3. **错误日志含 trace_id 与 audio_metadata 摘要。**
- **Required Trace Fields**: trace_id, **audio_metadata**, llm_error_code, http_status, ui_fallback_offered
- **Must Not Happen**: 500 未分类；已录音频丢失且无重试/回退引导；把 STT 错误冒充口语分析错误。

## 3. M3-P3 E2E Evidence（m3-20260910-081624）

| Row | 断言 | Actual |
|---|---|---|
| r1-no-key-503 | 无 Key → 503 CONFIG_ERROR | `{status:503, kind:"CONFIG_ERROR"}` |
| r2-upstream-5xx-502 | 上游 5xx → 502 MODEL_ERROR + fallback 文案 | `{status:502, kind:"MODEL_ERROR", ui_fallback_offered:true}` |
| r2-structured-error | 错误结构化、不冒充口语分析错误 | `{structured:true, noAnalysisFields:true}` |
| r3-e2e-text-fallback | 真实浏览器文字回退路径可达 | `{textareaReachable:true, voiceRecorderVisible:true, fallbackAfterError:true}` |
| r4-error-log-trace-id | 错误日志含 trace_id | `{traceIdPresent:true}` |
| **uncovered** | **错误日志缺 audio_metadata 摘要** | 产品错误路径仅记录 message/status |

## 4. Uncovered Requirement

Gold pass_criteria 行3：**错误日志（含 trace）必须含 audio_metadata 摘要**。
当前产品 `request.received.input_summary` 为占位字符串 `"speaking transcribe (audio metadata only)"`，错误路径 trace/logger 无结构化音频元数据。

## 5. Root Cause

`app/api/speaking/transcribe/route.ts` 在 `startTrace` 时尚未解析 FormData，`input_summary` 写死占位符；`fail()` 出口只记录 message/status，未携带任何音频文件元数据（类型/大小/文件名存在性）。由此：503 CONFIG_ERROR、502 MODEL_ERROR、500 INTERNAL 三条错误路径均无法回答"文件是否为空、MIME 是否异常、请求大小是否异常、STT 是否被调用"。

## 6. Failure Layer

**FALLBACK（STT 层）** — 与 Gold 一致；本次修复是 observability 能力补齐，不改业务错误语义。

## 7. Privacy Boundary（M2 Contract §3）

| 约束 | 处理 |
|---|---|
| audio bytes NEVER | 绝不写入 trace / logger；仅摘要字段 |
| base64 NEVER | 不落 base64 |
| 原始音频内容 NEVER | 不落（正常路径 raw_output 仅 transcript head/tail 截断） |
| Authorization NEVER | 不落 key / header |
| full conversation NEVER | 不落 transcript 全文（错误路径无 transcript；成功路径 head/tail 截断 + sha256） |
| filename 可能含个人信息 | **只记 `has_filename: boolean` 与 `extension`，不记完整 filename** |
| payload ≤ 4KB | 沿用 trace 4KB 截断机制 |

## 8. Options

| Option | 描述 | 结论 |
|---|---|---|
| A | `request.received.payload.audio_metadata`（结构化摘要） | **采用**：INPUT 事件语义正确；FormData 提前解析后所有错误路径可见；不新建 event type |
| B | 仅 `llm.attempt(whisper)` 携带 | 拒绝：503 CONFIG_ERROR 路径已发射 llm.attempt（error），但 request.received 才是"输入边界发生了什么"的权威位置 |
| C | 新增 `audio.uploaded` event type | 拒绝：违反"禁止为 034 新建无必要 event type" |
| D | 完整 filename 记录 | 拒绝：隐私风险，仅 has_filename + extension |

## 9. Decision

**Trace Placement**: `request.received`（payload.audio_metadata），复用现有 Trace Contract；`fail()` 的 `logger.error("speaking.transcribe.failed")` 同步携带摘要（覆盖 Gold "错误日志"字面）。不新建 event type。

**关键路径保证**：`formData()` 解析移至 `startTrace` 之前 → 即使 STT config 缺失（503）或上游 5xx（502），audio_metadata 在 trace 首事件即存在。

## 10. Metadata Contract

```ts
audio_metadata?: {
  content_type?: string;      // MIME 异常可排查
  size_bytes?: number;        // 请求大小 / 超限 / 空文件排查
  has_filename: boolean;      // 隐私：不落文件名原文
  extension?: string;         // 文件扩展名（小写）
  empty_audio_flag?: boolean; // size_bytes === 0
}
```

## 11. Must Not Log

- audio bytes / base64 / 原始音频内容
- Authorization header / API key
- 完整 filename（仅 has_filename + extension）
- 完整 transcript（成功路径 raw_output 已截断）

## 12. Implementation

- `lib/observability/trace-contract.ts`: `RequestReceivedPayload` 增加 `audio_metadata?`（BC-034 注释，隐私约束说明）。
- `app/api/speaking/transcribe/route.ts`:
  - 新增 `buildAudioMetadataSummary(file)`（导出供单测边界覆盖）。
  - FormData 解析提前到 `startTrace` 之前，`input_summary` 真实化（`audio upload: {mime} {size}B`）。
  - `fail()` 统一 `logger.error("speaking.transcribe.failed")` 带 `trace_id + audio_metadata`。
  - `whisper.api.failed` / `speaking.transcribe.error` / `speaking.transcribe.success` 日志同样携带摘要。
  - 业务行为零改动（400/503/502/500 语义、ui_fallback_offered、响应结构均不变）。
- `tests/unit/badcase-034-audio-metadata.test.ts`（8 tests）:
  1. 正常路径 metadata 落 trace + 字段值正确（content_type/size_bytes/has_filename/extension/empty_audio_flag）
  2. audio bytes 与 base64 绝不进入任何 payload（唯一标记探测）
  3. **missing STT config（503 CONFIG_ERROR）仍有 metadata**（关键路径）+ llm_error_code/http_status/ui_fallback_offered
  4. 上游 5xx（502 MODEL_ERROR）metadata 仍可见 + 错误结构化
  5. empty audio → empty_audio_flag=true；异常 MIME 原样记录
  6. 无 filename → has_filename=false（隐私边界）
  7. 所有 payload < 4KB + 无 audio_bytes/audio_base64/authorization 字段
  8. 400 路径无文件可描述 → 无 metadata、不崩溃

## 13. Regression

| 项 | 结果 |
|---|---|
| tsc --noEmit | PASS |
| next build | PASS（35/35 static pages） |
| badcase-034 tests | 8/8 PASS |
| M2 Phase1 + Phase2 + P3A + P3B acceptance（含 transcribe 链） | 105/105 PASS |
| full unit | 见下（全量套件结果） |

## 14. Expected Independent Eval

修复后重新运行 Eval Runner（independent）：
- r4-error-log-trace-id → 扩展为 "错误日志含 trace_id 与 audio_metadata 摘要" 应 PASS。
- ELS-EVAL-034 期望由 UNVERIFIED → **PASS**（由独立 Eval Runner 判定，本文件不声明 PASS）。
