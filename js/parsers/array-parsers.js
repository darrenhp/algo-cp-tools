/**
 * 一维数组输入解析器
 * 支持空格/逗号/换行分隔的数字数组，支持 # 与 // 注释。
 * 沿用 tree-parsers.js 的注释判断风格。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  function isComment(line) {
    var t = line.trim();
    return !t || t.charAt(0) === '#' || t.slice(0, 2) === '//';
  }

  /**
   * 将输入文本解析为数字数组。
   * 支持空格、逗号、换行混合分隔；忽略 # 与 // 开头的注释行。
   * 非法 token 会导致抛出错误。
   * @param {string} text
   * @returns {number[]}
   */
  function parseArray(text) {
    if (!text) return [];
    var lines = text.split(/\r?\n/);
    var tokens = [];
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var parts = lines[i].trim().split(/[\s,]+/).filter(Boolean);
      for (var j = 0; j < parts.length; j++) {
        var num = Number(parts[j]);
        if (isNaN(num)) {
          throw new Error('第 ' + (i + 1) + ' 行无法解析为数字: "' + parts[j] + '"');
        }
        tokens.push(num);
      }
    }
    return tokens;
  }

  NS.parsers.arrayParsers = { parseArray: parseArray };
})();
