"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/browser";
import { useAuth } from "@/components/auth/useAuth";
import { ProfilePanel } from "@/components/account/ProfilePanel";
import { ModelSettingsPanel } from "@/components/account/ModelSettingsPanel";
import { ImaPanel } from "@/components/account/ImaPanel";

type SectionKey = "profile" | "security" | "model" | "kb";

const SECTIONS: { key: SectionKey; label: string; desc: string }[] = [
  { key: "profile", label: "身份档案", desc: "头像与昵称" },
  { key: "security", label: "登录与安全", desc: "密码与设备" },
  { key: "model", label: "模型与 API", desc: "自有 LLM 密钥" },
  { key: "kb", label: "知识库", desc: "ima 接入" },
];

function initialOf(name: string | null, email: string | null) {
  const base = (name ?? "").trim() || email || "?";
  return base.charAt(0).toUpperCase();
}

export function AccountPanel() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [active, setActive] = useState<SectionKey>("profile");

  // 修改密码
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pwdWorking, setPwdWorking] = useState(false);

  // 退出登录
  const [signoutWorking, setSignoutWorking] = useState(false);

  // 删除账户
  const [showDelete, setShowDelete] = useState(false);
  const [deletePwd, setDeletePwd] = useState("");
  const [deleteAck, setDeleteAck] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (loading) {
    return <p className="text-sm text-ink-soft">加载中…</p>;
  }

  const handleChangePassword = async () => {
    if (!user?.email) return;
    setPwdMsg(null);
    if (newPwd.length < 6) {
      setPwdMsg({ kind: "err", text: "新密码至少需要 6 位。" });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ kind: "err", text: "两次输入的新密码不一致。" });
      return;
    }
    setPwdWorking(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPwd,
      });
      if (signInErr) throw new Error("旧密码不正确。");
      const { error: updErr } = await supabase.auth.updateUser({ password: newPwd });
      if (updErr) throw updErr;
      setPwdMsg({ kind: "ok", text: "密码已更新，下次登录请使用新密码。" });
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err) {
      setPwdMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "更新失败，请稍后重试。",
      });
    } finally {
      setPwdWorking(false);
    }
  };

  const handleSignOut = async (scope: "local" | "global") => {
    setSignoutWorking(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut({ scope });
    router.push("/login");
    router.refresh();
  };

  const openDelete = () => {
    setDeleteMsg(null);
    setDeletePwd("");
    setDeleteAck(false);
    setShowDelete(true);
  };

  const handleDelete = async () => {
    if (!user?.email) return;
    if (!deleteAck) {
      setDeleteMsg("请先勾选确认框。");
      return;
    }
    setDeleting(true);
    setDeleteMsg(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePwd,
      });
      if (signInErr) throw new Error("密码不正确，无法删除账户。");
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "删除失败，请稍后重试。");
      }
      await supabase.auth.signOut({ scope: "global" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      setDeleting(false);
      setDeleteMsg(err instanceof Error ? err.message : "删除失败，请稍后重试。");
    }
  };

  return (
    <div>
      <header className="subhead">
        <h1>个人中心</h1>
        <p className="lead">
          管理你的身份档案、自有模型与知识库，以及登录与安全设置。
        </p>
      </header>

      <div className="account-shell">
        <aside className="account-aside">
          <div className="account-hero">
            {user?.avatarUrl ? (
              <img className="account-hero__avatar" src={user.avatarUrl} alt="头像" />
            ) : (
              <div className="account-hero__letter">
                {initialOf(user?.displayName ?? null, user?.email ?? null)}
              </div>
            )}
            <div className="account-hero__meta">
              <div className="account-hero__name">
                {user?.displayName || user?.email || "未命名"}
              </div>
              <div className="account-hero__email">{user?.email ?? ""}</div>
            </div>
          </div>

          <nav className="account-nav" aria-label="账户分区">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`account-nav__item${
                  active === s.key ? " account-nav__item--active" : ""
                }`}
                aria-current={active === s.key ? "page" : undefined}
                onClick={() => setActive(s.key)}
              >
                <span className="account-nav__label">{s.label}</span>
                <span className="account-nav__desc">{s.desc}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="account-sheet">
          {active === "profile" && <ProfilePanel />}

          {active === "security" && (
            <section className="account-section">
              <div className="panel">
                <h2 className="panel__title">修改密码</h2>
                <p className="panel__desc">出于安全，修改前需验证当前密码。</p>
                <div className="account-form">
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="当前密码"
                    value={oldPwd}
                    onChange={(e) => setOldPwd(e.target.value)}
                    className="field-input"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="新密码（至少 6 位）"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    className="field-input"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="再次输入新密码"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    className="field-input"
                  />
                </div>
                {pwdMsg ? (
                  <p
                    className={`account-msg ${
                      pwdMsg.kind === "ok" ? "account-msg--ok" : "account-msg--err"
                    }`}
                  >
                    {pwdMsg.text}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleChangePassword()}
                  disabled={pwdWorking}
                  className="btn btn--primary mt-4 disabled:cursor-not-allowed"
                >
                  {pwdWorking ? "处理中…" : "更新密码"}
                </button>
              </div>

              <div className="panel">
                <h2 className="panel__title">退出登录</h2>
                <p className="panel__desc">
                  仅本机退出保留其他设备会话；全设备登出会结束所有设备的登录状态。
                </p>
                <div className="account-actions">
                  <button
                    type="button"
                    onClick={() => void handleSignOut("local")}
                    disabled={signoutWorking}
                    className="btn btn--ghost disabled:cursor-not-allowed"
                  >
                    仅本机退出
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSignOut("global")}
                    disabled={signoutWorking}
                    className="btn btn--ghost disabled:cursor-not-allowed"
                  >
                    全设备登出
                  </button>
                </div>
              </div>

              <div className="panel danger-zone">
                <h2 className="panel__title">删除账户</h2>
                <p className="panel__desc">
                  删除后，你的账号及全部学习数据（词库进度、复习记录、口语记录）将从服务器永久清除，且不可恢复。
                </p>
                <button type="button" onClick={openDelete} className="btn btn--danger mt-4">
                  删除账户
                </button>
              </div>
            </section>
          )}

          {active === "model" && <ModelSettingsPanel />}

          {active === "kb" && <ImaPanel />}
        </div>
      </div>

      {/* 删除确认弹层 */}
      {showDelete ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除账户"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDelete(false);
          }}
        >
          <div className="modal">
            <h3 className="modal__title">确认删除账户？</h3>
            <p className="modal__body">此操作不可恢复。请输入当前密码以确认身份。</p>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="当前密码"
              value={deletePwd}
              onChange={(e) => setDeletePwd(e.target.value)}
              className="field-input"
            />
            <label className="modal__ack">
              <input
                type="checkbox"
                checked={deleteAck}
                onChange={(e) => setDeleteAck(e.target.checked)}
              />
              我理解该操作将永久删除我的账号与所有数据
            </label>
            {deleteMsg ? <p className="account-msg account-msg--err">{deleteMsg}</p> : null}
            <div className="modal__actions">
              <button type="button" onClick={() => setShowDelete(false)} className="btn btn--ghost">
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting || !deletePwd || !deleteAck}
                className="btn btn--danger disabled:cursor-not-allowed"
              >
                {deleting ? "处理中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
