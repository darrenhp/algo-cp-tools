/**
 * 二维计算几何输入解析器
 * 支持多类几何实体输入：
 *   1. 点列表：每行 `x y`（空格/逗号分隔）
 *   2. xy 数组：第一行 x 数组，第二行 y 数组
 *   3. 线段：每行 `x1 y1 x2 y2`；行首 `>` 表示有向（箭头指向第二点）
 *   4. 直线：每行 `x1 y1 x2 y2`（两点确定直线，无限延伸）
 *   5. 多边形：空行分隔多个多边形；每个多边形每行一个顶点 `x y`
 *   6. 长方形：每行 `x1 y1 x2 y2`（对角线两端点，轴对齐）
 *   7. 圆：每行 `cx cy r`（圆心与半径，半径可为负但按绝对值处理）
 * 沿用 tree-parsers.js / array-parsers.js 的注释判断与分隔风格。
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

  /** 点列表：每行 `x y`（空格/逗号分隔），# // 注释。 */
  function parsePointsList(text) {
    var points = [];
    if (!text) return points;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var parts = lines[i].trim().split(/[\s,]+/).filter(Boolean);
      if (parts.length === 0) continue;
      if (parts.length < 2) {
        throw new Error('第 ' + (i + 1) + ' 行至少需要两个数字（x y）');
      }
      var x = parseNumber(parts[0], i);
      var y = parseNumber(parts[1], i);
      points.push({ x: x, y: y });
    }
    return points;
  }

  /** xy 数组：第一行 x 数组，第二行 y 数组，长度需相等。 */
  function parseXYArrays(text) {
    if (!text) return [];
    var lines = text.split(/\r?\n/);
    var dataLines = [];
    var lineNos = [];
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      if (lines[i].trim() === '') continue;
      dataLines.push(lines[i]);
      lineNos.push(i);
      if (dataLines.length >= 2) break;
    }
    if (dataLines.length === 0) return [];
    if (dataLines.length < 2) {
      throw new Error('xy 数组模式需要两行：第一行 x 数组，第二行 y 数组');
    }
    var xs = dataLines[0].trim().split(/[\s,]+/).filter(Boolean);
    var ys = dataLines[1].trim().split(/[\s,]+/).filter(Boolean);
    if (xs.length !== ys.length) {
      throw new Error('x 数组长度(' + xs.length + ')与 y 数组长度(' + ys.length + ')不一致');
    }
    var points = [];
    for (var j = 0; j < xs.length; j++) {
      points.push({
        x: parseNumber(xs[j], lineNos[0]),
        y: parseNumber(ys[j], lineNos[1])
      });
    }
    return points;
  }

  /**
   * 线段/直线/长方形：每行 `x1 y1 x2 y2`。
   * 线段支持行首 `>` 前缀表示有向。
   * type: 'segment' | 'line' | 'rect'
   */
  function parseQuadTokens(text, type) {
    var result = [];
    if (!text) return result;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (isComment(raw)) continue;
      var trimmed = raw.trim();
      if (trimmed === '') continue;
      var directed = false;
      if (type === 'segment' && trimmed.charAt(0) === '>') {
        directed = true;
        trimmed = trimmed.slice(1).trim();
      }
      var parts = trimmed.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 4) {
        throw new Error('第 ' + (i + 1) + ' 行需要四个数字（x1 y1 x2 y2）');
      }
      var x1 = parseNumber(parts[0], i);
      var y1 = parseNumber(parts[1], i);
      var x2 = parseNumber(parts[2], i);
      var y2 = parseNumber(parts[3], i);
      var a = { x: x1, y: y1 }, b = { x: x2, y: y2 };
      if (type === 'segment') {
        result.push({ a: a, b: b, directed: directed });
      } else {
        result.push({ a: a, b: b });
      }
    }
    return result;
  }

  function parseSegments(text) { return parseQuadTokens(text, 'segment'); }
  function parseLines(text) { return parseQuadTokens(text, 'line'); }
  function parseRectangles(text) { return parseQuadTokens(text, 'rect'); }

  /**
   * 圆：每行 `cx cy r`（圆心坐标与半径）。
   * 半径解析为数字，渲染时按绝对值处理（负值视为正）。
   */
  function parseCircles(text) {
    var circles = [];
    if (!text) return circles;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var trimmed = lines[i].trim();
      if (trimmed === '') continue;
      var parts = trimmed.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 3) {
        throw new Error('第 ' + (i + 1) + ' 行需要三个数字（cx cy r）');
      }
      var cx = parseNumber(parts[0], i);
      var cy = parseNumber(parts[1], i);
      var r = parseNumber(parts[2], i);
      circles.push({ cx: cx, cy: cy, r: r });
    }
    return circles;
  }

  /**
   * 多边形：每行一个多边形，平铺 `x1 y1 x2 y2 ... xn yn`。
   * 至少 6 个数字（3 个顶点），token 数必须为偶数。
   */
  function parsePolygons(text) {
    var polygons = [];
    if (!text) return polygons;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var trimmed = lines[i].trim();
      if (trimmed === '') continue;
      var parts = trimmed.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 6) {
        throw new Error('第 ' + (i + 1) + ' 行至少需要 6 个数字（3 个顶点 x1 y1 x2 y2 x3 y3）');
      }
      if (parts.length % 2 !== 0) {
        throw new Error('第 ' + (i + 1) + ' 行坐标数量为奇数，应为偶数（每顶点 x y 两个数）');
      }
      var poly = [];
      for (var j = 0; j < parts.length; j += 2) {
        poly.push({ x: parseNumber(parts[j], i), y: parseNumber(parts[j + 1], i) });
      }
      polygons.push(poly);
    }
    return polygons;
  }

  /** 由各类实体数据构建 Geometry2DModel。 */
  function buildModel(data) {
    var model = new NS.models.Geometry2DModel();
    model.setData(data);
    return model;
  }

  NS.parsers.geometry2dParsers = {
    parsePointsList: parsePointsList,
    parseXYArrays: parseXYArrays,
    parseSegments: parseSegments,
    parseLines: parseLines,
    parsePolygons: parsePolygons,
    parseRectangles: parseRectangles,
    parseCircles: parseCircles,
    buildModel: buildModel
  };
})();
