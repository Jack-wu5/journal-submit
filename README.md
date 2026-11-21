# journal-submit — 通用中文期刊投稿成稿技能包

一个面向 AI Agent（ZCode / Claude / 其他 CLI Agent 均可用）的期刊投稿全流程技能：从期刊调研到成稿质检的**七道闸门工作流**，配套 docx 格式自检脚本与川图共享平台文献代下载工具。

> 适用对象：任何"给中文科技期刊写投稿论文"的场景。技能本身与特定期刊解耦，期刊硬指标在 Gate 2 现场调研获取。

## 目录结构

```
journal-submit/
├── SKILL.md                     # 主文件：四条铁律 + 七道闸门（Gate 1~7）
├── references/
│   ├── workflow-detail.md       # 各闸门细则（防串刊、无实测数据稿规则、匿名稿处理等）
│   ├── templates.md             # 模板 A~F（硬指标清单/选题地图/六维拆解表/偏好报告）
│   ├── quality-control.md       # Gate 6 质检链、内容一致性两轮通读、降 AIGC 分支
│   └── multi-agent.md           # 多智能体编排：收集并行→单点写作→并行评审
├── scripts/
│   └── audit_loop.py            # docx 格式自检（11 类检查，python-docx）
└── 川图文献下载/                # 子技能：四川省图书馆共享平台→知网镜像代下载
    ├── SKILL.md                 # 完整流程 + 三个关键坑的解法
    ├── 启动受控Edge.bat         # CDP:9333 受控浏览器启动
    └── scripts/                 # lib.mjs / 搜索文献.mjs / 下载PDF.mjs（playwright-core）
```

## 七道闸门（顺序不可变）

1. **作者资格核对** → 2. **期刊调研**（官方须知+防串刊+下载清单）→ 3. **范文拆解**（六维+版式体例）→ 4. **题目确认** → 5. **成稿**（提纲→初稿→润色）→ 6. **质检**（格式脚本+引用双向+两轮通读）→ 7. **投稿跟踪**

三条不可谈判红线：作者信息真实、不一稿多投、范文只学套路不抄句子。

## 快速开始

### ZCode 用户
把整个文件夹放入 `~/.zcode/skills/journal-submit/`，对 Agent 说"投稿"即可触发。

### 其他 AI / 手动使用
1. 让 Agent 读 `SKILL.md`，按七道闸门推进，闸门细则在 `references/` 里按需加载
2. 稿件生成后（docx）必跑格式自检：

```bash
python scripts/audit_loop.py 稿件.docx \
  --refs-min 6 --refs-max 8 --chars-min 4800 --chars-max 8000 \
  --abs-min 250 --abs-max 300 --min-cites 6 \
  --must-contain "栏目锚点词,作者要素词"
```

退出码：0=全 PASS，1=有 FAIL（先甄别真伪再动稿），2=文件/参数错误。

### 文献代下载（Gate 2 范文正文）
依赖：Node.js + playwright-core + 带 CDP 调试端口的 Edge + 四川省图书馆读者账号（自备，首次手动登录）。

```bash
启动受控Edge.bat                                  # 1. 启动受控 Edge
node 川图文献下载/scripts/搜索文献.mjs "文献标题"    # 2. 检索，输出详情页 URL
node 川图文献下载/scripts/下载PDF.mjs "<URL>" "<保存目录>"  # 3. 下载并校验 PDF
```

## 依赖

| 组件 | 用途 |
|---|---|
| Python 3.x + python-docx | audit_loop.py |
| Node.js + playwright-core | 川图代下载脚本 |
| Edge（CDP 9333） | 受控浏览器 |

## 学术诚信声明

本工具**仅辅助写作与流程管理**，内建多条硬约束：不代写、不虚构作者信息与实测数据、不编造参考文献、不绕过付费墙（正文下载走图书馆合法共享通道）、不代登账号、不接受账号密码。使用者的投稿行为请遵守目标期刊的所有规定。

## 隐私与版权

本仓库**不包含**任何文献 PDF、平台登录截图、账号信息；调试目录与下载目录已排除。
