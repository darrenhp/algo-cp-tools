/**
 * 方程求解增强：符号解美化 + 代入验证
 * 依赖 calculator-model.js（须先于本文件加载）。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;
  if (!NS || !NS.models || !NS.models.CalculatorModel) return;
  var M = NS.models.CalculatorModel.prototype;

  function getMath() {
    return (typeof window.math !== 'undefined') ? window.math : null;
  }

  /**
   * 将符号解字符串美化为易读形式（math.js 解析后格式化）。
   * 返回 { pretty, latex, ok }。若 math.js 不可用或解析失败，原样返回并 ok=false。
   */
  M.prettify = function (exprStr) {
    exprStr = String(exprStr).trim();
    var math = getMath();
    if (!math) return { pretty: exprStr, latex: '', ok: false };
    try {
      var node = math.parse(exprStr);
      var pretty = math.format(node, { parenthesis: 'keep', precision: 14 });
      var latex = '';
      try { latex = node.toTex({ parenthesis: 'keep' }); } catch (e) { latex = ''; }
      return { pretty: pretty, latex: latex, ok: true };
    } catch (e) {
      return { pretty: exprStr, latex: '', ok: false };
    }
  };

  /** 先把解表达式在「其他参数」下求值为数值，避免代入时该变量自引用变成字符串。 */
  M._preEval = function (solutionStr, scope) {
    try { return this._evaluate(this._compile(String(solutionStr)), scope); }
    catch (e) { return solutionStr; }
  };

  M.verifySolution = function (eqStr, varName, solutionStr, scope) {
    eqStr = String(eqStr).trim();
    varName = String(varName || '').trim();
    solutionStr = String(solutionStr).trim();
    scope = scope || {};
    if (!eqStr || !varName || !solutionStr) {
      throw new Error('验证需要方程、求解变量与解');
    }
    var lhsStr = eqStr, rhsStr = '0';
    var eqIdx = eqStr.indexOf('=');
    if (eqIdx >= 0) {
      lhsStr = eqStr.slice(0, eqIdx).trim();
      rhsStr = eqStr.slice(eqIdx + 1).trim();
    }
    var self = this;
    var subsScope = Object.assign({}, scope);
    subsScope[varName] = self._preEval(solutionStr, scope);
    var math = getMath();
    function evalExpr(s) {
      if (math) {
        try {
          var so = Object.assign({}, subsScope);
          so.gcd = function (a, b) { return Number(self._gcdBig(a, b)); };
          so.lcm = function (a, b) { return Number(self._lcmBig(a, b)); };
          so.comb = so.choose = so.C = function (n, k) { return Number(self._bigComb(n, k)); };
          so.factorial = so.fact = function (n) { return Number(self._bigFactorial(n)); };
          var r = math.evaluate(String(s), so);
          var n = math.number(r);
          if (typeof n === 'number' && isFinite(n)) return { value: n, exact: math.format(r, { precision: 14 }) };
        } catch (e) { /* 回退 */ }
      }
      var ast = self._compile(String(s));
      var v = self._evaluate(ast, subsScope);
      return { value: v, exact: String(v) };
    }
    var L = evalExpr(lhsStr);
    var R = evalExpr(rhsStr);
    var residual = (isFinite(L.value) && isFinite(R.value)) ? (L.value - R.value) : NaN;
    var equal = isFinite(residual) && Math.abs(residual) < 1e-9;
    var subsText = lhsStr + ' = ' + L.exact + (rhsStr !== '0' ? ' , ' + rhsStr + ' = ' + R.exact : '');
    return {
      lhs: L.exact, rhs: R.exact,
      lhsNum: L.value, rhsNum: R.value,
      residual: residual, equal: equal,
      subsText: subsText
    };
  };
})();
