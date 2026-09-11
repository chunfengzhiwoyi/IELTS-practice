import { useState, useEffect } from "react";
import Taro from "@tarojs/taro";

/**
 * 返回自定义导航栏所需的布局参数（真机安全，首帧即正确）。
 *
 * 关键：高度计算在「首次渲染」同步完成（useState 初始化函数），
 * 不再依赖 useEffect 时机——否则 tab 页在应用启动时一并挂载，
 * 胶囊信息可能尚未就绪，导致不同页面算出不同的顶部间距。
 *
 * - statusBarHeight: 系统状态栏高度（px，因机型而异）
 * - navBarHeight: 导航栏内容区高度（胶囊高度 + 上下对称间距）
 * - totalHeight: 需为内容预留的总高度 = 状态栏 + 导航栏 + 少量间距
 * - menuButtonRight: 胶囊按钮右边距（用于右侧留白，避免与右上胶囊重叠）
 */
export interface NavHeightInfo {
  statusBarHeight: number;
  navBarHeight: number;
  totalHeight: number;
  menuButtonRight: number;
}

const FALLBACK: NavHeightInfo = {
  statusBarHeight: 44,
  navBarHeight: 88,
  totalHeight: 44 + 88 + 16,
  menuButtonRight: 180,
};

function computeNavHeight(): NavHeightInfo {
  try {
    const sys =
      typeof Taro.getWindowInfo === "function"
        ? Taro.getWindowInfo()
        : // @ts-ignore legacy
          Taro.getSystemInfoSync();

    // 注意用 || 而非 ??：statusBarHeight 为 0（未就绪）时应回落，避免把间距算成 0
    const sb = sys?.statusBarHeight || 44;

    let menuBtn: { top: number; bottom: number; right: number; width: number } | null = null;
    if (typeof Taro.getMenuButtonBoundingClientRect === "function") {
      try {
        const btn = Taro.getMenuButtonBoundingClientRect();
        if (btn && btn.width > 0) {
          menuBtn = { top: btn.top, bottom: btn.bottom, right: btn.right, width: btn.width };
        }
      } catch {
        /* 胶囊信息获取失败时用默认值 */
      }
    }

    let navH = 88; // 默认值
    let menuRight = 180;

    if (menuBtn) {
      const capsuleHeight = menuBtn.bottom - menuBtn.top;
      // 胶囊上下与状态栏的间距对称：gap = max(胶囊top - 状态栏, 0)
      const gap = Math.max(menuBtn.top - sb, 0);
      navH = Math.max(capsuleHeight + gap, 32);
      if (sys?.windowWidth) {
        menuRight = sys.windowWidth - menuBtn.right + 12;
      }
    }

    // 内容需预留的总高度：状态栏 + 导航栏内容 + 底部 16px 安全间距
    const totalHeight = sb + navH + 16;

    return {
      statusBarHeight: sb,
      navBarHeight: navH,
      totalHeight,
      menuButtonRight: menuRight,
    };
  } catch {
    return FALLBACK;
  }
}

export function useNavHeight(): NavHeightInfo {
  // 首帧即同步计算正确值，useEffect 仅作二次校准（如横竖屏切换）
  const [info, setInfo] = useState<NavHeightInfo>(computeNavHeight);

  useEffect(() => {
    setInfo(computeNavHeight());
  }, []);

  return info;
}
