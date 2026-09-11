// 隐私弹窗的模块级 store：app.tsx 在隐私接口被调用时通过全局监听打开弹窗，
// PrivacyPopup 组件订阅此 store 渲染，并将用户选择回传 resolve。

export type PrivacyResolve = (
  arg: { event: "agree" | "disagree" | "exposureAuthorization" }
) => void;

let current: PrivacyResolve | null = null;
const listeners = new Set<(open: boolean) => void>();

/** 由全局隐私监听调用：展示自定义弹窗并记录本次的 resolve 回调 */
export function openPrivacyPopup(resolve: PrivacyResolve) {
  current = resolve;
  listeners.forEach((fn) => fn(true));
}

/** 弹窗关闭（无论同意/拒绝） */
export function closePrivacyPopup() {
  current = null;
  listeners.forEach((fn) => fn(false));
}

export function getPrivacyResolve(): PrivacyResolve | null {
  return current;
}

/** 弹窗曝光上报（在显示时调用一次，告知 superapp 已展示） */
export function reportPrivacyExposure() {
  current?.({ event: "exposureAuthorization" });
}

export function subscribePrivacy(fn: (open: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
