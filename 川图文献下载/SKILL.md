---
name: 川图文献下载
description: 通过四川省图书馆数字资源共享平台（sclib.cn）进入知网/万方等数据库镜像，检索学术文献确认存在并下载 PDF。包含受控浏览器启动、登录检查、代理域名映射、Referer 校验下载、PDF 验证等已验证步骤与三个关键坑的解法。
---

# 川图文献下载技能

通过四川省图书馆（sclib.cn）的**四川省公共图书馆数字资源共享平台**，进入知网等数据库镜像检索并下载学术文献 PDF。本技能的所有步骤均于 2026-11-21 实测跑通（测试文献：《石油化工企业环境保护与经济效益协调发展研究》李元军）。

## 适用场景

- 用户给出题目（+作者/单位），要求"下载文献/论文 PDF"
- 需要确认某文献在哪些数据库有收录，并按优先级选择下载源

**收录优先级规则**（多库收录时）：知网 > 万方 > 维普 > 其他。

## 平台背景

- 入口：https://www.sclib.cn/ → 顶部"资源"菜单 → **四川省公共图书馆数字资源共享平台**（直达 URL：`https://www.sclib.cn/v2/p/61c35688843e8311ef2adad6a9dd4efb0cd9`）
- 平台首页有"热门数据库排行"：① 中国知网学术期刊 ② 万方数据服务平台 ③ 读秀
- 数据库经**镜像代理**访问，域名规则见"坑 2"
- 平台需读者账号登录（登录后浏览器配置目录持久化，一般无需重复登录）

## 环境与启动（坑 1）

`node-repl-host` 内置插件在本机被禁用（`~/.zcode/cli/config.json` 的 `suppressedBuiltins`），**@browser-use 插件不可用**。替代方案（已验证）：

- **playwright-core 1.65.1**：位于 `C:\Users\user\Desktop\DScode_test\teardown-hub\node_modules\playwright-core`（脚本已自动寻址，也可用环境变量 `PLAYWRIGHT_CORE_PATH` 覆盖）
- **有界面 Edge + CDP 远程调试**：用户日常使用 Edge，自动化也用 Edge
- 启动方式：双击本技能文件夹里的 `启动受控Edge.bat`，或让 agent 用 Bash 执行它
- CDP 地址：`http://127.0.0.1:9333`（可用环境变量 `SCLIB_CDP_URL` 覆盖）

**登录检查**：连接后看平台页右上角——显示"登录"按钮 = 未登录，需请用户在弹出的 Edge 窗口手动登录后再继续（自动化实例与用户日常 Edge 的登录态互不相通，首次必须手动登录一次）。

**凭据边界（不可谈判）**：读者账号/密码由使用者本人在受控 Edge 窗口输入，agent 全程不经手、不记录、不询问、不写入任何文件；登录态仅存于本机受控 Edge 专用配置目录（Chromium 加密存储）。多人共用此技能时，**各自注册并使用自己的读者账号**（四川省图书馆官网 sclib.cn 免费自助注册），禁止使用、借用或共享他人账号（读者证号可能等同身份证号，属高敏信息）。使用者无账号时，agent 引导其在官网完成免费注册后再登录（配置目录按机器隔离，互不影响）。

## 完整流程

### 第 0 步：启动受控 Edge 并确认登录

1. 运行 `启动受控Edge.bat`（已运行则跳过；检测方法：`curl -s http://127.0.0.1:9333/json/version` 有响应）
2. `curl -s http://127.0.0.1:9333/json/list` 查看已有标签页，复用已打开的平台/知网页签
3. 若平台页右上角显示"登录"→ 请用户手动登录，确认后再继续

### 第 1 步：进入知网

平台首页点"热门数据库排行"第 1 名"中国知网学术期刊"，会新开镜像站标签页（`https://www--cnki--net-s-205.share.sclib.cn/`）。也可用万方入口（优先级备选）。

### 第 2 步：检索题目

用 `scripts/搜索文献.mjs`：

```bash
node "C:/Users/user/.zcode/skills/journal-submit/川图文献下载/scripts/搜索文献.mjs" "文献标题"
```

- 搜索框是 `textarea#txt_SearchText`（主文档内，**不在 iframe**），检索按钮 `.search-btn`
- 脚本输出 JSON：结果条目列表 + 第一条命中的**代理化详情页 URL**（`/kcms2/article/abstract?v=...`）
- 检索范围默认"主题"；命中多条时按题名+作者匹配确认

### 第 3 步：核对并下载 PDF

用 `scripts/下载PDF.mjs`：

```bash
node "C:/Users/user/.zcode/skills/journal-submit/川图文献下载/scripts/下载PDF.mjs" "<详情页URL>" "<保存目录>"
```

脚本自动完成：代理域名归一化 → 打开详情页 → 输出题名/作者/单位/来源核对信息 → 抓取"PDF下载"链接 → **页内导航下载**（坑 3）→ 保存 → 校验 PDF 头与页数。

### 第 4 步：验证 PDF

- 文件头应为 `%PDF-1.x`；知网 PDF 尾部有元数据 `WebFastLoad<FileProperty><FileName>ZGOU202629005</FileName><TableName>CJFDTotal</TableName>`（FileName = 期刊代码+年+期+序号，CJFDTotal = 中国学术期刊全文库）
- 文字核验：`pip install pypdf`（**默认源会超时，必须用清华镜像** `-i https://pypi.tuna.tsinghua.edu.cn/simple`，用户翻墙走 Clash Party 也不行），提取第 1 页文字比对题名/栏目/页码

## 三个关键坑（必读）

### 坑 1：node_repl 被禁用

见上"环境与启动"。不要尝试走 @browser-use 插件的 `mcp__node_repl__js`——该工具不存在。

### 坑 2：代理域名映射（必须手动做）

平台经镜像代理访问知网，规则：**原始域名的每个点换成 `--`，末尾加 `-s-205`，后缀 `.share.sclib.cn`**：

| 原始域名 | 代理域名 |
|---|---|
| www.cnki.net | www--cnki--net-s-205.share.sclib.cn |
| kns.cnki.net | kns--cnki--net-s-205.share.sclib.cn |
| bar.cnki.net | bar--cnki--net-s-205.share.sclib.cn |

结果页里文章标题链接和"PDF下载"链接的 href **仍指向真实域名**（`kns.cnki.net`、`bar.cnki.net`）。直接点击会：① 触发腾讯滑块安全验证（`#tCaptchaDyMainWrap`，隐藏挂载，弹出即拦截）；② 新标签打不开或瞬间自关。**必须把 URL 手动映射成代理域名再导航。**

### 坑 3：bar.cnki.net 下载端点校验来源（Referer）

直接访问（哪怕换成代理域名、新开标签）会报 **"来源应用不正确(01)"**。正确做法：**在详情页标签页内**执行 `window.location.href = <代理化的 bar URL>`，让导航自动带上详情页 Referer，download 事件随即触发。`下载PDF.mjs` 已内置此逻辑。

## 故障排查

| 现象 | 处置 |
|---|---|
| CDP 连不上 | 运行 `启动受控Edge.bat`；若 Edge 已开着但无调试端口，先关掉全部 Edge 窗口再用 bat 启动 |
| 平台显示未登录 | 请用户在受控 Edge 窗口手动登录（右上角"登录"） |
| 搜索无结果 | 换"篇名"检索维度试一次；仍无则去万方/维普入口重搜（收录优先级规则） |
| 下载触发滑块验证码 | 截图确认后请用户手动拖滑块完成，再重试下载 |
| 下载 0 字节/HTML | 多半是走了真实域名或 Referer 不对，重跑 `下载PDF.mjs`（其内部已处理） |
| pip 装 pypdf 超时 | 加清华镜像参数，见第 4 步 |

## 文件清单

- `SKILL.md` — 本文件
- `启动受控Edge.bat` — 启动带 CDP 调试端口的 Edge（专用配置目录，登录态持久化）
- `scripts/lib.mjs` — 公共库：CDP 连接、playwright 寻址、截图
- `scripts/搜索文献.mjs` — 在知网镜像检索标题，输出命中列表与详情页 URL
- `scripts/下载PDF.mjs` — 从详情页下载 PDF 并校验
- `调试截图/` — 脚本运行时的过程截图（排查用）
