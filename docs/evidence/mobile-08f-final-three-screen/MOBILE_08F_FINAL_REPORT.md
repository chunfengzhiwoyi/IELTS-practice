# MOBILE-08F — Final Three-Screen Polish

- 仓库：`D:\Codex\IELTS-practice`
- 分支：`dashboard-only`（基线 HEAD `9d86b70` = MOBILE-08 VISUAL_ACCEPTED_CANDIDATE）
- 本轮硬范围：**仅** `LoginScreen` / `ProfileScreen` / `ApiConfigScreen`（+ ApiConfig 独立状态组件的确定性截图测试）。
- 冻结约束：Today / Learn / Review / Notes / Speaking / Result / Report / Goal / Register / Forgot / Account / Change Password / About **零源码改动、零视觉漂移**；功能、DB、后端协议、导航 IA、学习机制未触碰。
- 验收设备：HUAWEI ELI-AN00（adb `AU7K024621005560`，1200×2664），debug APK 经 `adb reverse tcp:3000` 连真实 Next 后端，真实 QA 账号登录。
- 日期：2026-09-19。
- 状态口径：本轮只允许 `VISUAL_ACCEPTED_CANDIDATE / VISUAL_NEEDS_REWORK`；**最终 FROZEN 由用户人工确认**。

---

## 1. 三页收口要点

### LOGIN — minor polish（结构/IA 不变）
- 紧密 vertical lockup：篆刻 Logo（56dp 克制锚点）→ 灵犀 IELTS → 中文品牌句 → 英文小句，Logo 与标题间距由 14dp 收紧为 10dp，标题与中文句间距加大形成组。
- 中文 slogan「让每一次学习影响下一次学习」升为 Ink、16sp，成为品牌主句；英文句降为 11sp、InkMeta 78% 透明的 editorial annotation，不再与中文争视觉。
- Hero 高度 344→330dp、表单 top 4→2dp，整体略上移；品牌区（山景+暖色）/ 操作区（表单）两层结构保留。山景保持单层克制远山，未加云/建筑/复杂插画。
- 视觉 Hero = 灵犀品牌 +「进入你的学习空间」，不是两个输入框。
- 仅改 `LoginScreen.kt` 内部 `LoginBrandHero` 与间距；`AuthPage`/`AuthRidgeBand`（Register/Forgot 共用）未改。

### PROFILE — Personal Learning Portrait 强化（IA 不变）
- 去 KPI 化：由「三个等权数字横排」改为 **一个主长期数字 `12`（heroNum 40sp，累计学习·词）+ 右侧两个弱辅助状态行**（连续学习 1 天 / 口语练习 0 次），辅助数值降为 InkSoft 中号、标签 InkMeta，不与主数字争视觉。
- 长邮箱：昵称优先（editorTitleSmall），邮箱 `singleLine + ellipsis`、11sp InkMeta 次级识别；真机 40 字符长邮箱实测单行省略为 `lingxi-audit01-1789715862474@li…`，不换行破卡。
- 7 日轨迹升级为本肖像**主图形**：底部对齐的克制圆角柱（有活动、高度随 count 归一化到 8–36dp；今日酒红、其余暖铜；无活动为 7dp 淡点），无坐标轴/数值标注/图例；周一→周日排序与 Today 母版一致。
- 本周目标层级重建：标签 + 酒红大百分比 + 轻量 ProgressRule + 「已学习 13 / 200 词」+「去设置 ›」，整块可点 → Goal（真实 goal/done/pct 逻辑不变，未伪造）。
- 整块仍是**单块 Cream 连续 composition**（身份 → 细线 → 主数字+辅助 → 周轨迹 → 细线 → 目标），不是四张边框卡；below-fold 工具区为 Paper 上纯编辑式行（AI 配置/关于），无齿轮，API 入口保持 below the fold。

### API CONFIG — status-first（逻辑/存储/验证/BYOK 不变）
- 抽出独立 `ApiStatusHero(mode, title, subtitle, providerLabel)` + `ApiStatusMode` 五态枚举，状态 Hero 明显强于表单：42dp 圆形状态徽标（未连接=空心圆 / 验证中=进度环 / 连接正常=实心点 / 失败=! / 待验证=实心点）+ kicker「AI 服务状态」+ 大状态标题 + 产品化副文案；连接态附「已验证」Pill + 服务商名。
- 未配置真机态：`尚未连接` +「配置你的个人 AI 服务后，即可在口语与写作中启用相关 AI 能力。」
- 表单归入次级「服务配置」kicker 分组（服务提供商 / API Key / vector 眼睛图标）；「保存并验证」保持原真实验证 enable 逻辑；高级选项默认折叠（自定义端点自动展开）；「清除当前配置」降为底部酒红 text-style（非大按钮）；说明收敛为一行小字，不暴露 HTTP/工程实现。
- BYOK 安全边界不变：Key 仅本机 DataStore，不回显完整值/不上传/不入日志/截图。

---

## 2. 真机迭代闭环

每页均执行 改 → assembleDebug → install -r → physical screencap → 肉眼 inspect，非「代码写完即 PASS」。

| 帧 | 文件 | 结果 |
|---|---|---|
| Login | `LOGIN__FINAL__PHYSICAL_DEVICE.png` | lockup/主句/注释/表单上移成立 |
| Profile 默认 | `PROFILE__FINAL__PHYSICAL_DEVICE.png` | 主数字 12 + 弱辅助 + 柱轨迹 + 目标层级成立 |
| Profile 长邮箱 | `PROFILE__LONG_EMAIL__PHYSICAL_DEVICE.png` | 40 字符邮箱单行省略（与默认同帧取证） |
| Profile 滚动 | `PROFILE__SCROLLED__PHYSICAL_DEVICE.png` | 滚动无破版，工具区完整 |
| API Config | `API_CONFIG__UNCONFIGURED__PHYSICAL_DEVICE.png` | 状态 Hero 强于表单，全要素到位 |

### API Config 非未配置状态（无真实可安全使用的用户 Key）
未伪造真机：`VALIDATING / CONNECTED / SAVED_PENDING / FAILED`（含一张 UNCONFIGURED 组件对照）由 **Robolectric 确定性渲染** `ApiStatusHero` 产出，文件名一律 `*__ROBOLECTRIC_ONLY.png`，共 5 张；测试仅渲染视觉组件、不发起任何网络/存储调用。

### 冻结页真机抽查（无 drift）
- `REFERENCE_TODAY__PHYSICAL_DEVICE.png`：今日母版（问候/今日复习/本周 2-7/四卡/五栏）不变。
- `REFERENCE_SPEAKING__PHYSICAL_DEVICE.png`：P1/P2/P3、第 1 题·共 4 题、112dp 大麦克风、按下开始录音不变。
- `REFERENCE_REPORT__PHYSICAL_DEVICE.png`：Cream 本周总结 Hero、编辑式备考目标、无框三列、周一→周日趋势不变。
- 附：pm clear 后以全 0 数据进入 Report，空态句 + mastery 全 0 安全渲染、logcat 无 `FATAL / invalid weight`，零桶安全再次真机留证。

### 跨页 board
`MOBILE_08F_FINAL_BOARD.png`（2×3：Login / Profile / Profile 滚动 / API Config + Today / Speaking 冻结参考）——三页收口与冻结母版同属 Paper / Accent / Bronze 暖纸编辑式体系。

---

## 3. 回归

| 项 | 结果 |
|---|---|
| `assembleDebug -PLINGXI_BACKEND_BASE_URL=http://127.0.0.1:3000` | **BUILD SUCCESSFUL** |
| `:app:testDebugUnitTest` | **135 tests / 0 failures**（基线 130 + 新增 ApiConfig 状态截图 5），其中新截图测试为 compare 模式，基准即证据目录同名 ROBOLECTRIC_ONLY 图 |
| `npx tsc --noEmit` | **EXIT=0**（本轮无 Web 改动） |
| 真机主链 | 登录 → Today → Speaking / Report 抽查，无崩溃 |

**NEW_FAIL = 0**。未删/skip/降断言；既有 Login/Profile 相关单测因 IA 锚点未变，全部通过。

---

## 4. 视觉阻塞 / 限制（不阻塞 CANDIDATE）

1. Robolectric 状态图中中文回退为偏粗黑体（沙箱字体环境差异），真机回退常规黑体，连接态真机字体以设备为准；状态图仅用于确认状态构成与配色。
2. `CONNECTED / VALIDATING / FAILED / SAVED_PENDING` 无真机帧——设备无真实可安全使用的用户 Key，按要求只用 ROBOLECTRIC_ONLY 取证，未伪造真机。
3. Profile 全新用户「完全无学习数据」空态未单独真机构造（单测对空数据有覆盖）；pm clear 后的 Report 全 0 已真机确认安全。

无 SCHEMA/付费 secret/删数据/安全等 HARD STOP。

---

## 5. §25 Final Report

```text
LOGIN_VISUAL:                VISUAL_ACCEPTED_CANDIDATE
PROFILE_VISUAL:              VISUAL_ACCEPTED_CANDIDATE
API_CONFIG_VISUAL:           VISUAL_ACCEPTED_CANDIDATE
LOGIN_BRAND_HERO:            紧密 lockup（篆刻→灵犀 IELTS→中文主句→英文淡注释），山景克制，表单上移
PROFILE_PRIMARY_METRIC:      单一主数字 totalItems(12)=heroNum；连续/口语降为右侧弱辅助
PROFILE_LONG_EMAIL:          singleLine + ellipsis，昵称优先；真机 40 字符邮箱单行 …@li…
PROFILE_WEEK_VISUAL:         克制柱节奏（今日酒红/有活动铜/无活动淡点），无坐标轴图例，周一→周日
PROFILE_GOAL_VISUAL:         标签+酒红大百分比+轻量 progress+已学习 13/200+去设置；点击进 Goal 逻辑不变
API_CONFIG_STATUS_FIRST:     大徽标状态 Hero 明显强于表单（五态产品化文案）
API_CONFIG_FORM_SECONDARY:   归入「服务配置」次级 kicker 分组
API_CONFIG_ADVANCED:         默认折叠，一行编辑式入口（自定义端点自动展开）
API_CONFIG_CLEAR_ACTION:     底部酒红 text-style，非同级大按钮
TODAY_REGRESSION:            NONE（真机参考帧核对）
SPEAKING_REGRESSION:         NONE（真机参考帧核对）
REPORT_REGRESSION:           NONE（真机参考帧核对；pm clear 全 0 安全）
ANDROID_TESTS:               135 / 0 FAILURES（130 基线 + 5 新增），assembleDebug SUCCESSFUL
WEB_TESTS:                   tsc --noEmit EXIT 0（无 Web 改动）
NEW_FAIL:                    0
PHYSICAL_SCREENSHOTS:        8（Login×1, Profile×3 含长邮箱/滚动, ApiConfig×1, 冻结参考 Today/Speaking/Report×3）
ROBOLECTRIC_ONLY:            5（ApiConfig unconfigured/validating/connected/saved_pending/failed 状态 Hero）
VISUAL_BOARD:                docs/evidence/mobile-08f-final-three-screen/MOBILE_08F_FINAL_BOARD.png
COMMITS:                     4（login / profile / ai-config+test / evidence），未 push
VISUAL_BLOCKERS:             连接态仅 ROBOLECTRIC_ONLY（无真实 key，未伪造）；沙箱中文字体偏粗仅影响 robo 图
MOBILE_08F:                  VISUAL_ACCEPTED_CANDIDATE
```

**最终 FROZEN 由用户人工确认。** 未 push；本轮 STOP，不自动进入 MOBILE-09。
