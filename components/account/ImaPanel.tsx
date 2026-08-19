"use client";

/**
 * ima 知识库设置：clientId / apiKey + 列出知识库并选择
 * ------------------------------------------------------------
 * 「获取我的知识库」调 /api/ima/list（服务端直连 ima OpenAPI，不落库）；
 * 保存走 /api/secrets（加密存 user_secrets）。配置后助手对话会检索该知识库。
 */
import { useEffect, useState } from "react";

type Msg = { kind: "ok" | "err"; text: string } | null;
interface KbItem {
  id: string;
  name: string;
}

export function ImaPanel() {
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasSaved, setHasSaved] = useState(false);
  const [list, setList] = useState<KbItem[]>([]);
  const [kbId, setKbId] = useState<string | null>(null);

  const [fetching, setFetching] = useState(false);
  const [listMsg, setListMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    fetch("/api/secrets")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.imaConfig) {
          setClientId(d.imaConfig.clientId ?? "");
          setKbId(d.imaConfig.knowledgeBaseId ?? null);
          setHasSaved(true);
        }
      })
      .catch(() => {});
  }, []);

  const fetchList = async () => {
    if (!clientId || !apiKey) {
      setListMsg({ kind: "err", text: "请先填写 clientId 与 apiKey。" });
      return;
    }
    setFetching(true);
    setListMsg(null);
    try {
      const res = await fetch("/api/ima/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, apiKey }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "获取失败");
      const items: KbItem[] = j.list ?? [];
      setList(items);
      if (!items.length) {
        setListMsg({ kind: "err", text: "未找到知识库，请确认凭证是否有效。" });
      }
    } catch (e) {
      setListMsg({ kind: "err", text: e instanceof Error ? e.message : "获取失败" });
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    if (!clientId || !apiKey) {
      setMsg({ kind: "err", text: "请先填写 clientId 与 apiKey。" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imaConfig: { clientId, apiKey, knowledgeBaseId: kbId ?? undefined },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "保存失败");
      setHasSaved(true);
      setApiKey("");
      setMsg({
        kind: "ok",
        text: kbId
          ? "已保存，灵犀助手对话将检索你选中的知识库。"
          : "已保存（未选择知识库，对话暂不会检索）。",
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="panel__title">ima 知识库</h2>
      <p className="panel__desc">
        接入你的 ima 知识库，灵犀助手可检索其中的内容来回答你的问题（ima OpenAPI 凭证）。
      </p>

      <div className="account-form">
        <label className="field-label">Client ID</label>
        <input
          className="field-input"
          placeholder="ima-openapi-clientid"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
        <label className="field-label">API Key</label>
        <input
          className="field-input"
          type="password"
          autoComplete="off"
          placeholder={hasSaved ? "已配置（留空则不修改）" : "ima-openapi-apikey"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className="account-actions mt-4">
        <button
          type="button"
          className="btn btn--ghost disabled:cursor-not-allowed"
          disabled={fetching}
          onClick={() => void fetchList()}
        >
          {fetching ? "获取中…" : "获取我的知识库"}
        </button>
      </div>

      {list.length > 0 ? (
        <ul className="kb-list">
          {list.map((kb) => (
            <li key={kb.id}>
              <label className="kb-item">
                <input
                  type="radio"
                  name="kb"
                  checked={kbId === kb.id}
                  onChange={() => setKbId(kb.id)}
                />
                <span className="kb-item__name">{kb.name}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      {listMsg ? (
        <p className={`account-msg ${listMsg.kind === "ok" ? "account-msg--ok" : "account-msg--err"} mt-3`}>
          {listMsg.text}
        </p>
      ) : null}

      <div className="account-actions mt-4">
        <button
          type="button"
          className="btn btn--primary disabled:cursor-not-allowed"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "保存中…" : "保存知识库"}
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
