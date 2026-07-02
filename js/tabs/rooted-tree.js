/**
 * 有根树 Tab 控制器
 * 负责 DOM 绑定、解析调度、属性字段/表格渲染、渲染器切换。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;
  var P = NS.parsers.treeParsers;
  var renderers = {
    mermaid: NS.renderers.mermaidRenderer,
    graphviz: NS.renderers.graphvizRenderer,
    tikz: NS.renderers.tikzRenderer
  };

  function makeTh(text) {
    var th = document.createElement('th');
    th.textContent = text;
    return th;
  }

  var STORAGE_KEY = 'algoCpTools.rootedTree';
  var SESSION_KEY = 'algoCpTools.rootedTree.session';

  function RootedTreeTab(rootEl) {
    this.rootEl = rootEl;
    this.model = null;
    this.inputMode = 'edges';
    this.rendererName = 'mermaid';
    this._savedFieldVis = null; // 解析后恢复字段可见性
    this.cacheDom();
    this.bindEvents();
    var saved = this.loadState();
    if (saved) {
      this.applyState(saved);
    } else {
      this.loadSample();
    }
    this.parse();
    this.bindPersistEvents();
  }

  /** 收集当前 UI 状态。 */
  RootedTreeTab.prototype.collectState = function () {
    var fieldVis = null;
    if (this.model) {
      fieldVis = {
        node: {},
        edge: {}
      };
      this.model.nodeAttributeFields.forEach(function (f) { fieldVis.node[f.name] = f.visible; });
      this.model.edgeAttributeFields.forEach(function (f) { fieldVis.edge[f.name] = f.visible; });
    }
    return {
      inputMode: this.inputMode,
      inputText: this.inputText.value,
      root: this.rootInput.value,
      nodeAttrsText: this.nodeAttrsText.value,
      rendererName: this.rendererSel.value,
      autoRender: this.autoRenderChk.checked,
      fieldVis: fieldVis
    };
  };

  /** 同时写入 sessionStorage 和 localStorage。 */
  RootedTreeTab.prototype.saveState = function () {
    var data;
    try {
      data = JSON.stringify(this.collectState());
    } catch (e) { return; }
    try { sessionStorage.setItem(SESSION_KEY, data); } catch (e) {}
    try { localStorage.setItem(STORAGE_KEY, data); } catch (e) {}
  };

  /** 读取状态：优先 sessionStorage，回退 localStorage。 */
  RootedTreeTab.prototype.loadState = function () {
    var raw = null;
    try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) {
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };

  /** 将保存的状态应用到 UI。 */
  RootedTreeTab.prototype.applyState = function (saved) {
    if (saved.inputMode != null) {
      this.setInputMode(saved.inputMode);
    }
    if (saved.inputText != null) this.inputText.value = saved.inputText;
    if (saved.root != null) this.rootInput.value = saved.root;
    if (saved.nodeAttrsText != null) this.nodeAttrsText.value = saved.nodeAttrsText;
    if (saved.rendererName != null) {
      this.rendererName = saved.rendererName;
      this.rendererSel.value = saved.rendererName;
    }
    if (saved.autoRender != null) this.autoRenderChk.checked = saved.autoRender;
    this._savedFieldVis = saved.fieldVis || null;
  };

  /** 清除 sessionStorage 和 localStorage 中的状态。 */
  RootedTreeTab.prototype.clearStorage = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };

  /** 清理：清空存储、重置为示例并重新渲染。 */
  RootedTreeTab.prototype.clearAll = function () {
    this.clearStorage();
    this._savedFieldVis = null;
    this.loadSample();
    this.parse();
  };

  /** 恢复保存的字段可见性（解析后调用）。 */
  RootedTreeTab.prototype.restoreFieldVisibility = function () {
    var fv = this._savedFieldVis;
    if (!fv || !this.model) return;
    if (fv.node) {
      this.model.nodeAttributeFields.forEach(function (f) {
        if (fv.node[f.name] != null) f.visible = fv.node[f.name];
      });
    }
    if (fv.edge) {
      this.model.edgeAttributeFields.forEach(function (f) {
        if (fv.edge[f.name] != null) f.visible = fv.edge[f.name];
      });
    }
    this._savedFieldVis = null;
  };

  /** 为输入控件绑定持久化事件。 */
  RootedTreeTab.prototype.bindPersistEvents = function () {
    var self = this;
    var inputs = [this.inputText, this.rootInput, this.nodeAttrsText];
    inputs.forEach(function (el) {
      el.addEventListener('input', function () { self.saveState(); });
    });
    var selects = [this.rendererSel];
    selects.forEach(function (el) {
      el.addEventListener('change', function () { self.saveState(); });
    });
    this.autoRenderChk.addEventListener('change', function () { self.saveState(); });
    this.inputTabsEl.addEventListener('click', function () { self.saveState(); });
  };

  RootedTreeTab.prototype.cacheDom = function () {
    var el = this.rootEl;
    this.inputTabsEl = el.querySelector('#rt-input-tabs');
    this.inputText = el.querySelector('#rt-input-text');
    this.rootInput = el.querySelector('#rt-root');
    this.parseBtn = el.querySelector('#rt-parse-btn');
    this.parseStatus = el.querySelector('#rt-parse-status');
    this.nodeAttrsText = el.querySelector('#rt-node-attrs-text');

    this.nodeFieldsEl = el.querySelector('#rt-node-fields');
    this.edgeFieldsEl = el.querySelector('#rt-edge-fields');
    this.addNodeFieldBtn = el.querySelector('#rt-add-node-field');
    this.addEdgeFieldBtn = el.querySelector('#rt-add-edge-field');
    this.nodeTableWrap = el.querySelector('#rt-node-table-wrap');
    this.edgeTableWrap = el.querySelector('#rt-edge-table-wrap');

    this.rendererSel = el.querySelector('#rt-renderer');
    this.renderBtn = el.querySelector('#rt-render-btn');
    this.autoRenderChk = el.querySelector('#rt-auto-render');
    this.graphOutput = el.querySelector('#rt-graph-output');
    this.codeOutput = el.querySelector('#rt-code-output');
    this.clearBtn = el.querySelector('#rt-clear-btn');
  };

  RootedTreeTab.prototype.bindEvents = function () {
    var self = this;
    this.parseBtn.addEventListener('click', function () { self.parse(); });
    this.inputTabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.input-tab-btn');
      if (!btn) return;
      self.setInputMode(btn.getAttribute('data-input-mode'));
    });
    this.renderBtn.addEventListener('click', function () { self.render(); });
    this.rendererSel.addEventListener('change', function () {
      self.rendererName = self.rendererSel.value;
      if (self.autoRenderChk.checked) self.render();
    });
    this.addNodeFieldBtn.addEventListener('click', function () { self.promptAddNodeField(); });
    this.addEdgeFieldBtn.addEventListener('click', function () { self.promptAddEdgeField(); });
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', function () { self.clearAll(); });
    }
  };

  /** 切换输入方式选项卡。 */
  RootedTreeTab.prototype.setInputMode = function (mode) {
    this.inputMode = mode;
    var btns = this.inputTabsEl.querySelectorAll('.input-tab-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-input-mode') === mode) {
        btns[i].classList.add('active');
      } else {
        btns[i].classList.remove('active');
      }
    }
    this.updatePlaceholder();
  };

  RootedTreeTab.prototype.updatePlaceholder = function () {
    var placeholders = {
      edges: '每行一条边：u v [attr1 attr2 …]\n前2个数字为 父→子，其余依次为边属性\n例如：\n1 2\n1 3\n2 4 heavy\n2 5 light',
      parent: '空格或逗号分隔的父节点数组（跳过根节点）\n第 i 个值为节点 (base+i+1) 的父节点\nbase=根节点值（1 或 0）\n例如（根=1，7节点）：\n1 1 2 2 3 3',
      children: '邻接表格式：每行 k v1 v2 … vk\n第 i 行对应节点 (base+i)，base=根节点值\nk=子节点数量，后跟 k 个子节点\n例如（根=1，7 节点）：\n2 2 3\n2 4 5\n2 6 7\n0\n0\n0\n0'
    };
    this.inputText.placeholder = placeholders[this.inputMode] || '';
  };

  RootedTreeTab.prototype.loadSample = function () {
    this.setInputMode('edges');
    this.updatePlaceholder();
    this.inputText.value = '1 2\n1 3\n2 4\n2 5\n3 6\n3 7';
    this.rootInput.value = '1';
    this.nodeAttrsText.value = '';
  };

  RootedTreeTab.prototype.parse = function () {
    var text = this.inputText.value;
    var root = (this.rootInput.value || '').trim() || '1';
    var edges;
    try {
      if (this.inputMode === 'edges') edges = P.parseEdges(text);
      else if (this.inputMode === 'parent') edges = P.parseParent(text, root);
      else edges = P.parseChildren(text, root);
    } catch (e) {
      this.setParseStatus('解析失败: ' + e.message, true);
      return;
    }
    var nodeAttrs = P.parseNodeAttrs(this.nodeAttrsText.value, root);
    this.model = P.buildModel(edges, root, nodeAttrs);
    this.restoreFieldVisibility();
    this.setParseStatus('解析成功：' + this.model.nodes.size + ' 个节点，' + this.model.edges.length + ' 条边。', false);
    this.renderFields();
    this.renderTables();
    this.saveState();
    if (this.autoRenderChk.checked) this.render();
  };

  RootedTreeTab.prototype.setParseStatus = function (msg, isError) {
    this.parseStatus.textContent = msg;
    this.parseStatus.className = 'rt-status' + (isError ? ' rt-status-error' : ' rt-status-ok');
  };

  RootedTreeTab.prototype.renderFields = function () {
    this.renderFieldList(this.nodeFieldsEl, this.model.nodeAttributeFields, 'node');
    this.renderFieldList(this.edgeFieldsEl, this.model.edgeAttributeFields, 'edge');
  };

  RootedTreeTab.prototype.renderFieldList = function (container, fields, kind) {
    var self = this;
    container.innerHTML = '';
    fields.forEach(function (f) {
      var row = document.createElement('label');
      row.className = 'field-row';

      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = f.visible;
      chk.addEventListener('change', function () {
        if (kind === 'node') self.model.setNodeFieldVisible(f.name, chk.checked);
        else self.model.setEdgeFieldVisible(f.name, chk.checked);
        self.saveState();
        if (self.autoRenderChk.checked) self.render();
      });
      row.appendChild(chk);

      var name = document.createElement('span');
      name.className = 'field-name';
      name.textContent = f.name + (f.autoGenerated ? ' (auto)' : '');
      row.appendChild(name);

      if (!f.autoGenerated) {
        var rm = document.createElement('button');
        rm.className = 'icon-btn field-remove-btn';
        rm.textContent = '×';
        rm.title = '删除字段 ' + f.name;
        rm.addEventListener('click', function () {
          if (kind === 'node') self.model.removeNodeField(f.name);
          else self.model.removeEdgeField(f.name);
          self.renderFields();
          self.renderTables();
          if (self.autoRenderChk.checked) self.render();
        });
        row.appendChild(rm);
      }
      container.appendChild(row);
    });
  };

  RootedTreeTab.prototype.promptAddNodeField = function () {
    var name = prompt('输入节点属性字段名称：');
    if (name && name.trim()) {
      this.model.addNodeField(name.trim());
      this.renderFields();
      this.renderTables();
      this.saveState();
      if (this.autoRenderChk.checked) this.render();
    }
  };

  RootedTreeTab.prototype.promptAddEdgeField = function () {
    var name = prompt('输入边属性字段名称：');
    if (name && name.trim()) {
      this.model.addEdgeField(name.trim());
      this.renderFields();
      this.renderTables();
      this.saveState();
      if (this.autoRenderChk.checked) this.render();
    }
  };

  RootedTreeTab.prototype.renderTables = function () {
    this.renderNodeTable();
    this.renderEdgeTable();
  };

  RootedTreeTab.prototype.renderNodeTable = function () {
    var self = this;
    var wrap = this.nodeTableWrap;
    wrap.innerHTML = '';
    if (!this.model || this.model.nodes.size === 0) {
      wrap.textContent = '无节点';
      return;
    }
    var table = document.createElement('table');
    table.className = 'attr-table';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    headRow.appendChild(makeTh('节点'));
    this.model.nodeAttributeFields.forEach(function (f) {
      headRow.appendChild(makeTh(f.name + (f.autoGenerated ? ' ⓘ' : '')));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var ids = this.model.getAllNodeIds().sort(function (a, b) { return Number(a) - Number(b); });
    ids.forEach(function (id) {
      var node = self.model.nodes.get(id);
      var tr = document.createElement('tr');
      var tdId = document.createElement('td');
      tdId.className = 'attr-id-cell';
      tdId.textContent = id;
      tr.appendChild(tdId);
      self.model.nodeAttributeFields.forEach(function (f) {
        var td = document.createElement('td');
        var input = document.createElement('input');
        input.type = 'text';
        input.value = (node.attributes[f.name] != null) ? node.attributes[f.name] : '';
        input.disabled = f.autoGenerated;
        input.addEventListener('input', function () {
          node.attributes[f.name] = input.value;
          if (self.autoRenderChk.checked) self.render();
        });
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  };

  RootedTreeTab.prototype.renderEdgeTable = function () {
    var self = this;
    var wrap = this.edgeTableWrap;
    wrap.innerHTML = '';
    if (!this.model || this.model.edges.length === 0) {
      wrap.textContent = '无边';
      return;
    }
    var table = document.createElement('table');
    table.className = 'attr-table';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    headRow.appendChild(makeTh('from'));
    headRow.appendChild(makeTh('to'));
    this.model.edgeAttributeFields.forEach(function (f) {
      headRow.appendChild(makeTh(f.name + (f.autoGenerated ? ' ⓘ' : '')));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    this.model.edges.forEach(function (edge) {
      var tr = document.createElement('tr');
      var tdFrom = document.createElement('td');
      tdFrom.className = 'attr-id-cell';
      tdFrom.textContent = edge.from;
      tr.appendChild(tdFrom);
      var tdTo = document.createElement('td');
      tdTo.className = 'attr-id-cell';
      tdTo.textContent = edge.to;
      tr.appendChild(tdTo);
      self.model.edgeAttributeFields.forEach(function (f) {
        var td = document.createElement('td');
        var input = document.createElement('input');
        input.type = 'text';
        input.value = (edge.attributes[f.name] != null) ? edge.attributes[f.name] : '';
        input.disabled = f.autoGenerated;
        input.addEventListener('input', function () {
          edge.attributes[f.name] = input.value;
          if (self.autoRenderChk.checked) self.render();
        });
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  };

  RootedTreeTab.prototype.render = function () {
    if (!this.model) return;
    var renderer = renderers[this.rendererName];
    if (!renderer) return;
    var self = this;
    this.codeOutput.textContent = '';
    renderer.render(this.model, this.graphOutput).then(function (code) {
      self.codeOutput.textContent = code;
    });
  };

  NS.tabs.RootedTreeTab = RootedTreeTab;
})();
