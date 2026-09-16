# FILE_LIFECYCLE

MOBILE-04A 录音文件契约：`context.cacheDir/speaking/speaking_<nanoTime>.m4a`（单文件所有权）。

## 所有权模型（A 节冻结）

| 状态 | 文件归属 | 动作 |
| --- | --- | --- |
| IDLE | 无 active file | — |
| RECORDING | recorder 持有 temp file | start 成功创建 |
| RECORDED | screen/controller 持有 | stop 成功移交（path + durationMs） |
| RERECORD | 旧文件删除 | 停止播放 → release player → 删旧文件 → 新文件 |
| LEAVE SCREEN | 未移交文件删除 | release() → player.release + recorder.release + delete |

## 清理路径（全部经测试断言 File.exists()==false）

| 场景 | 动作 | 测试 |
| --- | --- | --- |
| start 失败 | recorder.discard + file.delete | SessionTest `recording start failure cleans up...` / DeepTest `start failure deletes target...` |
| stop 失败 | recorder.discard + 损坏文件删除 → IDLE | SessionTest `stop failure deletes damaged file...` |
| cancel（RECORDING） | recorder.discard + temp 删除 | SessionTest `cancel recording discards temp file` |
| rerecord | 旧文件删除 + lastRecording=null | SessionTest rerecord 用例 |
| release（RECORDED/PLAYING） | 未移交文件删除 | SessionTest `release stops everything...` |
| release（RECORDING） | recorder.discard + release + 文件删除 | SessionTest `release while recording discards recorder` |
| 离开页面 | onDispose → session.release() | Compose 层 onDispose 绑定 |

## 连续循环审计（DeepTest）
10 次 `record → stop → rerecord`：每轮文件数 0→1→0，最终 **ORPHAN_LOGICAL_FILES = 0**。

## 结论
FILE_OWNERSHIP_MODEL = PASS
ORPHAN_LOGICAL_FILES = 0
