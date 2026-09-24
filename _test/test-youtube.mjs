/**
 * 真实 YouTube 页面自测（v2）
 * 用 addInitScript 在文档创建前注入（等价于 Userscripts 的注入时机），
 * 绕过 YouTube 的 Trusted Types 限制；并打印祖先链确认「显示区」选择是否正确。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, '视频旋转.user.js'), 'utf8');
const OUT = HERE;
fs.mkdirSync(OUT, { recursive: true });
const URL = process.argv[2] || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

// 关键：文档创建前注入
await page.addInitScript(() => {
  // 强制中文界面（脚本按 navigator.language 选语言，这里的断言用中文文案）
  Object.defineProperty(navigator, 'language', { get: () => 'zh-CN', configurable: true });
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'], configurable: true });
});
await page.addInitScript(SCRIPT);

console.log('打开 ' + URL);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('video', { timeout: 30000 }).catch(() => console.log('⚠️ 没等到 video'));
await page.waitForTimeout(4000);
await page.evaluate(() => { const v = document.querySelector('video'); if (v) v.play().catch(() => {}); });
await page.waitForTimeout(3000);

const before = await page.evaluate(() => {
  const v = document.querySelector('video');
  if (!v) return null;
  const r = v.getBoundingClientRect();
  let el = v.parentElement, chain = [];
  while (el && chain.length < 8) {
    chain.push((el.id || el.className || el.tagName) + ' → ' + el.clientWidth + 'x' + el.clientHeight);
    el = el.parentElement;
  }
  return {
    video: [Math.round(r.width), Math.round(r.height)].join('x'),
    videoInline: v.getAttribute('style'),
    fit: getComputedStyle(v).objectFit,
    media: v.videoWidth + 'x' + v.videoHeight,
    祖先链: chain,
    bar注入: !!document.querySelector('.dal-bar'),
  };
});
console.log('\n===== 注入前（脚本已在文档创建前注入） =====');
console.log(JSON.stringify(before, null, 2));

// 点旋转
const clicked = await page.click('.dal-bar button:nth-child(1)').then(() => true).catch(() => false);
console.log('\n点击旋转按钮: ' + (clicked ? '成功' : '失败（找不到按钮）'));
await page.waitForTimeout(1200);

const after = await page.evaluate(() => {
  const v = document.querySelector('video');
  const r = v.getBoundingClientRect();
  // 显示区 = 第一个有高度的祖先（脚本用的就是这个）
  let el = v.parentElement, box = null;
  while (el) {
    if (el.clientWidth > 40 && el.clientHeight > 40) { box = el; break; }
    el = el.parentElement;
  }
  const br = box ? box.getBoundingClientRect() : null;
  return {
    视觉尺寸: [Math.round(r.width), Math.round(r.height)].join('x'),
    显示区: box ? (box.id || box.className) + ' ' + Math.round(br.width) + 'x' + Math.round(br.height) : '(无，用 video 自身)',
    中心偏差: br ? [
      Math.round((r.left + r.width / 2 - br.left - br.width / 2) * 10) / 10,
      Math.round((r.top + r.height / 2 - br.top - br.height / 2) * 10) / 10].join(' / ') : '0 / 0',
    画面比例: (r.width / r.height).toFixed(3),
    媒体比例: (v.videoWidth / v.videoHeight).toFixed(3),
    transform: v.style.transform,
    objectFit: getComputedStyle(v).objectFit,
    tag: v.getAttribute('data-dal-tag'),
    内联样式: v.getAttribute('style'),
  };
});
console.log('\n===== 旋转后 =====');
console.log(JSON.stringify(after, null, 2));
await page.screenshot({ path: OUT + '/youtube_旋转后.png' });

/* 全屏 */
await page.evaluate(async () => {
  const p = document.querySelector('#movie_player') || document.querySelector('video').parentElement;
  try { await p.requestFullscreen(); } catch (e) {}
});
await page.waitForTimeout(2000);
const fsAfter = await page.evaluate(() => {
  const b = document.querySelector('.dal-bar');
  const v = document.querySelector('video');
  const fse = document.fullscreenElement;
  const r = v ? v.getBoundingClientRect() : null;
  let el = v ? v.parentElement : null, box = null;
  while (el) { if (el.clientWidth > 40 && el.clientHeight > 40) { box = el; break; } el = el.parentElement; }
  const br = box ? box.getBoundingClientRect() : null;
  return {
    fullscreenElement: fse ? (fse.id || fse.className) : '(未进入全屏)',
    按钮存在: !!b,
    按钮在全屏元素内: b && fse ? fse.contains(b) : false,
    按钮位置: b ? Math.round(b.getBoundingClientRect().left) + ',' + Math.round(b.getBoundingClientRect().top) : null,
    视觉尺寸: r ? Math.round(r.width) + 'x' + Math.round(r.height) : null,
    显示区尺寸: br ? Math.round(br.width) + 'x' + Math.round(br.height) : null,
    中心偏差: r && br ? [
      Math.round((r.left + r.width / 2 - br.left - br.width / 2) * 10) / 10,
      Math.round((r.top + r.height / 2 - br.top - br.height / 2) * 10) / 10].join(' / ') : null,
  };
});
console.log('\n===== 全屏后 =====');
console.log(JSON.stringify(fsAfter, null, 2));
await page.screenshot({ path: OUT + '/youtube_全屏.png' });

await browser.close();
console.log('\n截图目录: ' + OUT);
