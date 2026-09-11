// 生成底部 tabBar 图标：5 个语义图标 × 普通/选中两态 = 10 个 81×81 单色 PNG。
// 微信会自动按 tabBar 的 color / selectedColor 染色，故图标用纯黑描边 + 透明背景即可。
// 普通态 = 细描边空心；选中态 = 粗描边（更醒目），配合文字变色形成清晰反馈。

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../src/assets/tabbar");
mkdirSync(OUT_DIR, { recursive: true });

const SIZE = 81;
// 描边线宽：普通细、选中粗
const W_NORMAL = 3.2;
const W_ACTIVE = 6;

// 每个图标返回 { normal: <svg>, active: <svg> }，内部用当前色 #000 描边
const ICONS = {
  today: {
    normal: calendar(W_NORMAL),
    active: calendar(W_ACTIVE),
  },
  learn: {
    normal: book(W_NORMAL),
    active: book(W_ACTIVE),
  },
  review: {
    normal: refresh(W_NORMAL),
    active: refresh(W_ACTIVE),
  },
  speaking: {
    normal: mic(W_NORMAL),
    active: mic(W_ACTIVE),
  },
  profile: {
    normal: person(W_NORMAL),
    active: person(W_ACTIVE),
  },
};

// ---------- 图形定义（viewBox 0 0 81 81） ----------
function svg(inner, w) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <g fill="none" stroke="#000000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">
      ${inner}
    </g>
  </svg>`;
}

function calendar(w) {
  return svg(
    `
    <rect x="18" y="22" width="45" height="42" rx="9"/>
    <line x1="32" y1="14" x2="32" y2="25"/>
    <line x1="49" y1="14" x2="49" y2="25"/>
    <line x1="18" y1="34" x2="63" y2="34"/>
    <circle cx="32" cy="46" r="2.4" ${w > 4 ? 'fill="#000000" stroke="none"' : ""}/>
    <circle cx="49" cy="46" r="2.4" ${w > 4 ? 'fill="#000000" stroke="none"' : ""}/>
    `,
    w
  );
}

function book(w) {
  return svg(
    `
    <path d="M40.5 24 C33 20 22 21 18 23 L18 58 C22 56 33 55 40.5 59 Z"/>
    <path d="M40.5 24 C48 20 59 21 63 23 L63 58 C59 56 48 55 40.5 59 Z"/>
    <line x1="26" y1="32" x2="35" y2="31"/>
    <line x1="26" y1="40" x2="35" y2="39"/>
    <line x1="46" y1="31" x2="55" y2="32"/>
    <line x1="46" y1="39" x2="55" y2="40"/>
    `,
    w
  );
}

function refresh(w) {
  // 环形循环箭头：两段弧 + 两个箭头
  return svg(
    `
    <path d="M26 33 A19 19 0 0 1 60 36"/>
    <path d="M60 36 L54 28 M60 36 L66 30" />
    <path d="M55 50 A19 19 0 0 1 21 47"/>
    <path d="M21 47 L27 55 M21 47 L15 53"/>
    `,
    w
  );
}

function mic(w) {
  return svg(
    `
    <rect x="32.5" y="16" width="16" height="30" rx="8"/>
    <path d="M24 42 A16.5 16.5 0 0 0 57 42"/>
    <line x1="40.5" y1="58" x2="40.5" y2="66"/>
    <line x1="28" y1="66" x2="53" y2="66"/>
    `,
    w
  );
}

function person(w) {
  return svg(
    `
    <circle cx="40.5" cy="29" r="11"/>
    <path d="M22 65 C22 52 32 47 40.5 47 C49 47 59 52 59 65"/>
    `,
    w
  );
}

// ---------- 渲染 ----------
const tasks = [];
for (const [name, { normal, active }] of Object.entries(ICONS)) {
  tasks.push(
    sharp(Buffer.from(normal)).resize(SIZE, SIZE).png().toFile(resolve(OUT_DIR, `${name}.png`))
  );
  tasks.push(
    sharp(Buffer.from(active)).resize(SIZE, SIZE).png().toFile(resolve(OUT_DIR, `${name}-active.png`))
  );
}

await Promise.all(tasks);
console.log(`✅ 已生成 ${tasks.length} 个图标到 ${OUT_DIR}`);
