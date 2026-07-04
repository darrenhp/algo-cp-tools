/**
 * 三维计算几何输入解析器
 * 支持多类几何实体输入：
 *   1. 点：每行 `x y z`（空格/逗号分隔）
 *   2. 线段：每行 `x1 y1 z1 x2 y2 z2`；行首 `>` 表示有向（箭头指向第二点）
 *   3. 面：每行一个多边形面，平铺 `x1 y1 z1 x2 y2 z2 ... xn yn zn`（至少 3 顶点）
 *   4. 立方体：每行 `x1 y1 z1 x2 y2 z2`（对角线两端点，轴对齐长方体）
 *   5. 球体：每行 `x y z r`（球心 + 半径）
 * 沿用 geometry2d-parsers.js 的注释判断与分隔风格。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  function isComment(line) {
    var t = line.trim();
    return !t || t.charAt(0) === '#' || t.slice(0, 2) === '//';
  }

  function parseNumber(token, lineNo) {
    var num = Number(token);
    if (isNaN(num)) {
      throw new Error('第 ' + (lineNo + 1) + ' 行无法解析为数字: "' + token + '"');
    }
    return num;
  }

  /** 点列表：每行 `x y z`（空格/逗号分隔），# // 注释。 */
  function parsePoints3D(text) {
    var points = [];
    if (!text) return points;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var parts = lines[i].trim().split(/[\s,]+/).filter(Boolean);
      if (parts.length === 0) continue;
      if (parts.length < 3) {
        throw new Error('第 ' + (i + 1) + ' 行至少需要三个数字（x y z）');
      }
      points.push({
        x: parseNumber(parts[0], i),
        y: parseNumber(parts[1], i),
        z: parseNumber(parts[2], i)
      });
    }
    return points;
  }

  /**
   * 线段：每行 `x1 y1 z1 x2 y2 z2`；行首 `>` 表示有向（箭头指向第二点）。
   */
  function parseSegments3D(text) {
    var result = [];
    if (!text) return result;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (isComment(raw)) continue;
      var trimmed = raw.trim();
      if (trimmed === '') continue;
      var directed = false;
      if (trimmed.charAt(0) === '>') {
        directed = true;
        trimmed = trimmed.slice(1).trim();
      }
      var parts = trimmed.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 6) {
        throw new Error('第 ' + (i + 1) + ' 行需要六个数字（x1 y1 z1 x2 y2 z2）');
      }
      result.push({
        a: {
          x: parseNumber(parts[0], i),
          y: parseNumber(parts[1], i),
          z: parseNumber(parts[2], i)
        },
        b: {
          x: parseNumber(parts[3], i),
          y: parseNumber(parts[4], i),
          z: parseNumber(parts[5], i)
        },
        directed: directed
      });
    }
    return result;
  }

  /**
   * 面：每行一个多边形面，平铺 `x1 y1 z1 x2 y2 z2 ... xn yn zn`。
   * 至少 9 个数字（3 个顶点），token 数必须为 3 的倍数。
   */
  function parseFaces3D(text) {
    var faces = [];
    if (!text) return faces;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var trimmed = lines[i].trim();
      if (trimmed === '') continue;
      var parts = trimmed.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 9) {
        throw new Error('第 ' + (i + 1) + ' 行至少需要 9 个数字（3 个顶点 x1 y1 z1 x2 y2 z2 x3 y3 z3）');
      }
      if (parts.length % 3 !== 0) {
        throw new Error('第 ' + (i + 1) + ' 行坐标数量不是 3 的倍数，每顶点 x y z 三个数');
      }
      var face = [];
      for (var j = 0; j < parts.length; j += 3) {
        face.push({
          x: parseNumber(parts[j], i),
          y: parseNumber(parts[j + 1], i),
          z: parseNumber(parts[j + 2], i)
        });
      }
      faces.push(face);
    }
    return faces;
  }

  /**
   * 立方体：每行 `x1 y1 z1 x2 y2 z2`（对角线两端点，轴对齐长方体）。
   */
  function parseCubes3D(text) {
    var result = [];
    if (!text) return result;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var trimmed = lines[i].trim();
      if (trimmed === '') continue;
      var parts = trimmed.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 6) {
        throw new Error('第 ' + (i + 1) + ' 行需要六个数字（x1 y1 z1 x2 y2 z2）');
      }
      result.push({
        a: {
          x: parseNumber(parts[0], i),
          y: parseNumber(parts[1], i),
          z: parseNumber(parts[2], i)
        },
        b: {
          x: parseNumber(parts[3], i),
          y: parseNumber(parts[4], i),
          z: parseNumber(parts[5], i)
        }
      });
    }
    return result;
  }

  /**
   * 球体：每行 `x y z r`（球心 + 半径）。
   * 需要 4 个数字，半径为负数时取绝对值。
   */
  function parseSpheres3D(text) {
    var result = [];
    if (!text) return result;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var trimmed = lines[i].trim();
      if (trimmed === '') continue;
      var parts = trimmed.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 4) {
        throw new Error('第 ' + (i + 1) + ' 行需要四个数字（x y z r）');
      }
      result.push({
        c: {
          x: parseNumber(parts[0], i),
          y: parseNumber(parts[1], i),
          z: parseNumber(parts[2], i)
        },
        r: Math.abs(parseNumber(parts[3], i))
      });
    }
    return result;
  }

  /** 由各类实体数据构建 Geometry3DModel。 */
  function buildModel(data) {
    var model = new NS.models.Geometry3DModel();
    model.setData(data);
    return model;
  }

  NS.parsers.geometry3dParsers = {
    parsePoints3D: parsePoints3D,
    parseSegments3D: parseSegments3D,
    parseFaces3D: parseFaces3D,
    parseCubes3D: parseCubes3D,
    parseSpheres3D: parseSpheres3D,
    buildModel: buildModel
  };
})();
