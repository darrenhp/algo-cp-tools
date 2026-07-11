---
name: sgu-problem-list-web
overview: 在新工程 sgu 下用 Python 脚本抓取 Codeforces acmsguru 题库第 1~5 页，用混元 3 大模型把英文题目标题翻译成中文，生成 problems.json（含题号、中文名、Codeforces 链接、vjudge 中文链接），并生成一个可直接打开的静态网页 index.html 以表格展示（含搜索/筛选）。
design:
  architecture:
    framework: html
  styleKeywords:
    - Minimalism
    - Clean
    - Dashboard
    - Sticky Header
    - Responsive Table
  fontSystem:
    fontFamily: PingFang SC, Noto Sans, system-ui
    heading:
      size: 28px
      weight: 700
    subheading:
      size: 18px
      weight: 600
    body:
      size: 15px
      weight: 400
  colorSystem:
    primary:
      - "#2563EB"
      - "#1E40AF"
    background:
      - "#F8FAFC"
      - "#FFFFFF"
    text:
      - "#0F172A"
      - "#64748B"
    functional:
      - "#2563EB"
      - "#22C55E"
      - "#EF4444"
todos:
  - id: scaffold-project
    content: 创建 requirements.txt、.env.example 项目骨架与依赖
    status: completed
  - id: impl-scrape
    content: 实现 scrape.py 抓取并解析 5 页题目数据
    status: completed
    dependencies:
      - scaffold-project
  - id: impl-translate
    content: 接入混元 3 批量翻译英文标题为中文名
    status: completed
    dependencies:
      - impl-scrape
  - id: gen-data
    content: 生成 problems.json 并拼接 vjudge 链接
    status: completed
    dependencies:
      - impl-translate
  - id: gen-page
    content: 生成 index.html 展示页（搜索过滤+表格）
    status: completed
    dependencies:
      - gen-data
  - id: verify-run
    content: 运行脚本并浏览器验证抓取与展示
    status: completed
    dependencies:
      - gen-page
---

## 用户需求

创建一个全新工程，抓取 Codeforces 上 acmsguru 题库第 1~5 页题目，提取题号、英文标题、Codeforces 链接，并用混元 3 大模型翻译出中文名，最终生成一个题目列表文件（JSON）和一个用于展示的网页。

## 产品概述

- 用 Python 脚本离线抓取并提取数据，无需常驻服务器。
- 生成 `problems.json` 作为题目列表文件，包含：题号、中文名、Codeforces 链接、vjudge 中文版链接。
- 生成一个静态网页 `index.html`，以表格形式展示题目列表，并支持搜索/筛选。

## 核心功能

- 抓取 Codeforces acmsguru 第 1~5 页（每页约 100 题，共约 500 题），解析出题号、英文标题、题目详情链接。
- 调用混元 3 大模型，将英文题目标题批量翻译为简体中文名。
- 按规则拼接 vjudge 中文版链接：`https://vjudge.net/problem/SGU-{题号}#author=translator:1281309:zh`。
- 输出 `problems.json` 题目列表文件。
- 静态网页以表格展示（题号、中文名、Codeforces 链接、vjudge 中文链接），并提供搜索框按题号/中文名过滤。

## 技术栈

- 语言：Python 3.14（已确认可用）
- HTTP 抓取：`requests`
- HTML 解析：`beautifulsoup4` + `lxml`
- 翻译调用：腾讯云混元大模型 API（hy3 / 混元翻译模型），使用 `requests` 原生调用，凭证通过环境变量注入
- 展示：纯静态 `index.html`（HTML + 内联 CSS/JS），数据内嵌以便 `file://` 直接双击打开，规避浏览器本地 fetch 的 CORS 限制

## 实现思路

- **抓取与解析**：`scrape.py` 依次请求 `page/1`~`page/5`，请求带 `User-Agent`，页间加 1 秒延时避免限流。用 BeautifulSoup 解析题目列表表格，提取题号（如 `553`）与英文标题（如 `Sultan's Pearls`），两者均链接到 `/problemsets/acmsguru/problem/99999/{ID}`，据此构造完整 Codeforces 链接 `https://codeforces.com/problemsets/acmsguru/problem/99999/{ID}`。
- **批量翻译**：为避免 500 次 API 调用，将所有英文标题一次性（或按 100 条分批）发送给混元 3，系统提示词要求「将英文算法题目标题翻译为简体中文，仅返回 JSON 对象（题号为键、中文名为值）」，再按题号映射回中文名；翻译失败的题号回退为英文原名。
- **数据产出**：构造每条记录 `{id, enName, zhName, cfUrl, vjudgeUrl}`，`vjudgeUrl` 由题号按规则拼接，写入 `problems.json`。
- **展示页**：`index.html` 内嵌一份 `problems.json` 的数据副本（避免本地 fetch 限制），渲染响应式表格，顶部搜索框按题号/中文名实时过滤，行 hover 高亮，题号与两个链接可点击跳转。

## 实现要点

- **性能与限流**：抓取 5 页串行 + 延时，控制请求频率；翻译合并为少量批量调用，显著降低额度消耗与耗时。
- **健壮性与容错**：抓取失败（网络/解析异常）时跳过错题并继续；翻译缺失或异常的题目保留英文原名，保证 `problems.json` 完整性。
- **配置与密钥**：混元凭证（`HUNYUAN_SECRET_ID` / `HUNYUAN_SECRET_KEY` 或 `HUNYUAN_TOKEN`）与模型名写在 `.env.example` 中由用户填写，代码读取环境变量，不硬编码密钥。
- **可扩展性**：解析与翻译解耦为独立函数；若后续抓取更多页或新增字段（如难度），仅需扩展 `scrape.py` 与数据 schema，前端表格列可同步扩展。

## 架构设计

数据流：Codeforces 页面 → Python 抓取/解析 → 混元 3 翻译 → 构造 JSON → 写入 `problems.json` + 内嵌进 `index.html` → 浏览器静态展示。
脚本为纯命令行一次性生成，无后端服务；展示与数据生成分离。

## 目录结构

```
sgu/
├── requirements.txt   # [NEW] Python 依赖声明（requests、beautifulsoup4、lxml）
├── .env.example       # [NEW] 混元 API 凭证与模型名占位模板
├── scrape.py          # [NEW] 核心脚本：抓取 5 页→解析题号/标题/CF链接→混元批量翻译→拼接 vjudge 链接→写出 problems.json 与生成 index.html
├── problems.json      # [NEW] 生成的题目列表文件（id、enName、zhName、cfUrl、vjudgeUrl）
└── index.html         # [NEW] 静态展示页（内嵌数据副本，表格+搜索过滤）
```

## 设计风格

采用现代简约仪表盘风格（Minimalism + 轻量玻璃质感），以清晰的信息层级呈现题目列表。页面顶部为标题栏与搜索框，下方为带粘性表头的响应式表格，列包含：题号、中文名、Codeforces、vjudge 中文。行 hover 高亮、链接按钮化（可点击跳转），整体留白充足、阅读舒适。页面无外部依赖，单文件即可运行。

## 页面区块（自上而下）

1. 顶部导航/标题栏：工程标题「SGU 题目列表」+ 简洁副标题，背景浅色渐变。
2. 搜索区：圆角搜索输入框，按题号或中文名实时过滤表格。
3. 统计条：显示题目总数，随过滤动态更新。
4. 数据表格：粘性表头，列含题号、中文名（主显示）、Codeforces 链接、vjudge 中文链接；行 hover 浅蓝高亮；窄屏下横向滚动。
5. 页脚：数据生成时间与来源说明。