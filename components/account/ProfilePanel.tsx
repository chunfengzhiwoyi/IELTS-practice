"use client";

/**
 * 身份档案面板：头像（本机选图上传）+ 昵称 + 字母头像 fallback
 * ------------------------------------------------------------
 * 头像通过浏览器端 <input type="file"> 调起系统文件选择框（即「从本机文件选择」），
 * 预览后上传到 Supabase Storage avatars/<uid>/...（受 0006 RLS 约束），
 * 公钥 URL 存于 auth metadata + users 行。
 */
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/db/browser";
import { useAuth } from "@/components/auth/useAuth";

type Msg = { kind: "ok" | "err"; text: string } | null;

// 设计系统色板（酒红 / 古铜 / 墨蓝 / 苔绿 / 灰紫），无图时按名称哈希取色
const PALETTE = ["#7c2d3a", "#8a5a2b", "#3f5b73", "#4a6b52", "#6b4a6b"];

function hueIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % PALETTE.length;
}

export function ProfilePanel() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/account/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          setDisplayName(d.displayName ?? "");
          setAvatarUrl(d.avatarUrl ?? null);
        }
      })
      .catch(() => {});
  }, []);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setMsg({ kind: "err", text: "请选择图片文件。" });
      return;
    }
    if (f.size > 3 * 1024 * 1024) {
      setMsg({ kind: "err", text: "图片不超过 3MB。" });
      return;
    }
    setFile(f);
    setMsg(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const clearAvatar = () => {
    setFile(null);
    setPreview(null);
    setAvatarUrl(null);
  };

  const save = async () => {
    if (!user) {
      setMsg({ kind: "err", text: "请先登录。" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      let finalAvatarUrl: string | null = avatarUrl;
      if (file) {
        const supabase = createSupabaseBrowserClient();
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw new Error(upErr.message);
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        finalAvatarUrl = data.publicUrl;
      }
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, avatarUrl: finalAvatarUrl ?? "" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "保存失败");
      setAvatarUrl(finalAvatarUrl);
      setFile(null);
      setPreview(null);
      setMsg({ kind: "ok", text: "档案已保存。" });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const seed = displayName || user?.email || "?";
  const initial = seed.trim().charAt(0).toUpperCase() || "?";
  const letterBg = PALETTE[hueIndex(seed)];

  return (
    <section className="panel">
      <h2 className="panel__title">身份档案</h2>
      <p className="panel__desc">
        设置头像与昵称，将显示在你的学习主页与灵犀助手对话中。
      </p>

      <div className="profile-card">
        <div className="avatar-editor">
          <div className="avatar-display">
            {preview ? (
              <img src={preview} alt="头像预览" className="avatar-img" />
            ) : avatarUrl ? (
              <img src={avatarUrl} alt="头像" className="avatar-img" />
            ) : (
              <span className="letter-avatar" style={{ backgroundColor: letterBg }}>
                {initial}
              </span>
            )}
          </div>
          <div className="avatar-actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => fileRef.current?.click()}
            >
              选择本机图片
            </button>
            {avatarUrl && !file && (
              <button type="button" className="btn btn--quiet" onClick={clearAvatar}>
                移除头像
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onPickFile}
            />
          </div>
        </div>

        <div className="account-form">
          <input
            className="field-input"
            placeholder="昵称"
            value={displayName}
            maxLength={40}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
      </div>

      {msg ? (
        <p className={`account-msg ${msg.kind === "ok" ? "account-msg--ok" : "account-msg--err"}`}>
          {msg.text}
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn--primary mt-4 disabled:cursor-not-allowed"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? "保存中…" : "保存档案"}
      </button>
    </section>
  );
}
