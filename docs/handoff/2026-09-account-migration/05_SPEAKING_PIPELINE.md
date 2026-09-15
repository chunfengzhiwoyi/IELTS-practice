# 05_SPEAKING_PIPELINE.md — Speaking 管线（从代码核对）

> 全部为 2026-09-15 从当前仓库代码实时核对，非旧报告复述。

## 1. 真实端点

| 端点 | 文件 | 方法/用途 |
|---|---|---|
| `POST /api/speaking/session` | `app/api/speaking/session/route.ts` | 建会话（含 frozen suggestedExpressions） |
| `GET /api/speaking/sessions` | `app/api/speaking/sessions/route.ts` | 会话列表 |
| `POST /api/speaking/transcribe` | `app/api/speaking/transcribe/route.ts` | 音频→文本 |
| `POST /api/speaking/analyze` | `app/api/speaking/analyze/route.ts` | 分析（LLM+规则降级；能力观察/效果评估/evidence 服务端写） |
| `POST /api/speaking/complete` | `app/api/speaking/complete/route.ts` | 完成会话 |

Web 录音：`lib/client/audio-utils.ts`（浏览器 MediaRecorder）。

## 2. 分析契约（`lib/speaking/types.ts`）

```
SpeakingAnalysisResult {
  candidateIssues: SpeakingIssue[]        // dimension + severity + description + suggestion
  mainIssue: SpeakingIssue                // 每轮只选一个
  microDrill: MicroDrill
  metrics: { wordCount, sentenceCount, connectorCount, uniqueWordRatio, paraphraseScore }
  summary: string
  ieltsAnalysis?: IeltsSpeakingAnalysis   // LLM 深度分析（语音回答填充）
  targetExpressionEvidence?: ValidatedTargetExpressionEvidence[]
  qualityWarning?: {...}                  // NEEDS_REVIEW 时附加（含 sanitization 信息）
}

IeltsSpeakingAnalysis {                   // ← 无任何 band/分数字段
  fluency / lexicalResource / grammaticalRange / pronunciation: DimensionAnalysis|null
  overallDiagnosis: string
  prioritizedSuggestions: string[]
}
DimensionAnalysis { label, level: strong|adequate|developing|weak, evidence[], issues[], suggestions[] }
```

## 3. 关键结论（逐项）

| 能力 | 状态 | 证据 |
|---|---|---|
| IELTS Band / estimated band | **NOT_SUPPORTED** | `IeltsSpeakingAnalysis` 无 band 字段；`lib/llm/tasks/analyze-speaking.ts` BAND_SCORE_LEAK 红线：LLM 一旦输出 band → **确定性强制规则引擎安全回退**（band-free）。**Android Mock 的 6.5 是 UI fixture，非真实能力** |
| strengths / weaknesses | SUPPORTED | DimensionAnalysis.evidence/issues/suggestions + mainIssue |
| 逐句分析（sentence-level） | **NOT_SUPPORTED**（服务端） | 服务端无 sentence 数组输出；Android 结果页逐句为 Mock fixture |
| vocabulary-level analysis | PARTIAL | lexicalResource 维度 + targetExpressionEvidence（词项使用判定） |
| 口语四个维度 | SUPPORTED | fluency/lexicalResource/grammaticalRange/pronunciation（pronunciation=null，需专用 API） |
| 规则引擎降级 | SUPPORTED | `analyzeSpeakingWithLlm` 失败/band-leak → rule engine |
| BAND_SCORE_LEAK redline | SUPPORTED（enforced） | `lib/llm/tasks/analyze-speaking.ts`、`lib/speaking/feedback-quality.ts` |
| Application Evidence | **Web 写路径 IMPLEMENTED；远程表未部署** | `recordApplicationEvidenceFromAnalysis`（analyze route）；远程缺 `application_evidence` 表（AUTH-SEC-02 实测 PGRST205） |
| Ability Observation writeback | IMPLEMENTED | `lib/ability/server-writer.ts` |
| Speaking Evaluation writeback | IMPLEMENTED（isSecondAnswer） | `lib/evaluation/evaluation-builder.ts` → speaking_evaluations |

## 4. 服务端写路径（不阻塞主流程）
1. `application_evidence`（upsert，幂等键 user_id+item_id+session_id；second 覆盖 first 记 recoveredViaRetry）
2. `ability_observations`（观察提升规则）
3. `speaking_evaluations`（仅二次回答；issueResolutionRate 等）

## 5. Web UI
- `app/speaking/page.tsx` + `components/speaking/`（既有 Web 口语界面）
- 题库：`lib/speaking/question-bank.ts`（P1/P2/P3，13 题，跨语境覆盖率 8/8——PRODUCT-LOOP-04F 证据 `99d4e5f`）

## 6. Android 接线现状
- Speaking 前端 Shell 全部状态 = Mock（`SpeakingMock.kt`）；**MOBILE-04 尚未开始**：无 Recorder/权限/HTTP/Auth 桥/transcribe/analyze 接线。
- MOBILE-04-00 审计结论（证据：本包 04 + AUTH-SEC 系列）：复用既有 Web API 链即得相同 writeback，**Android 不重写证据系统**；但受 Auth 桥 BLOCK（AUTH-SEC-02 前置结论：MOBILE-04-02 推荐方案 B=server exchange 路由，AUTH_BRIDGE_READY=YES，未施工）。
