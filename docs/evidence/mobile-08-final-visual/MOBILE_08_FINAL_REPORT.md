# MOBILE-08 — Final Visual Acceptance & High-Fidelity Convergence

- 仓库：`D:\Codex\IELTS-practice`
- 分支：`dashboard-only`
- 基线（功能冻结）：MOBILE_07_FUNCTIONAL_CONVERGENCE = VERIFIED（HEAD `902fce1`）
- 本轮性质：**纯视觉收敛**。未改功能、数据库、后端协议、导航 IA、学习机制；仅 hierarchy / composition / spacing / typography / surface / states / iconography / copy micro-polish。
- 验收设备：HUAWEI ELI-AN00（adb `AU7K024621005560`，1200×2664），debug APK 经 `adb reverse tcp:3000` 连真实后端，真实 QA 账号登录。
- 视觉母版（唯一 authority）：Today 批准版 + Auth V3（Paper `#FAF8F4` / Accent `#7A2E2B` / Bronze `#A07C4A` / Ink `#2A2723`；Fraunces · Newsreader · Instrument Sans）。
- 日期：2026-09-19。

> 状态口径：本轮只允许 `VISUAL_ACCEPTED_CANDIDATE` / `VISUAL_NEEDS_REWORK`。
> **最终人工视觉批准仍属于用户**；下列 CANDIDATE 表示「真机帧 + 跨页 board + hierarchy 明确」三项齐备，可进入人工终审。

---

## 1. 逐族视觉判定

| Family | 真机取证 | 视觉 Hero | 判定 |
|---|---|---|---|
| Auth（Login/Register/Forgot） | 3 页 + Login before 对照 | 品牌山景 + 篆刻 + 双语品牌句；表单克制 | `VISUAL_ACCEPTED_CANDIDATE` |
| Profile | 默认 + 滚动 | 一整块 Cream「Personal Learning Portrait」：身份→三长期数字→7 日轨迹→本周目标；工具区降为纯编辑式行 | `VISUAL_ACCEPTED_CANDIDATE` |
| API Config | 仅「未配置」真机态 | 状态卡（尚未配置）为视觉主角，强于表单；清除降权；说明一行 | `VISUAL_ACCEPTED_CANDIDATE`（连接态真机缺口见 §5） |
| Report | 默认 + 滚动 | 「本周总结」Cream Hero → 备考目标 → 无框三列 → 趋势 → 掌握 → 下一步；零桶安全 | `VISUAL_ACCEPTED_CANDIDATE` |
| Goal | 默认 | 编辑式考试日期行；弱分段/时间 chip；无框当前情况；「生成我的计划」结尾落点 | `VISUAL_ACCEPTED_CANDIDATE` |
| Speaking | Initial / Recording / Recorded / Text 四态 | Idle 112dp 麦克风唯一主角；Recording 计时+波形唯一主角；Recorded 主次清晰；Text 200dp 主区域 | `VISUAL_ACCEPTED_CANDIDATE` |
| Account / Change Password | 2 帧 | 紧凑 Cream 身份块 + 编辑式行；描边次按钮退出；改密一句副文案 | `VISUAL_ACCEPTED_CANDIDATE` |
| Secondary（About） | 1 帧 | seal + 品牌名 + 版本 + 一句理念 + 隐私政策，克制 | `VISUAL_ACCEPTED_CANDIDATE` |
| Privacy | 无（本轮未改） | 法律文本阅读体验 polish 未做 | 见 §5 缺口 |

每个 touched screen 均已满足：真机 build → install → screenshot → 对照 Today/Auth V3 的闭环，非仅看 Compose tree。

### 关键视觉决策
1. **字体定稿**：`res/font` 仅 Fraunces（单一粗体）/ Newsreader / Instrument Sans 三个静态文件。Fraunces 被多字重复用会导致中文大标题粗黑压迫，故中文大标题 `editorTitle = Instrument Sans Normal 27/35`（中文回退常规黑体，干净不压迫），英文/衬线展示保留 `editorTitleSmall = Newsreader Normal 22/28`；`heroNum = DisplayFont Medium 40/42`、`editorKicker = UiFont SemiBold 11sp Bronze` 保留。Login「灵犀 IELTS」字标随之从粗 Fraunces 变为常规无衬线，配下方 italic serif 英文句仍有编辑感，真机确认更克制——接受（保留 `LOGIN__V08` before 帧对照）。
2. **去 Dashboard 化**：Profile 取消「身份卡 + 3 小统计卡 + 目标卡 + 设置卡」的等权堆叠，合并为单块连续 composition；Report 取消 5 个同权重统计框，改为编辑式叙事。
3. **Auth 山景不扩散**：山景/晨光仅服务 Login，Register/Forgot 用满宽出血山脊条 `AuthRidgeBand()` 呼应；学习操作页保持克制，不铺山水。
4. **Tokenization 不做 mass refactor**：仅在本轮 touched screens 使用 `Space.xs/sm/md/lg/xl/section/page` 与统一 Type 层级，不机械全局替换，Today/Learn/Review 核心构图零漂移。

---

## 2. System Bars / 字体 / 间距

- **System bar**：`MainActivity` status/navigation bar 维持 Paper `#FAF8F4` + light 图标，真机各页顶部无深灰硬切；未启用 edge-to-edge（保持 `setDecorFitsSystemWindows(true)`），不遮挡系统状态。IME 弹起场景（登录/改密/口语文字）真机验证字段与 CTA 可达。
- **Typography 收敛**：touched screens 大标题统一走 `editorTitle / editorTitleSmall`，数字走 `heroNum / statNum`，kicker 走 `editorKicker`；减少内联 fontSize。
- **Spacing 收敛**：`Space` token（xs4 / sm8 / md12 / lg16 / xl24 / section22 / page14）落地；`SubPage` 标题统一 `editorTitle`、内边距 14dp（所有子页统一；Today/Learn/Review 不用 SubPage，不漂移）。

---

## 3. 功能 / 数据契约 未变更确认

- Speaking 状态机、Result 数据契约、Analyzer prompt、Report 统计口径、Goal 业务逻辑、Profile/Account IA、API Config 验证与 BYOK 安全边界均未改。
- **Report MasteryStack 零桶安全保持**：`filter { it > 0 }`、weight 用真实分数、全 0 显空 track、不塞 epsilon。真机账号含 0 桶（新 1 / 学习中 2 / 复习中 0 / 掌握 9），Report 打开 + 滚动 **logcat 无 `FATAL` / `invalid weight` / `IllegalArgumentException`**。
- API Key 仍仅本机安全存储：不回显完整 key、不上传、不入 logcat/screenshot；自定义端点才显示 Endpoint/协议。
- Production mock：本轮无新增 fixture/假数据，QA 所见均真实账号数据。

---

## 4. 回归

| 项 | 命令 | 结果 |
|---|---|---|
| Android 构建 | `gradlew.bat assembleDebug -PLINGXI_BACKEND_BASE_URL=http://127.0.0.1:3000` | **BUILD SUCCESSFUL** |
| Android 单测 | `:app:testDebugUnitTest`（同 backend flag） | **130 tests / 0 failures** |
| Web 类型 | `npx tsc --noEmit` | **TSC_EXIT=0**（本轮 0 Web 改动） |
| Web 相关 auth 单测 | `npx vitest run tests/unit/auth-surface-security.test.ts` | **24 / 24 passed，EXIT=0** |
| 真机主链 | 登录 → Today → 学习报告（开+滚）→ 备考目标 | 全通过，无崩溃；Report/Goal 可达 |

- **NEW_FAIL = 0**。期间出现的 6 个用例失败均因本轮有意替换旧文案/结构，已对 3 个测试文件做**等价对齐**（forgot 链接补 `performScrollTo()`；身份卡锚点改「累计学习 · 词」；API Config 锚点改「AI 服务状态」；口语 Idle 锚点改「按下开始录音」），未删/skip 测试、未降断言；对齐后回到 130/0。
- Web 全量 vitest 中约 30 个 product-loop（LLM/真实环境）基线失败与 UI 无关，本轮 0 Web 改动，不在本轮新增失败口径内。

---

## 5. 已知缺口 / 视觉阻塞（不阻塞 CANDIDATE，供人工终审决策）

1. **API_CONFIG 连接态真机帧缺失**：无真实用户 key，无法真机触发「连接正常 / 验证中 / 连接异常」状态；当前仅有「未配置」真机帧。连接成功分支（`stateColor=Pos`）仅走代码路径，未在真机留证。未用假 key 或伪造截图冒充真机。
2. **PrivacyScreen 阅读 polish 未做**：任务书 §11 要求法律文本 spacing/typography 小修，本轮未触碰（功能可达，About 内有入口）；不影响主展示链。
3. **Profile 空数据（全新用户）未真机验证**：新版移除旧空态分支，QA 账号有学习数据未触发；单测环境对空数据有断言覆盖，但全新真机账号的克制空态建议终审时补一次肉眼检查。
4. 系统栏未做 edge-to-edge（当前 Paper 协调已无硬切），如终审追求全出血可作为 MOBILE-09 可选项，不属本轮范围。

无 `SCHEMA_CHANGE_REQUIRED / NEW_PAID_SECRET_REQUIRED / DESTRUCTIVE_USER_DATA_ACTION / SECURITY_BLOCKER` 等 HARD STOP。

---

## 6. 真机截图清单（17 帧）

目录：`docs/evidence/mobile-08-final-visual/`

- `00-board/MOBILE_08_VISUAL_BOARD.png` — 16 帧 4×4 跨页一致性总览（自检通过）
- `01-auth/`：LOGIN__DEFAULT、**LOGIN__V08（before 对照，不入 board）**、REGISTER__DEFAULT、FORGOT__DEFAULT
- `02-profile/`：PROFILE__DEFAULT、PROFILE__SCROLLED
- `03-api-config/`：API_CONFIG__UNCONFIGURED
- `04-report/`：REPORT__DEFAULT、REPORT__SCROLLED
- `05-goal/`：GOAL__DEFAULT
- `06-speaking/`：SPEAKING__INITIAL / RECORDING / RECORDED / TEXT
- `07-account/`：ACCOUNT__DEFAULT、CHANGE_PASSWORD__DEFAULT
- `08-secondary/`：ABOUT__DEFAULT

均为 `*__PHYSICAL_DEVICE.png` 真机帧；无 ROBOLECTRIC 帧冒充真机。

---

## 7. Commits（本轮 7 个，未 push）

1. `083cf20` mobile: refine auth visual composition
2. `5089b90` mobile: redesign profile visual hierarchy
3. `a4c6cb8` mobile: redesign ai config visual hierarchy
4. `a107791` mobile: refine report and goal visual hierarchy
5. `11fb0a0` mobile: refine speaking visual states
6. `71d7f40` mobile: finalize visual system polish
7. （本报告 + 证据）mobile: add mobile-08 final visual evidence and acceptance report

提交边界：仅本轮 13 源码文件 + `auth_ridge.xml` + 3 个对齐测试 + 本证据目录。未提交 roborazzi 刷新 PNG、`mobile-03d-today-pilot` 刷新图、build 日志及其它历史 untracked；未 push。

---

## 8. §20 Final Report

```text
AUTH_VISUAL:              VISUAL_ACCEPTED_CANDIDATE
PROFILE_VISUAL:           VISUAL_ACCEPTED_CANDIDATE
API_CONFIG_VISUAL:        VISUAL_ACCEPTED_CANDIDATE   (connected-state device frame pending; see §5)
REPORT_VISUAL:            VISUAL_ACCEPTED_CANDIDATE
GOAL_VISUAL:              VISUAL_ACCEPTED_CANDIDATE
SPEAKING_VISUAL:          VISUAL_ACCEPTED_CANDIDATE
ACCOUNT_VISUAL:           VISUAL_ACCEPTED_CANDIDATE
SECONDARY_VISUAL:         ABOUT CANDIDATE; PRIVACY polish deferred (see §5)
TODAY_REGRESSION:         NONE (real-device master frame unchanged)
LEARN_REGRESSION:         NONE (untouched; build + 130/0 unit tests green)
REVIEW_REGRESSION:        NONE (untouched; build + 130/0 unit tests green)
NOTES_REGRESSION:         NONE (untouched; build + 130/0 unit tests green)
SYSTEM_BAR:               PAPER-COORDINATED, NO HARD CUT (edge-to-edge not enabled; out of scope)
TYPOGRAPHY_CONVERGENCE:   APPLIED ON TOUCHED SCREENS (editorTitle/editorTitleSmall/heroNum/editorKicker)
SPACING_CONVERGENCE:      APPLIED ON TOUCHED SCREENS (Space tokens + unified SubPage padding)
ANDROID_TESTS:            130 / 0 FAILURES (assembleDebug SUCCESSFUL)
WEB_TESTS:                tsc --noEmit EXIT 0; auth-surface-security 24/24 EXIT 0
NEW_FAIL:                 0
PHYSICAL_SCREENSHOTS:     17 (16 final + 1 LOGIN before), all PHYSICAL_DEVICE
VISUAL_BOARD:             docs/evidence/mobile-08-final-visual/00-board/MOBILE_08_VISUAL_BOARD.png
FUNCTIONAL_REGRESSION:    NONE — real login→Today→Report(open+scroll,no invalid-weight)→Goal verified
VISUAL_BLOCKERS:          API_CONFIG connected-state device frame; Privacy reading polish; Profile empty-data device eye-check (see §5)
MOBILE_08_VISUAL_ACCEPTANCE: VISUAL_ACCEPTED_CANDIDATE
```

**最终人工视觉批准权属于用户。** 未 push；本轮 STOP，不自动进入下一阶段。
