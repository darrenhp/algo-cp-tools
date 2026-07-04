/**
 * 三维计算几何数据模型
 * 支持多类几何实体共存：点 points、线段 segments、面 faces、立方体 cubes、球体 spheres。
 * 提供轴对齐包围盒（AABB）与视口范围推导，覆盖所有实体顶点（含球体半径扩展）。
 * 坐标系约定：数学惯例 z 向上；渲染时由 renderer 映射到 Three.js 的 Y 向上。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  /**
   * @constructor
   * points:   Array<{x,y,z}>
   * segments: Array<{a:{x,y,z}, b:{x,y,z}, directed:Boolean}>
   * faces:    Array<Array<{x,y,z}>>         每个面为顶点数组（凸多边形，扇形三角化）
   * cubes:    Array<{a:{x,y,z}, b:{x,y,z}}> 对角线两端点（轴对齐长方体）
   * spheres:  Array<{c:{x,y,z}, r:Number}>  球心 c + 半径 r
   */
  function Geometry3DModel() {
    this.points = [];
    this.segments = [];
    this.faces = [];
    this.cubes = [];
    this.spheres = [];
  }

  Geometry3DModel.prototype.reset = function () {
    this.points = [];
    this.segments = [];
    this.faces = [];
    this.cubes = [];
    this.spheres = [];
  };

  Geometry3DModel.prototype.setData = function (data) {
    data = data || {};
    this.points = data.points || [];
    this.segments = data.segments || [];
    this.faces = data.faces || [];
    this.cubes = data.cubes || [];
    this.spheres = data.spheres || [];
  };

  /** 是否完全没有实体。 */
  Geometry3DModel.prototype.isEmpty = function () {
    return this.points.length === 0 &&
      this.segments.length === 0 &&
      this.faces.length === 0 &&
      this.cubes.length === 0 &&
      this.spheres.length === 0;
  };

  /** 实体总数（各类相加）。 */
  Geometry3DModel.prototype.size = function () {
    return this.points.length + this.segments.length +
      this.faces.length + this.cubes.length + this.spheres.length;
  };

  /** 遍历所有实体顶点，调用 fn(p)。球体仅遍历球心（半径在 AABB 中单独处理）。 */
  Geometry3DModel.prototype.allVertices = function (fn) {
    var i, j;
    for (i = 0; i < this.points.length; i++) fn(this.points[i]);
    for (i = 0; i < this.segments.length; i++) { fn(this.segments[i].a); fn(this.segments[i].b); }
    for (i = 0; i < this.faces.length; i++) {
      var face = this.faces[i];
      for (j = 0; j < face.length; j++) fn(face[j]);
    }
    for (i = 0; i < this.cubes.length; i++) { fn(this.cubes[i].a); fn(this.cubes[i].b); }
    for (i = 0; i < this.spheres.length; i++) fn(this.spheres[i].c);
  };

  /** 顶点总数。 */
  Geometry3DModel.prototype.vertexCount = function () {
    var c = 0;
    this.allVertices(function () { c++; });
    return c;
  };

  /**
   * 轴对齐包围盒（AABB），覆盖所有实体顶点；球体按球心±半径扩展。
   * 返回 {minX,maxX,minY,maxY,minZ,maxZ,width,height,depth,volume} 或 null（空）。
   */
  Geometry3DModel.prototype.getAABB = function () {
    var first = true, minX = 0, maxX = 0, minY = 0, maxY = 0, minZ = 0, maxZ = 0;
    this.allVertices(function (p) {
      if (first) {
        minX = maxX = p.x; minY = maxY = p.y; minZ = maxZ = p.z;
        first = false; return;
      }
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    if (first) return null;
    // 球体按球心±半径扩展边界
    for (var i = 0; i < this.spheres.length; i++) {
      var s = this.spheres[i];
      var r = Math.abs(s.r);
      if (s.c.x - r < minX) minX = s.c.x - r;
      if (s.c.x + r > maxX) maxX = s.c.x + r;
      if (s.c.y - r < minY) minY = s.c.y - r;
      if (s.c.y + r > maxY) maxY = s.c.y + r;
      if (s.c.z - r < minZ) minZ = s.c.z - r;
      if (s.c.z + r > maxZ) maxZ = s.c.z + r;
    }
    var w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
    return {
      minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ,
      width: w, height: h, depth: d, volume: w * h * d
    };
  };

  /**
   * 在 AABB 基础上扩展 padding，供渲染器计算相机范围。
   * 处理退化情况（所有顶点共面/共线/共点）：维度为 0 时给默认最小范围。
   */
  Geometry3DModel.prototype.getBounds = function (padding) {
    var aabb = this.getAABB();
    if (!aabb) return null;
    var pad = (padding != null) ? padding : 1;
    var w = aabb.width, h = aabb.height, d = aabb.depth;
    if (w === 0) w = 2;
    if (h === 0) h = 2;
    if (d === 0) d = 2;
    var minX = aabb.minX - pad, maxX = aabb.maxX + pad;
    var minY = aabb.minY - pad, maxY = aabb.maxY + pad;
    var minZ = aabb.minZ - pad, maxZ = aabb.maxZ + pad;
    return {
      minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ,
      width: maxX - minX, height: maxY - minY, depth: maxZ - minZ
    };
  };

  /** 计算所有线段总长（3D 欧氏距离）。 */
  Geometry3DModel.prototype.segmentsLength = function () {
    var total = 0;
    for (var i = 0; i < this.segments.length; i++) {
      var s = this.segments[i];
      var dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, dz = s.b.z - s.a.z;
      total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return total;
  };

  /**
   * 计算所有面的总面积（叉积法）。
   * 对每个凸多边形面，用扇形三角化：以第 0 个顶点为公共点，
   * 对每条三角形 (v0, vi, vi+1) 用叉积取模的一半求面积。
   */
  Geometry3DModel.prototype.facesArea = function () {
    var total = 0;
    for (var i = 0; i < this.faces.length; i++) {
      var face = this.faces[i];
      var n = face.length;
      if (n < 3) continue;
      var v0 = face[0];
      for (var j = 1; j < n - 1; j++) {
        var a = face[j], b = face[j + 1];
        var ux = a.x - v0.x, uy = a.y - v0.y, uz = a.z - v0.z;
        var vx = b.x - v0.x, vy = b.y - v0.y, vz = b.z - v0.z;
        var cx = uy * vz - uz * vy;
        var cy = uz * vx - ux * vz;
        var cz = ux * vy - uy * vx;
        total += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      }
    }
    return total;
  };

  /** 计算所有立方体总体积。 */
  Geometry3DModel.prototype.cubesVolume = function () {
    var total = 0;
    for (var i = 0; i < this.cubes.length; i++) {
      var c = this.cubes[i];
      var w = Math.abs(c.b.x - c.a.x);
      var h = Math.abs(c.b.y - c.a.y);
      var d = Math.abs(c.b.z - c.a.z);
      total += w * h * d;
    }
    return total;
  };

  /** 计算所有球体总体积（4/3·π·r³）。 */
  Geometry3DModel.prototype.spheresVolume = function () {
    var total = 0;
    for (var i = 0; i < this.spheres.length; i++) {
      var r = Math.abs(this.spheres[i].r);
      total += (4 / 3) * Math.PI * r * r * r;
    }
    return total;
  };

  /** 计算所有球体总表面积（4·π·r²）。 */
  Geometry3DModel.prototype.spheresSurfaceArea = function () {
    var total = 0;
    for (var i = 0; i < this.spheres.length; i++) {
      var r = Math.abs(this.spheres[i].r);
      total += 4 * Math.PI * r * r;
    }
    return total;
  };

  NS.models.Geometry3DModel = Geometry3DModel;
})();
