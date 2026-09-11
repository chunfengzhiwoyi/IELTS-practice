# P7 — Interaction QA

基于组件代码与 prior P2.1/P2.1.1 visual parity 证据；本轮未重捕浏览器点击录屏。

- Range 切换：7d/30d/all 调同一 summary API，按 key 缓存刷新，不整页重载。
- Lifecycle Drawer：点击 stage 打开；X/scrim/Esc 关闭；fixed overlay 不推页。
- Learning Impact popover：outside click / scroll / range switch / 打开 drawer 时关闭。
- Feature module drawer：report 状态按 not_instrumented 渲染文案，不显示 0%。
- AI Quality：Offline 与 Runtime 分区；memory/mock run 明确标注，不冒充生产。
- Runtime：durable 不可用 → 不提供虚假 Bad Case/Trace；Top5/其他 N 类/UNKNOWN=待归因 在聚合层正确（单测）。
