# P7 — Full Integration QA Report

## 基线回归
- tsc --noEmit：PASS（0 error）
- next build：PASS
- Dashboard correctness：34 tests passed（P5/P5.1/P6/P6.1 全回归）
- 既有项目 4 个无关环境测试失败，与 Dashboard 无关，保留 pre-existing/environment 分类，不计 Dashboard FAIL。

## API 实测（demo authed 200）
| route | 结果 |
|---|---|
| /api/dashboard?range=7d | 200 dataStatus=ready |
| range=30d / all | 200 |
| range=bad | 200（落入默认解析，与 contract 一致） |
| lifecycle/activation | 200 |
| modules/learn | 200 |
| bad-cases?layer=MODEL | 200（空数组，不冒充 0） |
| traces/t1 | 404（trace 未持久化， documented） |
| /dashboard 页面 | 200 |
| 未登录 summary/lifecycle | 401 |

## 状态语义（实测 JSON）
- runtime.persistence = not_connected（migration 未 apply）
- 报告后回流 = not_instrumented
- 内容复用 = not_instrumented
- 学习新表达/口语 = insufficient（空库，非 0%）
- 离线评测 envNote = "离线评测 · memory/mock 环境（非生产运行时质量）"
- dataStatus=ready、failed=[]；missing P6 表不 500、不返 0%。

## partial failure
composeDashboard 单测覆盖：一 section reject → partial_error + failedSections + 其余可用。

## P7.1 错误语义修复
safeQuery 精确三分类：missing(42P01/does not exist) → not_connected/not_instrumented；ok(含0行) → zero/insufficient；其他(401/403/RLS/网络/超时) → error，不再 tolerant 降级。38 tests、tsc、build PASS。
