# STATE_MACHINE_MATRIX

MOBILE-04A SpeakingAudioSession 状态机：IDLE / RECORDING / RECORDED / PLAYING（ERROR = IDLE + lastError，可恢复）。

## 合法迁移

| # | 迁移 | 触发 | 资源动作 | 测试 |
| --- | --- | --- | --- | --- |
| 1 | IDLE → RECORDING | startRecording()（start 成功） | recorder.start(path)；生成新 .m4a | SessionTest `idle to recording` |
| 2 | RECORDING → RECORDED | finishRecording()（stop 成功） | recorder.stop()；文件移交 screen | SessionTest `recording to recorded keeps path and duration` |
| 3 | RECORDED → PLAYING | play()（play 成功） | player.play(path) | SessionTest `recorded to playing then completion returns to recorded` |
| 4 | PLAYING → RECORDED | completion 回调 / stopPlayback() | player 停止（不触发 completion） | SessionTest 同上 / `playing to recorded via manual stop` |
| 5 | RECORDED → IDLE | rerecord() | player.release()；旧文件删除；lastRecording=null | SessionTest `rerecord stops playback releases player deletes old file and resets` |
| 6 | RECORDING → IDLE | cancelRecording() | recorder.discard()；temp 删除 | SessionTest `cancel recording discards temp file` |
| 7 | 任意 → IDLE | release() | stopPlayback + player.release + recorder.discard/release + 未移交文件删除 | SessionTest `release stops everything...` / `release while recording discards recorder` |
| 8 | ERROR → RECOVER | 任意 IDLE 后重新 startRecording() | 新 recorder 会话；lastError 清除 | DeepTest `error state recovers to recording again` |
| 9 | RECORDING → IDLE(+ERROR) | finishRecording() stop 失败 | recorder.discard()；损坏文件删除；lastError 产品提示 | SessionTest `stop failure deletes damaged file...` |

## 非法迁移（必须拒绝：no crash / no leak / state predictable）

| # | 非法迁移 | 期望 | 测试 |
| --- | --- | --- | --- |
| 1 | IDLE → PLAYING | play()=false，IDLE 不变 | SessionTest `illegal transitions are rejected` / DeepTest `play after discard rejected` |
| 2 | PLAYING → RECORDING | startRecording()=false，PLAYING 不变 | SessionTest `illegal transitions are rejected` |
| 3 | RECORDING → PLAYING | play()=false，RECORDING 不变（互斥） | SessionTest / DeepTest `recording state rejects playback double start and finish` |
| 4 | double startRecording | 第二次 startRecording()=false | SessionTest / DeepTest 同上 |
| 5 | double finishRecording | 第二次 finishRecording()=false，RECORDED 不变 | DeepTest `double stop rejected without crash or leak` |
| 6 | play after discard | play()=false，IDLE 不变，lastRecording=null | DeepTest `play after discard rejected` |
| 7 | PLAYING 中 rerecord | player stop/release、旧文件删除、IDLE | DeepTest `rerecord while playing releases player and resets` |

## 互斥规则
- RECORDING 时不可 play；PLAYING 时不可 startRecording；播放与录音必须一方先停止。
- release 幂等（任意状态调用安全）。

## 结论
STATE_MACHINE_MATRIX = PASS（19 个状态机用例全部通过）
