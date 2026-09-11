# P6C — Content Reuse Telemetry Report

## 口径（冻结）
- 每次 eligible resolution 产生 request-level 结果 reused|created|failed。
- hit rate = reused / (reused + created)；failed 不进分母，单独计数。
- 按 request_id 去重；不存完整 canonical text（仅 item_id / hash）。
- Dashboard 标签保持"内容复用命中率"，不改名 Knowledge/Cache。

## 实现
- `content_reuse_events` 表（request_id 主键、item_type/item_id、outcome、resolution_source）。
- 纯聚合 `computeContentReuse(rows)`。

## Fixture
reused=7 created=3 failed=2 → rate=70%，denom=10，failed=2 另计（不会错算 7/12）。
重复 request_id 只计一次。

## 说明
在 createOrGetItem/lookup resolution boundary 的真实调用接线留 P7；不改变业务返回行为。
