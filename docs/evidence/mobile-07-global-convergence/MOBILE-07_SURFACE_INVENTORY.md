# MOBILE-07_SURFACE_INVENTORY

MOBILE-07 — Global Product Convergence · Android 全 Surface / 全状态清单（收敛后）

- 执行：2026-09-19 · Windows 本地主机 · 物理真机 Huawei ELI-AN00（AU7K024621005560，1200×2664）
- 仓库：`D:\Codex\IELTS-practice`，branch `dashboard-only`
- BASE_COMMIT：`7bcee6a` · CODE_HEAD：`d223f3e`（证据/报告提交为当前分支 tip）
- 口径：沿用 MOBILE-VISUAL-AUDIT-01 的 **88 个状态粒度 surface** 基线做增量；本轮不做美丑评分，只做「可达 / 真实 / 同代际」收敛核对。
- 取证标记：
  - **PHYSICAL(M07)** = 本轮在 FINAL_HEAD APK 上真机新取证（20 帧，见文件名）
  - **PHYSICAL(BASELINE)** = 审计基线真机帧，且该面视觉/代码路径本轮未改动，证据仍有效
  - **ROBOLECTRIC_ONLY** = 难稳定真机触发，由单测/Robolectric/fixture 覆盖，不冒充真机
  - **NOT_CAPTURED** = 需特定外部条件（真实付费 key / 服务端 5xx）才能触发

---

## 0. 路由 Delta（相对基线）

| 项 | 基线 | MOBILE-07 | 说明 |
|---|---|---|---|
| Navigation const 路由 | 18 | **20** | 新增 `about` / `change_password` / `notes`；删除 `profile_edit` |
| 死路由 | PRIVACY / PROFILE_EDIT / NOTES（假入口） | **0** | Privacy 已连入口；ProfileEdit 已删屏删路由（0 消费者）；Notes 落地真实页 |
| Auth bootstrap | Splash / Restore(ok) / Restore(error) | 同（3 态） | 错误语义细分，无路由变化 |

---

## A. SYSTEM / BOOTSTRAP

| SURFACE_ID | ROUTE / 状态 | SOURCE | ENTRY / TASK | GEN(M07) | EVIDENCE |
|---|---|---|---|---|---|
| SYS-01 | Splash | MainActivity/AuthGate | 冷启动品牌闪屏 | V3_ALIGNED | PHYSICAL(BASELINE) |
| SYS-02 | Restore · 恢复中 | AuthGate | 恢复本地会话 | V3_ALIGNED | PHYSICAL(BASELINE) |
| SYS-03 | Restore · 网络/服务不可达 | AuthGate | 错误语义区分（网络/服务/401） | V3_ALIGNED | ROBOLECTRIC_ONLY |

## B. AUTH

| SURFACE_ID | ROUTE / 状态 | SOURCE | ENTRY / TASK | GEN(M07) | EVIDENCE |
|---|---|---|---|---|---|
| AUTH-01 | LOGIN 默认 | LoginScreen | 邮箱+密码登录 | V3_ALIGNED | PHYSICAL(M07) `LOGIN__DEFAULT` |
| AUTH-02 | LOGIN loading | LoginScreen | 提交中 | V3_ALIGNED | ROBOLECTRIC_ONLY |
| AUTH-03 | LOGIN 凭据错误 | LoginScreen | 「邮箱或密码不正确」 | V3_ALIGNED | ROBOLECTRIC_ONLY |
| AUTH-04 | LOGIN 服务不可用 | LoginScreen | 产品文案，无技术码 | V3_ALIGNED | NOT_CAPTURED(需5xx) |
| AUTH-05 | LOGIN 网络不可用 | LoginScreen | 「当前网络不可用…」 | V3_ALIGNED | ROBOLECTRIC_ONLY |
| AUTH-06 | REGISTER 默认 | RegisterScreen | 建号 | V3_ALIGNED | PHYSICAL(M07) `REGISTER__DEFAULT` |
| AUTH-07 | REGISTER 校验（邮箱格式/弱密码） | RegisterScreen + zod | 字段级中文提示 | V3_ALIGNED | ROBOLECTRIC_ONLY |
| AUTH-08 | REGISTER 邮箱已注册 | register/route 409 | 「邮箱已注册」+去登录 | V3_ALIGNED | ROBOLECTRIC_ONLY |
| AUTH-09 | REGISTER loading | RegisterScreen | 提交中 | V3_ALIGNED | ROBOLECTRIC_ONLY |
| AUTH-10 | REGISTER 成功→自动登录 Today | AuthRepository | 无需手登 | V3_ALIGNED | ROBOLECTRIC_ONLY |
| AUTH-11 | FORGOT 默认 | ForgotPasswordScreen | 重置密码 / 一次性登录 | V3_ALIGNED | PHYSICAL(BASELINE) |
| AUTH-12 | RESET 邮件已发送 | ForgotPasswordScreen | sent 态 | V3_ALIGNED | PHYSICAL(BASELINE) |
| AUTH-13 | MAGIC-LINK 发送 | ForgotPasswordScreen | 仅在此出现 | V3_ALIGNED | PHYSICAL(BASELINE) |
| AUTH-14 | FORGOT 错误态 | ForgotPasswordScreen | 产品文案 | V3_ALIGNED | ROBOLECTRIC_ONLY |

> Auth root（Login）**无返回键**；Login 首页**无第二邮箱/magic 入口**；品牌句＝「让每一次学习影响下一次学习」；进页/输入即 `clearError`（修复错误残留）；注册协议**仅《隐私政策》**（《用户协议》正式文本缺失，记 `USER_AGREEMENT_CONTENT_REQUIRED`，未编造）。

## C. TODAY

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| TODAY-01 | 默认（有复习+本周轨迹+快捷卡+五栏） | V3_ALIGNED | PHYSICAL(M07) `TODAY__DEFAULT` |
| TODAY-02 | 有任务 | V3_ALIGNED | PHYSICAL(M07)（2 词待复习） |
| TODAY-03 | 无复习空态 | V3_ALIGNED | PHYSICAL(BASELINE) |

## D. LEARN

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| LRN-01 | 入口/卡片正面（回想） | V3_ALIGNED | PHYSICAL(M07) `LEARN__ENTRY` |
| LRN-02 | 查看提示 | V3_ALIGNED | PHYSICAL(BASELINE) |
| LRN-03 | 揭晓释义 | V3_ALIGNED | PHYSICAL(BASELINE) |
| LRN-04 | 认识 / 不认识判定 | V3_ALIGNED | PHYSICAL(BASELINE) |
| LRN-05 | 完成 | V3_ALIGNED | PHYSICAL(BASELINE) |
| LRN-06 | 空态（今日学完） | V3_ALIGNED | PHYSICAL(BASELINE) |
| LRN-07 | 错误态 | V3_ALIGNED | ROBOLECTRIC_ONLY |

## E. REVIEW

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| REV-01 | 入口/回想 | V3_ALIGNED | PHYSICAL(M07) `REVIEW__ENTRY` |
| REV-02 | 提示 | V3_ALIGNED | PHYSICAL(BASELINE) |
| REV-03 | 揭晓 | V3_ALIGNED | PHYSICAL(BASELINE) |
| REV-04 | 自评 生疏/模糊/熟练 | V3_ALIGNED | PHYSICAL(M07)（三键可见） |
| REV-05 | 下一项 / 完成 | V3_ALIGNED | PHYSICAL(BASELINE) |
| REV-06 | 空态（无待复习） | V3_ALIGNED | PHYSICAL(BASELINE) |

## F. NOTES（本轮由假入口落地为真实页）

| SURFACE_ID | 状态 | SOURCE | GEN(M07) | EVIDENCE |
|---|---|---|---|---|
| NTS-01 | 时间线默认（今天/昨天分组，真实事件） | NotesScreen + `StudyService.getLearningTimeline` | V3_ALIGNED | PHYSICAL(M07) `NOTES__DEFAULT` |
| NTS-02 | 滚动（多日） | 同上 | V3_ALIGNED | PHYSICAL(M07) `NOTES__SCROLLED` |
| NTS-03 | 空态（暂无学习记录，克制） | NotesScreen | V3_ALIGNED | ROBOLECTRIC_ONLY |

> 仅读现有 `learning_events` + `speaking_sessions` + SeedData，**未新增 DB schema**；Today「学习手记」快捷卡 route 由 LEARN 改为 `notes`，假入口消除。

## G. SPEAKING

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| SPK-01 | 初始（第 1 题 · 共 4 题；录音/文字） | V3_ALIGNED | PHYSICAL(M07) `SPEAKING__INITIAL` |
| SPK-02 | 文字模式空输入（计数已隐藏） | V3_ALIGNED | PHYSICAL(M07) `SPEAKING__TEXT_EMPTY` |
| SPK-03 | 录音中 recording | V3_ALIGNED | PHYSICAL(BASELINE) |
| SPK-04 | 已录 recorded / 播放 playing | V3_ALIGNED | PHYSICAL(BASELINE) |
| SPK-05 | 提交中（正在分析你的回答…） | V3_ALIGNED | PHYSICAL(BASELINE) |
| SPK-06 | 文字编辑 / 提交 | V3_ALIGNED | PHYSICAL(BASELINE) |
| SPK-07 | 麦克风权限（拒绝/永久拒绝） | V3_ALIGNED | PHYSICAL(BASELINE，03d 帧) |
| SPK-08 | 录音/分析错误态（保留回答可重试） | V3_ALIGNED | PHYSICAL(BASELINE，03d 帧) |

> chrome 已去工程化：`Question x / y` → 「第 x 题 · 共 y 题」；`0 / 1000` 降权为 ≥900 字才出现「已输入 N 字，最多 1000 字」；提交文案不暴露 STT/DashScope/DeepSeek。

## H. SPEAKING RESULT

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| RES-01 | Summary 默认 | V3_ALIGNED | PHYSICAL(BASELINE) |
| RES-02 | Detail | V3_ALIGNED | PHYSICAL(BASELINE) |
| RES-03 | 证据 present | V3_ALIGNED | PHYSICAL(BASELINE) |
| RES-04 | 整体结论 / Next Step | V3_ALIGNED | PHYSICAL(BASELINE) |
| RES-05 | 证据不足降级（needs-review） | **V2_PARTIAL**（构图已统一，信息仍偏密） | ROBOLECTRIC_ONLY |
| RES-06 | 能力明细 fallback | **V2_PARTIAL** | ROBOLECTRIC_ONLY |

> 正面证据才用 ✓；问题/缺项用中性圆点（已核查源码，非同款勾）；`developing`/`needs_review` 不直接面向用户；语气为「你…」非「学生…」。

## I. REPORT（P0 崩溃已修）

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| REP-01 | 默认（周总结/趋势/掌握/目标） | V3_ALIGNED | PHYSICAL(M07) `REPORT__DEFAULT` |
| REP-02 | 滚动 | V3_ALIGNED | PHYSICAL(M07) `REPORT__SCROLLED` |
| REP-03 | 含 0 值桶（真机数据确有 0 桶，不崩） | V3_ALIGNED | PHYSICAL(M07)（同帧，多桶为 0） |
| REP-04 | 全 0 安全空可视化 | V3_ALIGNED | ROBOLECTRIC_ONLY（单测 5 例） |

> `MasteryStack` 对 value≤0 不渲染、不 weight(0f)、不用 epsilon、不改统计口径（commit `7bcee6a`）。真机 logcat 无 `invalid weight` / FATAL。

## J. GOAL（随 Report 修复复活，且新增 Profile 入口）

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| GOAL-01 | 默认（考试日期/目标分/自估/每日时间/当前情况/生成计划） | V3_ALIGNED | PHYSICAL(M07) `GOAL__DEFAULT`（Report 入口） |
| GOAL-02 | Profile 本周目标卡 → GOAL | V3_ALIGNED | PHYSICAL(M07)（双入口均真机点达） |

## K. PROFILE

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| PRO-01 | 顶：身份卡（头像/昵称/邮箱，唯一入口→Account） | V3_ALIGNED | PHYSICAL(M07) `PROFILE__DEFAULT` |
| PRO-02 | Personal Learning Portrait（连续/累计/口语/7 天轨迹） | V3_ALIGNED | PHYSICAL(M07) |
| PRO-03 | 本周目标卡（可点→GOAL） | V3_ALIGNED | PHYSICAL(M07) |
| PRO-04 | 滚动：工具与设置（AI 配置 / 关于） | V3_ALIGNED | PHYSICAL(M07) `PROFILE__SCROLLED_TOOLS` |
| PRO-05 | 学习数据空态 | V3_ALIGNED | PHYSICAL(BASELINE) |

> 右上角无设置齿轮；学习数据直接在 Profile 可视化，未建独立 Learning Progress 页；API Key 入口存在且 below fold。

## L. ACCOUNT / CHANGE PASSWORD

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| ACC-01 | 账号资料默认（头像/昵称/邮箱/状态/安全） | V3_ALIGNED | PHYSICAL(M07) `ACCOUNT__DEFAULT` |
| ACC-02 | 修改密码（已登录，server-mediated） | V3_ALIGNED | PHYSICAL(M07) `CHANGE_PASSWORD__DEFAULT` |
| ACC-03 | 退出登录品牌确认弹窗 | V3_ALIGNED | PHYSICAL(M07) `LOGOUT_CONFIRM` |
| ACC-04 | 改密成功 / 会话失效 | V3_ALIGNED | ROBOLECTRIC_ONLY |

> 改密走新后端 `/api/auth/mobile/change-password`（SSR cookie 鉴权 `updateUser`，401→SESSION_EXPIRED），**不用 service_role、不收发 token、不跳找回页**。真机未实际提交新密码以保护 QA 账号；功能由端点+页面+单测覆盖。退出弹窗：「确定退出当前账号吗？退出后需要重新登录。」[取消][退出登录]，确认键 testTag=`logout_confirm`。

## M. AI SERVICE CONFIG

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| CFG-01 | 尚未配置 | V3_ALIGNED | PHYSICAL(M07) `API_CONFIG__UNCONFIGURED` |
| CFG-02 | 密钥已保存·可连接测试 | V3_ALIGNED | ROBOLECTRIC_ONLY |
| CFG-03 | 验证中（正在验证连接…） | V3_ALIGNED | ROBOLECTRIC_ONLY |
| CFG-04 | 连接正常 | **UNKNOWN**（状态机/UI 已实现，需真实 key 真机确认） | NOT_CAPTURED(需key) |
| CFG-05 | 失败（密钥无效/无法连接/地址不完整，中文） | **V2_PARTIAL**（文案已产品化，真机失败态未逐帧） | ROBOLECTRIC_ONLY |
| CFG-06 | custom endpoint 才显示 Endpoint URL | V3_ALIGNED | ROBOLECTRIC_ONLY |

> 👁/🙈 emoji 已换 Material vector（Visibility/VisibilityOff）；非 custom 不显示 URL 且不可空 URL 静默验证；不显示 HTTP/401/provider；Key 仅本机安全存储。

## N. SECONDARY

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| SEC-01 | ABOUT（Logo / 灵犀 IELTS / 版本 1.0 / 理念 / 隐私入口） | V3_ALIGNED | PHYSICAL(M07) `ABOUT__DEFAULT` |
| SEC-02 | PRIVACY（真实中文隐私内容，可达） | V3_ALIGNED | PHYSICAL(M07) `PRIVACY__DEFAULT` |
| SEC-03 | PROFILE_EDIT | — | **已删除**（0 消费者，屏+路由移除，commit `d52d51c`） |

## O. DIALOGS / MISC

| SURFACE_ID | 状态 | GEN(M07) | EVIDENCE |
|---|---|---|---|
| DLG-01 | 退出登录确认（基线缺失→已落地） | V3_ALIGNED | PHYSICAL(M07) `LOGOUT_CONFIRM` |
| DLG-02 | Toast / Snackbar / Error Banner | V3_ALIGNED | PHYSICAL(BASELINE) |

---

## 汇总

```
TOTAL_SURFACES (基线)        : 88
  删 PROFILE_EDIT 死 surface : -1
  Notes 新增正式「空态」state : +1
TOTAL_SURFACES (M07)         : 88
TOTAL_ROUTES                 : 20 const（+ Auth bootstrap 3 态）
```

代际分布（M07 收敛后）：

| 代际 | 基线 | M07 |
|---|---|---|
| V3_ALIGNED | 62 | **84** |
| V2_PARTIAL | 9 | **3**（RES-05/06 降级密度、CFG-05 失败态真机未逐帧） |
| V1_LEGACY | 0 | 0 |
| UTILITY_RAW | 0 | 0 |
| UNKNOWN | 12 | **1**（CFG-04 连接正常，需真实 key 真机确认） |
| 死路由/缺失 | 5 | **0**（PROFILE_EDIT 删除，其余落地） |
