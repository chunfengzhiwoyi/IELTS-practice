# 08_NEW_ACCOUNT_BOOTSTRAP_PROMPT.md — 新账号引导（可直接复制）

> 版本 v2（HANDOFF-02）：同步 Supabase 已部署事实与新 Gate。

## 用法
把下面整个代码块作为新 ChatGPT/Agent 会话的第一条指令。
目标：不依赖旧聊天记录，从仓库实体恢复项目状态并只读核对。

```
你是灵犀 IELTS 项目的新接手 Agent（账号迁移交接，HANDOFF）。
项目目录：D:\Codex\IELTS-practice

【第一步】先读交接包（禁止先改任何代码）：
docs/handoff/2026-09-account-migration/ 下全部文件，按此顺序：
01_PROJECT_HANDOFF.md → 02_CURRENT_STATE.md → 03_ARCHITECTURE_AND_DATA.md
→ 04_ANDROID_STATUS.md → 05_SPEAKING_PIPELINE.md → 06_SUPABASE_AND_MIGRATIONS.md
→ 07_OPEN_GATES.md → 09_EVIDENCE_INDEX.md → 10_MACHINE_STATE.json

【第二步】只读核对真实仓库（对比交接包是否漂移）：
1. git status / git branch --show-current / git log -1 --oneline
   —— 与 10_MACHINE_STATE.json 的 repo 段对比（预期：dashboard-only / 69b5517）
2. 确认 supabase/migrations/0012_auth_surface_security_hardening.sql 存在
3. 确认 tests/unit/auth-surface-security.test.ts 存在（24 断言）
4. 确认 apps/android/app/src/main/kotlin/com/ielts/app/screens/ 存在 SpeakingScreen.kt /
   TodayScreen.kt / SpeakingResultScreen.kt / SpeakingResultDetailScreen.kt /
   theme/Theme.kt / res/drawable/seal.png
5. 确认 lib/speaking/types.ts 无 band 字段；lib/llm/tasks/analyze-speaking.ts 有 BAND_SCORE_LEAK
6. 确认 .env.local 键名（不打印值）包含 NEXT_PUBLIC_SUPABASE_URL /
   SUPABASE_SERVICE_ROLE_KEY / AUTH_MODE / DATA_PROVIDER
7. 尝试运行：npm run typecheck（Web）；如报 Java/JAVA_HOME 缺失，记录为环境阻塞不重装
8. 已知远程事实（外部核验 2026-09-15，无需重复探测）：
   - 0012 已 DEPLOYED_AND_VERIFIED（RLS ON / revoke 生效 / search_path=''）
   - remote migrations = [20260913131204 remote_schema_recovery_01,
     20260915123227 auth_surface_security_hardening]
   - remote schema = REMOTE_BEHIND（0008§1/§2 + 0010 缺口）

【第三步】第一轮禁止：
- 修改任何生产代码 / UI / 数据库 / migration / .env
- 执行 db push / migration repair / SQL Editor DDL
- commit / reset / checkout / merge
- 开始 Speaking Result V2 或 AUTH-SCHEMA-04 施工（先出报告等确认）

【第四步】输出固定报告：
HANDOFF_LOADED: YES
REPO_STATE_VERIFIED: YES/NO（列出无法核对的项）
CURRENT_HEAD: <git log -1 实际值>
HANDOFF_DRIFT: 逐项列出交接包与实际不符处（无则 NONE）
CURRENT_PRODUCT_GATE: SPEAKING_RESULT_V2（Design Review）
CURRENT_ENGINEERING_GATE: AUTH_SCHEMA_04（补缺口→equality→repair→恢复 workflow）
NEXT_ACTION: <建议的第一步，等用户确认>
PRODUCTION_CHANGED: NO

【第五步】等用户确认后再动工。
```

## 新账号接手速查（30 秒版）
- 工作区唯一正式路径：`D:\Codex\IELTS-practice`（dashboard-only 分支，HEAD=69b5517）
- 30 项未提交 = Android PILOT 视觉 + AUTH-SEC 安全包 + 交接包（分类表见 02 §7；建议 3 个 commit，待批准）
- 0012 安全加固 = **已部署已验证**（不再是 BLOCKED）
- 下一个产品动作 = **Speaking Result V2 Design Review**（Analyzer 无 Band/stable strengths/逐句）
- 下一个工程动作 = **AUTH-SCHEMA-04**（补 0008§1/§2 + 0010 → equality → repair → 恢复 workflow）
- MOBILE-04（Recorder/Auth 桥/真实 API）= 后续 Gate，当前不执行
- 禁止混淆：Android Speaking Mock（含 6.5）≠ 真实后端能力（无 Band）
- 远程 Supabase 状态以本包 06 + 外部核验（2026-09-15）为准；Agent 无 DDL 权限
