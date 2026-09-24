/* 缩放交互自测：快选档位 / 长按加速 / 滚轮 / 点百分比复位
   跑法：node test-zoom.mjs   （需要 workspace 里的 playwright-core + chromium） */
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
  if (info) console.log('        ' + JSON.stringify(info, null, 0));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(HTML);
await page.addInitScript(() => { try { Object.keys(localStorage).forEach(k => k.indexOf('dalRot') === 0 && localStorage.removeItem(k)); } catch (e) {} });
await page.addScriptTag({ content: SCRIPT });
await page.waitForSelector('.dal-bar', { timeout: 5000 }).catch(() => {});

const zoom = () => page.evaluate(() => (window.__dalDbg && window.__dalDbg.zoom) || null);
const openDrawer = async () => {
  const open = await page.evaluate(() => !!document.querySelector('.dal-drawer.dal-open'));
  if (!open) { await page.click('.dal-bar button:nth-child(2)'); await page.waitForTimeout(300); }
};

/* ---------- S1 抽屉里有「快选」档位 ---------- */
await openDrawer();
const chips = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === '快选');
  return row ? [...row.querySelectorAll('button')].map(b => b.textContent) : null;
});
check('Z1_存在「快选」档位行', !!chips, { 档位: chips });

/* ---------- S1b 抽屉内容不能横向溢出（否则按钮被挤出屏幕点不到） ---------- */
const overflow = await page.evaluate(() => {
  const d = document.querySelector('.dal-drawer');
  const dr = d.getBoundingClientRect();
  const bad = [...d.querySelectorAll('button, input')].filter(b => {
    const r = b.getBoundingClientRect();
    if (!r.width) return false;
    return r.right > dr.right + 0.5 || r.left < dr.left - 0.5 ||
      r.right > window.innerWidth + 0.5 || r.left < -0.5;
  }).map(b => (b.textContent || b.type) + '@' + Math.round(b.getBoundingClientRect().right));
  return { 抽屉右边界: Math.round(dr.right), 视口宽: window.innerWidth, 溢出元素: bad };
});
check('Z1b_抽屉内所有控件都在可视范围内', overflow.溢出元素.length === 0, overflow);

/* ---------- S2 点 315% 一下到位 ---------- */
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === '快选');
  [...row.querySelectorAll('button')].find(b => b.textContent === '315%').click();
});
await page.waitForTimeout(400);
check('Z2_点「315%」一下跳到 315%', Math.abs((await zoom()) - 3.15) < 0.001, { zoom: await zoom() });

/* ---------- S3 百分比标签显示并高亮对应档位 ---------- */
const ui = await page.evaluate(() => {
  const v = document.querySelector('.dal-drawer .dal-val');
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === '快选');
  const on = [...row.querySelectorAll('button.dal-on')].map(b => b.textContent);
  return { label: v ? v.textContent : null, on };
});
check('Z3_标签显示 315% 且档位高亮', ui.label === '315%' && ui.on.length === 1 && ui.on[0] === '315%', ui);

/* ---------- S4 点百分比标签 → 回 100% ---------- */
await page.click('.dal-drawer .dal-val');
await page.waitForTimeout(400);
check('Z4_点百分比标签回到 100%', Math.abs((await zoom()) - 1) < 0.001, { zoom: await zoom() });

/* ---------- S5 滚轮：一次 ±10% ---------- */
await page.evaluate(() => {
  const row = document.querySelector('.dal-drawer .dal-row:nth-child(5)') || document.querySelector('.dal-drawer input[type=range]').parentNode;
  row.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(300);
check('Z5_滚轮上调一档 = +10%', Math.abs((await zoom()) - 1.1) < 0.001, { zoom: await zoom() });

/* ---------- S6 单次点击 + 按钮：小步（5%，因接近 100%） ---------- */
await page.click('.dal-drawer .dal-val');      // 回 100%
await page.waitForTimeout(300);
const plus = (await page.$$('.dal-drawer button.dal-zoombtn'))[1];
await plus.click();
await page.waitForTimeout(300);
check('Z6_近 100% 时单点 + 步长 5%', Math.abs((await zoom()) - 1.05) < 0.001, { zoom: await zoom() });

/* ---------- S7 远距离时步长自动变大 ---------- */
await page.evaluate(() => { window.__dalDbg = null; });
// 先跳到 200%，此时单点步长应为 10%
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === '快选');
  [...row.querySelectorAll('button')].find(b => b.textContent === '200%').click();
});
await page.waitForTimeout(400);
await (await page.$$('.dal-drawer button.dal-zoombtn'))[1].click();
await page.waitForTimeout(300);
const z7 = await zoom();
check('Z7_200% 时步子自动变大（> 100% 处的 5%，且 ≥ 20%）', (z7 - 2) >= 0.2,
  { '200% 处单点一步': Math.round((z7 - 2) * 100) + '%' });

/* ---------- S8 长按 + 按钮 1 秒 → 快速跨越（应远超单点） ---------- */
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === '快选');
  [...row.querySelectorAll('button')].find(b => b.textContent === '100%').click();
});
await page.waitForTimeout(400);
const before = await zoom();
const box = await (await page.$$('.dal-drawer button.dal-zoombtn'))[1].boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(1100);
await page.mouse.up();
await page.waitForTimeout(300);
const after = await zoom();
check('Z8_长按 1 秒快速跨越（涨幅 ≥ 100%）', (after - before) >= 1.0,
  { 起: Math.round(before * 100) + '%', 止: Math.round(after * 100) + '%', 涨幅: Math.round((after - before) * 100) + '%' });

/* ---------- S9 松手即停（定时器已清掉，不会继续涨） ---------- */
await page.click('.dal-drawer .dal-val');   // 回 100%
await page.waitForTimeout(300);
const box2 = await (await page.$$('.dal-drawer button.dal-zoombtn'))[1].boundingBox();
await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
await page.mouse.down();
await page.waitForTimeout(900);
await page.mouse.up();
await page.waitForTimeout(150);
const justAfterUp = await zoom();
await page.waitForTimeout(600);
const laterStill = await zoom();
check('Z9_松手即停（数值不再继续变化）', justAfterUp === laterStill,
  { 松手后: Math.round(justAfterUp * 100) + '%', '600ms 后': Math.round(laterStill * 100) + '%' });

/* ---------- S10 缩放真的改变了画面（不是只改了数字） ---------- */
const geom = await page.evaluate(() => {
  const v = document.querySelector('video'), p = document.getElementById('player');
  const vr = v.getBoundingClientRect(), pr = p.getBoundingClientRect();
  return { tf: v.style.transform, 中心偏差x: Math.round(((vr.left + vr.width / 2) - (pr.left + pr.width / 2)) * 10) / 10 };
});
check('Z10_缩放已作用到画面且仍居中', /scale\(/.test(geom.tf) && Math.abs(geom.中心偏差x) < 2, geom);

/* ---------- S11 全屏浮动按钮组要落在右下角（和播放器控制栏同侧） ---------- */
const floatInfo = await page.evaluate(() => {
  const b = document.querySelector('.dal-bar');
  b.classList.add('dal-float');
  const r = b.getBoundingClientRect();
  const res = {
    位置: Math.round(r.right) + ',' + Math.round(r.bottom),
    视口: window.innerWidth + 'x' + window.innerHeight,
    贴右边: Math.abs(r.right - (window.innerWidth - 12)) < 24,
    在下方: r.bottom > window.innerHeight * 0.6,
    避开了控制栏: r.bottom <= window.innerHeight - 56,
  };
  b.classList.remove('dal-float');
  return res;
});
check('Z11_全屏浮动按钮在右下角且避开控制栏',
  floatInfo.贴右边 && floatInfo.在下方 && floatInfo.避开了控制栏, floatInfo);

/* ---------- S12 浮动时抽屉向上展开（不跑到屏幕外） ---------- */
const drawerUp = await page.evaluate(async () => {
  const bar = document.querySelector('.dal-bar');
  const d = document.querySelector('.dal-drawer');
  bar.classList.add('dal-float');
  d.classList.remove('dal-open');                 // 先关
  document.querySelector('.dal-bar button:nth-child(2)').click();  // 再开 → 触发定位
  await new Promise(r => setTimeout(r, 350));
  const br = bar.getBoundingClientRect(), dr = d.getBoundingClientRect();
  const res = {
    按钮顶: Math.round(br.top), 抽屉底: Math.round(dr.bottom),
    抽屉在按钮上方: dr.bottom <= br.top + 1,
    完整可见: dr.top >= 0 && dr.bottom <= window.innerHeight && dr.left >= 0 && dr.right <= window.innerWidth,
  };
  bar.classList.remove('dal-float');
  return res;
});
check('Z12_浮动时抽屉向上展开且完整可见',
  drawerUp.抽屉在按钮上方 && drawerUp.完整可见, drawerUp);

await page.close();
await browser.close();
console.log('\n==========================================');
console.log(`通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
