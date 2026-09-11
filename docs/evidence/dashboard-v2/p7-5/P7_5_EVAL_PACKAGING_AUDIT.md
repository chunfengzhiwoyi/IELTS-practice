# P7.5C — Eval Packaging Audit

## 原风险
reader 读 `docs/eval/runs/<run_id>/results.json`，运行时 fs；standalone/serverless bundle 不一定含 docs/。

## 方案（A：build-time stable artifact）
- 生成 `generated/dashboard/latest-eval.json`：仅 run_id / generated_at / provider / passRate / criticalFailureRate / sampleSize，不含完整 case 内容。
- `real-repository` 优先读该稳定 artifact；缺失时回退 docs/ 路径。
- 不把整个 eval 目录打进生产；client bundle 不暴露 case 内容。

## 验证
- build PASS；artifact 由版本控制/构建流程产生。
- production-like build 后 reader 可读 latest-eval.json（路径稳定、随构建产物）。

EVAL_ARTIFACT_DEPLOYMENT_RISK: RESOLVED（改为 build-time 稳定 summary）。
