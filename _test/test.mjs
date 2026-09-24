/**
 * 视频旋转脚本 —— 真实浏览器几何自测 v4
 *
 * 与 v3 的区别：
 *  1. 断言改用脚本内部导出的「画面框」(Fw/Fh)：开启 clip-path 裁切后，
 *     元素的外接矩形会大于实际可见画面，用外接矩形量是量不准的。
 *  2. 新增「不变形」断言：可见区域的宽高比必须等于画面框比例。
 *  3. 新增全屏相关用例：原生视频全屏（webkitDisplayingFullscreen）、
 *     手动「整屏」范围、以及强制比例只裁不拉伸。
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
const LS = 'dalRot6:';

function pageHtml({ cw = 1920, ch = 1080, inline, mediaW, mediaH, yt = false, nativeFs = false }) {
  const inner = yt
    // 复刻真实 YouTube：外层 #movie_player 正常尺寸，内层 .html5-video-container 高度为 0
    ? `<div id="movie_player" class="html5-video-player" style="position:relative;width:${cw}px;height:${ch}px;overflow:hidden;background:#000">
         <div class="html5-video-container" style="position:absolute;left:0;top:0;width:${cw}px;height:0">
           <video id="v" style="${inline}"></video>
         </div>
         <div class="ytp-right-controls" style="position:absolute;right:0;bottom:0;display:flex;background:rgba(0,0,0,.5)">
           <button class="ytp-settings-button">S</button></div>
       </div>`
    : `<div id="player" style="position:relative;width:${cw}px;height:${ch}px;overflow:hidden;background:#000">
         <div class="html5-video-container" style="position:absolute;left:0;top:0;width:100%;height:100%">
           <video id="v" style="${inline}"></video>
         </div>
         <div class="ytp-right-controls" style="position:absolute;right:0;bottom:0;display:flex;background:rgba(0,0,0,.5)">
           <button class="ytp-settings-button">S</button></div>
       </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#222;width:100%;height:100%;overflow:hidden}
  </style></head><body>${inner}
  <script>
    (function(){
      var v = document.getElementById('v');
      Object.defineProperty(v, 'videoWidth',  { get: function(){ return ${mediaW}; } });
      Object.defineProperty(v, 'videoHeight', { get: function(){ return ${mediaH}; } });
      ${nativeFs ? "Object.defineProperty(v, 'webkitDisplayingFullscreen', { get: function(){ return true; } });" : ''}
    })();
  </script></body></html>`;
}

const FILL = 'position:absolute;left:0;top:0;width:100%;height:100%';
const LETTERBOX = 'position:absolute;left:320px;top:180px;width:1280px;height:720px';

/* ref: 居中基准 —— 'player' 用播放器框，'viewport' 用整块屏幕 */
const CASES = [
  { name: 'S1_铺满容器_16:9_转90', inline: FILL, media: [1920, 1080], deg: 90, mode: 'Auto', expect: [607.5, 1080] },
  { name: 'S2_内联letterbox内框_16:9_转90', inline: LETTERBOX, media: [1920, 1080], deg: 90, mode: 'Auto', expect: [607.5, 1080] },
  { name: 'S3_竖屏媒体_转90_填满', inline: FILL, media: [1080, 1920], deg: 90, mode: 'Auto', expect: [1920, 1080] },
  { name: 'S4_4:3媒体_Fill_不转_上下溢出', inline: FILL, media: [1440, 1080], deg: 0, mode: 'Fill', expect: [1920, 1440] },
  { name: 'S5_转180_尺寸同容器', inline: FILL, media: [1920, 1080], deg: 180, mode: 'Auto', expect: [1920, 1080] },
  { name: 'S6_转270_同90', inline: FILL, media: [1920, 1080], deg: 270, mode: 'Auto', expect: [607.5, 1080] },
  { name: 'S9_4:3媒体_转90_Auto', inline: FILL, media: [1440, 1080], deg: 90, mode: 'Auto', expect: [810, 1080] },
  { name: 'S12_YouTube结构_高0父容器_转90', yt: true, player: { cw: 1112, ch: 834 },
    inline: 'position:absolute;left:0;top:0;width:1112px;height:834px', media: [1920, 1080],
    deg: 90, mode: 'Auto', expect: [469.1, 834] },
  { name: 'S13_竖屏显示区_横视频_转90_应填满', player: { cw: 1080, ch: 1920 }, inline: FILL,
    media: [1920, 1080], deg: 90, mode: 'Auto', expect: [1080, 1920] },

  // ---- 强制比例：必须「裁切」而不是「拉伸」----
  { name: 'S14_强制4:3_16:9视频_只裁不拉伸', inline: FILL, media: [1920, 1080], deg: 0, mode: '4:3',
    expect: [1440, 1080], expectSrcAr: 4 / 3 },
  { name: 'S15_强制9:16_16:9视频_只裁不拉伸', player: { cw: 1080, ch: 1920 }, inline: FILL,
    media: [1920, 1080], deg: 0, mode: '9:16', expect: [1080, 1920], expectSrcAr: 9 / 16 },

  // ---- 全屏：显示区必须是整块屏幕，不是页面里的播放器小框 ----
  { name: 'S16_原生视频全屏_竖屏整块_应铺满', yt: true, nativeFs: true, viewport: [1080, 1920],
    player: { cw: 1080, ch: 607 }, inline: 'position:absolute;left:0;top:0;width:1080px;height:607px',
    media: [1920, 1080], deg: 90, mode: 'Auto', expect: [1080, 1920], ref: 'viewport' },
  { name: 'S17_手动整屏范围_窗口下也铺满', viewport: [1080, 1920], player: { cw: 1080, ch: 607 },
    inline: FILL, media: [1920, 1080], deg: 90, mode: 'Auto', scope: 2,
    expect: [1080, 1920], ref: 'viewport' },
];

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const browser = await chromium.launch();

async function buildPage(c) {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1600 } });
  if (c.viewport) await page.setViewportSize({ width: c.viewport[0], height: c.viewport[1] });
  const cw = c.player ? c.player.cw : 1920, ch = c.player ? c.player.ch : 1080;
  await page.setContent(pageHtml({ cw, ch, inline: c.inline, mediaW: c.media[0], mediaH: c.media[1],
    yt: !!c.yt, nativeFs: !!c.nativeFs }));
  await page.addInitScript(() => {
    try { Object.keys(localStorage).forEach(k => k.indexOf('dalRot') === 0 && localStorage.removeItem(k)); } catch (e) {}
  });
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForSelector('.dal-bar', { timeout: 5000 }).catch(() => {});
  if (c.ref === 'viewport') await page.evaluate(() => { window.__refViewport = true; });
  return page;
}

async function pickChip(page, label) {
  await page.click('.dal-bar button:nth-child(2)');       // 打开抽屉
  await page.waitForTimeout(250);
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll('.dal-drawer .dal-chips button')].find(x => x.textContent === t);
    if (b) b.click();
  }, label);
  await page.waitForTimeout(250);
  await page.click('.dal-bar button:nth-child(2)');       // 关掉抽屉
  await page.waitForTimeout(200);
}

let pass = 0, fail = 0;
const rows = [];
const check = (name, ok, detail) => { ok ? pass++ : fail++; rows.push({ name, ok, ...detail }); };

for (const c of CASES) {
  const page = await buildPage(c);
  if (c.mode !== 'Auto') await pickChip(page, c.mode);
  if (c.scope === 2) await pickChip(page, '整屏');
  for (let i = 0; i < c.deg / 90; i++) {
    await page.click('.dal-bar button:nth-child(1)');
    await page.waitForTimeout(130);
  }
  await page.waitForTimeout(700);

  const m = await page.evaluate(() => {
    const v = document.getElementById('v');
    const p = document.getElementById('movie_player') || document.getElementById('player');
    const vr = v.getBoundingClientRect();
    const d = window.__dalDbg || {};
    let rx, ry;
    if (window.__refViewport) { rx = innerWidth / 2; ry = innerHeight / 2; }
    else { const pr = p.getBoundingClientRect(); rx = pr.left + pr.width / 2; ry = pr.top + pr.height / 2; }
    return {
      cx: vr.left + vr.width / 2, cy: vr.top + vr.height / 2, rx, ry,
      tf: v.style.transform, dbg: d, clip: v.style.clipPath,
    };
  });

  const d = m.dbg || {};
  const rot = (c.deg % 180) !== 0;
  const visW = rot ? d.Fh : d.Fw, visH = rot ? d.Fw : d.Fh;
  const sizeOk = near(visW, c.expect[0], 2) && near(visH, c.expect[1], 2);
  const centerOk = Math.abs(m.cx - m.rx) <= 1.5 && Math.abs(m.cy - m.ry) <= 1.5;
  // 不变形：可见区域宽高比 == 画面框比例
  const visAr = d.可见w / d.可见h;
  const wantAr = c.expectSrcAr || d.srcAr;
  const shapeOk = c.expectSrcAr ? Math.abs(visAr - wantAr) / wantAr < 0.02 : true;

  check(c.name, sizeOk && centerOk && shapeOk, {
    '画面框(屏幕)': `${visW}x${visH}  期望 ${c.expect[0]}x${c.expect[1]}`,
    '中心偏差': `x ${(m.cx - m.rx).toFixed(2)} / y ${(m.cy - m.ry).toFixed(2)}`,
    '显示区': `${d.Dw}x${d.Dh}${d.全屏 || d.原生全屏 ? ' 全屏' : ' 窗口'}`,
    '可见宽高比': c.expectSrcAr
      ? `${visAr.toFixed(3)} 期望 ${wantAr.toFixed(3)}（不变形=${shapeOk ? '是' : '否'}）` : `自动(${d.srcAr})`,
    '裁切': d.裁切, 'transform': m.tf || '(空)',
  });
  await page.screenshot({ path: path.join(OUT, c.name + '.png') });
  await page.close();
}

/* S7 默认状态零侵入 */
{
  const page = await browser.newPage({ viewport: { width: 2000, height: 1600 } });
  await page.setContent(pageHtml({ inline: LETTERBOX, mediaW: 1920, mediaH: 1080 }));
  await page.addInitScript(() => { try { Object.keys(localStorage).forEach(k => k.indexOf('dalRot') === 0 && localStorage.removeItem(k)); } catch (e) {} });
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => document.getElementById('v').getAttribute('style'));
  check('S7_默认状态零侵入', s === LETTERBOX && !/transform|object-fit|clip-path/.test(s), { '内联样式': s });

  await page.click('.dal-bar button:nth-child(1)');
  await page.waitForTimeout(400);
  const mid = await page.evaluate(() => document.getElementById('v').getAttribute('style'));
  for (let i = 0; i < 3; i++) { await page.click('.dal-bar button:nth-child(1)'); await page.waitForTimeout(250); }
  await page.waitForTimeout(700);
  const end = await page.evaluate(() => {
    const v = document.getElementById('v');
    return { pos: v.style.position, left: v.style.left, top: v.style.top,
      w: v.style.width, h: v.style.height, hasTf: !!v.style.transform,
      hasFit: !!v.style.objectFit, hasClip: !!v.style.clipPath };
  });
  const endOk = end.pos === 'absolute' && end.left === '320px' && end.top === '180px' &&
    end.w === '1280px' && end.h === '720px' && !end.hasTf && !end.hasFit && !end.hasClip;
  check('S8_转回0°后样式完整还原', endOk && /transform/.test(mid),
    { '旋转时含transform': /transform/.test(mid) ? '是' : '否',
      '还原后': `left=${end.left} top=${end.top} ${end.w}x${end.h} transform=${end.hasTf ? '有(错)' : '无'} object-fit=${end.hasFit ? '有(错)' : '无'} clip-path=${end.hasClip ? '有(错)' : '无'}` });
  await page.close();
}

/* S10 重复注入防护 */
{
  const page = await browser.newPage({ viewport: { width: 2000, height: 1600 } });
  await page.setContent(pageHtml({ inline: FILL, mediaW: 1920, mediaH: 1080 }));
  await page.addInitScript(() => { try { Object.keys(localStorage).forEach(k => k.indexOf('dalRot') === 0 && localStorage.removeItem(k)); } catch (e) {} });
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForSelector('.dal-bar', { timeout: 5000 }).catch(() => {});
  await page.addScriptTag({ content: SCRIPT });   // 第二次注入
  await page.click('.dal-bar button:nth-child(1)');
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const v = document.getElementById('v'), p = document.getElementById('player');
    const vr = v.getBoundingClientRect(), pr = p.getBoundingClientRect();
    return { d: window.__dalDbg, dcx: (vr.left + vr.width / 2) - (pr.left + pr.width / 2),
      bars: document.querySelectorAll('.dal-bar').length };
  });
  check('S10_重复注入只生效一个实例',
    near(m.d.Fh, 607.5, 2) && Math.abs(m.dcx) <= 1.5 && m.bars === 1,
    { '画面框': `${m.d.Fw}x${m.d.Fh}`, '中心偏差': m.dcx.toFixed(2), '按钮组数量': m.bars });
  await page.close();
}

/* S11 旋转 8 次后仍能完整还原 */
{
  const page = await browser.newPage({ viewport: { width: 2000, height: 1600 } });
  await page.setContent(pageHtml({ inline: LETTERBOX, mediaW: 1920, mediaH: 1080 }));
  await page.addInitScript(() => { try { Object.keys(localStorage).forEach(k => k.indexOf('dalRot') === 0 && localStorage.removeItem(k)); } catch (e) {} });
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForSelector('.dal-bar', { timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 8; i++) { await page.click('.dal-bar button:nth-child(1)'); await page.waitForTimeout(160); }
  const r = await page.evaluate(() => {
    const v = document.getElementById('v');
    const vr = v.getBoundingClientRect();
    return { orig: v.getAttribute('data-dal-orig'), w: vr.width, h: vr.height };
  });
  check('S11_旋转8次后仍能完整还原', r.orig === null,
    { '是否残留备份': r.orig === null ? '否（已还原）' : '是', '视觉尺寸': `${r.w}x${r.h}` });
  await page.close();
}

/* S18 一键铺满：全屏竖屏 + 横视频 → 自动转 90° 且铺满 */
{
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(pageHtml({ cw: 1080, ch: 607, yt: true, nativeFs: true,
    inline: 'position:absolute;left:0;top:0;width:1080px;height:607px', mediaW: 1920, mediaH: 1080 }));
  await page.addInitScript(() => { try { Object.keys(localStorage).forEach(k => k.indexOf('dalRot') === 0 && localStorage.removeItem(k)); } catch (e) {} });
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForSelector('.dal-bar', { timeout: 5000 }).catch(() => {});
  await page.click('.dal-bar button:nth-child(2)');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.dal-drawer button')].find(x => x.textContent === '一键铺满');
    if (b) b.click();
  });
  await page.waitForTimeout(800);
  const d = await page.evaluate(() => window.__dalDbg);
  check('S18_一键铺满_全屏竖屏_横视频_自动转90铺满',
    d.deg === 90 && d.mode === 'Fill' && d.zoom === 1 && near(d.Fh, 1080, 3) && near(d.Fw, 1920, 3),
    { '角度': d.deg, '比例': d.mode, '缩放': d.zoom,
      '画面框': `${d.Fw}x${d.Fh}（转 90° 后 = 1080x1920）`, '显示区': `${d.Dw}x${d.Dh}` });
  await page.close();
}

console.log('\n================ 测试结果 ================');
rows.forEach(r => {
  console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name);
  Object.keys(r).filter(k => k !== 'name' && k !== 'ok').forEach(k => console.log('        ' + k + ': ' + r[k]));
});
console.log('==========================================');
console.log(`通过 ${pass} / 失败 ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
