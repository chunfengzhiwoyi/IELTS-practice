# REPO-ARCH-03E.2 — ANDROID_BUILD_ENVIRONMENT_DECOUPLING（任务报告）

- 日期：2026-09-11
- Worktree：`D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE`（branch `repo/arch-consolidate`）
- Start HEAD：`8b6ae14ae4d971b7f7ce07de64d238ccfaaeee2a`

## 1. Original Blocker

- Android source 已迁入 `apps/android`（:app + :core），但 Debug build 此前依赖 source-bundled JDK：`D:\Codex\ielts-android\.jdk\jdk-17.0.20+8`。
- `SOURCE_CODE_DEPENDENCY = 0`（源码无引用），`SOURCE_BUILD_TOOL_DEPENDENCY = 1` → `ANDROID_SOURCE_RETIREMENT_READY = NO`。

## 2. External JDK Discovery（全机扫描，source 外）

| 检查项 | 结果 |
|---|---|
| JAVA_HOME（机器级） | `D:\AI-Models\Andorid Studio\jbr` —— **路径不存在**（Android Studio 已移除，仅剩安装包 `D:\AI-Models\android-studio-panda4-windows.exe`） |
| PATH 中 java.exe | 无 |
| `D:\AI-Models\Andorid Studio` / `D:\AI-Models\Android Studio` | 均不存在 |
| C:\Program Files\Java / Eclipse Adoptium / Zulu | 不存在 |
| C:\Program Files\Microsoft | 仅 OneDrive，无 JDK |
| C:\Program Files (x86)\Java / Adoptium / Zulu | 不存在 |
| C:\Users\34394\.jdks / AppData\Local\Programs | 无 JDK |
| .gradle\jdks（C:\Users\34394 与 D:\AppData\Gradle） | 仅 CACHEDIR.TAG，空 |
| D:\AI / D:\Apps / D:\dev / D:\AppData / D:\Program Files / 注册表 JavaSoft | 无 JDK 记录 |
| 定向 java.exe 扫描（多根目录，排除 ielts-android） | 0 命中 |

**结论：全机无 source-independent JDK。** 按任务 §6 采用 LOCAL_TOOLCHAIN_SNAPSHOT 方案。

## 3. Chosen Toolchain

- **JDK_STRATEGY**: LOCAL_TOOLCHAIN_SNAPSHOT（repo 外、非 Git 资产）
- **TOOLCHAIN_SOURCE**: `D:\Codex\ielts-android\.jdk\jdk-17.0.20+8`
- **TOOLCHAIN_TARGET**: `D:\Codex\_toolchains\java\jdk-17.0.20+8`
- **TOOLCHAIN_COPY_PERFORMED**: YES（robocopy /E，COPY 语义，源未动）
- **TOOLCHAIN_VERSION**: OpenJDK 17.0.20（Temurin-17.0.20+8），major = 17
- **Integrity**: 目标 `bin\java.exe` 存在；`java -version` = 17.0.20；源/目标文件数 492/492、大小 302.8/302.8 MB 完全一致
- 未把 JDK 加入任何 Git repository（D:\Codex\_toolchains 在 repo 外）

## 4. Gradle JVM Verification

- 构建进程显式设置 `JAVA_HOME=D:\Codex\_toolchains\java\jdk-17.0.20+8`、`PATH` 前置 `%JAVA_HOME%\bin`、`ANDROID_HOME/ANDROID_SDK_ROOT=C:\Users\34394\AppData\Local\Android\Sdk`（真实 SDK，不依赖 `ielts-android\local.properties`）。
- `where java` → 仅 `D:\Codex\_toolchains\java\jdk-17.0.20+8\bin\java.exe`。
- `gradlew --version` → `JVM: 17.0.20 (Eclipse Adoptium 17.0.20+8)`。
- **铁证**：Gradle daemon 日志（`D:\AppData\Gradle\daemon\8.6\daemon-18852.out.log`，2026-09-11T20:24 启动）`DefaultDaemonContext[... javaHome=D:\Codex\_toolchains\java\jdk-17.0.20+8 ...]` —— Gradle JVM 确凿来自独立 toolchain。

## 5. Independent Debug Build

- `.\gradlew.bat :app:assembleDebug --rerun-tasks`（强制 37/37 全量重编译，非缓存）：**BUILD SUCCESSFUL in 1m 42s**。
- APK：`apps/android/app/build/outputs/apk/debug/app-debug.apk`，17,783,183 B，2026-09-11 20:26（比 03D 产物小 36 B，不同 JDK 编译的预期微差）。
- 仅 pre-existing Kotlin warnings（unused params/vars，03D 已存在，非新增）。

## 6. Source Dependency Scan

| 扫描项（apps/android，排除 build/） | 命中 |
|---|---|
| `D:\Codex\ielts-android` | 0 |
| `ielts-android\.jdk` | 0 |
| `ielts-android\local.properties` | 0 |
| `ielts-android\release-key.jks` | 0 |
| `ielts-android\keystore.properties` | 0 |

- `app/build.gradle.kts` 的 release signing 使用**相对路径** `rootProject.file("keystore.properties")` + `exists()` 守卫：文件不存在时 Debug configuration 正常（本次 Debug 构建成功即证明）。**不是** external source dependency。
- `apps/android` 内无 `keystore.properties` / `release-key.jks` / `local.properties` / `.jdk`。

## 7. Isolation & Source Protection

- `git diff HEAD -- apps/android` = **0**（零源码/配置修改）。
- Web / Miniapp / Eval / supabase / data 未触碰（git status clean）。
- `D:\Codex\ielts-android` 完整保留：3056 files；`.jdk\jdk-17.0.20+8\bin\java.exe`、`keystore.properties`、`release-key.jks` 均未移动/删除；secret 内容未读取。

## 8. Remaining Secret Boundary & Retirement Status

- **ANDROID_BUILD_TOOL_DEPENDENCY_CLEARED = YES**（source-independent JDK17 完整构建 PASS）。
- **ANDROID_SOURCE_RETIREMENT_READY = NO** —— 仍受 SECRET-HYGIENE-01 阻塞（signing assets：keystore.properties / release-key.jks 处置未做）。
- 旧 source 退休是后续任务；本任务不删除旧 source。

## 9. Acceptance 汇总

| 项 | 值 |
|---|---|
| ANDROID_TARGET | apps/android |
| JAVA_MAJOR | 17 |
| JAVA_HOME_OUTSIDE_ANDROID_SOURCE | YES |
| GRADLE_JVM_OUTSIDE_ANDROID_SOURCE | YES（daemon javaHome 证据） |
| ANDROID_DEBUG_BUILD | PASS（1m42s，37/37 tasks） |
| ANDROID_RUNTIME_SOURCE_REFERENCES | 0 |
| ANDROID_BUILD_SOURCE_JDK_REFERENCES | 0 |
| ANDROID_SOURCE_FILES_MODIFIED | 0 |
| SIGNING_SECRET_MOVED | NO |
| SIGNING_SECRET_READ | NO |
| JDK_TRACKED_BY_GIT | NO |
| SOURCE_ANDROID_UNCHANGED | YES |

## 10. Commit

- `chore(repo): verify source-independent android toolchain`（docs only：REPO-ARCH-03E.2.md + CURRENT-PROJECT-STATE.md）
- 未提交：JDK / APK / Gradle cache / local.properties / secret。

## 11. Failure Classification

- JDK 发现：无外部 JDK（BLOCKED_ENVIRONMENT 预期分支）→ 按方案走 LOCAL_TOOLCHAIN_SNAPSHOT。
- 独立 toolchain build：**SOURCE_JDK_DEPENDENCY_CLEARED**（无 MIGRATION_ENVIRONMENT_REGRESSION）。
