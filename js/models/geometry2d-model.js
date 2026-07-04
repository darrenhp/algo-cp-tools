/**
 * 二维计算几何数据模型
 * 支持多类几何实体共存：点 points、线段 segments、直线 lines、多边形 polygons、长方形 rectangles。
 * 提供轴对齐包围盒（AABB）与视口范围推导，覆盖所有实体顶点。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  /**
   * @constructor
   * points:     Array<{x,y}>
   * segments:   Array<{a:{x,y}, b:{x,y}, directed:Boolean}>
   * lines:      Array<{a:{x,y}, b:{x,y}}>   两点确定一条直线（无限延伸）
   * polygons:   Array<Array<{x,y}>>         每个多边形为顶点数组
   * rectangles: Array<{a:{x,y}, b:{x,y}}>   对角线两端点（轴对齐长方形）
   */
  function Geometry2DModel() {
    this.points = [];
    this.segments = [];
    this.lines = [];
    this.polygons = [];
    this.rectangles = [];
  }

  Geometry2DModel.prototype.reset = function () {
    this.points = [];
    this.segments = [];
    this.lines = [];
    this.polygons = [];
    this.rectangles = [];
  };

  Geometry2DModel.prototype.setData = function (data) {
    data = data || {};
    this.points = data.points || [];
    this.segments = data.segments || [];
    this.lines = data.lines || [];
    this.polygons = data.polygons || [];
    this.rectangles = data.rectangles || [];
  };

  /** 是否完全没有实体。 */
  Geometry2DModel.prototype.isEmpty = function () {
    return this.points.length === 0 &&
      this.segments.length === 0 &&
      this.lines.length === 0 &&
      this.polygons.length === 0 &&
      this.rectangles.length === 0;
  };

  /** 实体总数（各类相加）。 */
  Geometry2DModel.prototype.size = function () {
    return this.points.length + this.segments.length + this.lines.length +
      this.polygons.length + this.rectangles.length;
  };

  /** 遍历所有实体顶点，调用 fn(p)。 */
  Geometry2DModel.prototype.allVertices = function (fn) {
    var i, j;
    for (i = 0; i < this.points.length; i++) fn(this.points[i]);
    for (i = 0; i < this.segments.length; i++) { fn(this.segments[i].a); fn(this.segments[i].b); }
    for (i = 0; i < this.lines.length; i++) { fn(this.lines[i].a); fn(this.lines[i].b); }
    for (i = 0; i < this.polygons.length; i++) {
      var poly = this.polygons[i];
      for (j = 0; j < poly.length; j++) fn(poly[j]);
    }
    for (i = 0; i < this.rectangles.length; i++) { fn(this.rectangles[i].a); fn(this.rectangles[i].b); }
  };

  /** 顶点总数。 */
  Geometry2DModel.prototype.vertexCount = function () {
    var c = 0;
    this.allVertices(function () { c++; });
    return c;
  };

  /**
   * 轴对齐包围盒（AABB），覆盖所有实体顶点。
   * 返回 {minX,maxX,minY,maxY,width,height,area} 或 null（空）。
   */
  Geometry2DModel.prototype.getAABB = function () {
    var first = true, minX = 0, maxX = 0, minY = 0, maxY = 0;
    this.allVertices(function (p) {
      if (first) { minX = maxX = p.x; minY = maxY = p.y; first = false; return; }
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    if (first) return null;
    var w = maxX - minX, h = maxY - minY;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, width: w, height: h, area: w * h };
  };

  /**
   * 在 AABB 基础上扩展 padding，供渲染器计算 viewBox。
   * 处理退化情况（所有顶点共线/共点）：width/height 为 0 时给默认最小范围。
   */
  Geometry2DModel.prototype.getBounds = function (padding) {
    var aabb = this.getAABB();
    if (!aabb) return null;
    var pad = (padding != null) ? padding : 1;
    var w = aabb.width, h = aabb.height;
    if (w === 0) w = 2;
    if (h === 0) h = 2;
    var minX = aabb.minX - pad, maxX = aabb.maxX + pad;
    var minY = aabb.minY - pad, maxY = aabb.maxY + pad;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, width: maxX - minX, height: maxY - minY };
  };

  /** 计算所有线段总长（用于结果展示）。 */
  Geometry2DModel.prototype.segmentsLength = function () {
    var total = 0;
    for (var i = 0; i < this.segments.length; i++) {
      var s = this.segments[i];
      total += Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    }
    return total;
  };

  /** 计算所有多边形周长。 */
  Geometry2DModel.prototype.polygonsPerimeter = function () {
    var total = 0;
    for (var i = 0; i < this.polygons.length; i++) {
      var poly = this.polygons[i];
      var n = poly.length;
      if (n < 2) continue;
      for (var j = 0; j < n; j++) {
        var a = poly[j], b = poly[(j + 1) % n];
        total += Math.hypot(b.x - a.x, b.y - a.y);
      }
    }
    return total;
  };

  NS.models.Geometry2DModel = Geometry2DModel;
})();
