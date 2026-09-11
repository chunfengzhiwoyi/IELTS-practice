# P7 — Security & Deployment Gates

## Security
- requireUser() = authentication（登录即过），无 admin/internal/跨用户聚合 authorization primitive。
- SECURITY_BLOCKER_FOR_PRODUCTION：REGISTERED。P7 PASS 但 P8/P9 BLOCKED。
- 未发明临时 RBAC。

## Eval artifact
- reader 仍读 docs/eval/runs/<run_id>/results.json；本地正常。
- EVAL_ARTIFACT_DEPLOYMENT_RISK：REGISTERED（Preview 是否含 docs/ 待验证）。

## Remote migration
- 0009 未 apply shared/production；REMOTE_INSTRUMENTATION_MIGRATION_PENDING：REGISTERED。

## 结论
- LOCAL_INTEGRATION_QA = PASS
- PREVIEW_ELIGIBLE = NO（三个 blocker 未解）
- 不进入 P8。下一步：P7.5 Deployment Readiness Gates（授权机制 / migration 目标环境 / eval artifact 打包）。
