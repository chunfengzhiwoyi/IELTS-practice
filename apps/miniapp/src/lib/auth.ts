import Taro from "@tarojs/taro";
import { TaroStorageAdapter } from "@ielts/core/mini";
import { setStorageAdapter, getProfile, saveProfile, type MonogramColor } from "@ielts/core";

const AUTH_KEY = "els_auth";

/** 字母头像可选配色（墨/印/铜）——用户可在编辑页“选择” */
export const MONOGRAM_COLORS: Record<
  MonogramColor,
  { label: string; bg: string; fg: string }
> = {
  ink: { label: "墨", bg: "#2a2723", fg: "#faf8f4" },
  accent: { label: "印", bg: "#7a2e2b", fg: "#faf7f2" },
  bronze: { label: "铜", bg: "#a07c4a", fg: "#faf8f4" },
};

// 存储适配在模块加载时即绑定：避免 H5 / 首屏在 useLaunch 之前读取到默认的“内存存储”，
// 否则 getReviewQueue / generateReport 等都会拿到空数据（复习队列为空 → 无“查看提示”按钮），且学习进度无法落地。
setStorageAdapter(new TaroStorageAdapter());

export interface AuthState {
  userId: string;
  anonymous: boolean;
  openid?: string;
  nickname: string;
  avatarUrl: string;
  monogramColor: MonogramColor;
}

let auth: AuthState | null = null;
const listeners = new Set<(a: AuthState) => void>();

function persist(a: AuthState) {
  auth = a;
  Taro.setStorageSync(AUTH_KEY, a);
  notify();
}

function notify() {
  listeners.forEach((fn) => fn(auth!));
}

function ensureAnonymous(): AuthState {
  if (auth) return auth;
  const existing = Taro.getStorageSync(AUTH_KEY) as AuthState | "" | undefined;
  if (existing && (existing as AuthState).userId) {
    const e = existing as AuthState;
    // 兼容旧存储：早期版本未存 monogramColor，缺字段时回落到墨，避免 MONOGRAM_COLORS[undefined] 崩溃
    const safeColor: MonogramColor = (e.monogramColor &&
      (MONOGRAM_COLORS as Record<string, unknown>)[e.monogramColor]
      ? e.monogramColor
      : "ink") as MonogramColor;
    auth = { ...e, monogramColor: safeColor };
  } else {
    const userId = "anon-" + Math.random().toString(36).slice(2, 10);
    auth = { userId, anonymous: true, nickname: "", avatarUrl: "", monogramColor: "ink" };
    Taro.setStorageSync(AUTH_KEY, auth);
  }
  return auth;
}

/** 应用启动时调用：注入存储适配 + 静默匿名通行（零弹窗） */
export function initAuth() {
  setStorageAdapter(new TaroStorageAdapter());
  ensureAnonymous();
  // 静默 wx.login：拿到 code，二期发给后端换 openid；MVP 本地匿名即可，不阻塞渲染
  Taro.login({
    success: () => {},
    fail: () => {},
  });
}

export function getAuth(): AuthState {
  return ensureAnonymous();
}

/** 深度交互时调用：轻量个人化（昵称 / 微信头像 / 字母头像配色），不碰手机号 */
export function saveProfileInfo(
  nickname: string,
  avatarUrl: string,
  monogramColor?: MonogramColor,
) {
  const p = getProfile();
  const next = {
    nickname: nickname || p.nickname,
    avatarUrl: avatarUrl || p.avatarUrl,
    monogramColor: monogramColor || p.monogramColor,
  };
  saveProfile(next);
  persist({ ...getAuth(), nickname: next.nickname, avatarUrl: next.avatarUrl, monogramColor: next.monogramColor });
}

/** 调用需授权接口前的合规闸门；touristappid/H5 下静默通过（上线前须在微信后台配隐私指引） */
export function requirePrivacy(onOk: () => void) {
  // @ts-ignore
  if (typeof Taro.requirePrivacyAuthorize === "function") {
    Taro.requirePrivacyAuthorize({
      success: onOk,
      fail: () => {
        Taro.showToast({ title: "需同意隐私协议", icon: "none" });
      },
    });
  } else {
    onOk();
  }
}

export function logout() {
  Taro.removeStorageSync(AUTH_KEY);
  auth = null;
  ensureAnonymous();
}

import { useState, useEffect } from "react";
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(getAuth());
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
