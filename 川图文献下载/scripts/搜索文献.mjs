// 搜索文献.mjs — 在知网镜像站检索标题，输出命中列表 + 代理化详情页 URL
// 用法: node 搜索文献.mjs "文献标题"
// 前提: 受控 Edge 已启动(CDP 9333)，且已通过共享平台打开知网镜像标签页
import { connect, findPage, isProxyUrl, toProxyUrl, shot } from './lib.mjs';

const title = process.argv[2];
if (!title) { console.error('用法: node 搜索文献.mjs "文献标题"'); process.exit(2); }

const { browser, ctx } = await connect();
try {
  // 找知网相关标签页：排除下载端点(bar)/错误页，优先结果页，其次首页
  const cnkiTabs = ctx.pages().filter(p => /cnki/i.test(p.url()) && isProxyUrl(p.url())
    && !/\/bar\/|ErrorMsg/i.test(p.url()));
  let page = cnkiTabs.find(p => /defaultresult|kns8s/i.test(p.url()))
    || cnkiTabs.find(p => /www--cnki/i.test(p.url()))
    || cnkiTabs[0];
  if (!page) {
    console.error('未找到知网镜像标签页。请先：平台首页 → 热门数据库排行 → 中国知网学术期刊，再重试。');
    console.error('当前标签页:', ctx.pages().map(p => p.url().slice(0, 80)));
    process.exit(1);
  }
  await page.bringToFront();

  // 搜索框有两种：首页 textarea#txt_SearchText；结果页 input#txt_search（kns8s）
  // 若在任一状态都执行检索，避免旧结果冒充新查询
  const homeBox = page.locator('#txt_SearchText');
  const listBox = page.locator('#txt_search');
  if (await homeBox.count() && await homeBox.first().isVisible().catch(() => false)) {
    const ta = homeBox.first();
    await ta.waitFor({ state: 'visible', timeout: 5000 });
    await ta.fill(title);
    await page.locator('.search-btn').first().click();
  } else if (await listBox.count() && await listBox.first().isVisible().catch(() => false)) {
    const inp = listBox.first();
    await inp.waitFor({ state: 'visible', timeout: 5000 });
    await inp.fill(title);
    const v = await inp.inputValue();
    if (v !== title) throw new Error(`搜索框填词校验失败：="${v}"`);
    await inp.press('Enter'); // 结果页用回车触发检索
  } else {
    console.error('当前标签页既无首页搜索框也无结果页搜索框，URL:', page.url());
    process.exit(1);
  }
  await page.waitForTimeout(4500);

  // 解析结果列表（结果页结构：行内含题名链接/作者/来源/发表时间）
  const hits = await page.evaluate((want) => {
    const rows = [];
    for (const a of document.querySelectorAll('a')) {
      const href = a.href || '';
      if (!/article\/abstract/i.test(href)) continue;
      const row = a.closest('tr,div');
      const text = (row ? row.innerText : a.innerText || '').replace(/\n+/g, ' | ').trim();
      if (text.length < 5) continue;
      rows.push({ title: (a.innerText || '').trim(), text: text.slice(0, 200), rawUrl: href });
    }
    return rows;
  }, title);

  if (!hits.length) {
    console.log('HITS: 0');
    console.log('提示: 换"篇名"维度重试，或改走万方/维普入口（收录优先级：知网>万方>维普）');
    await shot(page, 'search_empty');
    process.exit(0);
  }

  // 防串台校验：第一条应与查询词相关，否则可能结果未刷新，等 3s 重解析一次
  const related = (t, q) => t.includes(q) || q.includes(t) ||
    q.split(/(?=[\u4e00-\u9fa5A-Za-z]{4})/).filter(s => s.length >= 4 && t.includes(s)).length >= 2;
  if (!related(hits[0].title, title)) {
    console.log('结果与查询词不一致，疑似未刷新，3s 后重解析...');
    await page.waitForTimeout(3000);
    const again = await page.evaluate(() => {
      const rows = [];
      for (const a of document.querySelectorAll('a')) {
        if (/article\/abstract/i.test(a.href || ''))
          rows.push({ title: (a.innerText || '').trim(), rawUrl: a.href });
      }
      return rows;
    });
    if (again.length) hits.length = 0, hits.push(...again);
  }

  const first = hits[0];
  const detailProxied = toProxyUrl(first.rawUrl);
  console.log(JSON.stringify({
    总命中: hits.length,
    第一条: { 题名: first.title, 信息: first.text },
    详情页URL_代理化: detailProxied,
    下一步: `node 下载PDF.mjs "${detailProxied}" "<保存目录>"`
  }, null, 2));
  console.log('其余命中:', JSON.stringify(hits.slice(1, 6), null, 1));
  await shot(page, 'search_done');
} finally {
  await browser.close().catch(() => {}); // 只断开 CDP 连接，不关浏览器
}
