# Special-Tool Requirement — ELS-EVAL-034

| 字段 | 值 |
|---|---|
| CASE_ID | ELS-EVAL-034 |
| severity | S3 |
| category | FALLBACK_FAILURE |
| automation_level | C（SPECIAL_TOOL） |
| execution_status | **BLOCKED**（BLOCKED_BY_CAPABILITY） |
| run | `m3-20260909-142124` |
| product_base / runner_base | `43364c3` / `7ff7fc1` |
| current_expected（Gold） | PASS |

## 1. Gold（Frozen 契约）

- **precondition**：行 1 未配置 Whisper Key；行 2 注入上游 5xx。
- **expected_behavior**：行 1 → 503 CONFIG_ERROR；行 2 → 502（或 fallback 文案），错误响应结构化；前端提示"语音不可用，可改用文字输入"且不阻塞口语流程。
- **pass_criteria**：http_status/app_error_code 符合上表；前端存在文字输入回退路径（可达）；错误日志含 trace_id 与 audio_metadata 摘要。
- **notes**：覆盖 Failure 必覆盖项「STT failure」。Whisper 未走统一管线，是已知架构缺口（审计 §5.2 调用点 7）。

## 2. Special-Tool Requirement

| 项 | 内容 |
|---|---|
| 工具名 | E2E browser（前端路径可达性）+ 真实 Whisper/STT 管线 |
| 能力 | 行 1：无 Whisper Key 场景下驱动前端 → 断言 503 CONFIG_ERROR + 文字输入回退路径可达；行 2：注入上游 5xx → 断言 502/fallback 文案 + 不阻塞口语流程 + 日志含 trace_id/audio_metadata |

## 3. Input / Output Contract

```jsonc
// input
{
  "audio": "File",
  "text": "string?（文字输入回退）",
  "traceId": "string"
}
// output
{
  "whisper_error_code": "CONFIG_ERROR(503) | UPSTREAM_5XX(502)",
  "ui_fallback_offered": "boolean",
  "transcript": "string?",
  "degradation_flag": "boolean",
  "log_trace_id": "string",
  "log_audio_metadata": "object"
}
```

## 4. Runner Adapter Placeholder

- `tests/eval/cases/els-eval-034.eval.ts`：`r-e2e` 直接 `ctx.rec.blocked("BLOCKED_BY_CAPABILITY: E2E browser / 真实 STT 不存在")`，**不伪造执行**。
- 工具就绪后：placeholder 换为 E2E 驱动（无 Key / 5xx 注入双场景）→ 断言状态码、回退文案、前端可达性、日志字段。

## 5. 判定

- 工具不存在 → **BLOCKED**。Whisper 未走统一管线为已知架构缺口，登记审计项（§5.2 调用点 7），不修产品。
