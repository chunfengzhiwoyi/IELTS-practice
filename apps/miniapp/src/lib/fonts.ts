/**
 * 字体加载（非阻塞 + 系统衬线兜底）
 * 用户决策：MVP 即加载 Fraunces / Newsreader 以还原 web 学术编辑气质。
 * 前置条件（上线前必须满足，否则静默回退系统衬线，不影响功能）：
 *   1. 字体 woff2 托管在 https 且加入微信「downloadFile 合法域名」白名单；
 *   2. 真实 appid（touristappid 无法真验）；
 *   3. Fraunces/Newsreader 为 SIL OFL 可商用。
 */
// 替换为你的 https 字体托管地址（建议子集化 woff2，控制主包体积）。
const FONT_BASE = ""; // 例：https://cdn.example.com/fonts

const FONTS: Array<{ family: string; file: string }> = [
  { family: "Fraunces", file: "Fraunces.woff2" },
  { family: "Newsreader", file: "Newsreader.woff2" },
];

export function loadFonts(): void {
  if (!FONT_BASE) return; // 未配置则走系统衬线兜底
  // @ts-ignore —— wx 在小程序运行时存在
  const wxLoad = typeof wx !== "undefined" && wx.loadFontFace ? wx.loadFontFace : null;
  if (!wxLoad) return;
  for (const f of FONTS) {
    wxLoad({
      family: f.family,
      source: `url(${FONT_BASE}/${f.file})`,
      success: () => {},
      fail: () => {}, // 静默回退
    });
  }
}
