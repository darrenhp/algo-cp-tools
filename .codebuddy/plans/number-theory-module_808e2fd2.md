---
name: number-theory-module
overview: 新增数论模块 Tab：输入区间 [L,R]，用线性筛一次性计算区间内所有数的素数判定、约数个数 d(n)、莫比乌斯 μ(n)、约数列表、质因数分解、欧拉 φ(n)、约数和 σ(n)、质因子个数 ω(n)/Ω(n)，以单张表格展示，每列通过 checkbox 控制显隐。
design:
  architecture:
    framework: html
  styleKeywords:
    - Dark Theme
    - Indigo Gradient
    - Purple Gradient
    - Sticky Header Table
    - Pill Toggle
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 15px
      weight: 600
    subheading:
      size: 13px
      weight: 600
    body:
      size: 12px
      weight: 400
  colorSystem:
    primary:
      - "#6366f1"
      - "#818cf8"
      - "#a855f7"
    background:
      - "#1e1b4b"
      - "#1e293b"
      - "#4a044e"
    text:
      - "#e2e8f0"
      - "#94a3b8"
      - "#a5b4fc"
      - "#d8b4fe"
    functional:
      - "#34d399"
      - "#f87171"
      - "#f1f5f9"
todos:
  - id: create-number-theory-model
    content: 创建 js/models/number-theory-model.js，实现线性筛与积性函数计算
    status: completed
  - id: create-number-theory-tab
    content: 创建 js/tabs/number-theory.js，实现 Tab 控制器与表格渲染
    status: completed
    dependencies:
      - create-number-theory-model
  - id: update-html-and-css
    content: 修改 index.html 新增 Tab 和 script 引用，修改 main.css 新增数论模块样式
    status: completed
    dependencies:
      - create-number-theory-tab
  - id: update-app-and-readme
    content: 修改 app.js 新增初始化调用，更新 README.md 文档
    status: completed
    dependencies:
      - update-html-and-css
---

## 产品概述

新增数论模块 Tab，用户输入一个整数区间 [L, R]（L ≥ 1，R ≤ 10^7），模块通过线性筛一次性计算区间内每个整数的多种数论函数值，以单张表格形式展示，每列对应一个数论属性，通过 checkbox 控制每列显隐。

## 核心功能

- **区间输入**：输入 L 和 R 两个整数，点击「计算」生成结果；支持 L ≥ 1、R ≤ 10^7、L ≤ R 的校验，非法输入显示错误提示
- **数论函数计算**（8 项）：
- 是否素数（isPrime）
- 约数个数 d(n)
- 莫比乌斯函数 μ(n)
- 约数列表（完整约数，升序）
- 质因数分解列表（如 12 → 2²×3）
- 欧拉函数 φ(n)
- 约数和 σ(n)
- 质因子个数 ω(n)（不同质因子数）/ Ω(n)（总质因子数）
- **列显隐控制**：n 列固定显示，其余 8 列各有一个 checkbox，勾选/取消即时切换列的显示/隐藏
- **状态持久化**：区间输入、列显隐状态保存到 localStorage + sessionStorage，刷新不丢失
- **示例数据**：首次加载自带默认区间（如 1~30）

## 技术栈

- 纯 HTML/CSS/JavaScript，无构建工具，兼容 `file://` 协议
- 全局命名空间 `window.AlgoCPTools` + 传统 `<script>` 按序加载
- 深色主题 CSS（复用现有 `.attr-table`、`.form-control`、`.btn` 等样式）

## 实现方案

### 核心算法：线性筛（欧拉筛）O(R)

对区间 [1, R] 使用欧拉筛，在筛的过程中一次性计算以下积性函数：

- `isPrime[i]`：是否为素数
- `mu[i]`：莫比乌斯函数（素数=-1，有平方因子=0，否则=(-1)^k）
- `phi[i]`：欧拉函数（素数 p → p-1，否则 phi[i] = phi[i/spf] * spf 或 phi[i/spf] * (spf-1)）
- `spf[i]`：最小质因子（最小质因子），用于后续推导
- `omega[i]`：不同质因子个数（spf 首次出现时 +1）
- `Omega[i]`：总质因子个数（含重复，每次筛标记 +1）

### 派生计算（基于 spf 递推）

- **约数个数 d(n)**：维护 `cnt[i]`（i 中 spf 的幂次 k），d(i) = d(i / spf^k) * (k+1)
- **约数和 σ(n)**：维护 `pk[i]`（spf^k）和 `sigmapk[i]`（1 + spf + ... + spf^k），σ(i) = σ(i / spf^k) * sigmapk[i]
- **质因数分解**：由 spf 逐次除得到，格式化为 "p1^a1 × p2^a2 × ..."
- **约数列表**：由质因数分解通过 DFS 组合生成，升序排列

### 性能考量

- R ≤ 10^7：约 10 个 Int32Array（每个 40MB），浏览器总内存约 400MB，可接受
- 线性筛 O(R) 时间复杂度，10^7 在浏览器中约 200-500ms
- 约数列表仅对显示区间 [L, R] 生成（非 [1, R]），避免不必要的内存开销
- 表格渲染：区间过大时（如 R-L > 10000）提示用户缩小范围，避免 DOM 节点过多

## 实现笔记

- **内存管理**：筛数组使用 `Int32Array` 而非普通 Array，减少内存占用；计算完成后仅保留结果，中间数组（如 sieve 标记）可释放
- **列显隐实现**：通过给 `<th>` 和 `<td>` 添加/移除 CSS class `nt-col-hidden { display: none; }` 实现，避免重建表格 DOM
- **表格行数限制**：当 R - L + 1 > 5000 时，提示「区间过大，建议缩小范围」但仍允许计算；表格容器 `.nt-table-wrap` 设置 `max-height` + `overflow: auto` + sticky 表头
- **状态持久化**：沿用现有模式，STORAGE_KEY = `'algoCpTools.numberTheory'`，SESSION_KEY = `'algoCpTools.numberTheory.session'`
- **缓存版本号**：新增 script 标签使用 `?v=26`，index.html 中 css 版本号递增

## 架构设计

沿用项目现有分层架构，数论模块不需要 renderer（纯表格展示，由 tab 控制器直接渲染 HTML），但需要 model 和 tab：

```
用户输入 [L, R] → Tab 控制器校验 → NumberTheoryModel.compute(L, R)
  → 线性筛计算 isPrime/mu/phi/spf/omega/Omega
  → 递推计算 d(n)/σ(n)
  → 生成质因数分解字符串和约数列表
  → Tab 控制器渲染表格（按 checkbox 状态控制列显隐）
```

## 目录结构

```
algo-cp-tools/
├── index.html                          # [MODIFY] 新增数论 Tab 按钮、Tab section、script 引用
├── css/main.css                        # [MODIFY] 新增 .nt-layout 布局、.nt-table 表格、.nt-col-toggle 列控制样式
├── js/
│   ├── namespace.js                    # [无修改] 已有 models/parsers/tabs 命名空间
│   ├── app.js                          # [MODIFY] 新增 initNumberTheory() 调用
│   ├── models/
│   │   └── number-theory-model.js      # [NEW] 数论模型：线性筛 + 积性函数计算
│   └── tabs/
│       └── number-theory.js            # [NEW] 数论 Tab 控制器：DOM 绑定、计算调度、表格渲染、状态持久化
└── README.md                           # [MODIFY] 更新功能说明与目录结构
```

### 文件详细说明

**`js/models/number-theory-model.js`** [NEW]

- `NumberTheoryModel` 构造函数，持有 `lo`、`hi`、`results` 数组
- `compute(lo, hi)` 方法：校验输入 → 线性筛 O(hi) → 递推 d(n)/σ(n) → 生成约数列表和质因数分解字符串 → 存入 `results`
- `results` 结构：`[{ n, isPrime, mu, phi, sigma, d, omega, Omega, factorization, divisors }]`
- 线性筛内部使用 `Int32Array` 管理 spf/mu/phi/omega/Omega/cnt/pk/sigmapk
- 质因数分解格式化：`formatFactorization(12)` → `"2²×3"`（上标用 Unicode）
- 约数列表生成：由 spf 得到质因数分解后 DFS 组合

**`js/tabs/number-theory.js`** [NEW]

- `NumberTheoryTab(rootEl)` 构造函数，沿用 geometry2d.js 的生命周期模式
- `cacheDom()`：缓存区间输入框、计算按钮、清理按钮、列 checkbox、表格容器、状态栏
- `bindEvents()`：计算/清理按钮点击、checkbox change、输入回车触发计算
- `compute()`：调用 model.compute → `renderTable()`
- `renderTable()`：根据 checkbox 状态生成表格 HTML，n 列固定，其余列按 checkbox 显隐
- `saveState()/loadState()/applyState()`：持久化区间值 + 各列 checkbox 状态
- 列定义常量 `COLUMNS`：`[{ key, label, defaultVisible }, ...]`

**`index.html`** [MODIFY]

- Tab 栏新增：`<button class="tab-btn" data-tab="number-theory">数论</button>`
- Tab 容器新增 `<section class="tab-content" id="tab-number-theory">`，内含：
- 左栏（输入）：L/R 数字输入框、计算/清理按钮、解析状态栏、列显隐 checkbox 组
- 右栏（结果）：表格容器 `.nt-table-wrap`
- 底部新增 script 引用：`number-theory-model.js` 和 `number-theory.js`（在 app.js 之前）

**`css/main.css`** [MODIFY]

- `.nt-layout`：双栏 grid（320px + 1fr），响应式回退单栏
- `.nt-panel`：面板样式（复用 .geom-panel 风格）
- `.nt-col-toggle`：列 checkbox 容器，flex-wrap 布局
- `.nt-table-wrap`：表格滚动容器，max-height + overflow auto
- `.nt-col-hidden`：`display: none` 用于隐藏列
- `.nt-factor`：质因数分解列等宽字体样式

## 关键代码结构

```javascript
// 列定义（tab 控制器中）
var COLUMNS = [
  { key: 'isPrime',       label: '素数',      defaultVisible: true  },
  { key: 'mu',            label: 'μ(n)',      defaultVisible: true  },
  { key: 'phi',           label: 'φ(n)',      defaultVisible: true  },
  { key: 'd',             label: 'd(n)',      defaultVisible: true  },
  { key: 'sigma',         label: 'σ(n)',      defaultVisible: false },
  { key: 'omega',         label: 'ω/Ω',       defaultVisible: false },
  { key: 'factorization', label: '质因数分解', defaultVisible: true  },
  { key: 'divisors',      label: '约数列表',   defaultVisible: false }
];
```

## 设计方案

数论模块沿用项目现有深色主题风格，采用双栏布局：左栏为输入与控制区，右栏为结果表格区。整体风格与二维几何模块保持一致，使用靛蓝渐变输入面板 + 紫色渐变结果面板。表格使用白底深色文字，sticky 表头，首列 n 高亮。列显隐 checkbox 以药丸状标签排列在输入区底部，勾选状态有渐变高亮反馈。

### 页面区块设计

**左栏（输入面板）**：

- 标题区：「输入」标题
- 区间输入区：L 和 R 两个数字输入框并排，中间用「~」连接，下方为计算/清理按钮
- 状态栏：解析成功/失败提示
- 列控制区：标题「显示列」+ 8 个 checkbox 药丸标签（复用 .checkbox-label 样式）

**右栏（结果面板）**：

- 标题区：「数论函数表」标题
- 表格区：可滚动表格，sticky 表头，首列 n 固定高亮，各数据列按 checkbox 状态显隐