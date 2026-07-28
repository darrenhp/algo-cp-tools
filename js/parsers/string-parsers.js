/**
 * 字符串模块输入解析器
 * - parseString(text)：将多行文本拼接为单个字符串（保留有效字符，支持 # / // 注释行）
 * - parsePatterns(text)：每行一个模式串（忽略空行与注释行），用于 AC 自动机
 * 沿用 array-parsers.js 的 isComment 风格。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  function isComment(line) {
    var t = line.trim();
    return !t || t.charAt(0) === '#' || t.slice(0, 2) === '//';
  }

  /**
   * 将输入文本解析为单个字符串。
   * - 多行自动拼接（去首尾空白），跳过 # / // 注释行
   * - 行内空白保留为单个空格（便于输入含空格的串时可控制）
   *   注：为避免歧义，默认对每行做 trim 后直接拼接（不插入分隔符），
   *   这样 "ab\ncd" → "abcd"，符合字符串算法的常见输入习惯。
   * @param {string} text
   * @returns {string}
   */
  function parseString(text) {
    if (!text) return '';
    var lines = text.split(/\r?\n/);
    var parts = [];
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      parts.push(lines[i].trim());
    }
    return parts.join('');
  }

  /**
   * 解析模式串列表（每行一个模式串），用于 AC 自动机。
   * - 忽略空行与 # / // 注释行
   * - 每行 trim 后作为一个模式串
   * @param {string} text
   * @returns {string[]}
   */
  function parsePatterns(text) {
    if (!text) return [];
    var lines = text.split(/\r?\n/);
    var patterns = [];
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var p = lines[i].trim();
      if (p) patterns.push(p);
    }
    return patterns;
  }

  NS.parsers.stringParsers = { parseString: parseString, parsePatterns: parsePatterns };
})();
