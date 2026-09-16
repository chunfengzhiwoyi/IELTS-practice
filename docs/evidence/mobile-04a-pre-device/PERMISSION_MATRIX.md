# PERMISSION_MATRIX

MOBILE-04A 麦克风权限判定：`resolveMicPermission(granted, hasRequestedBefore, rationaleAvailable)`（纯函数，SpeakingState.kt）。

## 全矩阵（8 分支穷举）

| granted | hasRequestedBefore | rationaleAvailable | 决策 | 产品动作 | 覆盖用例 |
| --- | --- | --- | --- | --- | --- |
| false | false | false | DENIED_LIGHT | 轻量提示（首次请求前 rationale=false 不误判永久） | `first denial is light not permanent` |
| false | false | true | DENIED_LIGHT | 轻量提示 | 同上 |
| false | true | false | DENIED_PERMANENT | 系统设置入口 | `requested before with no rationale is permanent` |
| false | true | true | DENIED_LIGHT | 轻量提示 | 同上矩阵 |
| true | false | false | START_RECORDING | 开始录音 | `granted always starts recording...` |
| true | false | true | START_RECORDING | 开始录音 | 同上 |
| true | true | false | START_RECORDING | 开始录音（设置返回后重新进入） | `after settings return granted again recording is reachable` |
| true | true | true | START_RECORDING | 开始录音 | 同上矩阵 |

## UI 行为对应（C 节冻结）

| 场景 | UI |
| --- | --- |
| A. 已授权 | 点击麦克风 → 直接开始录音 |
| B. 首次请求 | permissionLauncher 路径（Robolectric 下由 granted/denied 两分支覆盖；launcher 回调不完成属 Robolectric 限制） |
| C. 拒绝 | IDLE + 「需要麦克风权限才能录音，请允许后重试」 |
| D. 永久拒绝 | IDLE + 「麦克风权限已关闭，请在系统设置中开启后重试」+「前往系统设置」按钮（ACTION_APPLICATION_DETAILS_SETTINGS） |
| E. 设置返回已授权 | micDenied/micPermanent 清除 → 可重新进入录音 |

## 展示禁令（UI 不得出现）
- RECORD_AUDIO / Manifest 字符串
- SecurityException / 异常类型
- permanently denied / Android API 技术串

（Compose 截图证据：speaking-permission-denied.png / speaking-permission-permanent.png，ROBOLECTRIC_UI_EVIDENCE）

## 结论
PERMISSION_LOGIC = PASS
