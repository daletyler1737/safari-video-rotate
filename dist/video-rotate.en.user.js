// ---------------------------------------------------------------------------
// 【English pack】由 tools/build-lang-packs.mjs 从双语主脚本生成（v11.4）。
// 语言已锁定为 en，不含语言切换入口。
// 想要自动跟随浏览器语言 / 手动切换，请改用根目录的双语版：视频旋转.user.js
// 不要直接改这个文件 —— 改主脚本后重新跑构建即可。
// ---------------------------------------------------------------------------
// ==UserScript==
// @name         Video Rotate (English pack)
// @namespace    dale.local
// @version      11.4
// @description  English UI (language locked). Adds three icons (rotate / settings / fullscreen) to the YouTube & Bilibili player controls; the picture adapts to the whole screen in fullscreen, aspect presets crop instead of stretch, plus a one-tap fit button.
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return;
  // 防重复注入：单页应用（YouTube/B站）里扩展可能注多次，
  // 两个实例会互相还原对方的样式 → 画面乱跳、白屏。这里只允许一个实例。
  if (window.__dalRotateActive) return;
  window.__dalRotateActive = 1;

  /* ================= 状态 ================= */
  var MODES = ['Auto', 'Fill', '16:9', '4:3', '1:1', '9:16'];
  var LS = 'dalRot6:' + (location.hostname || 'other') + ':';
  var DEG = 0, MODE = 0, ZOOM = 1, OFFX = 0, OFFY = 0;
  /* SCOPE 决定「显示区」取哪一块：
     0 = 自动（全屏时=整块屏幕，窗口时=播放器框）
     1 = 强制用播放器框   2 = 强制用整块屏幕（溢出到页面外，用来铺满） */
  var SCOPE = 0;

  try {
    DEG = parseInt(localStorage.getItem(LS + 'deg') || '0', 10) || 0;
    MODE = parseInt(localStorage.getItem(LS + 'mode') || '0', 10) || 0;
    ZOOM = parseFloat(localStorage.getItem(LS + 'zoom') || '1') || 1;
    OFFX = parseFloat(localStorage.getItem(LS + 'offx') || '0') || 0;
    OFFY = parseFloat(localStorage.getItem(LS + 'offy') || '0') || 0;
    SCOPE = parseInt(localStorage.getItem(LS + 'scope') || '0', 10) || 0;
  } catch (e) {}
  DEG = ((DEG % 360) + 360) % 360;
  if (MODE < 0 || MODE >= MODES.length) MODE = 0;
  if (!isFinite(ZOOM) || ZOOM < 0.25) ZOOM = 0.25;
  if (ZOOM > 4) ZOOM = 4;
  if (!isFinite(OFFX)) OFFX = 0;
  if (!isFinite(OFFY)) OFFY = 0;

  function save() {
    try {
      localStorage.setItem(LS + 'deg', String(DEG));
      localStorage.setItem(LS + 'mode', String(MODE));
      localStorage.setItem(LS + 'zoom', String(ZOOM.toFixed(2)));
      localStorage.setItem(LS + 'offx', String(OFFX.toFixed(3)));
      localStorage.setItem(LS + 'offy', String(OFFY.toFixed(3)));
      localStorage.setItem(LS + 'scope', String(SCOPE));
    } catch (e) {}
  }

  /* 只碰这三个属性；改动前先把原值写到元素自身的 data-dal-orig 上。
     为什么不用内存变量：万一还是出现重复注入，备份放在元素上能被另一个实例读到，
     不会把「已被改过的值」误当成原值。
     为什么不用 removeProperty：播放器（YouTube）自己会给 video 写内联
     width/height/left/top，直接删会把它的布局拆掉 → 白屏/错位。 */
  var TOUCH_PROPS = ['transform', 'transform-origin', 'object-fit', 'clip-path'];
  var ORIG = 'data-dal-orig';

  function remember(v) {
    if (v.getAttribute(ORIG)) return;
    var o = {};
    TOUCH_PROPS.forEach(function (p) {
      o[p] = [v.style.getPropertyValue(p), v.style.getPropertyPriority(p)];
    });
    try { v.setAttribute(ORIG, JSON.stringify(o)); } catch (e) {}
  }

  function restore(v) {
    var raw = v.getAttribute(ORIG);
    if (raw) {
      try {
        var o = JSON.parse(raw);
        TOUCH_PROPS.forEach(function (p) {
          var s = o[p] || ['', ''];
          if (s[0]) v.style.setProperty(p, s[0], s[1]);
          else v.style.removeProperty(p);
        });
      } catch (e) {}
      v.removeAttribute(ORIG);
    }
    v.removeAttribute('data-dal-tag');
  }

  /* ================= 样式 ================= */
  /* 用 createElementNS 造图标，不用 innerHTML ——
     YouTube 等站点启用了 Trusted Types，innerHTML 赋值会被直接拒绝，
     整套 UI 会建不起来。 */
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function makeIcon(children) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.style.pointerEvents = 'none';
    children.forEach(function (c) {
      var el = document.createElementNS(SVG_NS, c.tag);
      for (var k in c.attrs) {
        if (Object.prototype.hasOwnProperty.call(c.attrs, k)) el.setAttribute(k, c.attrs[k]);
      }
      svg.appendChild(el);
    });
    return svg;
  }

  var ICON_ROT = [
    {
      tag: 'path', attrs: {
        fill: '#fff',
        d: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 .79-.15 1.54-.42 2.23' +
          'l1.53 1.53C19.5 14.72 20 13.4 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 ' +
          '0-.79.15-1.54.42-2.23L4.9 8.24C4.5 9.28 4 10.6 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z'
      }
    }
  ];

  var ICON_SET = [
    { tag: 'rect', attrs: { x: '3', y: '6.4', width: '18', height: '1.7', rx: '.85', fill: '#fff' } },
    { tag: 'circle', attrs: { cx: '8.5', cy: '7.25', r: '3', fill: '#fff' } },
    { tag: 'rect', attrs: { x: '3', y: '16.4', width: '18', height: '1.7', rx: '.85', fill: '#fff' } },
    { tag: 'circle', attrs: { cx: '15.5', cy: '17.25', r: '3', fill: '#fff' } }
  ];

  var ICON_FS = [
    {
      tag: 'path', attrs: {
        fill: '#fff',
        d: 'M4 9V4h5v2H6v3H4zm11-5h5v5h-2V6h-3V4zM4 15h2v3h3v2H4v-5zm14 0h2v5h-5v-2h3v-3z'
      }
    }
  ];

  function ensureStyle() {
    if (document.getElementById('dal-rot-style')) return;
    var s = document.createElement('style');
    s.id = 'dal-rot-style';
    s.textContent =
      /* 控制栏里的两个小按钮 */
      '.dal-bar{display:inline-flex;align-items:center;gap:1px;margin:0 2px;padding:0;' +
      'vertical-align:middle;user-select:none;position:relative;z-index:60;}' +
      '.dal-bar>button{-webkit-appearance:none;appearance:none;background:transparent;border:0;' +
      'width:26px;height:26px;padding:0;margin:0;border-radius:4px;cursor:pointer;opacity:.9;' +
      'display:inline-flex;align-items:center;justify-content:center;line-height:1;}' +
      '.dal-bar>button:hover{background:rgba(255,255,255,.25);opacity:1;}' +
      '.dal-bar>button.dal-on{background:rgba(255,255,255,.3);opacity:1;}' +
      /* 全屏时按钮组固定在**右下角**（和播放器控制栏同侧）。
         往上抬 60px 是为了正好避开 YouTube 自己的控制栏（那条 48px 的按钮带），
         否则鼠标一动控制栏升起时会互相压住。 */
      '.dal-bar.dal-float{position:fixed;top:auto;bottom:60px;right:12px;z-index:2147483647;' +
      'background:rgba(0,0,0,.6);border-radius:8px;padding:2px;gap:0;' +
      'box-shadow:0 2px 12px rgba(0,0,0,.55);}' +
      /* 抽屉 */
      '.dal-drawer{position:fixed;z-index:2147483646;display:none;width:252px;padding:10px 12px;' +
      'border-radius:12px;background:rgba(22,22,24,.94);color:#fff;box-sizing:border-box;' +
      'font:12px/1.4 -apple-system,"PingFang SC",sans-serif;' +
      'max-height:calc(100vh - 20px);overflow:auto;-webkit-overflow-scrolling:touch;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.6);backdrop-filter:blur(6px);}' +
      '.dal-drawer.dal-open{display:block;}' +
      '.dal-drawer .dal-h{font-size:12px;opacity:.55;margin:0 0 8px;letter-spacing:.5px;}' +
      '.dal-drawer .dal-row{display:flex;align-items:center;gap:6px;margin-bottom:9px;}' +
      /* 标签宽度用 min-width 而不是固定 width：英文标签（Aspect / Language / Position）
         比中文长得多，写死 30px 会溢出并压在第一个按钮上。margin-right 保证间距。
         英文界面同时加宽抽屉，否则标签变宽后按钮放不下（Position 行会被裁掉）。 */
      '.dal-drawer .dal-lab{min-width:30px;flex:none;opacity:.6;margin-right:6px;}' +
      '.dal-drawer.dal-en{width:300px;}' +
      '.dal-drawer.dal-en .dal-lab{min-width:52px;}' +
      '.dal-drawer button{-webkit-appearance:none;appearance:none;background:rgba(255,255,255,.12);' +
      'border:0;color:#fff;font:12px/1 -apple-system,"PingFang SC",sans-serif;' +
      'padding:6px 7px;border-radius:6px;cursor:pointer;}' +
      '.dal-drawer button:hover{background:rgba(255,255,255,.24);}' +
      '.dal-drawer button.dal-on{background:#0a84ff;color:#fff;}' +
      '.dal-drawer .dal-chips{display:flex;flex-wrap:wrap;gap:5px;}' +
      '.dal-drawer .dal-chips button{padding:5px 7px;font-size:11px;}' +
      /* flex:1 1 0 + min-width:0 —— 否则 range 有默认宽度（≈129px）不肯收缩，
         会把后面的百分比按钮挤出抽屉，导致点不到 */
      '.dal-drawer input[type=range]{-webkit-appearance:none;appearance:none;flex:1 1 0;min-width:0;' +
      'height:12px;border-radius:6px;background:rgba(255,255,255,.18);outline:none;margin:0;' +
      'cursor:pointer;}' +
      '.dal-drawer input[type=range]:hover{background:rgba(255,255,255,.3);}' +
      '.dal-drawer input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;' +
      'width:15px;height:15px;border-radius:50%;background:#fff;cursor:pointer;' +
      'box-shadow:0 1px 4px rgba(0,0,0,.5);}' +
      /* 长条独占一行（点哪就多大，越宽越好点） */
      '.dal-drawer .dal-row.dal-zrow{gap:0;margin:-1px 0 9px;}' +
      '.dal-drawer .dal-chips.dal-sm button{padding:4px 6px;font-size:11px;}' +
      '.dal-drawer button.dal-zoombtn{width:26px;padding:5px 0;text-align:center;flex:none;' +
      'user-select:none;-webkit-user-select:none;}' +
      '.dal-drawer button.dal-val{width:46px;padding:5px 2px;text-align:center;flex:none;' +
      'opacity:.85;font-variant-numeric:tabular-nums;}' +
      '.dal-drawer .dal-foot{justify-content:flex-end;margin:2px 0 0;}' +
      '.dal-drawer .dal-st{margin:9px 0 0;font-size:11px;line-height:1.4;opacity:.45;min-height:31px;' +
      /* 用 overflow-wrap 而不是 break-all：状态行里的英文单词（windowed / fullscreen）
         不该被从中间劈开，而 clip-path 那种长串仍需要在任意处断行 */
      'overflow-wrap:anywhere;border-top:1px solid rgba(255,255,255,.12);padding-top:7px;}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* ================= 视频定位：自适应核心 ================= */
  function allVideos() { return [].slice.call(document.querySelectorAll('video')); }

  // 只挑真正的「主视频」：面积最大的那个。
  // 不这样过滤的话，预览条 / 画中画里的小 video 也会被转，画面就乱了
  function targetVideos() {
    var vs = allVideos().filter(function (v) {
      return v.offsetWidth > 80 && v.offsetHeight > 80;
    });
    if (!vs.length) return [];
    var max = 0;
    vs.forEach(function (v) {
      var a = v.offsetWidth * v.offsetHeight;
      if (a > max) max = a;
    });
    return vs.filter(function (v) {
      return v.offsetWidth * v.offsetHeight >= max * 0.9;
    });
  }

  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement ||
      document.webkitCurrentFullScreenElement || null;
  }

  /* ---- 全屏接管 ----
     Safari 上点 YouTube 的全屏按钮会走 WebKit「原生视频全屏」，
     那一层由浏览器自己渲染，CSS transform 完全不起作用
     → 旋转在全屏下失效（画面变回横的、显瘦）。
     所以：由我们自己改成 DOM 全屏（全屏播放器容器），旋转才在全屏下也生效。 */
  var fsWanted = false, fsBounced = false;

  function requestFs(el) {
    if (!el) return null;
    try {
      if (el.requestFullscreen) { fsWanted = true; return el.requestFullscreen(); }
      if (el.webkitRequestFullscreen) { fsWanted = true; return el.webkitRequestFullscreen(); }
    } catch (e) {}
    return null;
  }

  function exitFs() {
    fsWanted = false;
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.webkitCancelFullScreen) document.webkitCancelFullScreen();
    } catch (e) {}
  }

  // 播放器根容器（DOM 全屏要对它做，不能对 video 做）
  var ROOTS = ['#movie_player', '.html5-video-player', '.bpx-player-container',
    '.bilibili-player', '#bilibili-player', '.bpx-player-video-wrap'];
  function playerRoot() {
    var v = targetVideos()[0] || allVideos()[0];
    if (!v) return null;
    for (var i = 0; i < ROOTS.length; i++) {
      var el = null;
      try { el = v.closest(ROOTS[i]); } catch (e) {}
      if (el && el.clientWidth > 80 && el.clientHeight > 80) return el;
    }
    // 退回：向上找第一个不小于 video 的容器
    var p = v.parentElement;
    while (p && p !== document.body) {
      if (p.clientWidth >= v.offsetWidth && p.clientHeight >= v.offsetHeight * 0.9) return p;
      p = p.parentElement;
    }
    return v.parentElement || v;
  }

  // 有没有"旋转/调比例"这类需要全屏接管的设置
  function needsOwnFullscreen() { return !isDefault(); }

  function nativeVideoFs() {
    var v = targetVideos()[0] || allVideos()[0];
    try { if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen(); } catch (e) {}
  }

  function toggleOwnFullscreen() {
    if (fsElement()) { exitFs(); return; }
    var p = requestFs(playerRoot());
    if (p && p.catch) p.catch(nativeVideoFs);
    else {
      // 旧式 webkit API 不返回 Promise，稍后确认是否真的进了全屏
      setTimeout(function () { if (!fsElement()) nativeVideoFs(); }, 400);
    }
  }

  function isDefault() {
    return DEG === 0 && MODE === 0 && Math.abs(ZOOM - 1) < 0.005 && !OFFX && !OFFY;
  }

  /* ---- 全屏状态判定 ----
     Safari 点播放器的全屏按钮可能走 WebKit「原生视频全屏」，
     那时 document.fullscreenElement 是空的，只能看 video.webkitDisplayingFullscreen。 */
  function nativeVideoFsActive() {
    var v = targetVideos()[0] || allVideos()[0];
    if (!v) return false;
    try {
      if (v.webkitDisplayingFullscreen) return true;
    } catch (e) {}
    try {
      if (document.webkitCurrentFullScreenElement === v ||
          document.webkitFullscreenElement === v) return true;
    } catch (e) {}
    return false;
  }

  function isFullscreenNow() {
    return !!(fsElement() || nativeVideoFsActive() || fsWanted);
  }

  // 整块屏幕（全屏时的「显示区」就该是它）
  function viewportBox() {
    return {
      x: window.innerWidth / 2, y: window.innerHeight / 2,
      w: window.innerWidth, h: window.innerHeight, el: null
    };
  }

  /* 显示区识别：
     0) 全屏 → 一律用整块屏幕（viewport）。
        ★不能用全屏元素的 rect★ —— 播放器常把它内联成小尺寸
        （YouTube 的 #movie_player 在窗口里是 1080×607），拿它当显示区会
        算小三倍，表现就是「画面很瘦、必须手动放大到 300% 才铺满」。
     1) 窗口模式 → 先试已知播放器容器，再沿祖先链找第一个「有高度」的容器
        （YouTube 的 .html5-video-container 高度是 0，绝不能用） */
  var PLAYER_BOXES = ['#movie_player', '.html5-video-player', '.bpx-player-video-wrap',
    '.bilibili-player-video', '.bpx-player-container', '.player-container'];

  function findDisplayBox(v) {
    if (SCOPE === 2) return viewportBox();
    if (SCOPE === 0 && isFullscreenNow()) return viewportBox();
    var fs = fsElement();
    if (fs && fs !== v) {
      var fr = rectOf(fs);
      if (fr.w > 40 && fr.h > 40) return fr;
    }
    for (var i = 0; i < PLAYER_BOXES.length; i++) {
      var el = null;
      try { el = v.closest(PLAYER_BOXES[i]); } catch (e) {}
      if (el && el.clientWidth > 40 && el.clientHeight > 40) return rectOf(el);
    }
    var p = v.parentElement;
    while (p) {
      if (p.clientWidth > 40 && p.clientHeight > 40) return rectOf(p);
      p = p.parentElement;
    }
    return null;
  }

  function clearVideo(v) {
    if (v.getAttribute(ORIG) || v.getAttribute('data-dal-tag')) restore(v);
  }

  // 取元素当前在视口中的矩形（含 transform 的视觉结果，中心点=变换原点）
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, el: el };
  }

  // 完全不改布局：只加 transform。
  // ① 缩放量按「显示区（父容器）」算，所以 letterbox 内框也能正好填满；
  // ② 位移量 = 显示区中心 − 元素当前中心，每次重算 → 闭环自校正，不会累积偏差。
  function apply(v) {
    try {
      if (isDefault()) {
        clearVideo(v);
        // 探针保持诚实：默认态也要反映真实值（画面已还原、transform 已被清掉）
        window.__dalDbg = {
          deg: DEG, mode: MODES[MODE], zoom: ZOOM, 默认: true,
          全屏: !!fsElement(), 视口: window.innerWidth + 'x' + window.innerHeight,
        };
        return;
      }
      if (!v.videoWidth || !v.videoHeight) return; // 元数据没到

      // 备份原始内联值（只做一次，必须在任何写入之前）
      remember(v);

      // 布局尺寸（不受 transform 影响）
      var W0 = v.offsetWidth, H0 = v.offsetHeight;
      if (W0 < 20 || H0 < 20) return;

      var box = findDisplayBox(v);
      // 显示区并不比 video 自己大 → video 本来就撑满显示区，不需要位移
      if (box && box.w * box.h < W0 * H0 * 1.05) box = null;

      var Dw = box ? box.w : W0;
      var Dh = box ? box.h : H0;

      var t = [DEG, MODE, ZOOM.toFixed(2), v.videoWidth, v.videoHeight, W0, H0,
        Math.round(Dw), Math.round(Dh)].join('/');
      if (v.getAttribute('data-dal-tag') === t) return;

      var ar = v.videoWidth / v.videoHeight;
      if (!isFinite(ar) || ar <= 0) ar = 16 / 9;

      // srcAr = 「画面框」的比例。Auto / Fill 用视频原始比例；
      // 其余是强制比例。强制比例用**裁切**而不是拉伸 ——
      // 所以 4:3 / 1:1 / 9:16 不会再把画面压扁了。
      var m = MODES[MODE], srcAr = ar;
      if (m === '16:9') srcAr = 16 / 9;
      else if (m === '4:3') srcAr = 4 / 3;
      else if (m === '1:1') srcAr = 1;
      else if (m === '9:16') srcAr = 9 / 16;

      // 旋转 90/270 后，显示区在画面坐标系里相当于转过来了
      var rot = (DEG % 180 !== 0);
      var Cw = rot ? Dh : Dw;
      var Ch = rot ? Dw : Dh;

      // 画面框：Fill = 铺满显示区（可能裁掉一点）；其余 = 完整放进显示区
      var s = (m === 'Fill') ? Math.max(Cw / srcAr, Ch) : Math.min(Cw / srcAr, Ch);
      if (!isFinite(s) || s <= 0) s = 1;
      var Fw = srcAr * s, Fh = s;

      // 元素**等比**放大到刚好盖住画面框（等比 = 绝不拉伸变形），
      // 多出来的部分用 clip-path 裁掉 = 「按比例裁切」。
      var k0 = Math.max(Fw / W0, Fh / H0);
      if (!isFinite(k0) || k0 <= 0) return;
      var k = k0 * ZOOM;

      var cl = Math.max(0, (W0 - Fw / k0) / 2);
      var ct = Math.max(0, (H0 - Fh / k0) / 2);
      var clip = (cl > 0.6 || ct > 0.6)
        ? ('inset(' + ct.toFixed(1) + 'px ' + cl.toFixed(1) + 'px)') : 'none';

      // 位移 = 显示区中心 − 元素未变换时的中心（同步读，同一帧不重绘，不会闪）
      // + 用户在抽屉里做的手动微调
      var dx = OFFX * Dw, dy = OFFY * Dh;
      if (box) {
        v.style.setProperty('transform', 'none', 'important');
        var L = rectOf(v);
        dx += box.x - L.x;
        dy += box.y - L.y;
      }
      if (!isFinite(dx)) dx = 0;
      if (!isFinite(dy)) dy = 0;

      /* 渲染方式（关键：绝不能让画面被拉伸变形）
         Auto  → contain：整幅画面完整可见（多余处留黑/被裁掉）
         Fill 与强制比例 → cover：内容铺满元素框，多出来的部分内部裁掉，
                              再配合下面的 clip-path 按比例裁切 → 只裁不拉伸 */
      var fitMode = (m === 'Auto') ? 'contain' : 'cover';

      v.style.setProperty('object-fit', fitMode, 'important');
      v.style.setProperty('clip-path', clip, 'important');
      v.style.setProperty('transform-origin', 'center center', 'important');
      v.style.setProperty('transform',
        'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) ' +
        'rotate(' + DEG + 'deg) scale(' + k.toFixed(4) + ')', 'important');
      v.setAttribute('data-dal-tag', t);

      // 只读调试出口：自动化测试 + 抽屉里的状态行用
      window.__dalDbg = {
        deg: DEG, mode: m, zoom: ZOOM, srcAr: +srcAr.toFixed(4), 视频ar: +ar.toFixed(4),
        W0: W0, H0: H0, Dw: Math.round(Dw), Dh: Math.round(Dh),
        box: box ? Math.round(box.w) + 'x' + Math.round(box.h) : null,
        容器: box ? (box.el && (box.el.id || box.el.className)) || '整屏' : null,
        s: +s.toFixed(2), Fw: Math.round(Fw), Fh: Math.round(Fh),
        可见w: Math.round(W0 - 2 * cl), 可见h: Math.round(H0 - 2 * ct),
        k: +k.toFixed(4), dx: Math.round(dx), dy: Math.round(dy), 渲染: fitMode,
        裁切: clip === 'none' ? '无' : clip,
        全屏: !!fsElement(), 原生全屏: nativeVideoFsActive(), 范围: SCOPE,
        视口: window.innerWidth + 'x' + window.innerHeight,
      };
    } catch (e) {
      try { restore(v); } catch (e2) {}
    }
  }

  function enforce(hard) {
    var targets = targetVideos();
    allVideos().forEach(function (v) {
      if (hard) v.removeAttribute('data-dal-tag');
      if (targets.indexOf(v) >= 0) apply(v);
      else clearVideo(v); // 预览条等小窗一律还原，避免干扰
    });
    syncUI();
  }

  /* ================= 多语言 =================
     界面文案中英各一份。默认跟随浏览器语言（zh* → 中文，其余 → English），
     也可以在抽屉里手动切换，选择存进 localStorage。

     注意：window.__dalDbg 里的键名（可见w / 裁切 / 全屏 …）是自动化测试依赖的接口，
     不跟着语言变，一律保持中文原样；所以下面拼状态行时判断 d.裁切 === '无' 用的是
     内部值，输出才走翻译。 */
  var STRINGS = {
    en: {
      langLab: 'Language',
      rotTitle: 'Rotate 90° (hold Shift to reverse · Option+R)',
      setTitle: 'Display settings (aspect / zoom)',
      fsTitle: 'Fullscreen (click again to exit)',
      head: 'Display',
      deg: 'Angle',
      mode: 'Aspect',
      scope: 'Scope',
      scopeAuto: 'Auto', scopePlayer: 'Player', scopeScreen: 'Screen',
      scopeTip: 'Auto: whole screen in fullscreen, player box when windowed. ' +
                '"Screen" also fills the screen in windowed mode',
      zoom: 'Zoom',
      zoomOut: 'Zoom out (5% per click, bigger steps the further from 100%; hold to repeat; ⌥− same)',
      zoomVal: 'Click to reset to 100%',
      zoomIn: 'Zoom in (5% per click, bigger steps the further from 100%; hold to repeat; ⌥= same)',
      barTip: 'Click anywhere on the bar to jump to that zoom; drag to scrub; ' +
              'mouse wheel works too (±10%, ⇧ fine 2%, ⌥ coarse 50%)',
      preset: 'Presets',
      pos: 'Position',
      posTip: 'Nudge the picture (3% per click)',
      center: 'Center',
      centerTip: 'Clear the manual offset and re-center automatically',
      fill: 'Fit screen',
      fillTip: 'Pick the right angle and fill the screen (zoom 100%, offset reset)',
      reset: 'Reset all',
      untouched: 'Original, untouched',
      fsSuffix: ' (fullscreen)',
      fsWord: ' fullscreen', winWord: ' windowed',
      stMain: 'Video {ar} ({m} box) · Scope {w}×{h}{scope} · Zoom {z}%{clip}',
      stClip: ' · Crop {c}',
      toast: 'Video Rotate v11.4 ready: ⟳ rotate · ⚙ more settings',
    }
  };

  /* 单语言包：语言在这里固定，不做自动识别，也不写 localStorage。 */
  var LANG = 'en';

  function T(k) {
    var d = STRINGS[LANG] || STRINGS.zh;
    if (d && Object.prototype.hasOwnProperty.call(d, k)) return d[k];
    return STRINGS.zh[k] || k;
  }

  /* 极简模板替换：把 '范围 {w}×{h}' 里的 {x} 换成 map.x（缺就留空） */
  function fmt(tpl, map) {
    return String(tpl).replace(/\{(\w+)\}/g, function (_, k) {
      return (map && k in map) ? String(map[k]) : '';
    });
  }

  /* ================= UI ================= */
  var bar = null, drawer = null, bRot = null, bSet = null, bFs = null, ready = false;

  function stop(e) { e.preventDefault(); e.stopPropagation(); }

  function buildBar() {
    if (bar) return bar;
    ensureStyle();
    bar = document.createElement('div');
    bar.className = 'dal-bar';

    bRot = document.createElement('button');
    bRot.appendChild(makeIcon(ICON_ROT));
    bRot.title = T('rotTitle');
    bRot.addEventListener('click', function (e) { stop(e); rotateStep(e.shiftKey ? -90 : 90); });
    bRot.addEventListener('mousedown', stop);
    bar.appendChild(bRot);

    bSet = document.createElement('button');
    bSet.appendChild(makeIcon(ICON_SET));
    bSet.title = T('setTitle');
    bSet.addEventListener('click', function (e) { stop(e); toggleDrawer(); });
    bSet.addEventListener('mousedown', stop);
    bar.appendChild(bSet);

    // 自带全屏按钮：走 DOM 全屏，保证旋转/比例在全屏下同样生效
    bFs = document.createElement('button');
    bFs.appendChild(makeIcon(ICON_FS));
    bFs.title = T('fsTitle');
    bFs.addEventListener('click', function (e) { stop(e); toggleOwnFullscreen(); });
    bFs.addEventListener('mousedown', stop);
    bar.appendChild(bFs);

    return bar;
  }

  function chipRow(label, items, isOn, onPick) {
    var row = document.createElement('div');
    row.className = 'dal-row';
    var lab = document.createElement('span');
    lab.className = 'dal-lab';
    lab.textContent = label;
    row.appendChild(lab);
    var box = document.createElement('div');
    box.className = 'dal-chips';
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.textContent = it.label;
      b._val = it.val;
      b.addEventListener('click', function (e) { stop(e); onPick(it.val); });
      b.addEventListener('mousedown', stop);
      box.appendChild(b);
    });
    row.appendChild(box);
    row._box = box;
    return row;
  }

  function buildDrawer() {
    if (drawer) return drawer;
    drawer = document.createElement('div');
    // dal-en 用来放宽标签列宽（英文标签更长），见 ensureStyle 里的 .dal-en .dal-lab
    drawer.className = 'dal-drawer' + (LANG === 'en' ? ' dal-en' : '');
    drawer.addEventListener('mousedown', stop);
    drawer.addEventListener('click', stop);

    var h = document.createElement('div');
    h.className = 'dal-h';
    h.textContent = T('head');
    drawer.appendChild(h);

    // 角度
    var rDeg = chipRow(T('deg'), [0, 90, 180, 270].map(function (d) {
      return { label: d + '°', val: d };
    }), function (v) { return v === DEG; }, function (val) {
      DEG = val; save(); enforce(true);
    });
    drawer.appendChild(rDeg);
    drawer._deg = rDeg;

    // 比例
    var rMode = chipRow(T('mode'), MODES.map(function (m, i) {
      return { label: m, val: i };
    }), function () { return false; }, function (val) {
      MODE = val; save(); enforce(true);
    });
    drawer.appendChild(rMode);
    drawer._mode = rMode;

    // 显示范围：自动 / 播放器框 / 整块屏幕
    var SCOPE_LAB = [T('scopeAuto'), T('scopePlayer'), T('scopeScreen')];
    var rScope = chipRow(T('scope'), SCOPE_LAB.map(function (m, i) {
      return { label: m, val: i };
    }), function () { return false; }, function (val) {
      SCOPE = val; save(); enforce(true);
    });
    rScope.title = T('scopeTip');
    drawer.appendChild(rScope);
    drawer._scope = rScope;

    // 缩放
    var rZoom = document.createElement('div');
    rZoom.className = 'dal-row';
    var zlab = document.createElement('span');
    zlab.className = 'dal-lab';
    zlab.textContent = T('zoom');
    rZoom.appendChild(zlab);

    var bMinus = document.createElement('button');
    bMinus.className = 'dal-zoombtn';
    bMinus.textContent = '−';
    bMinus.title = T('zoomOut');
    holdRepeat(bMinus, -1);
    rZoom.appendChild(bMinus);

    var bVal = document.createElement('button');
    bVal.className = 'dal-val';
    bVal.textContent = '100%';
    bVal.title = T('zoomVal');
    bVal.addEventListener('click', function (e) { stop(e); setZoom(1); });
    bVal.addEventListener('mousedown', stop);
    rZoom.appendChild(bVal);

    var bPlus = document.createElement('button');
    bPlus.className = 'dal-zoombtn';
    bPlus.textContent = '+';
    bPlus.title = T('zoomIn');
    holdRepeat(bPlus, 1);
    rZoom.appendChild(bPlus);

    // 鼠标滚轮：在按钮行或长条上滚，都直接调缩放，比点按钮快得多
    // （长条上本来就有滚轮事件，但绑定在长条行上，滚长条边缘的空白也生效）
    rZoom.addEventListener('wheel', wheelZoom, { passive: false });

    drawer._val = bVal;
    drawer.appendChild(rZoom);

    /* 缩放长条：**点哪就多大** —— 直接点长条上的任意位置，缩放立刻跳到那个百分比，
       不用先点加号再一下下往上加。按住拖动同样跟手。
       这里自己接管鼠标：Safari 的轨道是「点哪跳哪」，别的内核却是「按步长挪一格」，
       自己算位置才能保证哪里的行为都是「点多大就多大」。 */
    var rZBar = document.createElement('div');
    rZBar.className = 'dal-row dal-zrow';
    var rng = document.createElement('input');
    rng.type = 'range';
    rng.min = '25'; rng.max = '400'; rng.step = '1';
    rng.title = T('barTip');
    rng.addEventListener('input', function () { setZoom(parseInt(rng.value, 10) / 100); });
    var THUMB = 15;                       // 与 CSS 里的滑块直径保持一致
    function zJump(e) {
      var r = rng.getBoundingClientRect();
      var min = +rng.min, max = +rng.max;
      // 扣掉滑块直径：这样点到最左/最右才严格落在 min / max 上
      var t = (e.clientX - r.left - THUMB / 2) / Math.max(1, r.width - THUMB);
      t = Math.max(0, Math.min(1, t));
      setZoom((min + t * (max - min)) / 100);
    }
    var zRaf = 0, zEvt = null;
    function zMove(e) {                   // 拖动时按帧合并，别让 mousemove 的频率拖慢播放
      e.preventDefault();
      zEvt = e;
      if (zRaf) return;
      zRaf = requestAnimationFrame(function () { zRaf = 0; if (zEvt) zJump(zEvt); });
    }
    function zEnd() {
      document.removeEventListener('mousemove', zMove, true);
      document.removeEventListener('mouseup', zEnd, true);
    }
    rng.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();   // 拦下默认行为，全程自己算
      zJump(e);
      document.addEventListener('mousemove', zMove, true);
      document.addEventListener('mouseup', zEnd, true);
    });
    rng.addEventListener('click', stop);
    rZBar.appendChild(rng);
    rZBar.addEventListener('wheel', wheelZoom, { passive: false });
    drawer._rng = rng;
    drawer.appendChild(rZBar);

    // 缩放快选：一下跳到常用档位（含 315%，竖屏铺满常用值）
    var rZPre = chipRow(T('preset'), [50, 75, 100, 125, 150, 200, 315, 400].map(function (p) {
      return { label: p + '%', val: p / 100 };
    }), function (v) { return Math.abs(v - ZOOM) < 0.006; }, function (val) {
      setZoom(val);
    });
    rZPre._box.className = 'dal-chips dal-sm';
    drawer.appendChild(rZPre);
    drawer._zpre = rZPre;

    // 位置微调（万一画面还有偏移，用它几下就对正）
    var rPos = document.createElement('div');
    rPos.className = 'dal-row';
    var plab = document.createElement('span');
    plab.className = 'dal-lab';
    plab.textContent = T('pos');
    rPos.appendChild(plab);
    [['↑', 0, -0.03], ['↓', 0, 0.03], ['←', -0.03, 0], ['→', 0.03, 0]].forEach(function (it) {
      var b = document.createElement('button');
      b.textContent = it[0];
      b.title = T('posTip');
      b.addEventListener('click', function (e) {
        stop(e);
        OFFX = Math.max(-0.5, Math.min(0.5, OFFX + it[1]));
        OFFY = Math.max(-0.5, Math.min(0.5, OFFY + it[2]));
        save(); enforce(true);
      });
      b.addEventListener('mousedown', stop);
      rPos.appendChild(b);
    });
    var bZero = document.createElement('button');
    bZero.textContent = T('center');
    bZero.title = T('centerTip');
    bZero.addEventListener('click', function (e) {
      stop(e); OFFX = 0; OFFY = 0; save(); enforce(true);
    });
    bZero.addEventListener('mousedown', stop);
    rPos.appendChild(bZero);
    drawer.appendChild(rPos);

    // 一键铺满 + 复位
    var foot = document.createElement('div');
    foot.className = 'dal-row dal-foot';

    var bFill = document.createElement('button');
    bFill.textContent = T('fill');
    bFill.title = T('fillTip');
    bFill.addEventListener('click', function (e) { stop(e); smartFill(); });
    bFill.addEventListener('mousedown', stop);
    foot.appendChild(bFill);

    var bReset = document.createElement('button');
    bReset.textContent = T('reset');
    bReset.addEventListener('click', function (e) {
      stop(e); DEG = 0; MODE = 0; ZOOM = 1; OFFX = 0; OFFY = 0; SCOPE = 0;
      save(); enforce(true);
    });
    bReset.addEventListener('mousedown', stop);
    foot.appendChild(bReset);
    drawer.appendChild(foot);

    // 单语言包：不含语言切换行

    // 实时状态：出问题时这行数字能直接定位原因
    var st = document.createElement('div');
    st.className = 'dal-st';
    drawer.appendChild(st);
    drawer._st = st;

    return drawer;
  }

  /* 切换语言：文案散落在已建好的 DOM 里，逐个回改太脆，直接把抽屉拆掉重建 ——
     角度 / 比例 / 范围 / 缩放 / 偏移都在全局变量里，重建后自动一致。 */
  function setLang(l) {
    if (l !== 'zh' && l !== 'en') return;
    if (l === LANG) return;
    LANG = l;
    try { localStorage.setItem(LS + 'lang', l); } catch (e) {}
    if (bRot) bRot.title = T('rotTitle');
    if (bSet) bSet.title = T('setTitle');
    if (bFs) bFs.title = T('fsTitle');
    var wasOpen = !!(drawer && drawer.classList.contains('dal-open'));
    if (drawer) {
      try { drawer.remove(); } catch (e) {}
      drawer = null;
    }
    buildDrawer();
    try { (fsElement() || document.documentElement).appendChild(drawer); } catch (e) {}
    if (wasOpen) openDrawer();
    syncUI();
  }

  // 一键铺满：屏幕方向和视频方向不一致（竖屏看横片）就转 90°，
  // 然后 Fill 铺满、缩放回 100%、偏移归零。
  function smartFill() {
    var v = targetVideos()[0] || allVideos()[0];
    if (!v) return;
    var ar = (v.videoWidth && v.videoHeight) ? v.videoWidth / v.videoHeight : 16 / 9;
    var b = findDisplayBox(v) || viewportBox();
    var dAr = (b && b.h > 0) ? b.w / b.h : 1;
    DEG = ((dAr < 1) !== (ar < 1)) ? 90 : 0;
    MODE = 1;                       // Fill
    ZOOM = 1; OFFX = 0; OFFY = 0;
    save(); enforce(true);
  }

  function arName(a) {
    if (!isFinite(a) || a <= 0) return '?';
    var cands = [[16 / 9, '16:9'], [4 / 3, '4:3'], [1, '1:1'], [9 / 16, '9:16']];
    for (var i = 0; i < cands.length; i++) {
      if (Math.abs(a - cands[i][0]) < 0.03) return cands[i][1];
    }
    return a.toFixed(2) + ':1';
  }

  function updateStatus() {
    if (!drawer || !drawer._st) return;
    var d = window.__dalDbg;
    if (isDefault()) {
      drawer._st.textContent = T('untouched') + (isFullscreenNow() ? T('fsSuffix') : '');
      return;
    }
    if (!d) { drawer._st.textContent = '…'; return; }
    drawer._st.textContent = fmt(T('stMain'), {
      ar: arName(d.视频ar),
      m: MODES[MODE],
      w: d.Dw, h: d.Dh,
      scope: (d.全屏 || d.原生全屏 ? T('fsWord') : T('winWord')),
      z: Math.round(d.zoom * 100),
      // d.裁切 是内部值（'无' 或 clip-path 字面量），比较用原值，输出才翻译
      clip: (d.裁切 === '无' ? '' : fmt(T('stClip'), { c: d.裁切 }))
    });
  }

  /* 滚轮调缩放：默认 ±10%，按 ⇧ 细调 2%，按 ⌥ 粗调 50% */
  function wheelZoom(e) {
    e.preventDefault(); e.stopPropagation();
    var s = e.shiftKey ? 0.02 : (e.altKey ? 0.5 : 0.10);
    setZoom(ZOOM + (e.deltaY < 0 ? s : -s));
  }

  function setZoom(z) {
    z = Math.max(0.25, Math.min(8, +(+z).toFixed(2)));
    if (z === ZOOM) return;
    ZOOM = z;
    save();
    enforce(true);
    syncUI();
  }

  /* 缩放步长：按「离 100% 多远」分档 —— 近处细调，远处大步。
     单点不会跳过头，长按连调时 1 秒能走完 100% → 300%（见 holdRepeat）。 */
  function zoomStep() {
    var d = ZOOM >= 1 ? ZOOM - 1 : 1 - ZOOM;
    if (d < 0.05) return 0.05;   // 95% ~ 106%
    if (d < 0.15) return 0.10;   // 85% ~ 115%
    if (d < 0.35) return 0.18;   // 65% ~ 135%
    return 0.28;                 // 再远
  }

  /* 按住不放 → 先等 240ms，再每 60ms 连调一次。
     实测：按住 1 秒 ≈ 100% → 300%，正好一次覆盖常用的 150%~315% 区间，
     不用点几十下，也不会一按就冲到上限（冲顶了还得往回退，反而更费事）。

     注意：停止只认 document 上的 mouseup，**不监听 mouseleave**。
     原因：长按时缩放值变化会让状态行文字变长 → 抽屉高度变化 → 抽屉整体移位，
     按钮就从鼠标底下溜走了，mouseleave 会立刻把长按掐断（表现为"按着不动却只加了一点点"）。
     松手必停，所以只靠 mouseup 足够。 */
  function holdRepeat(btn, dir) {
    var t1 = null, t2 = null, held = false;
    function tick() { setZoom(ZOOM + dir * zoomStep()); }
    function stopHold() {
      if (t1) { clearTimeout(t1); t1 = null; }
      if (t2) { clearInterval(t2); t2 = null; }
      document.removeEventListener('mouseup', stopHold, true);
    }
    btn.addEventListener('mousedown', function (e) {
      stop(e);
      stopHold();
      held = false;
      document.addEventListener('mouseup', stopHold, true);
      t1 = setTimeout(function () {
        t1 = null; held = true; tick();
        t2 = setInterval(tick, 60);
      }, 240);
    });
    // 不监听 mouseleave：抽屉因状态行文字变长而移位时，按钮会从鼠标下溜走，
    // mouseleave 会误把长按掐断。松手（document 上的 mouseup）才是最可靠的停止信号。
    btn.addEventListener('click', function (e) {
      stop(e);
      if (held) { held = false; return; }   // 长按那轮已经调过了，不再多走一步
      tick();
    });
    btn.addEventListener('contextmenu', stop);
  }

  function rotateStep(step) {
    DEG = ((DEG + step) % 360 + 360) % 360;
    save();
    enforce(true);
  }

  function markChips(row, cur) {
    if (!row || !row._box) return;
    [].slice.call(row._box.children).forEach(function (b) {
      if (b._val === cur) b.classList.add('dal-on');
      else b.classList.remove('dal-on');
    });
  }

  function syncUI() {
    if (!bar) return;
    if (bRot) {
      if (DEG !== 0) bRot.classList.add('dal-on'); else bRot.classList.remove('dal-on');
    }
    if (drawer) {
      markChips(drawer._deg, DEG);
      markChips(drawer._mode, MODE);
      markChips(drawer._scope, SCOPE);
      if (drawer._rng) {
        var pct = Math.round(ZOOM * 100);
        if (document.activeElement !== drawer._rng) drawer._rng.value = String(pct);
        if (drawer._val) drawer._val.textContent = pct + '%';
      }
      if (drawer._zpre) markChips(drawer._zpre, ZOOM);
      // 语言行也要标出来：否则看不出当前选的是中文还是 EN
      if (drawer._lang) markChips(drawer._lang, LANG);
      updateStatus();
    }
  }

  function placeDrawer() {
    if (!drawer || !drawer.classList.contains('dal-open')) return;
    var b = bar.getBoundingClientRect();
    var dw = drawer.offsetWidth || 252;
    var dh = drawer.offsetHeight || 190;
    var left = b.left + b.width / 2 - dw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - dw - 8));
    var top = b.top - dh - 10;
    if (top < 8) top = Math.min(b.bottom + 10, window.innerHeight - dh - 8);
    drawer.style.left = Math.round(left) + 'px';
    drawer.style.top = Math.round(Math.max(8, top)) + 'px';
  }

  function openDrawer() {
    buildDrawer();
    drawer.classList.add('dal-open');
    syncUI();
    placeDrawer();
    if (bSet) bSet.classList.add('dal-on');
  }

  function closeDrawer() {
    if (drawer) drawer.classList.remove('dal-open');
    if (bSet) bSet.classList.remove('dal-on');
  }

  function toggleDrawer() {
    if (drawer && drawer.classList.contains('dal-open')) closeDrawer();
    else openDrawer();
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:14%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,.82);color:#fff;padding:7px 14px;border-radius:8px;' +
      'font:13px -apple-system;z-index:2147483647;pointer-events:none';
    (fsElement() || document.documentElement).appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  /* ================= 挂载 ================= */
  function findBar() {
    return document.querySelector('.ytp-right-controls') ||
           document.querySelector('.bpx-player-control-bottom-right') ||
           document.querySelector('.bilibili-player-video-control');
  }

  function mount() {
    if (!document.body) return;   // 文档还没就绪，等下一次调度
    buildBar();
    buildDrawer();
    var fs = fsElement();
    var hostEl = fs || document.documentElement;

    // 抽屉必须挂在全屏元素里，否则全屏时浏览器不渲染
    if (drawer.parentElement !== hostEl) {
      try { hostEl.appendChild(drawer); } catch (e) {}
    }

    if (fs) {
      if (bar.parentElement !== fs) {
        try { fs.appendChild(bar); } catch (e) {}
      }
      bar.classList.add('dal-float');
    } else {
      bar.classList.remove('dal-float');
      var b = findBar();
      if (b) {
        if (bar.parentElement !== b) {
          var anchor = b.querySelector('.ytp-settings-button') || b.firstElementChild;
          try { b.insertBefore(bar, anchor); } catch (e) { b.appendChild(bar); }
        }
      } else if (bar.parentElement !== document.documentElement) {
        document.documentElement.appendChild(bar);
        bar.classList.add('dal-float');
      }
    }

    if (!ready) {
      ready = true;
      toast(T('toast'));
    }
    placeDrawer();
  }

  /* ================= 事件 ================= */

  /* 全屏接管：始终把「播放器的全屏按钮」改成 DOM 全屏。
     原因：Safari 上 YouTube 会走 WebKit 原生视频全屏，那一层由浏览器自己渲染，
     CSS transform 完全不起作用 —— 旋转在全屏下会失效（画面变回横的、显得很瘦）。
     改成 DOM 全屏后，播放器容器铺满屏幕，我们的旋转/比例在全屏下照常生效。 */
  var FS_BUTTONS = '.ytp-fullscreen-button, .bpx-player-ctrl-full, .bilibili-player-video-btn-fullscreen';

  document.addEventListener('click', function (e) {
    if (!targetVideos().length) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = null;
    try { btn = t.closest(FS_BUTTONS); } catch (err) {}
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    toggleOwnFullscreen();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== 'f' && e.key !== 'F') return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!targetVideos().length) return;
    e.preventDefault(); e.stopPropagation();
    toggleOwnFullscreen();
  }, true);

  // 兜底：真不小心进了原生全屏（且当前有旋转设置）→ 退出来，改用 DOM 全屏
  document.addEventListener('webkitbeginfullscreen', function (e) {
    if (!needsOwnFullscreen()) return;
    var v = e.target;
    try { if (v && v.webkitExitFullscreen) v.webkitExitFullscreen(); } catch (err) {}
    setTimeout(function () { requestFs(playerRoot()); }, 80);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'KeyR') { e.preventDefault(); rotateStep(e.shiftKey ? -90 : 90); }
    else if (e.code === 'Digit0') { e.preventDefault(); DEG = 0; MODE = 0; ZOOM = 1; OFFX = 0; OFFY = 0; save(); enforce(true); }
    // 缩放：⌥= / ⌥−（按住键盘会自动连发，很快）；加 ⇧ 一次 50%
    else if (e.code === 'Equal') { e.preventDefault(); setZoom(ZOOM + (e.shiftKey ? 0.5 : zoomStep())); }
    else if (e.code === 'Minus') { e.preventDefault(); setZoom(ZOOM - (e.shiftKey ? 0.5 : zoomStep())); }
  }, true);

  document.addEventListener('click', function (e) {
    if (!drawer || !drawer.classList.contains('dal-open')) return;
    if (bar && bar.contains(e.target)) return;
    if (drawer.contains(e.target)) return;
    closeDrawer();
  });

  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      [60, 200, 500, 1000].forEach(function (d) {
        setTimeout(function () { mount(); enforce(true); }, d);
      });
    }, true);
  });

  window.addEventListener('resize', function () {
    setTimeout(function () { enforce(true); placeDrawer(); }, 150);
  });

  document.addEventListener('loadedmetadata', function (e) {
    if (e.target && e.target.tagName === 'VIDEO') {
      e.target.removeAttribute('data-dal-tag');
      apply(e.target);
    }
  }, true);

  var pending = null;
  function schedule() {
    clearTimeout(pending);
    pending = setTimeout(function () { mount(); enforce(false); }, 250);
  }

  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  if (document.documentElement) {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }
  setInterval(function () { mount(); enforce(false); }, 800);
  schedule();
})();
