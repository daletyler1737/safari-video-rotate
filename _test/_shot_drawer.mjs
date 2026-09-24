/* 截取抽屉 UI（放进 docs/ 给 README 用）
   跑法：cd _test && node _shot_drawer.mjs        # 中文 → docs/drawer.png
                    node _shot_drawer.mjs en      # 英文 → docs/drawer-en.png */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, '视频旋转.user.js'), 'utf8');

const LOC = {
  zh: { nav: 'zh-CN', aspect: '比例', preset: '快选', file: 'drawer.png' },
  en: { nav: 'en-US', aspect: 'Aspect', preset: 'Presets', file: 'drawer-en.png' },
}[process.argv[2] === 'en' ? 'en' : 'zh'];

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#111;height:100%}
  #player{position:relative;width:100%;height:100vh;overflow:hidden;background:#000}
  .ytp-right-controls{position:absolute;right:0;bottom:0;display:flex;align-items:center;background:rgba(0,0,0,.5)}
  </style></head><body>
  <div id="player">
    <div class="html5-video-container" style="position:absolute;left:0;top:0;width:100%;height:100%">
      <video id="v" style="width:100%;height:100%;left:0;top:0"></video>
    </div>
    <div class="ytp-right-controls"><button class="ytp-settings-button">S</button></div>
  </div>
  <script>(function(){var v=document.getElementById('v');
    Object.defineProperty(v,'videoWidth',{get:function(){return 1920;}});
    Object.defineProperty(v,'videoHeight',{get:function(){return 1080;}});})();</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
await page.setContent(HTML);
// 用 navigator.language 决定脚本用哪种语言（截图必须和说明文档一致）
await page.evaluate((nav) => {
  Object.defineProperty(navigator, 'language', { get: () => nav, configurable: true });
  Object.defineProperty(navigator, 'languages', { get: () => [nav], configurable: true });
}, LOC.nav);
await page.addScriptTag({ content: SCRIPT });
await page.waitForSelector('.dal-bar');
await page.click('.dal-bar button:nth-child(2)');           // 打开抽屉
await page.waitForTimeout(300);

// 摆一个好读的状态：转 90° + Fill + 315%
await page.click('.dal-bar button:nth-child(1)');           // 旋转
await page.waitForTimeout(200);
await page.evaluate(({ aspect, preset }) => {
  const rows = [...document.querySelectorAll('.dal-drawer .dal-row')];
  const chip = (lab, txt) => {
    const row = rows.find(r => r.querySelector('.dal-lab') && r.querySelector('.dal-lab').textContent === lab);
    const b = row && [...row.querySelectorAll('button')].find(b => b.textContent === txt);
    if (b) b.click();
  };
  chip(aspect, 'Fill');
  chip(preset, '315%');
}, { aspect: LOC.aspect, preset: LOC.preset });
await page.waitForTimeout(400);

const out = path.join(ROOT, 'docs');
fs.mkdirSync(out, { recursive: true });
const dst = path.join(out, LOC.file);
await page.locator('.dal-drawer').screenshot({ path: dst });
console.log('已保存 ' + dst);

await browser.close();
