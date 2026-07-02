# algo-cp-tools

算法竞赛可视化调试工具。纯网页应用，**无需构建工具**，直接用浏览器打开 `index.html` 即可使用（第三方库通过 CDN 加载，需联网）。

## 功能

多 Tab 单页应用，每个 Tab 对应一种常见算法竞赛数据结构模型。当前已实现：

### 有根树调试器

- **三种输入方式**（下拉框切换）
  - 边集合：每行 `u v` 表示从 u 到 v 的有向边
  - 父节点数组：空格/逗号分隔，`parent[i]` 为节点 `i+1` 的父节点，`0`/`-1` 表示根
  - 邻接表：每行 `k v1 v2 … vk`，k 为子节点数量，后跟 k 个子节点（第 i 行对应节点 `base+i`）
- **根节点选择**：手动输入，默认 `1`
- **属性系统**
  - 解析后自动为每个节点/边生成 `id` 字段（只读，不可删除）
  - 可添加自定义属性字段（如 `label`、`weight`、`color`）
  - 每个字段有 checkbox 控制是否在图上显示（属性级显示控制）
  - 节点表/边表可直接编辑属性值
- **三种可视化引擎**（下拉框切换）
  - **Mermaid**：生成 `graph TD` 语法，Mermaid 自行布局
  - **Graphviz**：生成 DOT 语法，viz.js dot 引擎布局
  - **TikZ**：手动计算树布局（叶子按序分配 x，内部节点取子节点中点），生成绝对定位 `tikzpicture`，由 TikZJax 在浏览器内编译为 SVG
- **自动渲染**：输入/属性/显示勾选变更后即时刷新
- **生成代码**：可展开查看并复制当前引擎生成的源码

## 目录结构

```
algo-cp-tools/
├── index.html
├── css/main.css
├── js/
│   ├── namespace.js              # 全局命名空间
│   ├── app.js                    # Tab 管理与初始化
│   ├── tabs/rooted-tree.js       # 有根树控制器
│   ├── models/tree-model.js      # 树数据模型
│   ├── parsers/tree-parsers.js   # 三种输入解析
│   ├── renderers/
│   │   ├── mermaid-renderer.js
│   │   ├── graphviz-renderer.js
│   │   └── tikz-renderer.js
│   └── utils/tree-layout.js      # TikZ 布局算法
└── README.md
```

## 使用方法

直接双击 `index.html` 打开（或拖入浏览器）。页面加载后会自带一棵示例树（7 节点），可立即渲染。

修改输入后点击「解析」重建模型；勾选/取消字段或编辑属性表后，若开启「自动渲染」会即时刷新图形。

## 技术说明

- 采用全局命名空间（`window.AlgoCPTools`）+ 传统 `<script>` 按序加载，兼容 `file://` 协议（不支持 ES6 模块）。
- CDN 依赖：
  - Mermaid `@10` — `cdn.jsdelivr.net`
  - viz.js `@2.1.2`（UMD，含 `full.render.js`）— `cdn.jsdelivr.net`
  - TikZJax — `tikzjax.com`（首次编译约 5MB，加载较慢）
- TikZ 引擎依赖浏览器内 LaTeX 编译，支持有限；若渲染失败，仍可在「生成代码」中复制 `tikzpicture` 到本地 LaTeX 环境。

## 后续规划

更多模型 Tab：无向图、有向图、并查集、线段树、堆等。
# algo-cp-tools
