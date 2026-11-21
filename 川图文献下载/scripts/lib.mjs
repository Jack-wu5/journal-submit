// lib.mjs — 公共库：playwright 寻址、CDP 连接、代理域名映射、截图
// 川图文献下载技能 · 2026-11-21 实测验证版
import { createRequire } from 'node:module';
import fs from 'node:fs';

const CDP_URL = process.env.SCLIB_CDP_URL || 'http://127.0.0.1:9333';

// playwright-core 寻址：环境变量 > 已知安装位置
const PLAYWRIGHT_CANDIDATES = [
  process.env.PLAYWRIGHT_CORE_PATH,
  'C:/Users/user/Desktop/DScode_test/teardown-hub/node_modules/playwright-core',
].filter(Boolean);

function loadPlaywrightCore() {
  for (const p of PLAYWRIGHT_CANDIDATES) {
    try {
      const require = createRequire(p.endsWith('/') ? p : p + '/');
      const pw = require('playwright-core');
      return pw;
    } catch (e) { /* 试下一个 */ }
  }
  throw new Error(
    `找不到 playwright-core。请设置环境变量 PLAYWRIGHT_CORE_PATH 指向其目录，\n` +
    `或确认 C:/Users/user/Desktop/DScode_test/teardown-hub/node_modules/playwright-core 存在。\n原始错误：`
  );
}

/** 连接受控 Edge（CDP）。返回 { browser, ctx }；用完记得 browser.close()（只断连接不关浏览器） */
export async function connect() {
  const { chromium } = loadPlaywrightCore();
  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error('CDP 已连通但找不到浏览器上下文');
  return { browser, ctx };
}

export const CDP = CDP_URL;

/** 按域名片段查找已打开标签页 */
export function findPage(ctx, urlPart) {
  return ctx.pages().find(p => p.url().includes(urlPart));
}

/** 原始知网域名 → 镜像代理域名（规则：整host的点换 --，尾加 -s-205）
 *  例：www.cnki.net → www--cnki--net-s-205.share.sclib.cn
 *      bar.cnki.net → bar--cnki--net-s-205.share.sclib.cn */
export function toProxyUrl(url) {
  return url.replace(/^https?:\/\/([a-z0-9]+(?:\.[a-z0-9]+)*)?\.cnki\.net/i, (m, sub) => {
    const prefix = sub ? sub.replace(/\./g, '--') + '--' : '';
    return 'https://' + prefix + 'cnki--net-s-205.share.sclib.cn';
  });
}

export function isProxyUrl(url) {
  return /\.share\.sclib\.cn\//.test(url);
}

/** 过程截图（存技能目录 调试截图/ 下） */
export async function shot(page, name) {
  const dir = 'C:/Users/user/.zcode/skills/journal-submit/川图文献下载/调试截图';
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const safe = String(name).replace(/[\\/:*?"<>|]/g, '_'); // 只清理文件名部分，不动盘符冒号
  const file = `${dir}/${Date.now()}_${safe}.png`;
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  console.log('截图:', file);
}

/** 校验 PDF 文件：头/大小/页对象数 */
export function verifyPdf(file) {
  const buf = fs.readFileSync(file);
  const header = buf.slice(0, 8).toString('latin1');
  const s = buf.toString('latin1');
  const pages = (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
  return { size: buf.length, header, pages, ok: header.startsWith('%PDF-') };
}
