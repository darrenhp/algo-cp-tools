---
name: geometry2d-module
overview: 新增「二维几何」Tab，支持点列表与 x/y 数组两种输入，纯 SVG 自绘散点图（坐标轴+网格+点）并计算/可视化轴对齐包围盒 AABB。沿用现有全局命名空间分层架构（models/parsers/renderers/tabs）。
design:
  architecture:
    framework: html
  styleKeywords:
    - Dark Tech
    - 渐变背景
    - 圆角卡片
    - 彩色边条
    - 白色画布对比
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
      - "#0f172a"
      - "#1e1b4b"
      - "#1e293b"
      - "#ffffff"
    text:
      - "#e2e8f0"
      - "#94a3b8"
      - "#1e293b"
    functional:
      - "#34d399"
      - "#f87171"
      - "#10b981"
todos:
  - id: create-model-parser
    content: 创建 Geometry2DModel 模型和 geometry2d-parsers 解析器（js/models/geometry2d-model.js, js/parsers/geometry2d-parsers.js）
    status: completed
  - id: create-svg-renderer
    content: 创建 SVG 自绘渲染器（js/renderers/geometry2d-svg-renderer.js），含坐标变换、网格、轴、点、AABB 绘制
    status: completed
    dependencies:
      - create-model-parser
  - id: create-tab-controller
    content: 创建 Geometry2DTab 控制器（js/tabs/geometry2d.js），含输入/解析/渲染/持久化全流程
    status: completed
    dependencies:
      - create-svg-renderer
  - id: integrate-html-css-app
    content: 修改 index.html（nav+tab section+script 标签+bump ?v=）、app.js（initGeometry2D）、css/main.css（.geom-* 样式）、README.md
    status: completed
    dependencies:
      - create-tab-controller
---

## 产品概述

在现有 Algo CP Tools 多 Tab 单页应用中新增「二维几何」Tab 模块。用户可输入二维点集，系统自动计算轴对齐包围盒（AABB），并以纯 SVG 绘制散点图（含坐标轴、网格、刻度标签、点、包围盒矩形）。

## 核心功能

- **两种输入方式**（选项卡切换）：
- 点列表：每行 `x y`（空格/逗号分隔）
- xy 数组：第一行为 x 数组，第二行为 y 数组
- **解析与校验**：支持 `#` / `//` 注释行，非法数字报错（含行号），xy 数组长度不一致报错
- **计算**：轴对齐包围盒（AABB）— minX / maxX / minY / maxY / width / height / area
- **可视化**：纯 SVG 自绘散点图，自适应坐标范围，含坐标轴、网格线、刻度标签、点（实心圆+索引标签）、AABB 虚线矩形（可开关）
- **状态持久化**：localStorage + sessionStorage 双写，刷新不丢数据
- **生成代码**：可展开查看生成的 SVG 源码
- **自动渲染**：输入变更后即时刷新图形

## Tech Stack

- 纯 HTML/CSS/JavaScript（无构建工具，file:// 可用）
- 全局命名空间 `window.AlgoCPTools` + IIFE 模块模式 + 传统 `<script>` 按序加载
- 可视化：原生 SVG 字符串构造 + innerHTML 注入（无第三方库）

## Implementation Approach

### 架构对齐

完全沿用现有项目的分层架构（models / parsers / renderers / tabs），每个新文件均为 IIFE 包裹、挂载到 `window.AlgoCPTools` 子命名空间。Tab 控制器沿用 `RootedTreeTab` 的生命周期模式：`cacheDom -> bindEvents -> loadState/loadSample -> parse -> render -> bindPersistEvents`。

### 模型层 Geometry2DModel

- `points: Array<{x:Number, y:Number}>` — 原始点集
- `setData(points)` / `reset()` / `size()`
- `getAABB()` — O(n) 遍历，返回 `{minX, maxX, minY, maxY, width, height, area}` 或 `null`（空点集）
- `getBounds(padding)` — 在 AABB 基础上扩展 padding，供渲染器计算 viewBox，确保所有点和 AABB 矩形都可见

### 解析器 geometry2d-parsers

- `isComment(line)` — 沿用 tree-parsers / array-parsers 的 `#` / `//` 判断
- `parsePointsList(text)` — 每行 split `/[\s,]+/`，取前两列为 x/y，非法数字抛错含行号
- `parseXYArrays(text)` — 取前两行非注释行，各自 split 为数字数组；长度不等抛错
- `buildModel(points)` — `new Geometry2DModel()` + `setData`

### SVG 渲染器 geometry2d-svg-renderer

- `render(model, container, options)` — `options.showAABB` 控制是否绘制包围盒
- 坐标变换：SVG y 轴向下，数学 y 轴向上 -> 翻转；按 `getBounds(padding)` 计算缩放比，映射到 600x420 viewBox
- 绘制层次：背景 -> 网格线（nice interval 自动选刻度）-> 坐标轴（原点在范围内则穿过原点，否则贴边）-> 刻度标签 -> AABB 矩形（`stroke-dasharray` 虚线）-> 点（实心圆 + 可选索引标签）
- 返回 `Promise<svgString>`，与现有渲染器签名一致，便于「生成代码」区显示
- 空点集显示 `.render-error` 提示

### Tab 控制器 Geometry2DTab

- 两栏布局 `.geom-layout`（左输入 + 右可视化），比树模块少属性面板
- 输入方式选项卡复用 `.input-tab-btn` 样式
- 控件：textarea、解析按钮、清理按钮、自动渲染勾选、显示包围盒勾选
- 结果区：点数、AABB 各项数值（复用 `.arr-result-card` 卡片样式风格）
- 持久化 key = `algoCpTools.geometry2d`，双写 localStorage + sessionStorage
- 示例数据预填含正负坐标的点，演示 AABB 效果

## Implementation Notes

- 新脚本 `?v=` 戳从 v=7 起步，同时 bump `css/main.css?v=` 和已加载脚本的版本号以避免缓存
- SVG 字符串构造使用数组 join，避免频繁字符串拼接；点数 <= 1000 时性能无忧
- 坐标变换中注意除零保护：若所有点 x 相同或 y 相同，width/height 为 0 时给默认最小范围（如 1）
- nice interval 算法：根据数据范围 / 目标格数（约 8-10 格）选取 1/2/5 x 10^k 的刻度间隔
- 不引入第三方库，不与未跟踪的 array-model / array-parsers 冲突，独立模块

## Architecture Design

```
index.html
  |-- nav: 「二维几何」tab-btn (新增)
  |-- section#tab-geometry2d (新增)
  `-- script 标签 (新增 4 个，按依赖序)

js/app.js -> initGeometry2D() -> new Geometry2DTab(el)

Geometry2DTab (控制器)
  |-- geometry2d-parsers -> parsePointsList / parseXYArrays -> buildModel
  |-- Geometry2DModel -> points + getAABB()
  `-- geometry2d-svg-renderer -> render(model, container, {showAABB})
```

## Directory Structure

```
algo-cp-tools/
|-- index.html                          # [MODIFY] nav 加「二维几何」按钮 + tab section + 4 个 script 标签 + bump ?v=
|-- css/main.css                        # [MODIFY] 新增 .geom-* 样式
|-- js/
|   |-- app.js                          # [MODIFY] 新增 initGeometry2D() 并在 init() 调用
|   |-- models/
|   |   `-- geometry2d-model.js         # [NEW] Geometry2DModel: points + getAABB() + getBounds(padding)
|   |-- parsers/
|   |   `-- geometry2d-parsers.js       # [NEW] parsePointsList / parseXYArrays / buildModel
|   |-- renderers/
|   |   `-- geometry2d-svg-renderer.js  # [NEW] SVG 自绘渲染器
|   `-- tabs/
|       `-- geometry2d.js               # [NEW] Geometry2DTab 控制器
`-- README.md                           # [MODIFY] 文档补充二维几何模块说明
```

### 文件详细说明

**js/models/geometry2d-model.js** [NEW]

- 定义 `Geometry2DModel` 构造函数，`points: []`
- prototype: `reset()`, `setData(points)`, `size()`, `getAABB()`（O(n) 遍历返回 min/max/width/height/area 或 null）, `getBounds(padding)`（AABB 扩展边距，处理退化情况）
- 挂载 `NS.models.Geometry2DModel`

**js/parsers/geometry2d-parsers.js** [NEW]

- `isComment(line)` — 沿用 `#` / `//` 判断
- `parsePointsList(text)` — 每行 `x y`，split `/[\s,]+/`，非法数字抛错含行号
- `parseXYArrays(text)` — 前两行非注释行分别解析为 x/y 数组，长度不等抛错
- `buildModel(points)` — 构造 Geometry2DModel
- 挂载 `NS.parsers.geometry2dParsers`

**js/renderers/geometry2d-svg-renderer.js** [NEW]

- `render(model, container, options)` — options.showAABB
- 坐标变换：数学坐标 -> SVG 坐标（y 翻转 + 缩放 + 平移），viewBox 600x420
- 绘制：背景、网格（nice interval）、坐标轴、刻度标签、点（r=4 实心圆 + 索引）、AABB 虚线矩形
- 返回 `Promise<svgString>`
- 挂载 `NS.renderers.geometry2dSvgRenderer`

**js/tabs/geometry2d.js** [NEW]

- `Geometry2DTab(rootEl)` 构造函数
- 方法：`cacheDom`, `bindEvents`, `setInputMode`, `updatePlaceholder`, `loadSample`, `parse`, `setParseStatus`, `render`, `renderResults`, `collectState`, `saveState`, `loadState`, `applyState`, `clearStorage`, `clearAll`, `bindPersistEvents`
- 持久化 key: `algoCpTools.geometry2d` / `algoCpTools.geometry2d.session`
- 挂载 `NS.tabs.Geometry2DTab`

**index.html** [MODIFY]

- 第 20 行 `<span class="tab-placeholder">` 前插入 `<button class="tab-btn" data-tab="geometry2d">二维几何</button>`，保留剩余 placeholder span
- 新增 `<section class="tab-content" id="tab-geometry2d">` — 含 `.geom-layout` 两栏（输入面板 + 可视化面板）
- 第 116-125 行脚本区追加 4 个 `<script>` 标签（model -> parser -> renderer -> tab），`?v=7`
- bump 已有脚本和 CSS 的 `?v=` 戳至 v=7

**js/app.js** [MODIFY]

- 新增 `initGeometry2D()` 函数：获取 `#tab-geometry2d` 元素，创建 `NS.tabs.Geometry2DTab` 实例
- `init()` 中调用 `initGeometry2D()`

**css/main.css** [MODIFY]

- 新增 `.geom-layout`（grid 两栏：输入 + 可视化，响应式断点 1200px / 820px）
- 新增 `.geom-panel`, `.geom-input`, `.geom-viz`（复用 rt-panel 基础样式 + 差异化渐变背景）
- 新增 `.geom-results`（结果卡片网格）
- 复用现有 `.input-tab-btn`, `.btn`, `.form-control`, `.rt-textarea`, `.graph-output`, `.render-error`, `.code-details`, `.code-block`, `.checkbox-label`, `.rt-status` 等类

**README.md** [MODIFY]

- 功能区追加「二维几何」模块说明
- 目录结构补充 4 个新文件

## 设计风格

沿用项目现有的暗色科技风（Dark Tech）设计语言。深色渐变背景配合靛蓝/紫色调，面板使用圆角卡片 + 顶部彩色边条区分功能区域。几何模块的可视化区使用白色背景画布（SVG），与暗色面板形成对比，突出图形内容。

### 页面布局

两栏 grid 布局（`.geom-layout`）：

- **左栏（输入面板 `.geom-input`）**：靛蓝渐变背景 + 顶部靛蓝色边条。上方为输入方式选项卡（点列表 / xy数组），中间为 textarea 输入框，下方为解析/清理按钮行 + 状态提示
- **右栏（可视化面板 `.geom-viz`）**：紫色渐变背景 + 顶部紫色边条。上方为控制行（自动渲染勾选 + 显示包围盒勾选 + 渲染按钮），中部为 SVG 画布输出区（白底），下方为结果数据卡片 + 可展开生成代码

### 交互细节

- 输入方式选项卡切换时更新 placeholder 提示文案
- 解析成功/失败在状态区显示绿色/红色文字
- 勾选「显示包围盒」即时重绘 SVG
- 自动渲染开启时，输入变更后即时刷新
- 结果卡片实时显示点数和 AABB 各项数值（minX/maxX/minY/maxY/width/height/area）
- 响应式：1200px 以下两栏堆叠为单列