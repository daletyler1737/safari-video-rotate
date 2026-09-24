/**
 * 全屏专项自测
 * 目的：验证「全屏后画面是否铺满」，并读出脚本内部的真实计算值（window.__dalDbg）。
 * 用法：node test-fullscreen.mjs [视频URL] [宽x高]
 *   默认视口 1080x1920（复刻用户当前的竖屏）
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, '视频旋转.user.js'), 'utf8');
const OUT = HERE;
const URL = process.argv[2] || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const VP = (process.argv[3] || '1080x1920').split('x').map(Number);
const HEADED = process.argv[4] === 'headed';

const browser = await chromium.launch({
  headless: !HEADED,
  args: ['--autoplay-policy=no-user-gesture-required', '--window-position=0,0'],
});
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] } });
page.on('pageerror', (e) => console.log('⚠️ 页面错误: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('⚠️ console: ' + m.text().slice(0, 200));
});
await page.addInitScript(() => {
  // 强制中文界面（脚本按 navigator.language 选语言，这里的断言用中文文案）
  Object.defineProperty(navigator, 'language', { get: () => 'zh-CN', configurable: true });
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'], configurable: true });
});
await page.addInitScript(SCRIPT);

console.log(`视口 ${VP[0]}x${VP[1]}  打开 ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('video', { timeout: 30000 }).catch(() => console.log('⚠️ 没等到 video'));
await page.waitForTimeout(3500);
await page.evaluate(() => { const v = document.querySelector('video'); if (v) v.play().catch(() => {}); });
await page.waitForTimeout(2500);

const probe = () => page.evaluate(() => {
  const v = document.querySelector('video');
  if (!v) return { err: 'no video' };
  const r = v.getBoundingClientRect();
  const fse = document.fullscreenElement || document.webkitFullscreenElement || null;
  const d = window.__dalDbg || {};
  // 注意：开启 clip-path 裁切后，元素外接矩形会大于实际可见画面，
  // 所以「可见画面」必须用脚本导出的画面框算，不能用 getBoundingClientRect。
  const rot = d.deg % 180 !== 0;
  const visW = d.Fw ? (rot ? d.Fh : d.Fw) * (d.zoom || 1) : r.width;
  const visH = d.Fh ? (rot ? d.Fw : d.Fh) * (d.zoom || 1) : r.height;
  return {
    视口: window.innerWidth + 'x' + window.innerHeight,
    全屏元素: fse ? (fse.id || fse.className || fse.tagName) : '(非全屏)',
    原生视频全屏: !!(v.webkitDisplayingFullscreen),
    可见画面: Math.round(visW) + 'x' + Math.round(visH),
    覆盖视口: (visW >= window.innerWidth - 2) && (visH >= window.innerHeight - 2),
    画面中心偏差: d.Fw ? ('x ' + Math.round((r.left + r.width / 2) - window.innerWidth / 2) +
      ' / y ' + Math.round((r.top + r.height / 2) - window.innerHeight / 2)) : '-',
    video内联尺寸: v.offsetWidth + 'x' + v.offsetHeight,
    媒体: v.videoWidth + 'x' + v.videoHeight,
    transform: v.style.transform || '(空)',
    裁切: v.style.clipPath || '(无)',
    DBG: d,
  };
});

console.log('\n===== ① 初始（未旋转） =====');
console.log(JSON.stringify(await probe(), null, 2));

// ⟳ 旋转 90°
await page.evaluate(() => document.querySelectorAll('.dal-bar button')[0].click());
await page.waitForTimeout(1000);
console.log('\n===== ② 转 90°（默认 Auto） =====');
console.log(JSON.stringify(await probe(), null, 2));

// ⚙ → 比例切 Fill
await page.evaluate(() => document.querySelectorAll('.dal-bar button')[1].click());
await page.waitForTimeout(300);
const fillOk = await page.evaluate(() => {
  const rows = document.querySelectorAll('.dal-drawer .dal-chips');
  if (rows.length < 2) return false;
  rows[1].querySelectorAll('button')[1].click(); // Fill
  return true;
});
await page.waitForTimeout(1000);
console.log('\n===== ③ 切 Fill（窗口模式） =====');
console.log('切 Fill 点击: ' + fillOk);
console.log(JSON.stringify(await probe(), null, 2));
await page.screenshot({ path: OUT + '/fs_00_窗口_Fill_转90.png' });

// ---- 进入全屏：点 YouTube 自己的全屏按钮（真实鼠标事件），验证是否被接管 ----
console.log('\n===== ④ 点 YouTube 原生全屏按钮（应被接管为 DOM 全屏） =====');
await page.mouse.move(VP[0] / 2, VP[1] / 2);
await page.waitForTimeout(600);
const ytFsBtn = page.locator('.ytp-fullscreen-button').first();
const hasBtn = await ytFsBtn.count();
console.log('YouTube 全屏按钮存在: ' + (hasBtn ? '是' : '否'));
if (hasBtn) {
  await ytFsBtn.click({ force: true }).catch((e) => console.log('点击失败: ' + e.message));
  await page.waitForTimeout(2500);
}
console.log(JSON.stringify(await probe(), null, 2));
await page.screenshot({ path: OUT + '/fs_01_全屏_Fill_转90.png' });

console.log('\n===== ⑤ 再等 4 秒（观察是否自愈） =====');
await page.waitForTimeout(4000);
console.log(JSON.stringify(await probe(), null, 2));
await page.screenshot({ path: OUT + '/fs_02_全屏_4秒后.png' });

console.log('\n===== ⑥ 点我们的 ⛶ 按钮退出全屏 =====');
await page.click('.dal-bar button:nth-child(3)', { force: true }).catch((e) => console.log('点击失败: ' + e.message));
await page.waitForTimeout(2000);
console.log(JSON.stringify(await probe(), null, 2));
await page.screenshot({ path: OUT + '/fs_03_退出全屏.png' });

await browser.close();
console.log('\n截图: ' + OUT);
