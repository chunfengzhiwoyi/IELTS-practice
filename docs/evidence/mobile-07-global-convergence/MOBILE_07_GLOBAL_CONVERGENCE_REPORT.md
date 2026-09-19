# MOBILE_07_GLOBAL_CONVERGENCE_REPORT

MOBILE-07 — Android 全产品功能修复 + 高保真视觉收敛 + 真机全状态验收

- 日期：2026-09-19 · Windows 本地主机
- 物理真机：Huawei ELI-AN00（ADB `AU7K024621005560`，1200×2664）
- 仓库：`D:\Codex\IELTS-practice` · branch `dashboard-only`
- BASE_COMMIT：`7bcee6a` · CODE_HEAD（最后代码提交）：`d223f3e`（本轮 8 个提交，未 push；末个为证据/报告提交，即当前分支 tip）
- 配套清单：`MOBILE-07_SURFACE_INVENTORY.md`；真机证据 20 帧在本子目录各 family 文件夹

---

## 1. 收敛结论（一句话）

> 审计基线的 **4 个 P0、5 个 P1 全部消除**，3 个死路由清零（Privacy 连通、Notes 落地真实页、ProfileEdit 删除），API Config 与改密/登出从工程态转为产品态，五栏主链路 + 身份族 + 报告/目标在同一台真机上**连续可演示、logcat 零崩溃**；视觉代际由 62 V3 / 12 UNKNOWN / 5 死路由收敛为 **84 V3 / 3 V2 / 1 UNKNOWN / 0 死路由**。判定 **MOBILE_GLOBAL_CONVERGENCE = VERIFIED**（保留 3 项 P2 polish 与 2 项受账号/密钥保护的真机端到端，见 §7，均非 blocker）。

## 2. 本轮 commits（scope clean，未 push）

| commit | 内容 |
|---|---|
| `e7bb549` | device QA harness、Space 间距令牌、Paper 系统栏 |
| `d9fe222` | auth 恢复/注册错误细分、已登录改密端点（server-mediated） |
| `0444d0d` | 身份族收敛、About、已登录改密页、真实学习手记时间线 |
| `3cd9568` | AI Config 状态产品化 + Speaking chrome 收敛 |
| `d52d51c` | 删除 PROFILE_EDIT 死路由与屏幕 |
| `24f9680` | 同步 auth 测试（确认弹窗 / 入口文案） |
| `d223f3e` | 修复 QA harness 尾逗号 |
| (tip) | 最终真机 QA 证据（20 帧）+ Surface 清单 + 收敛报告 — 见分支 HEAD「mobile: finalize global visual qa evidence and convergence report」 |

## 3. 各家族结论

| 家族 | 结论 |
|---|---|
| AUTH_FAMILY | **PASS**：品牌句/无返回键/无第二邮箱入口/错误随生命周期清理/注册错误细分（格式·弱密码·已注册·服务·网络）/仅《隐私政策》；真机登出→真登录闭环回 Today |
| CORE_LEARNING_FAMILY | **PASS**：Today/Learn/Review 保持已批准 V3 不漂移，仅统一 token 与 chrome；真机三页取证 |
| NOTES_FAMILY | **PASS（真实数据）**：基于现有 events+sessions+SeedData 的时间线（今天/昨天分组），无 schema 变更；假入口消除 |
| SPEAKING_FAMILY | **PASS**：「第 x 题 · 共 y 题」、字数计数 ≥900 才出现；录音/文字/提交/权限/错误态沿用真机证据；后端管线未改 |
| RESULT_FAMILY | **PASS（保留密度 polish）**：正面证据✓/问题中性圆点、needs-review 用产品文案、「你…」语气；降级两态信息仍偏密 → P2 |
| REPORT_FAMILY | **PASS**：P0 零桶崩溃已修，真机含 0 桶数据打开+滚动无崩溃，全 0 由 5 例单测保 |
| GOAL_FAMILY | **PASS**：Report 与 Profile 双入口真机均可达 |
| PROFILE_FAMILY | **PASS**：Personal Learning Portrait、身份卡唯一入口、目标卡可点、工具行 below fold、无设置齿轮 |
| ACCOUNT_FAMILY | **PASS**：改密为真实已登录流程（不跳找回页/不碰 token）、品牌登出弹窗 |
| API_CONFIG_FAMILY | **PASS（connected 真机保留）**：5 态中文产品化、vector 图标、URL 仅 custom 可验；连接正常态需真实 key 真机确认（UNKNOWN×1） |
| SECONDARY_FAMILY | **PASS**：About 品牌页、Privacy 真实内容可达、ProfileEdit 死路由删除 |

## 4. 回归

- Android：`:app:assembleDebug` **BUILD SUCCESSFUL**（带 `-PLINGXI_BACKEND_BASE_URL=http://127.0.0.1:3000` 真机包）；`:app:testDebugUnitTest` **130 / 0 failures / 16 classes**。
- Web：`tsc --noEmit` **0 error**；auth 三文件 **45/45 通过**。
- Web 全量 vitest：**682 passed / 30 failed（9 files）**——失败全部位于 `product-loop-*` LLM 分析器断言（`band_leakage_flag` / `analysis_path` / `rule_based_analysis` / `ieltsAnalysis` 等需真实 LLM 响应/密钥的行为），与本轮仅改的两个 auth HTTP route 无 import/逻辑交集，属**预存 LLM/env 基线**（按任务要求单独记录，未删/skip/降任何断言）。
- **NEW_FAIL = 0**。
- 真机 logcat：会话全程 **无 FATAL EXCEPTION / E AndroidRuntime / invalid weight**；app pid 存活未崩溃重启。

## 5. 安全 / Mock / 文案审计

- 改密端点 SSR cookie 鉴权 `updateUser`，**无 service_role、不收发/打印/落盘 token**；API Key 仅本机安全存储，未在日志/截图出现。
- 生产无 fake auth / fake recorder / fake result / demo provider；fixture 仅 test/debug 注入。
- 用户可见文案无 HTTP/401/403/500/Supabase/JWT/Cookie/provider/JSON/Exception/stacktrace；`developing`/`needs_review` 不直接面向用户；无「学生…」「Question x/y」「0/1000」「已保存 未验证」。

## 6. 真机取证（20 帧，FINAL_HEAD APK）

`02-auth`(Login/Register) · `03-today` · `04-learn` · `05-review` · `06-notes`(×2) · `07-speaking`(initial/text) · `09-report`(默认/滚动) · `10-goal` · `11-profile`(默认/工具区) · `12-account`(账号/改密) · `13-api-config`(未配置) · `14-secondary`(About/Privacy) · `15-dialogs`(登出确认)。
未改视觉路径的面沿用审计基线真机证据；难触发态以单测/Robolectric 覆盖并在清单标 ROBOLECTRIC_ONLY，未冒充真机。

## 7. 保留项（非 blocker）

- **P2×3**：① Result 证据不足/降级两态信息密度可再收敛；② Space/Type 令牌仅在本轮 touched screens 落地（刻意不机械全局替换以免 Today/Learn/Review 漂移），次级页留待后续批次；③ Session restore 回 Login 本轮冷启动**未复现**（NOT_REPRODUCED，未做压力复现，未瞎改）。
- **受保护未做真机端到端**：改密未在真机实际提交（保护 QA 账号密码，端点+页面+45 auth 测试覆盖）；API Config「连接正常/失败」态无真实 key 未真机触发（状态机+校验已实现）。
- `USER_AGREEMENT_CONTENT_REQUIRED`：仓库无《用户协议》正式文本，注册页仅连《隐私政策》，未编造法律条款。

---

# FINAL REPORT（§20）

```
MOBILE_07_GLOBAL_CONVERGENCE:   VERIFIED
BASE_COMMIT:                    7bcee6a
CODE_HEAD (last code commit):   d223f3e
EVIDENCE_TIP:                   branch HEAD = "mobile: finalize global visual qa evidence and convergence report"
PHYSICAL_DEVICE:                Huawei ELI-AN00 / AU7K024621005560 (1200x2664) ONLINE
TOTAL_ROUTES_BEFORE:            18 const (+ Auth bootstrap 3 态)
TOTAL_ROUTES_AFTER:             20 const (+ Auth bootstrap 3 态)
TOTAL_SURFACES:                 88
PHYSICAL_DEVICE_CAPTURED:       78（M07 新真机帧 20；其余沿用未改面基线真机证据）
ROBOLECTRIC_ONLY:               8
NOT_CAPTURED:                   2（CFG 连接正常需真实 key；LOGIN 服务5xx 需服务端故障）
VISUAL_COVERAGE:                88.6%（78/88 真机；按最佳证据等级互斥归类）
AUTH_FAMILY:                    PASS
CORE_LEARNING_FAMILY:           PASS
NOTES_FAMILY:                   PASS（真实数据，无 schema 变更）
SPEAKING_FAMILY:                PASS
RESULT_FAMILY:                  PASS（降级密度留 P2）
REPORT_FAMILY:                  PASS
GOAL_FAMILY:                    PASS（Report + Profile 双入口真机可达）
PROFILE_FAMILY:                 PASS
ACCOUNT_FAMILY:                PASS
API_CONFIG_FAMILY:              PASS（connected 真机态需 key，UNKNOWN×1）
SECONDARY_FAMILY:               PASS
REPORT_CRASH:                   FIXED（7bcee6a）
GOAL_REACHABILITY:              REACHABLE（双入口真机确认）
CHANGE_PASSWORD:                REAL_SIGNED_IN_SERVER_MEDIATED（真机未实提交以保护账号）
LOGOUT_CONFIRMATION:            DONE（品牌弹窗，真机）
LEARNING_NOTES:                 REAL_TIMELINE
PRIVACY_ROUTE:                  REACHABLE（注册页 + About 双入口，真实内容）
PROFILE_EDIT_DEAD_ROUTE:        REMOVED（0 消费者，屏+路由删除）
ABOUT_ROUTE:                    REACHABLE（品牌页，版本 1.0）
API_CONFIG_VALIDATION:          PRODUCTIZED（中文 5 态 + vector 图标 + URL 条件校验）
SESSION_RESTORE:                NOT_REPRODUCED（本轮冷启动直接恢复 Today，未压测）
USER_VISIBLE_INTERNAL_COPY:     NONE
PRODUCTION_MOCK_AUDIT:          CLEAN（fixture 仅 test/debug）
SECRET_AUDIT:                   CLEAN（无 token/key 落盘或出现在日志/截图）
ANDROID_TESTS:                  130 passed / 0 failed / 16 classes ; assembleDebug SUCCESS
WEB_TESTS:                      typecheck 0 error ; auth 45/45 ; 全量 682 passed / 30 failed(product-loop LLM/env 基线)
NEW_FAIL:                       0
DEVICE_LOGCAT:                  CLEAN（无 FATAL / AndroidRuntime / invalid weight）
P0_REMAINING:                   0
P1_REMAINING:                   0
P2_REMAINING:                   3（Result 降级密度 / 令牌化仅 touched 页 / session 未压测）
VISUAL_BLOCKERS:                NONE
FUNCTIONAL_BLOCKERS:            NONE
COMMITS:                        e7bb549 d9fe222 0444d0d 3cd9568 d52d51c 24f9680 d223f3e (code) + evidence/report tip "mobile: finalize global visual qa..."
MOBILE_GLOBAL_CONVERGENCE:      VERIFIED
NEXT_GATE:                      MOBILE_08_FINAL_ACCEPTANCE
```
