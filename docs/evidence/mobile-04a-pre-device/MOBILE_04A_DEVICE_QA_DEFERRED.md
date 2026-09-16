# MOBILE_04A_DEVICE_QA_DEFERRED

- 原因：**NO_PHYSICAL_ADB_DEVICE**（当前无可用真实 Android 手机 / ADB physical device）
- 状态：以下各项 **NOT_VERIFIED**；MOBILE_04A_DEVICE_QA = **OPEN**
- 后续：一旦获得真实设备，必须先补跑 MOBILE-04A-DEVICE-QA；最终发布前 REAL_DEVICE_AUDIO 必须从 DEFERRED 变为 VERIFIED。

## 未验证清单（全部 NOT_VERIFIED）

| # | 项目 | 状态 |
| --- | --- | --- |
| 1 | physical mic permission dialog（真实系统权限弹窗） | NOT_VERIFIED |
| 2 | real MediaRecorder.prepare / start / stop（真实硬件路径） | NOT_VERIFIED |
| 3 | real AAC encoder 行为 | NOT_VERIFIED |
| 4 | real .m4a non-zero file（非空产物） | NOT_VERIFIED |
| 5 | real codec / container metadata（容器与编码元数据） | NOT_VERIFIED |
| 6 | real MediaPlayer consumption（MediaPlayer 消费真实 m4a） | NOT_VERIFIED |
| 7 | audible playback（可听播放） | NOT_VERIFIED |
| 8 | actual 10s / 30s / 60s / 120s / 300s recording（真机长时录音） | NOT_VERIFIED |
| 9 | background behavior（真机后台行为） | NOT_VERIFIED |
| 10 | app switch（应用切换） | NOT_VERIFIED |
| 11 | lockscreen（锁屏） | NOT_VERIFIED |
| 12 | phone interruption（电话打断） | NOT_VERIFIED |
| 13 | OEM permission behavior（厂商权限行为） | NOT_VERIFIED |
| 14 | audio focus（音频焦点） | NOT_VERIFIED |

## 已完成（代码 / JVM 级，不构成真机证据）
- MediaRecorder 配置静态审计（MPEG_4 / AAC / .m4a / API 24 兼容构造）
- 状态机 / 权限逻辑 / 文件生命周期 / 计时契约 / 播放状态契约（纯逻辑与 Robolectric 测试）
- UI 状态接线截图（ROBOLECTRIC_UI_EVIDENCE，非真实设备录音）

## 约束
- 禁止将 Robolectric 截图 / JVM 测试结果表述为 REAL_DEVICE_RECORDING。
- 禁止在无真机证据时把 REAL_DEVICE_AUDIO 标为 VERIFIED。
