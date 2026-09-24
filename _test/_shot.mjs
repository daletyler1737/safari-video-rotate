import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, '视频旋转.user.js'), 'utf8');
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#111}
  #player{position:relative;width:1080px;height:607px;overflow:hidden;background:#000;margin:0 auto}
  .ytp-right-controls{position:absolute;right:0;bottom:0;display:flex;align-items:center;background:rgba(0,0,0,.5)}
  </style></head><body>
  <div id="player">
    <div class="html5-video-container" style="position:absolute;left:0;top:0;width:100%;height:100%">
      <video id="v" style="width:1080px;height:607px;left:0;top:0"></video>
    </div>
    <div class="ytp-right-controls"><button class="ytp-settings-button">S</button></div>
  </div>
  <script>(function(){var v=document.getElementById('v');
    Object.defineProperty(v,'videoWidth',{get:function(){return 1920;}});
    Object.defineProperty(v,'videoHeight',{get:function(){return 1080;}});})();</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(HTML);
await page.addScriptTag({ content: SCRIPT });
await page.waitForSelector('.dal-bar', { timeout: 5000 }).catch(() => {});
await page.click('.dal-bar button:nth-child(2)');
await page.waitForTimeout(400);
// 演示：切到 300%（高亮档位）
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === '快选');
  [...row.querySelectorAll('button')].find(b => b.textContent === '300%').click();
});
await page.waitForTimeout(700);

const box = await page.evaluate(() => {
  const d = document.querySelector('.dal-drawer');
  const b = document.querySelector('.dal-bar');
  const dr = d.getBoundingClientRect(), br = b.getBoundingClientRect();
  const x = Math.max(0, Math.min(dr.left, br.left) - 16);
  const y = Math.max(0, Math.min(dr.top, br.top) - 16);
  return {
    x, y,
    width: Math.max(dr.width, br.right + 16 - x),
    height: Math.max(dr.bottom, br.bottom) + 16 - y,
    drawerH: Math.round(dr.height),
  };
});
console.log('抽屉高度:', box.drawerH, 'px');
await page.screenshot({ path: 'zoom_ui.png', clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
console.log('已保存 zoom_ui.png');
await browser.close();
