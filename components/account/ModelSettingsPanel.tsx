"use client";

/**
 * 自有 LLM API 设置（方案 A：安静下拉 + 大厂商目录）
 * ------------------------------------------------------------
 * - 一个克制的「模型提供商」下拉：点开是带搜索、按「国内 / 海外」分组的列表；
 *   选中后静默带出 协议 + Base URL + 模型名（协议对用户隐藏）。
 * - 选「自定义端点」时暴露协议下拉（OpenAI 兼容 / Anthropic / Gemini），
 *   让自托管 / Ollama / 任意端点都能填。
 * - 认证提示做成古铜色细注脚，仅随协议变化。
 * 保存时把明文 POST 到 /api/secrets（服务端信封加密存 user_secrets）；
 * 加载时 GET 回填配置但**不回显明文 Key**。
 */
import { useEffect, useRef, useState } from "react";

import {
  CUSTOM_VENDOR,
  PROTOCOL_LABELS,
  VENDOR_PRESETS,
  findVendor,
  protocolHint,
  type LlmProtocol,
  type VendorPreset,
} from "@/lib/llm/catalog";

type Msg = { kind: "ok" | "err"; text: string } | null;

const GROUP_LABELS: Record<VendorPreset["group"], string> = {
  domestic: "国内",
  overseas: "海外",
};

export function ModelSettingsPanel() {
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [protocol, setProtocol] = useState<LlmProtocol>("openai");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // 回填已保存配置（不回显明文 Key）
  useEffect(() => {
    fetch("/api/secrets")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.modelConfig) {
          const mc = d.modelConfig;
          setBaseUrl(mc.baseUrl ?? "");
          setModelName(mc.modelName ?? "");
          setProtocol(mc.protocol ?? "openai");
          setHasSaved(true);
          const savedProto = mc.protocol ?? "openai";
          const v = VENDOR_PRESETS.find(
            (p) =>
              p.baseUrl === mc.baseUrl &&
              p.defaultModel === mc.modelName &&
              p.protocol === savedProto,
          );
          setSelectedKey(v ? v.key : "__custom__");
        }
      })
      .catch(() => {});
  }, []);

  const isCustom = selectedKey === "__custom__";
  const vendorLabel = (() => {
    if (!selectedKey) return "选择模型提供商";
    if (isCustom) return CUSTOM_VENDOR.label;
    return findVendor(selectedKey)?.label ?? "选择模型提供商";
  })();

  const selectVendor = (v: VendorPreset) => {
    setMenuOpen(false);
    setSearch("");
    if (v.key === "__custom__") {
      setSelectedKey("__custom__");
      setProtocol("openai");
      setBaseUrl("");
      setModelName("");
      return;
    }
    setSelectedKey(v.key);
    setProtocol(v.protocol);
    setBaseUrl(v.baseUrl);
    setModelName(v.defaultModel);
  };

  const filtered = VENDOR_PRESETS.filter((v) =>
    v.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const domestic = filtered.filter((v) => v.group === "domestic");
  const overseas = filtered.filter((v) => v.group === "overseas");
  const hint = protocolHint(protocol);

  const testConnection = async () => {
    if (!baseUrl || !modelName || !apiKey) {
      setTestMsg({ kind: "err", text: "请先填写完整的 Base URL / 模型名 / API Key。" });
      return;
    }
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch("/api/secrets/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, modelName, apiKey, protocol }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "连接失败");
      setTestMsg({ kind: "ok", text: `连接成功（${j.model ?? modelName}）。` });
    } catch (e) {
      setTestMsg({ kind: "err", text: e instanceof Error ? e.message : "连接失败" });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!baseUrl || !modelName || !apiKey) {
      setMsg({ kind: "err", text: "请先填写完整的 Base URL / 模型名 / API Key。" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelConfig: { baseUrl, modelName, apiKey, protocol } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "保存失败");
      setHasSaved(true);
      setApiKey(""); // 不留明文在内存
      setMsg({ kind: "ok", text: "已加密保存。灵犀助手与口语分析将优先使用你的模型。" });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel__title">自有模型（API）</h2>
      <p className="panel__desc">
        填入你自己的大模型 API，灵犀助手对话与口语分析将优先调用它；未配置时回落到官方默认模型。
      </p>

      {/* 模型提供商选择（方案 A：安静下拉 + 搜索 + 分组） */}
      <div className="vendor-field">
        <span className="field-label">模型提供商</span>
        <div className="vendor-select" ref={wrapRef}>
          <button
            type="button"
            className={`vendor-trigger ${menuOpen ? "vendor-trigger--open" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
          >
            <span className={selectedKey ? "" : "vendor-trigger__placeholder"}>{vendorLabel}</span>
            <span className="vendor-trigger__caret" aria-hidden="true">▾</span>
          </button>
          {menuOpen ? (
            <div className="vendor-menu" role="listbox">
              <input
                className="vendor-search"
                placeholder="搜索提供商…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {domestic.length ? (
                <>
                  <div className="vendor-group">{GROUP_LABELS.domestic}</div>
                  {domestic.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      role="option"
                      aria-selected={selectedKey === v.key}
                      className={`vendor-option ${selectedKey === v.key ? "vendor-option--active" : ""}`}
                      onClick={() => selectVendor(v)}
                    >
                      <span className="vendor-option__label">{v.label}</span>
                      <span className="vendor-option__proto">{PROTOCOL_LABELS[v.protocol]}</span>
                    </button>
                  ))}
                </>
              ) : null}
              {overseas.length ? (
                <>
                  <div className="vendor-group">{GROUP_LABELS.overseas}</div>
                  {overseas.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      role="option"
                      aria-selected={selectedKey === v.key}
                      className={`vendor-option ${selectedKey === v.key ? "vendor-option--active" : ""}`}
                      onClick={() => selectVendor(v)}
                    >
                      <span className="vendor-option__label">{v.label}</span>
                      <span className="vendor-option__proto">{PROTOCOL_LABELS[v.protocol]}</span>
                    </button>
                  ))}
                </>
              ) : null}
              <button
                type="button"
                role="option"
                aria-selected={isCustom}
                className={`vendor-option vendor-option--custom ${isCustom ? "vendor-option--active" : ""}`}
                onClick={() => selectVendor(CUSTOM_VENDOR)}
              >
                <span className="vendor-option__label">{CUSTOM_VENDOR.label}</span>
                <span className="vendor-option__proto">任意端点</span>
              </button>
              {filtered.length === 0 ? (
                <div className="vendor-empty">未找到匹配的提供商</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* 自定义端点时暴露协议选择（预设时协议隐藏，由厂商自动带出） */}
      {isCustom ? (
        <div className="vendor-field">
          <span className="field-label">协议</span>
          <select
            className="vendor-proto-select"
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as LlmProtocol)}
          >
            <option value="openai">OpenAI 兼容</option>
            <option value="anthropic">Anthropic 原生</option>
            <option value="gemini">Google Gemini 原生</option>
          </select>
        </div>
      ) : null}

      <div className="account-form">
        <label className="field-label">API Base URL</label>
        <input
          className="field-input"
          placeholder="https://api.xxx.com/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <label className="field-label">模型名</label>
        <input
          className="field-input"
          placeholder="deepseek-chat"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
        />
        <label className="field-label">API Key</label>
        <input
          className="field-input"
          type="password"
          autoComplete="off"
          placeholder={hasSaved ? "已配置（留空则不修改）" : "sk-..."}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      {/* 协议认证提示（古铜色细注脚） */}
      <p className="auth-hint">{hint}</p>

      {testMsg ? (
        <p className={`account-msg ${testMsg.kind === "ok" ? "account-msg--ok" : "account-msg--err"}`}>
          {testMsg.text}
        </p>
      ) : null}

      <div className="account-actions mt-4">
        <button
          type="button"
          className="btn btn--ghost disabled:cursor-not-allowed"
          disabled={testing}
          onClick={() => void testConnection()}
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
        <button
          type="button"
          className="btn btn--primary disabled:cursor-not-allowed"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "保存中…" : "保存模型"}
        </button>
      </div>

      {msg ? (
        <p className={`account-msg ${msg.kind === "ok" ? "account-msg--ok" : "account-msg--err"} mt-3`}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
