/**
 * 有根树布局算法（供 TikZ 渲染器使用）
 * 采用「叶子按从左到右顺序分配整数 x，内部节点居于子节点中点」的经典布局。
 * y 坐标为深度（根为 0），渲染时翻转方向使树向下生长。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  /**
   * @param {string|number} rootId
   * @param {Object} childrenMap id -> [child ids]
   * @returns {Object} id -> { x, y }
   */
  function computeLayout(rootId, childrenMap) {
    var positions = {};
    var nextX = 0;

    function assign(node, depth) {
      var children = (childrenMap[node] || []).slice();
      if (children.length === 0) {
        positions[node] = { x: nextX, y: depth };
        nextX += 1;
        return;
      }
      for (var i = 0; i < children.length; i++) {
        assign(children[i], depth + 1);
      }
      var first = positions[children[0]].x;
      var last = positions[children[children.length - 1]].x;
      positions[node] = { x: (first + last) / 2, y: depth };
    }

    if (rootId == null || !childrenMap) return positions;
    assign(rootId, 0);
    return positions;
  }

  NS.utils.treeLayout = { computeLayout: computeLayout };
})();
