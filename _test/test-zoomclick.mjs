/* 缩放长条「点哪就多大」自测
   跑法：cd _test && node test-zoomclick.mjs
   覆盖：长条独占整行 / 单击任意位置直接到位 / 两端极值 / 拖动跟手 / 不溢出 / 快选 315% / 长按加速 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, '视频旋转.user.js'), 'utf8');

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
  if (info) console.log('        ' + JSON.stringify(info));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(HTML);
await page.addInitScript(() => { try { Object.keys(localStorage).forEach(k => k.indexOf('dalRot') === 0 && localStorage.removeItem(k)); } catch (e) {} });
// 强制中文界面：脚本按 navigator.language 自动选语言，这里断言用的是中文文案
await page.evaluate(() => {
  Object.defineProperty(navigator, 'language', { get: () => 'zh-CN', configurable: true });
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'], configurable: true });
});
await page.addScriptTag({ content: SCRIPT });
await page.waitForSelector('.dal-bar', { timeout: 5000 }).catch(() => {});

const zoom = () => page.evaluate(() => (window.__dalDbg && window.__dalDbg.zoom) || null);
const openDrawer = async () => {
  const open = await page.evaluate(() => !!document.querySelector('.dal-drawer.dal-open'));
  if (!open) { await page.click('.dal-bar button:nth-child(2)'); await page.waitForTimeout(300); }
};
await openDrawer();

/* ---------- C1 长条独占一行且够宽 ---------- */
const barInfo = await page.evaluate(() => {
  const rng = document.querySelector('.dal-drawer input[type=range]');
  const row = rng.parentNode;
  const d = document.querySelector('.dal-drawer');
  const rr = rng.getBoundingClientRect(), dr = d.getBoundingClientRect();
  const others = [...row.querySelectorAll('button')].length;
  return {
    行内其它控件数: others,
    长条宽: Math.round(rr.width),
    抽屉内宽: Math.round(dr.width - 24),
    占满一行: rr.width >= (dr.width - 24) * 0.9,
    高度: Math.round(rr.height),
  };
});
check('C1_长条独占一行、占满抽屉宽度（好点）',
  barInfo.占满一行 && barInfo.行内其它控件数 === 0 && barInfo.高度 >= 10, barInfo);

/* ---------- 工具：把「长条上 x 比例处」换算成页面坐标并点击 ---------- */
const rangeGeom = () => page.evaluate(() => {
  const r = document.querySelector('.dal-drawer input[type=range]').getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});
async function clickAt(frac) {
  const g = await rangeGeom();
  const THUMB = 15;
  // 期望值：与脚本内 zJump 用同一套公式
  const t = Math.max(0, Math.min(1, frac));
  const expectPct = Math.round(25 + t * (400 - 25));
  // 反解出 clientX，使 zJump 恰好得到 expectPct
  const clientX = g.left + THUMB / 2 + t * (g.width - THUMB);
  await page.mouse.click(clientX, g.top + g.height / 2);
  await page.waitForTimeout(250);
  return { expectPct, clientX, got: Math.round((await zoom()) * 100) };
}

/* ---------- C2 点 30% 处 → 一次到位 ---------- */
await page.click('.dal-drawer .dal-val').catch(() => {});
await page.waitForTimeout(200);
const c2 = await clickAt(0.30);
check('C2_点长条 30% 处，一次点击即到位（25→400 映射 ≈137%）',
  Math.abs(c2.got - c2.expectPct) <= 2, c2);

/* ---------- C3 点 80% 处 ---------- */
const c3 = await clickAt(0.80);
check('C3_点长条 80% 处 → ≈325%', Math.abs(c3.got - c3.expectPct) <= 2, c3);

/* ---------- C4 点最左端 → 25% ---------- */
const c4 = await clickAt(0.0);
check('C4_点最左端 → 25%（下限）', Math.abs(c4.got - 25) <= 2, c4);

/* ---------- C5 点最右端 → 400% ---------- */
const c5 = await clickAt(1.0);
check('C5_点最右端 → 400%（上限）', Math.abs(c5.got - 400) <= 2, c5);

/* ---------- C6 点击次数 = 到位次数（不靠反复点） ---------- */
await page.evaluate(() => { window.__dalClickCount = 0; });
const c6 = await page.evaluate(async () => {
  const rng = document.querySelector('.dal-drawer input[type=range]');
  const r = rng.getBoundingClientRect();
  const y = r.top + r.height / 2;
  const x = r.left + 15 / 2 + 0.5 * (r.width - 15);   // 50% 处
  for (const type of ['mousedown', 'mouseup', 'click']) {
    rng.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }
  await new Promise(res => setTimeout(res, 300));
  return { zoom: window.__dalDbg && window.__dalDbg.zoom };
});
check('C6_50% 处单击一次 → ≈212%（点一下即到，无需连点）',
  Math.abs(Math.round(c6.zoom * 100) - 212) <= 3, { zoom: Math.round(c6.zoom * 100) + '%' });

/* ---------- C7 按住拖动跟手（30% → 70%） ---------- */
const g7 = await rangeGeom();
let afterC7 = 0;
{
  const THUMB = 15;
  const xAt = f => g7.left + THUMB / 2 + f * (g7.width - THUMB);
  const y = g7.top + g7.height / 2;
  await page.mouse.move(xAt(0.30), y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const mid = Math.round((await zoom()) * 100);
  await page.mouse.move(xAt(0.55), y);
  await page.waitForTimeout(120);
  await page.mouse.move(xAt(0.70), y);
  await page.waitForTimeout(150);
  const end = Math.round((await zoom()) * 100);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = Math.round((await zoom()) * 100);
  afterC7 = after;
  const expectEnd = Math.round(25 + 0.70 * 375);
  check('C7_按住拖动跟手（拖到 70% ≈287%，松手后不变）',
    Math.abs(mid - Math.round(25 + 0.30 * 375)) <= 3 &&
    Math.abs(end - expectEnd) <= 3 && after === end,
    { 按下点: mid + '%', 拖到70: end + '%', 期望: expectEnd + '%', 松手后: after + '%' });
}

/* ---------- C8 拖动结束后没有残留监听（再移动鼠标不会乱跳） ---------- */
await page.mouse.move(10, 10);
await page.waitForTimeout(100);
await page.mouse.move(600, 400);
await page.waitForTimeout(150);
const c8 = Math.round((await zoom()) * 100);
check('C8_松手后再移动鼠标不会继续改缩放', c8 === afterC7, { 松手后: afterC7 + '%', 再移动后: c8 + '%' });

/* ---------- C9 「− / 百分比 / +」这一行还在，百分比可点回 100% ---------- */
const rowUI = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === '缩放');
  return row ? [...row.children].map(c => c.textContent).filter(Boolean) : null;
});
check('C9_缩放按钮行 = 缩放 / − / 当前百分比 / +', !!rowUI && rowUI.length === 4, { 行: rowUI });

await page.click('.dal-drawer .dal-val');
await page.waitForTimeout(250);
check('C10_点百分比数字回到 100%', Math.abs((await zoom()) - 1) < 0.001, { zoom: Math.round((await zoom()) * 100) + '%' });

/* ---------- C11 快选里有 315% 且一下到位 ---------- */
const chips = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === '快选');
  return [...row.querySelectorAll('button')].map(b => b.textContent);
});
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === '快选');
  [...row.querySelectorAll('button')].find(b => b.textContent === '315%').click();
});
await page.waitForTimeout(300);
check('C11_快选含 315% 且一点到位', chips.indexOf('315%') >= 0 && Math.abs((await zoom()) - 3.15) < 0.001,
  { 档位: chips, zoom: Math.round((await zoom()) * 100) + '%' });

/* ---------- C12 长按 + 按钮 1 秒 → 落点既快又不过冲 ---------- */
await page.click('.dal-drawer .dal-val');
await page.waitForTimeout(250);
const before12 = await zoom();
const btnBox = await (await page.$$('.dal-drawer button.dal-zoombtn'))[1].boundingBox();
await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
await page.mouse.down();
await page.waitForTimeout(1000);
const at1s = Math.round((await zoom()) * 100);
await page.mouse.up();
await page.waitForTimeout(250);
const after12 = await zoom();
check('C12_长按 1 秒落到 250%~500%（够快、又不冲顶）',
  at1s >= 250 && at1s <= 500,
  { 起: Math.round(before12 * 100) + '%', '1秒时': at1s + '%', 松手后: Math.round(after12 * 100) + '%' });

/* ---------- C12b 松手立即停住 ---------- */
const holdAfter = Math.round((await zoom()) * 100);
await page.waitForTimeout(600);
const holdLater = Math.round((await zoom()) * 100);
check('C12b_松手后缩放不再继续变化', holdAfter === holdLater, { 松手时: holdAfter + '%', '600ms后': holdLater + '%' });

/* ---------- C13 抽屉控件仍不溢出 ---------- */
const overflow = await page.evaluate(() => {
  const d = document.querySelector('.dal-drawer');
  const dr = d.getBoundingClientRect();
  const bad = [...d.querySelectorAll('button, input')].filter(b => {
    const r = b.getBoundingClientRect();
    if (!r.width) return false;
    return r.right > dr.right + 0.5 || r.left < dr.left - 0.5 ||
      r.right > window.innerWidth + 0.5 || r.left < -0.5;
  }).map(b => (b.textContent || b.type) + '@' + Math.round(b.getBoundingClientRect().right));
  return { 抽屉右: Math.round(dr.right), 视口: window.innerWidth, 溢出: bad };
});
check('C13_抽屉内所有控件都在可视范围内', overflow.溢出.length === 0, overflow);

/* ---------- C14 缩放真的作用到画面 ---------- */
const geom = await page.evaluate(() => {
  const v = document.querySelector('video'), p = document.getElementById('player');
  const vr = v.getBoundingClientRect(), pr = p.getBoundingClientRect();
  return { tf: v.style.transform, 中心偏差x: Math.round(((vr.left + vr.width / 2) - (pr.left + pr.width / 2)) * 10) / 10 };
});
check('C14_缩放已作用到画面且仍居中', /scale\(/.test(geom.tf) && Math.abs(geom.中心偏差x) < 2, geom);

/* ---------- C15 截图留档 ---------- */
await page.evaluate(() => { document.querySelector('.dal-drawer').classList.add('dal-open'); });
await page.waitForTimeout(200);
await page.screenshot({ path: 'zoom_bar_ui.png', clip: { x: 0, y: 0, width: 1280, height: 720 } });

await page.close();
await browser.close();
console.log('\n==========================================');
console.log(`通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
