/**
 * 账户管理页（受 middleware 保护，仅登录可见）
 * 渲染客户端的账户面板：修改密码、退出登录、删除账户。
 */
import { AccountPanel } from "@/components/account/AccountPanel";

export const metadata = {
  title: "个人中心 · 灵犀 IELTS",
};

export default function AccountPage() {
  return (
    <main className="subpage" style={{ paddingTop: 40 }}>
      <AccountPanel />
    </main>
  );
}
