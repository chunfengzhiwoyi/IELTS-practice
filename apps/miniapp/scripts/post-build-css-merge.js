/**
 * post-build-css-merge.js
 * Taro H5 构建后：把拆分的 CSS chunk 合并进 app.css。
 *
 * 问题：mini-css-extract-plugin 把页面/组件 SCSS 拆成异步 chunk（127.css 等），
 *       但 Taro H5 运行时首屏未加载这些 <link>，导致样式全丢。
 * 方案：构建完成后把所有 css/*.css 拼接到 app.css 末尾（保留原文件防 404）。
 *
 * 用法：node post-build-css-merge.js <dist-h5-dir>
 * 示例：node post-build-css-merge.js dist-h5
 *
 * 健壮性：某些环境下（如工作区文件监视器 / 防病毒按访问扫描以 share-deny-write
 *        打开文件），覆盖「已存在」文件会报 EPERM，且文件一旦被创建便立即受影响。
 *        本脚本因此从不依赖覆盖已存在文件：
 *          - 优先就地覆盖 app.css / index.html（正常干净环境）
 *          - 失败时回退到「唯一新文件名」（带时间戳），保证任何环境下都能产出
 *            可预览的合并结果，且绝不触碰只读锁定的原文件。
 */
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(process.argv[2] || 'dist-h5');
const cssDir = path.join(distDir, 'css');
const appCss = path.join(cssDir, 'app.css');
const mergedCss = path.join(cssDir, 'app.merged.css');
const indexHtml = path.join(distDir, 'index.html');

/** 尝试写入 file；若因 EPERM/EACCES 失败，则写入带时间戳的唯一新文件并返回其路径。 */
function writeRobust(file, content) {
  try {
    fs.writeFileSync(file, content, 'utf8');
    return file;
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') {
      const ext = path.extname(file) || '';
      const base = file.slice(0, file.length - ext.length);
      const u = base + '.' + Date.now() + ext;
      fs.writeFileSync(u, content, 'utf8');
      return u;
    }
    throw e;
  }
}

if (!fs.existsSync(appCss)) {
  console.error('[post-build-css] ERROR: ' + appCss + ' not found');
  process.exit(1);
}

// 读取所有 CSS 文件，按文件名排序保证稳定顺序
const files = fs.readdirSync(cssDir)
  .filter(f => f.endsWith('.css') && f !== 'app.css' && f !== 'app.merged.css' && !/\.\d+\.css$/.test(f))
  .sort();

if (files.length === 0) {
  console.log('[post-build-css] No chunks to merge (already single file)');
  process.exit(0);
}

const appContent = fs.readFileSync(appCss, 'utf8');
const chunks = files.map(f => {
  const content = fs.readFileSync(path.join(cssDir, f), 'utf8');
  return '/* merged from ' + f + ' */\n' + content;
});

const merged = [appContent, ...chunks].join('\n\n');

// 1) 合并结果：优先就地覆盖 app.css（干净环境）；否则落到唯一新文件
const wroteApp = (() => {
  try { fs.writeFileSync(appCss, merged, 'utf8'); return true; }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') return false; throw e; }
})();

let entryCssRel;
if (wroteApp) {
  entryCssRel = '/css/app.css';
  console.log('[post-build-css] Merged ' + files.length + ' chunks into app.css (' +
    (Buffer.byteLength(merged) / 1024).toFixed(1) + ' KB)');
} else {
  const mergedPath = writeRobust(mergedCss, merged);
  entryCssRel = '/css/' + path.basename(mergedPath);
  console.log('[post-build-css] app.css write blocked (EPERM) — merged -> ' + entryCssRel + ' (' +
    (Buffer.byteLength(merged) / 1024).toFixed(1) + ' KB, ' + files.length + ' chunks)');
}

// 2) 入口 HTML：把 link 指向 entryCssRel，优先就地覆盖 index.html；否则唯一新文件
let entryHtmlRel = '/index.html';
if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, 'utf8');
  const patched = html.replace(
    /<link[^>]*href=["']\/css\/app\.css["'][^>]*>/i,
    '<link href="' + entryCssRel + '" rel="stylesheet">'
  );
  const outHtml = writeRobust(indexHtml, patched);
  entryHtmlRel = '/' + path.basename(outHtml);
  if (outHtml !== indexHtml) {
    console.log('[post-build-css] index.html write blocked (EPERM) — entry -> ' + entryHtmlRel);
  } else {
    console.log('[post-build-css] Patched index.html -> ' + entryCssRel);
  }
}

// 注意：不删除 chunk CSS 文件！webpack 运行时（__webpack_require__.f.miniCss）
// 会在加载对应 JS chunk 时动态插入 <link> 引用这些文件。
// 删除会导致 404 报错（CSS_CHUNK_LOAD_FAILED），虽然非致命但控制台难看。
// 保留它们只是冗余下载（几 KB），不影响功能。
console.log('[post-build-css] Done. Preview entry: ' + entryHtmlRel);
