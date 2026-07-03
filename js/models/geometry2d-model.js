/**
 * 二维计算几何数据模型
 * 持有原始点集 points[{x,y}]，提供轴对齐包围盒（AABB）计算与视口范围推导。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  /**
   * @constructor
   * points: Array<{x:Number, y:Number}>
   */
  function Geometry2DModel() {
    this.points = [];
  }

  Geometry2DModel.prototype.reset = function () {
    this.points = [];
  };

  Geometry2DModel.prototype.setData = function (points) {
    this.points = points || [];
  };

  Geometry2DModel.prototype.size = function () {
    return this.points.length;
  };

  /**
   * 轴对齐包围盒（AABB）。
   * O(n) 遍历返回 {minX,maxX,minY,maxY,width,height,area} 或 null（空点集）。
   */
  Geometry2DModel.prototype.getAABB = function () {
    var n = this.points.length;
    if (n === 0) return null;
    var minX = this.points[0].x;
    var maxX = minX;
    var minY = this.points[0].y;
    var maxY = minY;
    for (var i = 1; i < n; i++) {
      var px = this.points[i].x;
      var py = this.points[i].y;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    var w = maxX - minX;
    var h = maxY - minY;
    return {
      minX: minX, maxX: maxX, minY: minY, maxY: maxY,
      width: w, height: h, area: w * h
    };
  };

  /**
   * 在 AABB 基础上扩展 padding，供渲染器计算 viewBox。
   * 处理退化情况（所有点共线/共点）：width/height 为 0 时给默认最小范围。
   * 返回 {minX,maxX,minY,maxY,width,height}，空点集返回 null。
   */
  Geometry2DModel.prototype.getBounds = function (padding) {
    var aabb = this.getAABB();
    if (!aabb) return null;
    var pad = (padding != null) ? padding : 1;
    var w = aabb.width;
    var h = aabb.height;
    // 退化情况：给默认最小范围，避免除零
    if (w === 0) w = 2;
    if (h === 0) h = 2;
    var minX = aabb.minX - pad;
    var maxX = aabb.maxX + pad;
    var minY = aabb.minY - pad;
    var maxY = aabb.maxY + pad;
    return {
      minX: minX, maxX: maxX, minY: minY, maxY: maxY,
      width: maxX - minX, height: maxY - minY
    };
  };

  NS.models.Geometry2DModel = Geometry2DModel;
})();
