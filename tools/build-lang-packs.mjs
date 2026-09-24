#!/usr/bin/env node
/* 从根目录的双语主脚本生成「单语言包」→ dist/
     node tools/build-lang-packs.mjs
   产出：
     dist/video-rotate.zh.user.js   中文包 —— 语言锁中文、去掉语言切换行、只保留中文字典
     dist/video-rotate.en.user.js   英文包 —— 同上，英文

   为什么要有单语言包：主脚本虽然会自动识别浏览器语言，但有些人就想要一个
   "纯中文 / 纯英文"的干净版本（体积也更小）。两者功能完全一致，只是语言策略不同。
   主脚本才是唯一维护源，这两个包都是生成物 —— 别手改 dist/ 里的文件。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, '视频旋转.user.js');
const OUT = path.join(ROOT, 'dist');

const PACKS = [
  {
    lang: 'zh',
    file: 'video-rotate.zh.user.js',
    header: '中文包',
    name: '视频旋转（中文包）',
    desc: '中文界面（语言已锁定）。YouTube / Bilibili 控制栏放三个小图标（旋转 / 设置 / 全屏）；' +
          '全屏时按整块屏幕自适应，比例选项改为裁切而非拉伸，另有「一键铺满」；缩放长条点哪就多大。',
  },
  {
    lang: 'en',
    file: 'video-rotate.en.user.js',
    header: 'English pack',
    name: 'Video Rotate (English pack)',
    desc: 'English UI (language locked). Adds three icons (rotate / settings / fullscreen) to the ' +
          'YouTube & Bilibili player controls; the picture adapts to the whole screen in fullscreen, ' +
          'aspect presets crop instead of stretch, plus a one-tap fit button.',
  },
];

const src = fs.readFileSync(SRC, 'utf8');
const version = (src.match(/@version\s+(\S+)/) || [, '?'])[1];

/* 删掉 STRINGS 里不需要的那个语言块（值都是单行字符串，不存在嵌套对象，
   所以非贪婪匹配到 4 空格缩进的 `},` / `}` 一定是块的结尾） */
function dropLangBlock(text, lang) {
  if (lang === 'zh') {
    // zh 不是最后一项，结尾带逗号
    const re = /\n    zh: \{[\s\S]*?\n    \},(?=\n    en: \{)/;
    if (!re.test(text)) throw new Error('没找到 zh 语言块');
    return text.replace(re, '');
  }
  // en 是最后一项，结尾没有逗号，连后面的 `};` 一起收掉
  const re = /,\n    en: \{[\s\S]*?\n    \}\n  \};/;
  if (!re.test(text)) throw new Error('没找到 en 语言块');
  return text.replace(re, '\n  };');
}

function build(pack) {
  let t = src;

  // 1) 语言锁定：不做自动识别，也不读 / 写 localStorage
  const langRe = /  var LANG = \(function \(\) \{[\s\S]*?\n  \}\)\(\);/;
  if (!langRe.test(t)) throw new Error('没找到 LANG 检测代码');
  t = t.replace(langRe,
    `  /* 单语言包：语言在这里固定，不做自动识别，也不写 localStorage。 */\n` +
    `  var LANG = '${pack.lang}';`);

  // 2) 去掉不需要的语言字典
  t = dropLangBlock(t, pack.lang === 'zh' ? 'en' : 'zh');

  // 3) 去掉语言切换行（单语言包没有切换入口）
  const uiRe = /    \/\/ 语言切换：放最后一行[\s\S]*?drawer\._lang = rLang;\n/;
  if (!uiRe.test(t)) throw new Error('没找到语言切换行');
  t = t.replace(uiRe, '    // 单语言包：不含语言切换行\n');

  // 4) 元数据换成对应语言，并标注这是生成物
  t = t.replace(/\/\/ @name\s+.*\n/, `// @name         ${pack.name}\n`);
  t = t.replace(/\/\/ @name:en\s+.*\n/, '');
  t = t.replace(/\/\/ @description\s+.*\n/, `// @description  ${pack.desc}\n`);
  t = t.replace(/\/\/ @description:en\s+.*\n/, '');

  const banner =
    `// ---------------------------------------------------------------------------\n` +
    `// 【${pack.header}】由 tools/build-lang-packs.mjs 从双语主脚本生成（v${version}）。\n` +
    `// 语言已锁定为 ${pack.lang}，不含语言切换入口。\n` +
    `// 想要自动跟随浏览器语言 / 手动切换，请改用根目录的双语版：视频旋转.user.js\n` +
    `// 不要直接改这个文件 —— 改主脚本后重新跑构建即可。\n` +
    `// ---------------------------------------------------------------------------\n`;

  if (t.startsWith('// ==UserScript==')) {
    t = banner + t;
  } else {
    throw new Error('主脚本没有以 UserScript 元数据块开头');
  }

  fs.mkdirSync(OUT, { recursive: true });
  const dst = path.join(OUT, pack.file);
  fs.writeFileSync(dst, t, 'utf8');

  const cn = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  console.log('  ' + pack.file + '  ' + (Buffer.byteLength(t) / 1024).toFixed(1) +
    ' KB  汉字 ' + cn + ' 处（都在注释里，界面文案已全部换成 ' + pack.lang + '）');
  return dst;
}

console.log('从主脚本生成单语言包（v%s）：', version);
for (const p of PACKS) build(p);
console.log('完成 → %s', OUT);
