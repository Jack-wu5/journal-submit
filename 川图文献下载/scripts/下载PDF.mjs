// 下载PDF.mjs — 从知网镜像详情页下载 PDF（内置 Referer 坑解法）并校验
// 用法: node 下载PDF.mjs "<详情页URL(代理化或原始域名均可)>" "<保存目录>"
import { connect, toProxyUrl, verifyPdf, shot } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const inputUrl = process.argv[2];
const saveDir = process.argv[3] || 'C:/Users/user/.zcode/skills/journal-submit/川图文献下载/已下载';
if (!inputUrl) {
  console.error('用法: node 下载PDF.mjs "<详情页URL>" "<保存目录(可选)>"');
  process.exit(2);
}
const detailUrl = toProxyUrl(inputUrl);

const { browser, ctx } = await connect();
try {
  fs.mkdirSync(saveDir, { recursive: true });
  const page = await ctx.newPage();
  const dlPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);

  await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    .catch(e => console.log('导航警告:', e.message));
  await page.waitForTimeout(2000);
  console.log('详情页:', page.url().slice(0, 130));
  console.log('标题:', await page.title().catch(() => ''));

  // 核对元数据（详情页结构：题名\n作者\n单位\n摘要：…；来源行形如"中国化工贸易 . 2026 ,18 (29) : 13-15"）
  const meta = await page.evaluate(() => {
    const t = document.body.innerText;
    const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
    const zi = lines.findIndex(l => l.startsWith('摘要'));
    const srcLine = lines.find(l => /\.\s*\d{4}\s*,/.test(l) && l.length < 60) || '';
    return {
      题名: lines[zi - 3] || '',
      作者: zi >= 2 ? lines[zi - 2] : '',
      单位: zi >= 1 ? lines[zi - 1] : '',
      来源期页: srcLine,
    };
  }).catch(() => null);
  console.log('页面元数据:', JSON.stringify(meta, null, 1));

  // 抓 PDF下载 链接并代理化
  const pdfHref = await page.locator('a:has-text("PDF下载")').first().evaluate(el => el.href)
    .catch(() => null);
  if (!pdfHref) {
    console.error('未找到 PDF下载 按钮。CAJ下载 可作为备选（脚本暂不支持），或该文献无全文。');
    await shot(page, 'no_pdf_btn');
    process.exit(1);
  }
  const barUrl = toProxyUrl(pdfHref);
  console.log('下载端点(代理化):', barUrl.slice(0, 110));

  // 关键：在详情页内发起导航（带详情页 Referer），否则报"来源应用不正确(01)"
  const dl = await (async () => {
    const p = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
    await page.evaluate(u => { window.location.href = u; }, barUrl);
    return p;
  })();

  if (!dl) {
    // 可能被腾讯滑块验证码拦截
    const cap = await page.evaluate(() => {
      const el = document.querySelector('#tCaptchaDyMainWrap');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { 可见: !!(el.offsetWidth || el.offsetHeight), rect: { x: r.x | 0, y: r.y | 0 } };
    }).catch(() => null);
    if (cap && cap.可见) {
      console.error('触发腾讯滑块验证码——请用户在 Edge 窗口手动拖动完成验证后重跑本脚本。');
    } else {
      const body = await page.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n+/g, ' | ')).catch(() => '');
      console.error('下载未触发。页面状态:', body);
    }
    await shot(page, 'download_failed');
    process.exit(1);
  }

  // 保存
  const fname = dl.suggestedFilename() || '知网文献.pdf';
  const saveTo = path.join(saveDir, fname);
  await dl.saveAs(saveTo);
  const v = verifyPdf(saveTo);
  console.log(JSON.stringify({
    已保存: saveTo, 大小字节: v.size, 文件头: v.header, 页对象数: v.pages, 校验通过: v.ok
  }, null, 2));
  console.log(v.ok ? '✅ PDF 下载成功且结构有效' : '❌ 文件结构异常，请检查调试截图');
} finally {
  await browser.close().catch(() => {}); // 只断开 CDP 连接，不关浏览器
}
