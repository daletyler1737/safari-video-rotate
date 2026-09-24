/* 单语言包（dist/）自测：
     语言确实被「锁死」—— 不管浏览器语言是什么，包的界面语言都不变；
     包里不再有语言切换入口；功能与主脚本一致。
   跑法：先 node tools/build-lang-packs.mjs 生成 dist/，再 node test-langpacks.mjs */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SITE = 'https://local.test/';

const PACKS = {
  zh: path.join(ROOT, 'dist', 'video-rotate.zh.user.js'),
  en: path.join(ROOT, 'dist', 'video-rotate.en.user.js'),
};

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#222}
  #player{position:relative;width:1280px;height:720px;overflow:hidden;background:#000}
  .ytp-right-controls{position:absolute;right:0;bottom:0;display:flex;align-items:center;background:rgba(0,0,0,.5)}
  </style></head><body>
  <div id="player">
    <div class="html5-video-container" style="position:absolute;left:0;top:0;width:100%;height:100%">
      <video id="v" style="width:1280px;height:720px;left:0;top:0"></video>
    </div>
    <div class="ytp-right-controls"><button class="ytp-settings-button">S</button></div>
  </div>
  <script>
    (function(){
      var v = document.getElementById('v');
      Object.defineProperty(v, 'videoWidth',  { get: function(){ return 1920; } });
      Object.defineProperty(v, 'videoHeight', { get: function(){ return 1080; } });
    })();
  </script></body></html>`;

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
  if (info) console.log('        ' + JSON.stringify(info, null, 0));
}

/* ---------- 先做静态检查：包必须存在，且元数据正确 ---------- */
for (const [lang, p] of Object.entries(PACKS)) {
  check('P_' + lang + '_包文件存在（' + path.relative(ROOT, p) + '）', fs.existsSync(p));
}
const zhSrc = fs.readFileSync(PACKS.zh, 'utf8');
const enSrc = fs.readFileSync(PACKS.en, 'utf8');
check('P_zh_包含「中文包」标识且 LANG 锁为 zh',
  zhSrc.indexOf('【中文包】') >= 0 && /var LANG = 'zh';/.test(zhSrc) && !/navigator\.language/.test(zhSrc));
check('P_en_包含 English pack 标识且 LANG 锁为 en',
  enSrc.indexOf('English pack') >= 0 && /var LANG = 'en';/.test(enSrc) && !/navigator\.language/.test(enSrc));
check('P_两包都不含语言切换行、也不含另一语言字典',
  !/drawer\._lang = rLang;/.test(zhSrc) && !/drawer\._lang = rLang;/.test(enSrc) &&
  !/\n    en: \{/.test(zhSrc) && !/\n    zh: \{/.test(enSrc));

/* ---------- 运行时检查 ---------- */
const browser = await chromium.launch();

async function loadPack(lang, browserLang) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route(SITE, r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: HTML }));
  await page.goto(SITE);
  await page.evaluate((l) => {
    Object.defineProperty(navigator, 'language', { get: () => l, configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => [l], configurable: true });
  }, browserLang);
  await page.addScriptTag({ content: fs.readFileSync(PACKS[lang], 'utf8') });
  await page.waitForSelector('.dal-bar', { timeout: 5000 }).catch(() => {});
  await page.click('.dal-bar button:nth-child(2)');
  await page.waitForTimeout(220);
  return page;
}

function readDrawer(page) {
  return page.evaluate(() => {
    const d = document.querySelector('.dal-drawer');
    if (!d) return null;
    const rows = [...d.querySelectorAll('.dal-row')];
    const last = rows[rows.length - 1];
    return {
      head: (d.querySelector('.dal-h') || {}).textContent || null,
      labels: [...d.querySelectorAll('.dal-lab')].map(x => x.textContent),
      foot: [...d.querySelectorAll('.dal-foot button')].map(b => b.textContent),
      lastRowBtns: [...last.querySelectorAll('button')].map(b => b.textContent),
      rowCount: rows.length,
    };
  });
}

/* 中文包 + 浏览器语言英文 → 依然中文 */
const pz = await loadPack('zh', 'en-US');
let d = await readDrawer(pz);
check('R_zh_浏览器语言是英文时，中文包界面仍是中文（语言锁定生效）',
  d.head === '画面' && d.foot.join('/') === '一键铺满/全部复位',
  { head: d.head, foot: d.foot });

check('R_zh_包里没有语言切换档位（最后一行不是 中文/EN）',
  d.lastRowBtns.indexOf('中文') < 0 && d.lastRowBtns.indexOf('EN') < 0,
  { 最后一行按钮: d.lastRowBtns, 行数: d.rowCount });

await pz.click('.dal-bar button:nth-child(1)');      // 旋转
await pz.waitForTimeout(200);
const zhDeg = await pz.evaluate(() => (window.__dalDbg && window.__dalDbg.deg) || null);
check('R_zh_功能正常（旋转后 deg=90）', zhDeg === 90, { deg: zhDeg });
await pz.close();

/* 英文包 + 浏览器语言中文 → 依然英文 */
const pe = await loadPack('en', 'zh-CN');
d = await readDrawer(pe);
check('R_en_浏览器语言是中文时，英文包界面仍是英文（语言锁定生效）',
  d.head === 'Display' && d.foot.join('/') === 'Fit screen/Reset all',
  { head: d.head, foot: d.foot });

check('R_en_包里没有语言切换档位',
  d.lastRowBtns.indexOf('中文') < 0 && d.lastRowBtns.indexOf('EN') < 0,
  { 最后一行按钮: d.lastRowBtns, 行数: d.rowCount });

/* 英文包：状态行必须没有中文 */
await pe.click('.dal-bar button:nth-child(1)');
await pe.waitForTimeout(250);
const st = await pe.evaluate(() => {
  const s = document.querySelector('.dal-drawer .dal-st');
  return s ? s.textContent : null;
});
check('R_en_状态行全英文（无任何中文字符）',
  st && st.indexOf('Video') >= 0 && st.indexOf('Zoom') >= 0 && !/[\u4e00-\u9fff]/.test(st),
  { status: st });

/* 英文包：一键铺满仍能算对方向（竖屏看横片 → 转 90°） */
await pe.evaluate(() => {
  const d = document.querySelector('.dal-drawer');
  [...d.querySelectorAll('.dal-foot button')].find(b => b.textContent === 'Fit screen').click();
});
await pe.waitForTimeout(250);
const fill = await pe.evaluate(() => {
  const g = window.__dalDbg;
  return g ? { mode: g.mode, zoom: g.zoom } : null;
});
check('R_en_Fit screen 正常工作（切到 Fill、缩放回 100%）',
  fill && fill.mode === 'Fill' && Math.abs(fill.zoom - 1) < 0.001, fill);
await pe.close();

console.log('\n==========================================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
