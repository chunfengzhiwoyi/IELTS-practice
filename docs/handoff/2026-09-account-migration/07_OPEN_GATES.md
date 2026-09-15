# 07_OPEN_GATES.md — 真实 OPEN GATES（P0–P3）

> 基于当前 repo + 最近施工状态，非历史 roadmap 照抄。每条含为什么/禁止什么。
> HANDOFF-02 修订：0012 部署已完成（外部核验），Gate 列表按最新事实重排。

## P0（当前执行项）

### G0.1 — Speaking Result V2 Design Review（CURRENT_PRODUCT_GATE）
- 为什么：canonical Analyzer（`lib/speaking/types.ts` + `lib/llm/tasks/analyze-speaking.ts`）**不支持 numeric IELTS Band、无 stable strengths 字段、无 sentence-level analysis**（MOBILE-04-00 审计）。Android 现有 Result V1（Mock fixture 含 6.5）必须重新设计，才能与真实后端契约对齐。
- 内容：产品层面冻结 Result V2 视觉/字段映射（结果摘要 + 完整分析页），再做工程复现。
- 禁止：在 Analyzer 未支持的能力上硬编码 UI 字段；继续把 Mock 6.5 当真实输出。

### G0.2 — AUTH-SCHEMA-04（CURRENT_ENGINEERING_GATE）
内容（按序）：
1. 补远程 0008 §1/§2 缺口（ability_observations 四列）
2. 补 0010（application_evidence 表 + RLS）
3. 验证 local / remote schema equality
4. 处理 migration history reconciliation（远程 history 缺 canonical 0001–0011）
5. 恢复正常 migration workflow

- 前置：0012 已 DEPLOYED_AND_VERIFIED（AUTH-SEC-03 历史 BLOCKED 已 SUPERSEDED）。
- 禁止：裸 migration repair（必须先物化缺口）；db push 重放旧 migration；Dashboard 临时修补。

## P1

### G1.1 — 工作树提交（canonical commit plan 见 02_CURRENT_STATE.md §8）
- 30 项分类完成（CANONICAL_CODE/TEST/MIGRATION/DOC + EVIDENCE + TEMPORARY）。建议 3 个 commit（Android UI+tests / Security migration+tests+tooling / Handoff docs）。
- 禁止：把 TEMPORARY（日志、临时脚本、zoom 裁剪、supabase/.temp）纳入 commit。

### G1.2 — MOBILE-04：Android 真实能力接线（保持后续 Gate，不与 AUTH-SCHEMA-04 并列）
- Recorder（RECORD_AUDIO + MediaRecorder 抽象）→ 复用既有 Web Speaking API → Auth 桥（MOBILE-04-02 方案 B：server exchange 路由）→ Result V2 映射（依赖 G0.1 冻结的字段契约）。
- 禁止：Android 重写证据系统/评分器；Mock fixture 冒充真实能力。

## P2

### G2.1 — session_json 长期安全优化（AUTH-SEC-01 登记 P1）
- 加密 session_json / private schema——未做，登记后续。

### G2.2 — 部署环境核验
- Vercel env（DASHBOARD_ALLOWED_EMAILS / NEXT_PUBLIC_APP_URL）线上状态 UNKNOWN；Supabase Auth URL 配置 USER_ACTION_REQUIRED。

### G2.3 — Web 测试债务
- 32 项 PRE-EXISTING FAIL（badcase-019/026/033、product-loop-02d、int-m3-01——LLM/band-leak 模块）。与 Speaking Analyzer 强相关，改前需 Control Plane 决策。

## P3（DEFERRED，明确不做）
- 0009 空槽（instrumentation p6）——保持 deferred
- Goal Supabase 持久化（memory fallback + durable:false 边界）
- miniapp API key rotation（建议 provider 端 ROTATE，非 blocking）
- REAL_DEVICE Android 截图（当前 Robolectric 渲染验收；真机待设备可用）
