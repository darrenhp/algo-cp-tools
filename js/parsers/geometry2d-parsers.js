/**
 * 二维计算几何输入解析器
 * 支持两种输入方式：
 *   1. 点列表：每行 `x y`（空格/逗号分隔）
 *   2. xy 数组：第一行为 x 数组，第二行为 y 数组
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

  /**
   * 点列表：每行 `x y`（空格/逗号分隔），# // 注释。
   * 每行至少两个 token，取前两列为 x/y，多余忽略。
   * 空行/注释行跳过。
   */
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

  /**
   * xy 数组：第一行 x 数组，第二行 y 数组。
   * 取前两行非注释行；两行长度必须相等，否则抛错。
   */
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

  /** 由点集构建 Geometry2DModel。 */
  function buildModel(points) {
    var model = new NS.models.Geometry2DModel();
    model.setData(points);
    return model;
  }

  NS.parsers.geometry2dParsers = {
    parsePointsList: parsePointsList,
    parseXYArrays: parseXYArrays,
    buildModel: buildModel
  };
})();
