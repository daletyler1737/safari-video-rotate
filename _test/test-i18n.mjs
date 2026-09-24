/* 中英双语界面自测：
     语言自动识别（navigator.language） / 手动切换 / 写入 localStorage /
     重载后保持选择 / 切换后功能与状态行仍正确
   跑法：node test-i18n.mjs   （需要 workspace 里的 playwright-core + chromium）

   用 page.route 伪造一个正常 origin（https://local.test/），
   这样 localStorage 可用 —— about:blank（setContent）下它是被禁的，测不了持久化。 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, '视频旋转.user.js'), 'utf8');

const SITE = 'https://local.test/';
const LSKEY = 'dalRot6:local.test:lang';

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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route(SITE, r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: HTML }));

/* 载入页面：lang 决定 navigator.language；clear=true 时先清掉已保存的语言选择 */
async function load(lang, clear) {
  await page.goto(SITE);
  await page.evaluate((c) => {
    try {
      if (c) Object.keys(localStorage).forEach(k => k.indexOf('dalRot') === 0 && localStorage.removeItem(k));
    } catch (e) {}
  }, !!clear);
  await page.evaluate((l) => {
    Object.defineProperty(navigator, 'language', { get: () => l, configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => [l], configurable: true });
  }, lang);
  await page.addScriptTag({ content: SCRIPT });   // 语言覆盖必须在这之前
  await page.waitForSelector('.dal-bar', { timeout: 5000 }).catch(() => {});
  await page.click('.dal-bar button:nth-child(2)');   // 打开抽屉
  await page.waitForTimeout(220);
}

function readDrawer() {
  return page.evaluate(() => {
    const d = document.querySelector('.dal-drawer');
    if (!d) return null;
    const rows = [...d.querySelectorAll('.dal-row')];
    const langRow = rows[rows.length - 1];
    return {
      head: (d.querySelector('.dal-h') || {}).textContent || null,
      labels: [...d.querySelectorAll('.dal-lab')].map(x => x.textContent),
      status: (d.querySelector('.dal-st') || {}).textContent || null,
      foot: [...d.querySelectorAll('.dal-foot button')].map(b => b.textContent),
      langOn: [...langRow.querySelectorAll('button.dal-on')].map(b => b.textContent),
      titles: [...document.querySelectorAll('.dal-bar button')].map(b => b.title),
      saved: (function () { try { return localStorage.getItem('dalRot6:local.test:lang'); } catch (e) { return null; } })(),
    };
  });
}

/* 点语言行里的某个按钮（中文 / EN） */
async function pickLang(text) {
  await page.evaluate((t) => {
    const d = document.querySelector('.dal-drawer');
    const rows = [...d.querySelectorAll('.dal-row')];
    const langRow = rows[rows.length - 1];
    const b = [...langRow.querySelectorAll('button')].find(x => x.textContent === t);
    if (b) b.click();
  }, text);
  await page.waitForTimeout(250);
}

/* ---------------- T1 自动识别中文 ---------------- */
await load('zh-CN', true);
let d = await readDrawer();
check('T1_navigator.language=zh-CN → 中文界面（标题/标签/底部按钮）',
  d.head === '画面' && d.labels.includes('角度') && d.labels.includes('缩放') &&
  d.foot.join('/') === '一键铺满/全部复位',
  { head: d.head, labels: d.labels, foot: d.foot });

/* ---------------- T2 自动识别英文 ---------------- */
await load('en-US', true);
d = await readDrawer();
check('T2_navigator.language=en-US → 英文界面',
  d.head === 'Display' && d.labels.includes('Angle') && d.labels.includes('Zoom') &&
  d.foot.join('/') === 'Fit screen/Reset all',
  { head: d.head, labels: d.labels, foot: d.foot });

/* ---------------- T3 英文界面下图标 title 也是英文 ---------------- */
check('T3_三个图标 title 跟随语言（Rotate / Display / Fullscreen）',
  d.titles[0].indexOf('Rotate') === 0 && d.titles[1].indexOf('Display') === 0 &&
  d.titles[2].indexOf('Fullscreen') === 0,
  { titles: d.titles });

/* ---------------- T4 英文界面下状态行是英文 ---------------- */
await page.click('.dal-bar button:nth-child(1)');   // ⟳ 旋转 90°
await page.waitForTimeout(250);
d = await readDrawer();
check('T4_英文界面状态行用英文（Video … Scope … Zoom …，不含中文）',
  d.status && d.status.indexOf('Video') >= 0 && d.status.indexOf('Zoom') >= 0 &&
  !/[\u4e00-\u9fff]/.test(d.status),
  { status: d.status });

/* ---------------- T5 英文界面下功能照常 ---------------- */
const deg = await page.evaluate(() => (window.__dalDbg && window.__dalDbg.deg) || null);
check('T5_英文界面下旋转功能正常（deg=90）', deg === 90, { deg });

/* ---------------- T6 手动切回中文 ---------------- */
await pickLang('中文');
d = await readDrawer();
check('T6_点「中文」→ 界面立刻变回中文，且状态行同步',
  d.head === '画面' && d.status && d.status.indexOf('视频') === 0 &&
  d.status.indexOf('缩放') >= 0,
  { head: d.head, status: d.status });

/* ---------------- T7 切回中文后，角度仍是 90°（状态没被重建丢掉） ---------------- */
d = await readDrawer();
const degOn = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const on = rows[0].querySelector('button.dal-on');
  return on ? on.textContent : null;
});
check('T7_切换语言后保留原状态（角度仍高亮 90°）', degOn === '90°', { 高亮: degOn });

/* ---------------- T8 手动选择写入 localStorage ---------------- */
check('T8_手动切换写入 localStorage（' + LSKEY + ' = zh）', d.saved === 'zh', { saved: d.saved });

/* ---------------- T9 重载后保持手动选择（覆盖浏览器语言） ---------------- */
await load('en-US', false);          // 浏览器语言是英文，但上次存的是中文
d = await readDrawer();
check('T9_重载后仍是手动选的中文（优先于 navigator.language）',
  d.head === '画面' && d.langOn.join('') === '中文',
  { head: d.head, 高亮: d.langOn, saved: d.saved });

/* ---------------- T10 再切到 EN 并重载，持久化同样生效 ---------------- */
await pickLang('EN');
await load('zh-CN', false);          // 浏览器语言是中文，但上次存的是英文
d = await readDrawer();
check('T10_切到 EN 并重载后保持英文',
  d.head === 'Display' && d.langOn.join('') === 'EN' && d.saved === 'en',
  { head: d.head, 高亮: d.langOn, saved: d.saved });

/* ---------------- T11 语言行标签本身也翻译，档位名固定 ---------------- */
check('T11_语言行标签随语言变化（Language），档位名固定为 中文 / EN',
  d.labels.includes('Language'), { labels: d.labels, 档位: d.langOn });

/* ---------------- T12 语言切换不影响几何结果 ---------------- */
const geo = await page.evaluate(() => {
  const g = window.__dalDbg;
  return g ? { deg: g.deg, render: g.渲染, k: g.k } : null;
});
check('T12_切语言不改变任何几何状态（deg / 渲染方式 / 缩放系数）',
  geo && geo.deg === 90 && typeof geo.render === 'string' && geo.k > 0,
  geo);

console.log('\n==========================================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
