# Bad Case 033 — Error Contract: MODEL_SCHEMA_MISMATCH 不折叠

| | |
|---|---|
| **Case** | ELS-EVAL-033 |
| **Category** | FALLBACK_FAILURE / OUTPUT_VALIDATION |
| **Base Commit** | `43364c3` |
| **Branch** | `fix/eval-033-error-contract` |
| **Worktree** | `D:\Codex\IELTS-badcase-033` |
| **日期** | 2026-09-09 |
| **Frozen Gold** | `ELS_EVALUATION_V1_1`（未修改） |
| **Latest Eval** | `m3-20260909-143153` → FAIL |

---

## 1. Problem

### Frozen Gold (ELS-EVAL-033)

> 模型输出合法 JSON 但不符合 Zod schema，修复后仍不匹配（顽固错），系统须以 `MODEL_SCHEMA_MISMATCH` 正确归类结束，不得 500 裸奔。

**Expected:**
- 错误码 `MODEL_SCHEMA_MISMATCH`（不触发 Provider fallback，符合 shouldFallback 规则）
- HTTP 错误响应结构化（AppError）
- 前端可展示"服务暂时不可用/稍后再试"

**Must Not Happen:**
- 错误码漂移成 500/MODEL_ERROR
- 静默返回部分结果
- 把 schema 错误误判为 Provider 故障去切换

### Latest Eval Evidence (m3-20260909-143153)

| Assertion | Status | Expected | Actual |
|-----------|--------|----------|--------|
| r-error-code | **FAIL** | code=MODEL_SCHEMA_MISMATCH | code=MODEL_ERROR |
| r-readable | PASS | readable=true, noPartial=true | readable=true, noPartial=true |
| r-no-switch | PASS | fallbackTriggered=false, repairAttempted=true | fallbackTriggered=false, repairAttempted=true |

**唯一失败断言：** `app_error_code` 从 `MODEL_SCHEMA_MISMATCH` 漂移为 `MODEL_ERROR`。

Trace evidence:
- `llm.attempt` 两次均记录 `llm_error_code: MODEL_SCHEMA_MISMATCH`（LLM 层正确）
- `validation.result` 记录 `repair_attempts: 1`（修复已尝试）
- `fallback.triggered` 缺席（未误切换 provider）
- `response.sent.app_error_code = MODEL_ERROR`（API 层折叠）

---

## 2. Before Evidence

### 错误流转链

```
用户请求 /api/learn/card?term=galvanize
  ↓
generateWordCardWithLlm()
  ↓ callLlmStructured()
    ↓ attemptStructured()
      ↓ schema.safeParse() 失败
      → return { kind: "failure", error: LlmError("MODEL_SCHEMA_MISMATCH", ...) }  ✓ 正确
    ↓ shouldFallback(MODEL_SCHEMA_MISMATCH) = false  ✓ 不切换
    → throw LlmError(kind="MODEL_SCHEMA_MISMATCH")  ✓ 正确抛出
  ↓ generateWordCardWithLlm 不 catch，向上传播
  ↓
app/api/learn/card/route.ts 内层 catch (line 67-74)
  ↓
  const msg = err.message  ← 只取 message
  endTraceError(tctx, 502, "MODEL_ERROR", msg)  ← 硬编码 MODEL_ERROR ✗
  return { error: { kind: "MODEL_ERROR", ... } }  ← 硬编码 MODEL_ERROR ✗
```

### Root Cause 位置

**文件：** `app/api/learn/card/route.ts`
**行号：** 67-74（修复前）
**问题：** 内层 catch block 硬编码 `kind: "MODEL_ERROR"`，丢弃了 `LlmError` 携带的具体错误码。

`LlmError` 继承 `AppError`，其 `kind` 字段已经是 `MODEL_SCHEMA_MISMATCH`。但 route 没有读取 `err.kind`，而是直接写死 `"MODEL_ERROR"`。

---

## 3. Root Cause

**Failure Layer:** OUTPUT_VALIDATION → API_BOUNDARY（错误码在 API 边界被折叠）

**具体机制：**
1. LLM 层 (`callLlmStructured`) 正确识别 schema mismatch，抛出 `LlmError(kind="MODEL_SCHEMA_MISMATCH")`
2. `generateWordCardWithLlm` 不捕获，向上传播
3. `/api/learn/card` route 的内层 catch 只提取 `err.message`，然后**硬编码** `"MODEL_ERROR"` 作为响应错误码
4. Trace 的 `response.sent.app_error_code` 同样被硬编码为 `"MODEL_ERROR"`
5. 结果：LLM 层和 Trace 的 `llm.attempt` 都说 `MODEL_SCHEMA_MISMATCH`，但 API 响应和 `response.sent` 说 `MODEL_ERROR` — 自相矛盾

**为什么会折叠：** 内层 catch 最初设计时假设所有 LLM 错误都是通用的 "model error"，没有考虑到 LLM 层已经做了细粒度分类（8 种 LlmErrorKind）。这是一个"过度泛化"的错误处理。

---

## 4. Options

### Option A: 直接透传所有底层错误码

- **Pro:** 最大 diagnosability，API 用户看到最具体的错误
- **Con:** 可能泄漏内部实现细节（如 provider 名称、内部状态）
- **Con:** API 稳定性差，底层错误码变化直接影响 API contract
- **Verdict:** 过于激进，不适合所有错误类型

### Option B: 建立 allowlisted API error mapping

- **Pro:** API 稳定，只有 allowlist 中的错误码对外暴露
- **Con:** 需要维护 mapping 表，新增错误码时需要同步更新
- **Con:** 可能过度限制，把有价值的具体错误也映射掉了
- **Verdict:** 适合长期，但当前规模不需要这么重

### Option C: Domain error 保留具体语义，内部 provider/implementation error 映射到安全公开码（采纳）

- **Pro:** `MODEL_SCHEMA_MISMATCH`、`MODEL_INVALID_JSON` 等 domain-level 错误保留具体语义
- **Pro:** 底层 provider 错误（网络异常、SDK 错误）通过 `classifyProviderError` 已经映射为安全的 `MODEL_TIMEOUT`、`MODEL_PROVIDER_UNAVAILABLE` 等
- **Pro:** 非 `AppError` 的未知异常 fallback 为 `MODEL_ERROR`（不泄漏内部细节）
- **Pro:** 实现简单：检查 `err instanceof AppError`，保留 `err.kind`
- **Con:** 需要确保所有 LLM 错误都通过 `LlmError` 抛出（当前已满足）
- **Verdict:** **采纳**

### Product Decision

**Option C：Domain error 保留具体语义。**

- `LlmError` / `AppError` 的 `kind` 字段是已经过分类的安全公开码，直接保留
- 非 `AppError` 的未知异常（如 `throw new Error("...")`）映射为 `MODEL_ERROR`
- 不新增错误码、不修改 LLM 层分类逻辑
- HTTP status 保持 502（所有 LLM 错误统一）

---

## 5. Implementation

### 修改文件

**唯一修改：** `app/api/learn/card/route.ts`

### 修改内容

内层 catch block（修复前）：
```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : "生成词卡失败";
  endTraceError(tctx, 502, "MODEL_ERROR", msg);  // 硬编码 ✗
  return NextResponse.json(
    { error: { kind: "MODEL_ERROR", message: `...${msg}`, trace_id: traceId } },  // 硬编码 ✗
    { status: 502, ... },
  );
}
```

内层 catch block（修复后）：
```typescript
} catch (err) {
  // 保留 LLM 具体错误码（MODEL_SCHEMA_MISMATCH 等），不折叠为 MODEL_ERROR
  const appErr =
    err instanceof AppError
      ? err
      : new AppError("MODEL_ERROR", err instanceof Error ? err.message : "生成词卡失败", traceId);
  const { code, message } = appErrorToTrace(appErr);
  endTraceError(tctx, 502, code, message);  // 使用实际错误码 ✓
  return NextResponse.json(
    { error: { kind: appErr.kind, message: `...${appErr.message}`, trace_id: traceId } },  // 使用实际错误码 ✓
    { status: 502, ... },
  );
}
```

### 关键逻辑

1. `err instanceof AppError`：`LlmError` 继承 `AppError`，所以命中
2. `appErr.kind`：直接使用 LLM 层分类的错误码（`MODEL_SCHEMA_MISMATCH`、`MODEL_TIMEOUT` 等）
3. 非 `AppError`：创建新的 `AppError("MODEL_ERROR", ...)`，不泄漏内部异常细节
4. `endTraceError` 使用 `appErrorToTrace(appErr)` 提取的 code，确保 Trace 与 API 一致

---

## 6. API Error Contract

修复后 `/api/learn/card` 的 LLM 错误响应：

| 场景 | error.kind | HTTP Status | 说明 |
|------|-----------|-------------|------|
| Schema mismatch（顽固） | `MODEL_SCHEMA_MISMATCH` | 502 | Zod 校验失败，repair 后仍不匹配 |
| Invalid JSON | `MODEL_INVALID_JSON` | 502 | 无法 JSON.parse |
| Empty response | `MODEL_EMPTY_RESPONSE` | 502 | Provider 返回空 content |
| Timeout | `MODEL_TIMEOUT` | 502 | 超时/网络错误 |
| Rate limited | `MODEL_RATE_LIMITED` | 502 | HTTP 429 |
| Provider unavailable | `MODEL_PROVIDER_UNAVAILABLE` | 502 | HTTP 5xx |
| Unauthorized | `MODEL_UNAUTHORIZED` | 502 | HTTP 401/403 |
| All providers failed | `MODEL_ALL_PROVIDERS_FAILED` | 502 | primary + fallback 都失败 |
| 未知异常 | `MODEL_ERROR` | 502 | 非 AppError 的兜底，不泄漏内部细节 |
| 无效输入 | `INVALID_INPUT` | 400 | Zod 请求校验失败 |
| 未登录 | `AUTH_REQUIRED` | 401 | requireUser 失败 |

响应体格式（所有错误统一）：
```json
{
  "error": {
    "kind": "MODEL_SCHEMA_MISMATCH",
    "message": "无法为「galvanize」生成词卡: Schema 校验失败: ...",
    "trace_id": "trc_xxx"
  }
}
```

---

## 7. Trace Contract

修复后 Trace 一致性：

| Trace 字段 | 值 | 与 API 一致性 |
|-----------|-----|-------------|
| `llm.attempt.llm_error_code` | `MODEL_SCHEMA_MISMATCH` | — |
| `validation.result.zod_validation_result` | failure | — |
| `validation.result.repair_attempts` | 1 | — |
| `fallback.triggered` | 缺席 | — |
| `response.sent.app_error_code` | `MODEL_SCHEMA_MISMATCH` | ✓ 与 API error.kind 一致 |
| `response.sent.http_status` | 502 | ✓ 与 HTTP status 一致 |
| Trace Header.final_error_code | `MODEL_SCHEMA_MISMATCH` | ✓ |

**关键保证：** 用户看到的公开错误语义与 Trace 中诊断到的错误类型不自相矛盾。

---

## 8. Security Trade-off

### BC-033-SAFETY-PATCH 修正

原始 BC-033 修复存在 Security Contract contradiction：
Product Decision 声称"非 AppError 未知异常不泄漏内部细节"，
但实现中 `callAndValidate`（`lib/llm/structured-output.ts:354-361`）会把 provider
抛出的非 LlmError 包装为 `LlmError("MODEL_ERROR", err.message)`，
导致 route 看到的是 AppError（LlmError 继承 AppError），
`err.message`（可能包含 SDK path、apiKey、内部状态）被直接暴露给客户端。

### 最终安全边界（BC-033-SAFETY-PATCH 后）

| 错误类型 | API kind | API message | Trace message |
|----------|----------|-------------|---------------|
| LlmError(SCHEMA_MISMATCH/TIMEOUT/...) | 保留具体 kind | 保留已分类 message（Zod 字段名等，安全） | 保留 |
| LlmError(MODEL_ERROR) from callAndValidate | MODEL_ERROR | **安全文案** "模型服务暂时不可用，请稍后重试" | 保留内部 message（debug-only） |
| 非 AppError 未知异常 | MODEL_ERROR | **安全文案** "模型服务暂时不可用，请稍后重试" | 保留内部 message（debug-only） |
| 其他 AppError (AUTH/INVALID_INPUT/...) | 保留 kind | 保留 message | 保留 |

### 为什么 LlmError(MODEL_ERROR) 需要特殊处理

- `MODEL_ERROR` 是 `callAndValidate` 的通用 catch-all，其 message = 原始 `err.message`
- 其他 LlmError kind（SCHEMA_MISMATCH、EMPTY_RESPONSE、INVALID_JSON 等）的 message
  由 LLM pipeline 构造，只包含字段名/分类信息，不包含底层 SDK 敏感内容
- 因此安全判断条件为：`appErr instanceof LlmError && appErr.kind === "MODEL_ERROR"`

### Trace 与 API 的职责分离

- **API-visible message**：用户可见，必须安全，不得包含 arbitrary err.message
- **Trace response.sent**：内部诊断（debug-only endpoint `/api/debug/traces/[traceId]`），
  受 M2 Privacy Contract 约束（单条 payload 4KB 截断、raw output 512 char 截断），
  可记录内部错误摘要用于问题定位
- 两者语义一致（kind 相同），但 message 详细程度不同

### 保留了什么

- `MODEL_SCHEMA_MISMATCH` 等 domain-level 错误码：产品级分类，不包含敏感信息
- 具体 LlmError kind 的已分类 message（Zod validation 字段名等）：可诊断的必要信息

### 保护了什么

- `LlmError(MODEL_ERROR)` 的 raw `err.message` → 安全公开文案，不暴露 SDK path/apiKey/内部状态
- 非 AppError 未知异常的 raw `err.message` → 安全公开文案
- API Key、provider 内部配置不在错误响应中
- 无 stack trace 泄漏

### Trade-off

- 保留具体错误码意味着 API contract 包含更多可能值（8 种 LLM 错误码）
- 但这些错误码已在 `ErrorKind` union type 中定义，是稳定的公开 contract
- `MODEL_ERROR` 的 API message 是固定文案，丢失了具体底层错误信息——
  但内部 Trace 仍保留，可通过 debug endpoint 诊断
- 前端可根据不同错误码展示不同文案（`MODEL_SCHEMA_MISMATCH` → "生成内容格式异常"，
  `MODEL_RATE_LIMITED` → "请求过于频繁"，`MODEL_ERROR` → "服务暂时不可用"）

---

## 9. Regression

### 新增测试：`tests/unit/badcase-033-error-contract.test.ts`

| 测试类 | 用例数 | 覆盖 |
|--------|--------|------|
| schema mismatch → MODEL_SCHEMA_MISMATCH | 3 | 错误码精确、响应结构化、无部分结果 |
| Trace consistency | 3 | response.sent.app_error_code、llm.attempt、fallback 缺席 |
| Safety regression | 3 | 未知异常 → 安全文案、path/apiKey 不泄漏、SCHEMA_MISMATCH 不被折叠 |
| Normal path | 2 | LLM 成功 200、seed 命中 200 |
| Input validation | 1 | 空 term → INVALID_INPUT 400 |
| LlmError 单元 | 2 | kind 保留、shouldFallback=false |

### Regression Matrix

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| target specific error (schema mismatch) | MODEL_ERROR ✗ | MODEL_SCHEMA_MISMATCH ✓ |
| generic unexpected error | MODEL_ERROR | MODEL_ERROR（不变） |
| validation/input error | INVALID_INPUT | INVALID_INPUT（不变） |
| provider/model failure | MODEL_ERROR | MODEL_TIMEOUT / MODEL_PROVIDER_UNAVAILABLE（更精确） |
| normal success | 200 | 200（不变） |
| fallback success | N/A（schema mismatch 不 fallback） | N/A（不变） |

---

## 10. Expected Eval Outcome

修复后预期 ELS-EVAL-033 三个断言：

| Assertion | 预期 |
|-----------|------|
| r-error-code | **PASS** — code=MODEL_SCHEMA_MISMATCH |
| r-readable | PASS — readable=true, noPartial=true（未修改） |
| r-no-switch | PASS — fallbackTriggered=false, repairAttempted=true（未修改） |

**不写 ELS-EVAL-033 PASS。真正 PASS 由独立 Eval Runner 在合并后决定。**

EXPECTED_ON_INDEPENDENT_EVAL: PASS（基于代码逻辑分析，待独立 Eval Runner 验证）
