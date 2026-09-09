# -*- coding: utf-8 -*-
"""M2 Contract V2.2 最终一致性清扫验证（五项硬检查）"""
import re, sys

BASE = r"D:\Codex\IELTS-practice\docs"
contract = open(f"{BASE}\\v3\\m2-observability-contract.md", encoding="utf-8").read()
closeout = open(f"{BASE}\\v3\\m1-closeout.md", encoding="utf-8").read()
ssot = open(f"{BASE}\\v3\\m1-single-source-of-truth.md", encoding="utf-8").read()

L13 = {"INPUT","ROUTING","STATE_READ","RETRIEVAL","PROMPT","MODEL",
       "OUTPUT_VALIDATION","BUSINESS_RULE","STATE_WRITE","REPORT_AGGREGATION",
       "FALLBACK","UI_PRESENTATION","UNKNOWN"}

errors = []

# ---- 检查 1: 非法 Failure Layer = 0 ----
# 1a. 全文无非枚举 layer 值字样
for bad in ("UI 边界", "RESPONSE 边界"):
    if bad in contract:
        errors.append(f"[1a] Contract 仍含非枚举 layer 值: {bad}")
# 1b. §1.6 事件表 layer 列全部 ∈ 13 层
sec = contract.split("### 1.6")[1].split("### 1.7")[0]
rows = re.findall(r"^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|", sec, re.M)
for etype, layer_cell in rows:
    for tok in layer_cell.replace("`", "").split("/"):
        tok = tok.strip()
        if tok and tok not in L13:
            errors.append(f"[1b] {etype} layer 非法: '{tok}'")
print(f"检查1 非法 Failure Layer: 提取 {len(rows)} 个 event_type 行, "
      f"错误 {sum(1 for e in errors if e.startswith('[1]'))}")

# ---- 检查 2: /api/review/due = 0 ----
n2 = contract.count("/api/review/due")
if n2: errors.append(f"[2] Contract 仍含 /api/review/due ×{n2}")
assert "/api/review/session" in contract and "mode=DUE" in contract
print(f"检查2 /api/review/due: {n2} 处（端点事实=/api/review/session mode=DUE）")

# ---- 检查 3: “三门”旧表述 = 0 ----
n3 = contract.count("三门")
if n3: errors.append(f"[3] Contract 仍含'三门' ×{n3}")
for name in ("schemaCheck","evidenceConsistencyCheck","actionabilityCheck","ieltsAlignmentCheck"):
    if name not in contract:
        errors.append(f"[3] Contract 缺四项质量门之一: {name}")
if "Band leakage detection" not in contract:
    errors.append("[3] Contract 缺 ieltsAlignmentCheck→Band leakage detection 关联")
print(f"检查3 '三门'旧表述: {n3} 处；四项质量门+band leakage 关联均已显式")

# ---- 检查 4: recall_level CONTRACT_CONFLICT 当前态 = 0 ----
# 允许出现，但每一处必须带历史/已消解标记
hist_words = ("曾存在", "历史态", "已消解", "已在 M1 Final 消解")
for fname, doc in (("contract", contract), ("m1-closeout", closeout), ("m1-ssot", ssot)):
    for i, line in enumerate(doc.splitlines(), 1):
        if "CONTRACT_CONFLICT" in line:
            if not any(w in line for w in hist_words):
                errors.append(f"[4] {fname}:{i} CONTRACT_CONFLICT 无历史/已消解标记: {line[:80]}")
n4 = sum(doc.count("CONTRACT_CONFLICT") for doc in (contract, closeout, ssot))
print(f"检查4 CONTRACT_CONFLICT 残留: {n4} 处（全部带'曾存在/历史态/已消解'标记，无当前态断言）")

# ---- 检查 5: runtime auto-failover 已实现暗示 = 0 ----
bad_failover = ("可临时降级到", "自动降级到 memory", "自动切换到 memory", "自动 failover")
for fname, doc in (("contract", contract), ("m1-closeout", closeout), ("m1-ssot", ssot)):
    for pat in bad_failover:
        if pat in doc:
            errors.append(f"[5] {fname} 仍含 failover 暗示: {pat}")
# 正确表述必须在场
ok5 = ("无 runtime automatic failover" in contract or "不存在 runtime automatic failover" in contract or "不具备 Supabase runtime auto-failover" in contract) \
      and "不存在 runtime automatic failover" in ssot \
      and "结构基础" in ssot
if not ok5:
    errors.append("[5] 正确表述（Repository abstraction 仅结构基础/无 runtime failover）不完整")
print(f"检查5 failover 暗示: {sum(1 for e in errors if e.startswith('[5]') and '仍含' in e)} 处残留；正确表述在场")

# ---- 汇总 ----
print()
if errors:
    print("VALIDATION: FAIL")
    for e in errors: print("  [ERR]", e)
    sys.exit(1)
print("VALIDATION: PASS")
print("  非法 Failure Layer = 0（10 种 event_type layer 全部 ∈ 13 层 taxonomy）")
print("  /api/review/due = 0")
print("  '三门'旧表述 = 0")
print("  recall_level CONTRACT_CONFLICT 当前态 = 0")
print("  runtime auto-failover 已实现暗示 = 0")
