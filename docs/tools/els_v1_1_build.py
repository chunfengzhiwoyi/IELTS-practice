# -*- coding: utf-8 -*-
"""
ELS Evaluation V1.1 — MD→JSON 生成器 + 结构校验器
==================================================
输入 : docs/ELS_EVALUATION_V1_1.md（定稿）
输出 : docs/ELS_EVALUATION_V1_1.json
校验 : Case 数=39、ID 连续 ELS-EVAL-001..039、13 字段完整、
       Severity∈S1..S4、Failure Layer∈taxonomy(+proposed)、
       每 Case 含 AUDIT_SOURCE/CURRENT_EXPECTED/TARGET_EXPECTED 且取值合法。
用法 : python els_v1_1_build.py
说明 : 不改动 .md；JSON 的 cases 完全由 .md 解析而来，保证双份一致。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # docs/
MD = ROOT / "ELS_EVALUATION_V1_1.md"
OUT = ROOT / "ELS_EVALUATION_V1_1.json"
OLD = ROOT / "ELS_EVALUATION_V1.json"

TAXONOMY = [
    "INPUT", "ROUTING", "STATE_READ", "RETRIEVAL", "PROMPT", "MODEL",
    "OUTPUT_VALIDATION", "BUSINESS_RULE", "STATE_WRITE", "REPORT_AGGREGATION",
    "FALLBACK", "UI_PRESENTATION", "UNKNOWN",
]
TAXONOMY_EXTRA = ["STT", "IDEMPOTENCY"]  # §3.1 proposed（本轮不启用，但允许被引用）

# 13 字段 md 标签 -> JSON 键
FIELD_MAP = {
    "Category": "category",
    "Scenario": "scenario",
    "Precondition": "precondition",
    "User Input": "user_input",
    "Expected Behavior": "expected_behavior",
    "Must Not Happen": "must_not_happen",
    "Pass Criteria": "pass_criteria",
    "Failure Criteria": "failure_criteria",
    "Failure Layer": "failure_layer",
    "Severity": "severity",
    "Required Trace Fields": "required_trace_fields",
    "Notes": "notes",
}
REQUIRED_KEYS = [
    "case_id", "category", "scenario", "precondition", "user_input",
    "expected_behavior", "must_not_happen", "pass_criteria", "failure_criteria",
    "failure_layer", "severity", "required_trace_fields", "notes",
]

# FIX-10 Gold Audit 三标注（与 §15.3 矩阵一致）
AUDIT = {
    1:  ("V2_FACT", "PASS", "PASS"), 2:  ("V2_FACT", "PASS", "PASS"),
    3:  ("V2_FACT", "PASS", "PASS"), 4:  ("V2_FACT", "PASS", "PASS"),
    5:  ("V2_FACT", "PASS", "PASS"), 6:  ("MANUAL_GOLD", "UNVERIFIED", "PASS"),
    7:  ("V2_FACT", "PASS", "PASS"), 8:  ("V2_FACT", "PASS", "PASS"),
    9:  ("V2_FACT", "PASS", "PASS"), 10: ("V2_FACT", "PASS", "PASS"),
    11: ("V2_FACT", "PASS", "PASS"), 12: ("V2_FACT", "PASS", "PASS"),
    13: ("FUTURE_TARGET", "FAIL", "PASS"), 14: ("V2_FACT", "PASS", "PASS"),
    15: ("PRODUCT_CONTRACT", "PASS", "PASS"), 16: ("MANUAL_GOLD", "UNVERIFIED", "PASS"),
    17: ("PRODUCT_CONTRACT", "PASS", "PASS"), 18: ("MANUAL_GOLD", "UNVERIFIED", "PASS"),
    19: ("MANUAL_GOLD", "UNVERIFIED", "PASS"), 20: ("PRODUCT_CONTRACT", "PASS", "PASS"),
    21: ("V2_FACT", "PASS", "PASS"), 22: ("V2_FACT", "PASS", "PASS"),
    23: ("FUTURE_TARGET", "PASS", "PASS"), 24: ("V2_FACT", "PASS", "PASS"),
    25: ("V2_FACT", "PASS", "PASS"), 26: ("PRODUCT_CONTRACT", "PASS", "PASS"),
    27: ("V2_FACT", "PASS", "PASS"), 28: ("V2_FACT", "PASS", "PASS"),
    29: ("PRODUCT_CONTRACT", "PASS", "PASS"), 30: ("PRODUCT_CONTRACT", "PASS", "PASS"),
    31: ("V2_FACT", "PASS", "PASS"), 32: ("V2_FACT", "PASS", "PASS"),
    33: ("V2_FACT", "PASS", "PASS"), 34: ("V2_FACT", "PASS", "PASS"),
    35: ("V2_FACT", "PASS", "PASS"), 36: ("V2_FACT", "UNVERIFIED", "PASS"),
    37: ("V2_FACT", "PASS", "PASS"), 38: ("PRODUCT_CONTRACT", "FAIL", "PASS"),
    39: ("FUTURE_TARGET", "FAIL", "PASS"),
}
AUDIT_SOURCES = {"V2_FACT", "PRODUCT_CONTRACT", "FUTURE_TARGET", "MANUAL_GOLD"}
EXPECTED = {"PASS", "FAIL", "UNVERIFIED"}

CASE_HEAD = re.compile(r"^####\s+ELS-EVAL-(\d{3})\s+—\s+(.*)$")
FIELD_HEAD = re.compile(r"^-\s*\*\*([^*]+?)\*\*:?\s*(.*)$")
NUMBER_ITEM = re.compile(r"^\s*\d+[\.、)]\s*(.*)$")
BULLET_ITEM = re.compile(r"^\s*-\s+(.*)$")


def clean_lines(lines):
    """去掉首尾空行、行尾空白；保留内嵌空行为段落分隔。"""
    out = [ln.rstrip() for ln in lines]
    while out and not out[0].strip():
        out.pop(0)
    while out and not out[-1].strip():
        out.pop()
    return out


def is_field_line(ln):
    return bool(FIELD_HEAD.match(ln))


def parse_pass_criteria(raw_lines):
    """Pass Criteria -> list：按编号项/子标题拆成元素。"""
    items, cur = [], None
    for ln in raw_lines:
        s = ln.strip()
        if not s:
            continue
        # 子标题如 "**M1 Gate（…）**:"（以 - 开头）
        bm = BULLET_ITEM.match(ln)
        if bm and bm.group(1).strip().startswith("**") and cur is None:
            items.append(re.sub(r"^\*\*|\*\*:?\s*$", "", bm.group(1).strip()))
            continue
        nm = NUMBER_ITEM.match(ln)
        if nm:
            items.append(nm.group(1).strip())
            cur = items[-1]
            continue
        # 续行（缩进文本/backtick 行）
        if items:
            items[-1] = items[-1] + " " + s
    return items


def parse_trace_fields(value_text):
    """Required Trace Fields -> list：按 , 切分 token。"""
    toks = [t.strip() for t in re.split(r"[,，]", value_text) if t.strip()]
    return toks


def parse_md(text):
    lines = text.splitlines()
    cases = []
    cur_case = None
    buf = []
    for ln in lines:
        m = CASE_HEAD.match(ln)
        if m:
            if cur_case is not None:
                cases.append((cur_case, buf))
            cur_case = int(m.group(1))
            buf = []
            continue
        if cur_case is not None and (ln.startswith("### ") or ln.startswith("## ")):
            cases.append((cur_case, buf))
            cur_case, buf = None, []
            continue
        if cur_case is not None:
            buf.append(ln)
    if cur_case is not None and buf:
        cases.append((cur_case, buf))
    return cases


def build_case(num, body_lines):
    fields = {}
    i = 0
    n = len(body_lines)
    while i < n:
        ln = body_lines[i]
        m = FIELD_HEAD.match(ln)
        if not m:
            i += 1
            continue
        label, first = m.group(1).strip(), m.group(2).strip()
        key = FIELD_MAP.get(label)
        if key is None:
            i += 1
            continue
        chunk = [first] if first else []
        j = i + 1
        while j < n and not is_field_line(body_lines[j]) and not CASE_HEAD.match(body_lines[j]):
            if body_lines[j].strip():
                chunk.append(body_lines[j])
            j += 1
        if key == "pass_criteria":
            fields[key] = parse_pass_criteria(chunk)
        elif key == "required_trace_fields":
            fields[key] = parse_trace_fields(" ".join(chunk))
        else:
            fields[key] = "\n".join(clean_lines(chunk))
        i = j
    rec = {"case_id": f"ELS-EVAL-{num:03d}"}
    for k in REQUIRED_KEYS[1:]:
        rec[k] = fields.get(k, "")
    src, cur, tgt = AUDIT[num]
    rec["audit_source"] = src
    rec["current_expected"] = cur
    rec["target_expected"] = tgt
    return rec


def validate(cases, old):
    errors = []
    ids = [c["case_id"] for c in cases]
    if len(cases) != 39:
        errors.append(f"Case 数 = {len(cases)} ≠ 39")
    for i, want in enumerate(range(1, 40)):
        if ids[i] != f"ELS-EVAL-{want:03d}":
            errors.append(f"ID 不连续: 位置 {i+1} = {ids[i]}, 期望 ELS-EVAL-{want:03d}")
            break
    dup = {x for x in ids if ids.count(x) > 1}
    if dup:
        errors.append(f"重复 Case ID: {sorted(dup)}")
    for c in cases:
        missing = [k for k in REQUIRED_KEYS if c.get(k) in (None, "", [])]
        if missing:
            errors.append(f"{c['case_id']} 缺失字段: {missing}")
        sev = re.match(r"^S([1-4])", str(c.get("severity", "")))
        if not sev:
            errors.append(f"{c['case_id']} Severity 非法: {c.get('severity')}")
        # Failure Layer 合法性：抽取大写标识符逐一比对
        tokens = re.findall(r"\b[A-Z][A-Z_0-9]*\b", str(c.get("failure_layer", "")))
        legal_tokens = [t for t in tokens if re.fullmatch(r"[A-Z_]+", t)]
        bad = [t for t in legal_tokens if t not in TAXONOMY + TAXONOMY_EXTRA]
        if bad:
            errors.append(f"{c['case_id']} Failure Layer 非法 token: {bad} @ {c.get('failure_layer')}")
        if c.get("audit_source") not in AUDIT_SOURCES:
            errors.append(f"{c['case_id']} audit_source 非法: {c.get('audit_source')}")
        for f in ("current_expected", "target_expected"):
            if c.get(f) not in EXPECTED:
                errors.append(f"{c['case_id']} {f} 非法: {c.get(f)}")
        if c["current_expected"] == "FAIL" and c.get("target_expected") != "PASS":
            errors.append(f"{c['case_id']} CURRENT=FAIL 但 TARGET≠PASS")
    # 统计
    from collections import Counter
    sev_all = [re.match(r"^S([1-4])", c["severity"]).group(0) for c in cases]
    src_cnt = Counter(c["audit_source"] for c in cases)
    cur_cnt = Counter(c["current_expected"] for c in cases)
    stats = {
        "s1": sev_all.count("S1"), "s2": sev_all.count("S2"),
        "s3": sev_all.count("S3"), "s4": sev_all.count("S4"),
        "audit_source": dict(src_cnt), "current_expected": dict(cur_cnt),
    }
    return errors, stats


def build_meta(old_meta):
    meta = dict(old_meta)
    meta.update({
        "spec": "ELS_EVALUATION_V1_1",
        "spec_version": "1.1",
        "baseline": "ELS_EVALUATION_V1 / spec_version 1.0",
        "created_at": "2026-09-09",
        "status": "SPEC_FINALIZED_NO_RUNNER_V1_1",
        "case_set_version": "ELS-EVAL-V1.1",
        "case_count": 39,
        "review_round": "第一次设计审查（10 条 Review Findings → FIX-01~10）",
        "code_freeze_note": "仅新增/更新 ELS_EVALUATION_V1_1.md/.json 与校验脚本；不修改业务代码/DB Schema/Repository/API/页面",
    })
    return meta


def main():
    text = MD.read_text(encoding="utf-8")
    raw = parse_md(text)
    cases = []
    for num, body in raw:
        cases.append(build_case(num, body))
    cases.sort(key=lambda c: c["case_id"])

    old = json.loads(OLD.read_text(encoding="utf-8"))
    data = dict(old)
    data["meta"] = build_meta(old.get("meta", {}))
    data["cases"] = cases

    # FIX-09：metrics 修正 M3 并追加 M10；FIX-05：M6 备注去 RAG 绑定
    for m in data.get("metrics", []):
        if m["id"] == "M3":
            m["formula"] = "S1 失败行数 / 总执行行数 × 100%（仅 S1）"
            m["notes"] = "[FIX-09] 仅计 S1；S2 在 Registry 单独分层展示；发布阻断判定改看 M10"
        if m["id"] == "M6":
            m["notes"] = "当前关键词引擎 023 类 recall 低；数值差即语义检索升级收益基线（实现技术待定）"
    mids = {m["id"] for m in data.get("metrics", [])}
    if "M10" not in mids:
        data.setdefault("metrics", []).append({
            "id": "M10", "name": "Release-Blocking Failure Rate",
            "formula": "(S1 失败行数 + 阻断型 S2 失败行数) / 总执行行数 × 100%",
            "notes": "[FIX-09] 真正的发布闸门：S1>0 即红；阻断型 S2 阈值由发布策略定并逐案登记",
        })

    # §4 discipline 对齐 severity 描述
    for s in data.get("severity", []):
        if s["id"] == "S1":
            s["criterion"] = ("数据损坏/状态不可恢复错乱；红线结论对外可见（Band 分、无据进步、无据证据断言）；"
                              "幂等失效重复计分——仅限 §4 三类，禁止仅因重要升级")
    # FIX-10：顶层登记 Gold Audit
    data["gold_audit"] = {
        "definitions": {
            "AUDIT_SOURCE": ["V2_FACT", "PRODUCT_CONTRACT", "FUTURE_TARGET", "MANUAL_GOLD"],
            "CURRENT_EXPECTED": ["PASS", "FAIL", "UNVERIFIED"],
            "TARGET_EXPECTED": ["PASS"],
        },
        "matrix": {f"ELS-EVAL-{n:03d}": {"audit_source": a, "current_expected": b, "target_expected": c}
                   for n, (a, b, c) in AUDIT.items()},
    }

    errors, stats = validate(cases, old)
    data["meta"]["validation"] = {
        "case_count": len(cases),
        "id_contiguous": errors == [] or all("ID 不连续" not in e for e in errors),
        "severity_distribution": {f"S{i}": stats[f"s{i}"] for i in (1, 2, 3, 4)},
        "audit_source_distribution": stats["audit_source"],
        "current_expected_distribution": stats["current_expected"],
        "errors": errors,
        "ok": not errors,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print("== 生成 ==")
    print(f"cases = {len(cases)} | 输出 = {OUT.name}")
    print(f"Severity: S1×{stats['s1']} S2×{stats['s2']} S3×{stats['s3']} S4×{stats['s4']}")
    print(f"AUDIT_SOURCE: {stats['audit_source']}")
    print(f"CURRENT_EXPECTED: {stats['current_expected']}")
    print("== 校验 ==")
    if errors:
        for e in errors:
            print("  [ERR]", e)
        print("VALIDATION: FAIL")
        return 1
    print("VALIDATION: PASS (39 Case / ID 连续 / 13 字段完整 / Severity 合法 / Failure Layer 合法 / Gold Audit 三字段齐全)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
