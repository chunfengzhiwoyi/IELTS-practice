# P4.1 — Metric Formula Audit

> 当前 Supabase 为空，本文件只证明公式与冻结语义一致，不声称真实数据正确性。
> 单位：所有时间戳来自 `created_at`；业务日按 Asia/Shanghai（+08:00）取 dayKey。

## 1. Active Learners
- 冻结定义：valid learning activity = qualifying learning_events ∪ qualifying speaking_sessions，按 user_id 去重；页面浏览/report view/heartbeat/系统事件不计。
- actual tables / columns：
  - `learning_events(user_id, event_type, correctness, created_at)`
  - `speaking_sessions(id, user_id, first_answer, second_answer, main_issue, created_at)`
- algorithm：active = distinct user 出现在任意 learning_events，或出现在 `speaking_sessions.first_answer IS NOT NULL`。
- speaking qualifying 最小规则（业务事实）：`first_answer IS NOT NULL`（已提交首答）即视为真实口语学习活动；未首答的空 session 不计。
- readiness：exact（learning_events）/ derivable proxy（speaking：以 first_answer 非空作为“发生口语学习”代理）。

## 2. Closed-loop Learners
- 冻结定义：range 内完成至少一个 Module Success Loop 的 distinct user。INDEPENDENT/HINTED/FAIL 不是门槛。
- Module Success Rules V1（落地）：
  - Learn：`event_type=NEW AND correctness<>SKIPPED`（state write 成功以事件行本身持久化为 proxy —— 当前表无独立 state-write 审计列）。
  - Review：`event_type=REVIEW AND correctness<>SKIPPED`。
  - Speaking：`first_answer IS NOT NULL AND main_issue IS NOT NULL AND second_answer IS NOT NULL` 且存在对应 `speaking_evaluations` 行。
- actual tables/columns：learning_events(correctness)、speaking_sessions(first_answer/second_answer/main_issue)、speaking_evaluations(session_id)。
- readiness：Learn/Review = derivable proxy（事件持久化≈state write 成功）；Speaking = exact（三条件+评估行齐备）。
- 旧公式（NEW INDEPENDENT + REVIEW）已作废。

## 3. Activation Rate
- 冻结定义：first_use_at = 用户最早 valid activity；activation_at = 最早闭环完成时间；activated = activation_at ≤ first_use_at+24h。分母=first-use cohort。
- algorithm：`buildActivityModel` 计算 firstUseAt/activationAt；act==first_use_at 允许（同事件既是首用又闭环）。
- readiness：exact。

## 4. Top-level 7-Day Retention
- 冻结定义：eligible denominator = activation_at ≤ analysis_end−7d；retained = D1–D7 任一自然日存在 valid activity。不是 exact-D7，也不是 D7±1。
- algorithm：对每个 mature 激活用户，统计 (activation_at+24h, activation_at+8d] 内不同 dayKey 数 >0。
- readiness：exact。
- matrix D1/D3/D7 cell：Implementation Kit 未在本仓库冻结其精确口径 → 登记 semantic ambiguity，不拿 top-level 定义替换 cell（当前 cohorts 返回空，待 P5 fixture 明确）。

## 5. Independent Recall
- 冻结定义：REVIEW AND correctness=INDEPENDENT AND hint_level=0 / 非 SKIPPED REVIEW。
- algorithm：保持不变。readiness：exact。

## 6. 72h Delayed Recall
- 检查：实现为 `PARTITION BY user_id+item_id ORDER BY created_at`；lastLearn = 该 item 最后一次 `NEW INDEPENDENT`；eligibility = 后续 REVIEW 与 lastLearn 的时间差 ≥72h（按事件序，非全局 created_at<now−72h）。
- readiness：exact（口径已确认符合）。

## readiness 汇总
| metric | readiness |
|---|---|
| active learners | exact + proxy(speaking) |
| closed-loop | proxy(learn/review) + exact(speaking) |
| activation | exact |
| top-level D7 retention | exact |
| independent recall | exact |
| delayed 72h | exact（已核对排序规则） |
