/**
 * 图输入解析器
 * 支持四种输入方式：边集合、父节点数组、邻接表、邻接矩阵。
 * 统一产出边集合 { from, to }，再由 buildModel 构建 TreeModel。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  function isComment(line) {
    var t = line.trim();
    return !t || t.charAt(0) === '#' || t.slice(0, 2) === '//';
  }

  /**
   * 边集合：每行 `u v [attr1 attr2 ...]`（空格/逗号分隔）。
   * 前2个为 from→to，其余依次为该边的属性值。
   */
  function parseEdges(text) {
    var edges = [];
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var parts = lines[i].trim().split(/[\s,]+/).filter(Boolean);
      if (parts.length < 2) continue;
      edges.push({ from: parts[0], to: parts[1], attrs: parts.slice(2) });
    }
    return edges;
  }

  /**
   * 父节点数组：空格/逗号分隔，跳过根节点。
   * 第 i 个值（从 0 开始）为节点 (base+i+1) 的父节点。
   * base = root（root=1 → 节点 2,3,…；root=0 → 节点 1,2,…）。
   */
  function parseParent(text, root) {
    var base = Number(root);
    if (isNaN(base)) base = 1;
    var tokens = text.split(/[\s,]+/).filter(Boolean);
    var edges = [];
    for (var i = 0; i < tokens.length; i++) {
      var node = String(base + i + 1); // 跳过根节点 base
      var p = tokens[i].trim();
      if (p === '') continue;
      edges.push({ from: p, to: node });
    }
    return edges;
  }

  /**
   * 邻接表：每行对应一个节点（按顺序从 base 开始），
   * 格式为 `k v1 v2 ... vk`，k 为子节点数量，后跟 k 个子节点编号。
   * base = root（root=1 → 第一行对应节点 1，root=0 → 第一行对应节点 0）。
   */
  function parseChildren(text, root) {
    var base = Number(root);
    if (isNaN(base)) base = 1;
    var edges = [];
    var lines = text.split(/\r?\n/);
    var lineIdx = 0;
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var parts = lines[i].trim().split(/[\s,]+/).filter(Boolean);
      if (parts.length === 0) continue;
      var count = Number(parts[0]);
      if (isNaN(count)) continue;
      var node = String(base + lineIdx);
      for (var j = 1; j <= count && j < parts.length; j++) {
        edges.push({ from: node, to: parts[j] });
      }
      lineIdx++;
    }
    return edges;
  }

  /**
   * 邻接矩阵：支持全矩阵、上三角、下三角三种模式。
   * 数值表示边权：0=无边，1=普通边，其他值=带权边（自动生成 attr1 字段）。
   * mode: 'full'（全矩阵）| 'upper'（上三角，对角线下方）| 'lower'（下三角，对角线上方）
   * base = root。
   *
   * 全矩阵：第 i 行第 j 列 = (base+i)→(base+j) 的边权。
   * 下三角（对角线上方，i<j）：第 i 行为 D(i,i+1) D(i,i+2) … D(i,N)。
   * 上三角（对角线下方，i>j）：第 i 行为 D(i+1,0) D(i+1,1) … D(i+1,i)。
   */
  function parseAdjMatrix(text, root, mode) {
    mode = mode || 'full';
    var base = Number(root);
    if (isNaN(base)) base = 1;
    var edges = [];
    var lines = text.split(/\r?\n/);
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var parts = lines[i].trim().split(/[\s,]+/).filter(Boolean);
      if (parts.length === 0) continue;
      rows.push(parts);
    }

    function addEdge(fromIdx, toIdx, valStr) {
      var val = Number(valStr);
      if (isNaN(val) || val === 0) return;
      var from = String(base + fromIdx);
      var to = String(base + toIdx);
      if (val === 1) {
        edges.push({ from: from, to: to });
      } else {
        edges.push({ from: from, to: to, attrs: [String(val)] });
      }
    }

    if (mode === 'lower') {
      // 下三角（对角线上方，i<j）：第 i 行包含 D(i, i+1), D(i, i+2), …, D(i, N-1)
      for (var i = 0; i < rows.length; i++) {
        for (var j = 0; j < rows[i].length; j++) {
          addEdge(i, i + 1 + j, rows[i][j]);
        }
      }
    } else if (mode === 'upper') {
      // 上三角（对角线下方，i>j）：第 i 行包含 D(i+1, 0), D(i+1, 1), …, D(i+1, i)
      for (var i = 0; i < rows.length; i++) {
        for (var j = 0; j < rows[i].length; j++) {
          addEdge(i + 1, j, rows[i][j]);
        }
      }
    } else {
      // 全矩阵
      for (var i = 0; i < rows.length; i++) {
        for (var j = 0; j < rows[i].length; j++) {
          addEdge(i, j, rows[i][j]);
        }
      }
    }

    return edges;
  }

  /**
   * 节点属性解析：每行一个属性，格式为 `属性名 值1 值2 … 值n`。
   * 第 j 个值（从 0 开始）对应节点 (base+j)，base=root。
   * 属性值可为任意不含空格的字符串。多行表示多个属性。
   * 返回 { nodeId: { attrName: attrValue, ... }, ... }。
   */
  function parseNodeAttrs(text, root) {
    var base = Number(root);
    if (isNaN(base)) base = 1;
    var result = {};
    if (!text || !text.trim()) return result;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var parts = lines[i].trim().split(/[\s,]+/).filter(Boolean);
      if (parts.length < 2) continue;
      var attrName = parts[0];
      var values = parts.slice(1);
      for (var j = 0; j < values.length; j++) {
        var nodeId = String(base + j);
        if (!result[nodeId]) result[nodeId] = {};
        result[nodeId][attrName] = values[j];
      }
    }
    return result;
  }

  /**
   * 由边集合与根节点构建 TreeModel。
   * 边可携带 attrs 数组，依次对应自动生成的 attr1/attr2… 字段。
   * nodeAttrs 为 parseNodeAttrs 返回的映射，按属性名添加节点字段并赋值。
   */
  function buildModel(edges, root, nodeAttrs) {
    var model = new NS.models.TreeModel();
    model.root = root;
    var nodeSet = {};
    nodeSet[root] = true;
    edges.forEach(function (e) { nodeSet[e.from] = true; nodeSet[e.to] = true; });
    Object.keys(nodeSet).forEach(function (id) { model.addNode(id); });

    model.ensureIdFields();

    // 推断边属性字段数量并自动生成字段名 attr1, attr2…
    var maxAttrs = 0;
    edges.forEach(function (e) {
      if (e.attrs && e.attrs.length > maxAttrs) maxAttrs = e.attrs.length;
    });
    var edgeFieldNames = [];
    for (var j = 0; j < maxAttrs; j++) {
      edgeFieldNames.push('attr' + (j + 1));
    }
    edgeFieldNames.forEach(function (name) { model.addEdgeField(name); });

    // 添加边并应用边属性
    edges.forEach(function (e) {
      var edge = model.addEdge(e.from, e.to);
      if (e.attrs) {
        edgeFieldNames.forEach(function (name, idx) {
          if (idx < e.attrs.length) {
            edge.attributes[name] = e.attrs[idx];
          }
        });
      }
    });

    // 应用节点属性
    if (nodeAttrs) {
      Object.keys(nodeAttrs).forEach(function (nodeId) {
        var node = model.nodes.get(nodeId);
        if (!node) return;
        Object.keys(nodeAttrs[nodeId]).forEach(function (attrName) {
          if (!model.nodeAttributeFields.some(function (f) { return f.name === attrName; })) {
            model.addNodeField(attrName);
          }
          node.attributes[attrName] = nodeAttrs[nodeId][attrName];
        });
      });
    }

    return model;
  }

  NS.parsers.treeParsers = {
    parseEdges: parseEdges,
    parseParent: parseParent,
    parseChildren: parseChildren,
    parseAdjMatrix: parseAdjMatrix,
    parseNodeAttrs: parseNodeAttrs,
    buildModel: buildModel
  };
})();
