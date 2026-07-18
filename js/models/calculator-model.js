/**
 * 表达式计算器数据模型
 * ----------------------------------------------------------------------------
 * 集成：
 *   - Algebrite（符号代数）：化简、因式分解、求导、积分、符号代入。
 *   - numeric.js（数值计算）：曲线采样(linspace)、数值积分/求导、方程求根、线性方程组求解。
 *   - math.js（通用表达式引擎）：分数/BigNumber/复数/单位求值，注入竞赛辅助函数(gcd/lcm/modpow/comb…)，
 *     提供精确（exact）结果，作为符号与数值之外的第三套引擎，并作为代入求值的首选后端。
 *   - 自研安全表达式求值器（词法分析 + 递归下降语法分析 + 树求值）：
 *     用于函数绘图、代入数值、以及复杂度规模评估（含对数尺度，避免大数溢出）。
 *
 * 功能分组：
 *   1) 通用计算器：符号化简 / 因式分解 / 求导 / 积分；代入具体数值求解；函数曲线绘制；
 *      内置组合数、阶乘及常用数论/超越函数。
 *   2) 算法复杂度估算：输入以 n 为自变量的运算量表达式，不计算精确值，
 *      仅评估最大数据范围内的计算量规模，以科学计数法（如 1e10）输出，并给出可行性提示。
 *   3) 数论 / CP 工具：gcd、lcm、快速模幂 modpow、组合数、阶乘、素数判定、欧拉函数、
 *      任意底对数、方程求根、线性方程组求解等，接口统一、逻辑清晰。
 *
 * 依赖在浏览器中通过 CDN 以 <script> 加载，缺库时对应功能优雅降级（不崩溃）。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  // ===================== 依赖探测 =====================

  var algCache = null;
  var algCacheReady = false;

  /**
   * 返回 Algebrite 接口对象。
   * 优先 window.Algebrite（标准 UMD 全局）；
   * 其次浏览器打包版（algebrite.bundle-for-browser.js）可能把 run 暴露为全局函数，
   * 通过一次 1+1 探针确认其确为 Algebrite 后启用。结果缓存。
   */
  function getAlgebrite() {
    if (algCacheReady) return algCache;
    algCacheReady = true;
    if (typeof window.Algebrite !== 'undefined' && typeof window.Algebrite.run === 'function') {
      algCache = window.Algebrite;
      return algCache;
    }
    if (typeof window.run === 'function') {
      try {
        var probe = window.run('1+1');
        if (typeof probe === 'string' && /(^|[^0-9])2([^0-9]|$)/.test(probe)) {
          var w = window;
          algCache = { run: function (s) { return w.run(s); } };
          return algCache;
        }
      } catch (e) { /* 不是 Algebrite 的 run，忽略 */ }
    }
    algCache = null;
    return null;
  }

  function hasNumeric() {
    return typeof window.numeric !== 'undefined';
  }

  function getMath() {
    return (typeof window.math !== 'undefined') ? window.math : null;
  }

  function hasMath() {
    return typeof window.math !== 'undefined';
  }

  function runAlgSafe(script) {
    var alg = getAlgebrite();
    if (!alg) {
      throw new Error('Algebrite 未加载（需联网加载 CDN 提供的 algebrite.bundle-for-browser.js）');
    }
    var res;
    try {
      res = alg.run(script);
    } catch (e) {
      throw new Error('Algebrite 计算出错: ' + (e && e.message ? e.message : e));
    }
    if (typeof res === 'string' && /^stop:/.test(res)) {
      throw new Error('Algebrite: ' + res);
    }
    return res;
  }

  // ===================== 常数与函数表 =====================

  var CONSTANTS = {
    pi: Math.PI, e: Math.E, tau: 2 * Math.PI,
    phi: (1 + Math.sqrt(5)) / 2, eps: 1e-12, inf: Infinity
  };

  function log10(x) { return Math.log(x) / Math.LN10; }
  function log2(x) { return Math.log(x) / Math.LN2; }

  // ---------- 大整数版本（精确输出，避免 Number 溢出） ----------

  function bigFromNum(x) {
    var n = Math.trunc(Number(x));
    if (!isFinite(n)) throw new Error('数值超出可表示范围');
    return (n >= 0) ? BigInt(n) : -BigInt(-n);
  }

  function bigFactorial(n) {
    n = Math.trunc(Number(n));
    if (n < 0) throw new Error('阶乘要求非负整数');
    if (n > 200000) throw new Error('阶乘过大（n>' + 200000 + '）');
    var r = 1n;
    for (var k = 2n; k <= BigInt(n); k++) r *= k;
    return r;
  }

  function bigComb(n, k) {
    n = Math.trunc(Number(n)); k = Math.trunc(Number(k));
    if (k < 0 || k > n) return 0n;
    k = Math.min(k, n - k);
    var r = 1n;
    for (var i = 1n; i <= BigInt(k); i++) {
      r = r * BigInt(n - Number(i) + 1) / i;
    }
    return r;
  }

  function gcdBig(a, b) {
    a = bigFromNum(Math.abs(Number(a)));
    b = bigFromNum(Math.abs(Number(b)));
    while (b !== 0n) { var t = b; b = a % b; a = t; }
    return a;
  }

  function lcmBig(a, b) {
    var A = bigFromNum(Math.abs(Number(a)));
    var B = bigFromNum(Math.abs(Number(b)));
    if (A === 0n || B === 0n) return 0n;
    return (A / gcdBig(a, b)) * B;
  }

  function modpowBig(base, exp, mod) {
    mod = bigFromNum(Math.abs(Number(mod)));
    if (mod === 0n) throw new Error('模数不能为 0');
    base = ((bigFromNum(Number(base)) % mod) + mod) % mod;
    exp = bigFromNum(Math.abs(Math.trunc(Number(exp))));
    var res = 1n % mod;
    while (exp > 0n) {
      if (exp % 2n === 1n) res = (res * base) % mod;
      base = (base * base) % mod;
      exp /= 2n;
    }
    return res;
  }

  // ---------- 数值版本（绘图/代入，可能溢出为 Infinity） ----------

  function factorialNum(n) {
    n = Math.trunc(Number(n));
    if (n < 0) return NaN;
    if (n > 170) return Infinity;
    var r = 1;
    for (var k = 2; k <= n; k++) r *= k;
    return r;
  }

  function combNum(n, k) {
    n = Math.trunc(Number(n)); k = Math.trunc(Number(k));
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    var r = 1;
    for (var i = 1; i <= k; i++) r = r * (n - i + 1) / i;
    return r;
  }

  function erf(x) {
    var t = 1 / (1 + 0.3275911 * Math.abs(x));
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  }

  function gammaFn(z) {
    var g = 7;
    var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
    z -= 1;
    var x = c[0];
    for (var i = 1; i < g + 2; i++) x += c[i] / (z + i);
    var t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  function callFunc(name, args) {
    name = String(name).toLowerCase();
    switch (name) {
      case 'sin': return Math.sin(args[0]);
      case 'cos': return Math.cos(args[0]);
      case 'tan': return Math.tan(args[0]);
      case 'asin': return Math.asin(args[0]);
      case 'acos': return Math.acos(args[0]);
      case 'atan': return Math.atan(args[0]);
      case 'sinh': return Math.sinh ? Math.sinh(args[0]) : (Math.exp(args[0]) - Math.exp(-args[0])) / 2;
      case 'cosh': return Math.cosh ? Math.cosh(args[0]) : (Math.exp(args[0]) + Math.exp(-args[0])) / 2;
      case 'tanh': return Math.tanh ? Math.tanh(args[0]) : (Math.exp(2 * args[0]) - 1) / (Math.exp(2 * args[0]) + 1);
      case 'asinh': return Math.asinh ? Math.asinh(args[0]) : Math.log(args[0] + Math.sqrt(args[0] * args[0] + 1));
      case 'acosh': return Math.acosh ? Math.acosh(args[0]) : Math.log(args[0] + Math.sqrt(args[0] * args[0] - 1));
      case 'atanh': return Math.atanh ? Math.atanh(args[0]) : 0.5 * Math.log((1 + args[0]) / (1 - args[0]));
      case 'exp': return Math.exp(args[0]);
      case 'log': case 'ln': return Math.log(args[0]);
      case 'log10': return Math.log10 ? Math.log10(args[0]) : log10(args[0]);
      case 'log2': return Math.log2 ? Math.log2(args[0]) : log2(args[0]);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'cbrt': return Math.cbrt ? Math.cbrt(args[0]) : Math.pow(args[0], 1 / 3);
      case 'abs': return Math.abs(args[0]);
      case 'floor': return Math.floor(args[0]);
      case 'ceil': return Math.ceil(args[0]);
      case 'round': return Math.round(args[0]);
      case 'sign': return Math.sign ? Math.sign(args[0]) : (args[0] > 0 ? 1 : args[0] < 0 ? -1 : 0);
      case 'erf': return erf(args[0]);
      case 'gamma': return gammaFn(args[0]);
      case 'factorial': case 'fact': return factorialNum(args[0]);
      case 'comb': case 'choose': case 'c': return combNum(args[0], args[1]);
      case 'perm': case 'p': return factorialNum(args[0]) / factorialNum(Math.max(0, args[0] - args[1]));
      case 'gcd': return Number(gcdBig(args[0], args[1]));
      case 'lcm': return Number(lcmBig(args[0], args[1]));
      case 'modpow': return Number(modpowBig(args[0], args[1], args[2]));
      // 数论 / 单值函数（对整数 N）
      case 'primecount': return Number(primeCountBig(args[0]));
      case 'divisorcount': return Number(divisorCountBig(args[0]));
      case 'omega': return Number(primeFactorCountsBig(args[0]).omega);
      case 'bigomega': return Number(primeFactorCountsBig(args[0]).Omega);
      case 'mobius': return Number(mobiusBig(args[0]));
      case 'eulerphi': return Number(eulerPhiBig(args[0]));
      case 'partitionnumber': return Number(partitionNumberBig(args[0]));
      case 'factorize': return factorizeStrBig(args[0]);
      case 'isprime': return isPrimeBig(args[0]) ? 1 : 0;
      case 'nextprime': return Number(nextPrimeBig(args[0]));
      case 'nthroot': return Math.pow(args[0], 1 / (args[1] || 2));
      case 'pow': return Math.pow(args[0], args[1]);
      case 'atan2': return Math.atan2(args[0], args[1]);
      case 'min': return Math.min.apply(null, args);
      case 'max': return Math.max.apply(null, args);
      default: throw new Error('未知函数: ' + name);
    }
  }

  // ===================== 词法 / 语法分析 =====================

  function tokenize(str) {
    var tokens = [];
    var i = 0;
    var n = str.length;
    while (i < n) {
      var c = str[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(str[i + 1] || ''))) {
        var start = i;
        var seenDot = false;
        while (i < n && (/[0-9]/.test(str[i]) || (str[i] === '.' && !seenDot))) {
          if (str[i] === '.') seenDot = true;
          i++;
        }
        if (str[i] === 'e' || str[i] === 'E') {
          var j = i + 1;
          if (str[j] === '+' || str[j] === '-') j++;
          if (/[0-9]/.test(str[j] || '')) { i = j; while (i < n && /[0-9]/.test(str[i])) i++; }
        }
        tokens.push({ t: 'num', v: parseFloat(str.slice(start, i)) });
        continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        var s2 = i;
        while (i < n && /[a-zA-Z0-9_]/.test(str[i])) i++;
        tokens.push({ t: 'ident', v: str.slice(s2, i) });
        continue;
      }
      if ('+-*/^(),%!'.indexOf(c) >= 0) {
        tokens.push({ t: 'op', v: c });
        i++;
        continue;
      }
      throw new Error('无法识别的字符: "' + c + '"');
    }
    return tokens;
  }

  /** 在相邻记号间插入隐式乘号（如 2x → 2*x，3!x → 3!*x，(a)(b) → (a)*(b)）。 */
  function insertImplicitMult(tokens) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (i > 0) {
        var prev = out[out.length - 1];
        var prevIsClose = prev.t === 'op' && (prev.v === ')' || prev.v === '!');
        var curIsOpenOrIdent = tk.t === 'ident' || (tk.t === 'op' && tk.v === '(');
        if ((prev.t === 'num' || prevIsClose) && curIsOpenOrIdent) {
          out.push({ t: 'op', v: '*' });
        }
      }
      out.push(tk);
    }
    return out;
  }

  function parse(tokens) {
    var pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function expect(v) { var tk = next(); if (!tk || tk.v !== v) throw new Error('缺少 "' + v + '"'); }

    function parseExpr() {
      var node = parseTerm();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        var op = next().v;
        node = { type: 'binary', op: op, left: node, right: parseTerm() };
      }
      return node;
    }
    function parseTerm() {
      var node = parseUnary();
      while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/' || peek().v === '%')) {
        var op = next().v;
        node = { type: 'binary', op: op, left: node, right: parseUnary() };
      }
      return node;
    }
    function parseUnary() {
      if (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        var op = next().v;
        return { type: 'unary', op: op, arg: parseUnary() };
      }
      return parsePower();
    }
    function parsePower() {
      var node = parsePostfix();
      if (peek() && peek().t === 'op' && peek().v === '^') {
        next();
        node = { type: 'binary', op: '^', left: node, right: parseUnary() };
      }
      return node;
    }
    function parsePostfix() {
      var node = parsePrimary();
      while (peek() && peek().t === 'op' && peek().v === '!') {
        next();
        node = { type: 'call', name: 'factorial', args: [node] };
      }
      return node;
    }
    function parsePrimary() {
      var tk = peek();
      if (!tk) throw new Error('表达式不完整');
      if (tk.t === 'num') { next(); return { type: 'num', value: tk.v }; }
      if (tk.t === 'op' && tk.v === '(') {
        next();
        var e = parseExpr();
        expect(')');
        return e;
      }
      if (tk.t === 'ident') {
        next();
        if (peek() && peek().t === 'op' && peek().v === '(') {
          next();
          var args = [];
          if (!(peek() && peek().t === 'op' && peek().v === ')')) {
            args.push(parseExpr());
            while (peek() && peek().t === 'op' && peek().v === ',') { next(); args.push(parseExpr()); }
          }
          expect(')');
          return { type: 'call', name: tk.v, args: args };
        }
        if (CONSTANTS.hasOwnProperty(tk.v)) return { type: 'const', value: CONSTANTS[tk.v] };
        return { type: 'var', name: tk.v };
      }
      throw new Error('无法解析: ' + (tk.v !== undefined ? tk.v : '空'));
    }

    var ast = parseExpr();
    if (pos < tokens.length) throw new Error('多余的符号: "' + tokens[pos].v + '"');
    return ast;
  }

  function compile(str) {
    if (str == null) throw new Error('表达式为空');
    var toks = insertImplicitMult(tokenize(String(str)));
    return parse(toks);
  }

  function evaluate(node, scope, funcs) {
    scope = scope || {};
    funcs = funcs || {};
    switch (node.type) {
      case 'num': return node.value;
      case 'const': return node.value;
      case 'var':
        if (Object.prototype.hasOwnProperty.call(scope, node.name)) return scope[node.name];
        throw new Error('缺少变量 "' + node.name + '" 的取值');
      case 'unary': {
        var v = evaluate(node.arg, scope, funcs);
        return node.op === '-' ? -v : v;
      }
      case 'binary': {
        var l = evaluate(node.left, scope, funcs);
        var r = evaluate(node.right, scope, funcs);
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return l / r;
          case '^': return Math.pow(l, r);
          case '%': return l % r;
        }
        throw new Error('未知运算符: ' + node.op);
      }
      case 'call': {
        // 用户自定义函数优先于内建函数
        var fn = funcs[String(node.name).toLowerCase()];
        if (fn) {
          var argVals = node.args.map(function (a) { return evaluate(a, scope, funcs); });
          var newScope = Object.assign({}, scope);
          for (var pi = 0; pi < fn.params.length; pi++) newScope[fn.params[pi]] = argVals[pi];
          return evaluate(fn.body, newScope, funcs);
        }
        var args = node.args.map(function (a) { return evaluate(a, scope, funcs); });
        return callFunc(node.name, args);
      }
    }
    throw new Error('未知节点');
  }

  // ===================== 对数尺度（复杂度数量级） =====================

  function safeLog10(v) {
    if (!isFinite(v)) return v > 0 ? Infinity : (v < 0 ? NaN : -Infinity);
    if (v === 0) return -Infinity;
    return Math.log10(Math.abs(v));
  }

  function log10Factorial(n) {
    n = Number(n);
    if (n < 0) return NaN;
    if (n === 0 || n === 1) return 0;
    if (n <= 1e6) {
      var s = 0;
      for (var k = 2; k <= n; k++) s += Math.log10(k);
      return s;
    }
    return n * log10(n) - n * Math.LOG10E + 0.5 * log10(2 * Math.PI * n);
  }

  function log10Gamma(z) {
    z = Number(z);
    if (z <= 0) return NaN;
    if (z < 1) return log10(gammaFn(z));
    return (z - 0.5) * log10(z) - z * Math.LOG10E + 0.5 * log10(2 * Math.PI) + (1 / (12 * z)) * Math.LOG10E;
  }

  /** 计算 log10(|value|)。对易溢出的幂/阶乘/指数采用对数恒等式，避免 Infinity。 */
  function magnitudeLog10(node, scope) {
    scope = scope || {};
    switch (node.type) {
      case 'num': case 'const': return safeLog10(node.value);
      case 'var': {
        var v = scope[node.name];
        if (v === undefined) throw new Error('缺少变量 "' + node.name + '"');
        return safeLog10(v);
      }
      case 'unary': return magnitudeLog10(node.arg, scope);
      case 'binary': {
        if (node.op === '*') return magnitudeLog10(node.left, scope) + magnitudeLog10(node.right, scope);
        if (node.op === '/') return magnitudeLog10(node.left, scope) - magnitudeLog10(node.right, scope);
        if (node.op === '%') return Math.min(magnitudeLog10(node.left, scope), magnitudeLog10(node.right, scope));
        if (node.op === '^') {
          var base = evaluate(node.left, scope);
          var exp = evaluate(node.right, scope);
          if (base > 0 && isFinite(base) && isFinite(exp)) return exp * Math.log10(base);
          return safeLog10(evaluate(node, scope));
        }
        // + / -：利用带符号的 log-sum-exp
        var la = magnitudeLog10(node.left, scope);
        var lb = magnitudeLog10(node.right, scope);
        var sa = Math.sign(evaluate(node.left, scope));
        var sb = Math.sign(evaluate(node.right, scope));
        if (!isFinite(la) || !isFinite(lb)) return Math.max(la, lb);
        var m = Math.max(la, lb);
        if (m === -Infinity) return -Infinity;
        var t = sa * Math.pow(10, la - m) + sb * Math.pow(10, lb - m);
        return m + safeLog10(t);
      }
      case 'call': {
        var nm = String(node.name).toLowerCase();
        var a0 = node.args[0] ? evaluate(node.args[0], scope) : NaN;
        switch (nm) {
          case 'exp': return a0 * Math.LOG10E;
          case 'factorial': case 'fact': return log10Factorial(a0);
          case 'comb': case 'choose': case 'c':
            return log10Factorial(evaluate(node.args[0], scope)) - log10Factorial(evaluate(node.args[1], scope)) - log10Factorial(evaluate(node.args[0], scope) - evaluate(node.args[1], scope));
          case 'perm': case 'p':
            return log10Factorial(evaluate(node.args[0], scope)) - log10Factorial(evaluate(node.args[0], scope) - evaluate(node.args[1], scope));
          case 'log': case 'ln': return safeLog10(Math.log(a0));
          case 'log10': return safeLog10(Math.log10(a0));
          case 'log2': return safeLog10(Math.log2 ? Math.log2(a0) : log2(a0));
          case 'sqrt': return 0.5 * safeLog10(a0);
          case 'cbrt': return (1 / 3) * safeLog10(a0);
          case 'gamma': return log10Gamma(a0);
          case 'abs': case 'floor': case 'ceil': case 'round': case 'sin': case 'cos':
          case 'tan': case 'sinh': case 'cosh': case 'tanh':
            return safeLog10(evaluate(node, scope));
          default:
            return safeLog10(evaluate(node, scope));
        }
      }
    }
    throw new Error('未知节点');
  }

  // ===================== 格式化 =====================

  var SUP = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻'
  };
  function toSuperscript(n) {
    return String(n).split('').map(function (c) { return SUP[c] || c; }).join('');
  }

  /** 普通科学计数法：1.234e+10 → 1.234e10。 */
  function formatSci(value) {
    if (!isFinite(value)) return value > 0 ? '∞' : (value < 0 ? '-∞' : 'NaN');
    if (value === 0) return '0';
    var s = value.toExponential(4);
    s = s.replace('e+', 'e').replace('e-0', 'e-').replace('e+0', 'e');
    return s;
  }

  /** 由 log10 量级生成科学计数法字符串（如 1.23e10）。 */
  function formatMagnitude(L) {
    if (L === Infinity) return '∞';
    if (L === -Infinity) return '0';
    if (!isFinite(L)) return 'NaN';
    var b = Math.floor(L);
    var a = Math.pow(10, L - b);
    var mant = a.toPrecision(4).replace(/\.?0+$/, '');
    if (mant === '1') return '1e' + b;
    return mant + 'e' + b;
  }

  /** 由 log10 量级生成 上标 形式（如 1.23×10¹⁰）。 */
  function formatMagnitudeSup(L) {
    if (L === Infinity) return '∞';
    if (L === -Infinity) return '0';
    if (!isFinite(L)) return 'NaN';
    var b = Math.floor(L);
    var a = Math.pow(10, L - b);
    var mant = a.toPrecision(4).replace(/\.?0+$/, '');
    if (b === 0) return mant;
    return mant + '×10' + toSuperscript(b);
  }

  function feasibility(value, L) {
    var v = (isFinite(value) && Math.abs(value) < 1e300) ? Math.abs(value) : Math.pow(10, L);
    if (!isFinite(v)) return { level: 'bad', text: '数值溢出（规模极大，基本不可行）' };
    if (v < 1e7) return { level: 'great', text: '极快（远小于 1e7，毫秒级）' };
    if (v < 1e8) return { level: 'good', text: '快（约 1e7~1e8，约 0.1s 内）' };
    if (v < 1e9) return { level: 'ok', text: '可接受（约 1e8~1e9，约 1s 内）' };
    if (v < 1e10) return { level: 'slow', text: '偏慢（约 1e9~1e10，数秒）' };
    if (v < 1e11) return { level: 'veryslow', text: '很慢（约 1e10~1e11，可能 TLE）' };
    return { level: 'bad', text: '基本不可行（≥1e11，必然 TLE）' };
  }

  // ===================== 数论工具（大整数 / Miller–Rabin） =====================

  function isPrimeBig(n) {
    n = bigFromNum(Math.abs(Number(n)));
    if (n < 2n) return false;
    for (var p = 2n; p * p <= n; p++) if (n % p === 0n) return false; // 仅对极小 n 用试除
    if (n < 1000000n) return true;
    // 确定性 Miller–Rabin（对 < 2^64 正确）
    var d = n - 1n, r = 0n;
    while (d % 2n === 0n) { d /= 2n; r++; }
    var bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    for (var bi = 0; bi < bases.length; bi++) {
      var a = bases[bi];
      if (a % n === 0n) continue;
      var x = modpowBig(a, d, n);
      if (x === 1n || x === n - 1n) continue;
      var cont = false;
      for (var i = 1n; i < r; i++) {
        x = (x * x) % n;
        if (x === n - 1n) { cont = true; break; }
      }
      if (cont) continue;
      return false;
    }
    return true;
  }

  function eulerPhiBig(n) {
    n = bigFromNum(Math.abs(Math.trunc(Number(n))));
    if (n < 1n) return '0';
    var result = n;
    var m = n;
    for (var p = 2n; p * p <= m; p++) {
      if (m % p === 0n) {
        while (m % p === 0n) m /= p;
        result = result / p * (p - 1n);
      }
    }
    if (m > 1n) result = result / m * (m - 1n);
    return result.toString();
  }

  function nextPrimeBig(n) {
    n = bigFromNum(Math.trunc(Number(n)));
    var c = n < 1n ? 2n : n + 1n;
    while (!isPrimeBig(c)) c++;
    return c.toString();
  }

  // ===================== 作用域解析 =====================

  function parseScope(str) {
    var scope = {};
    var vars = [];
    if (!str) return { scope: scope, vars: vars };
    var parts = String(str).split(/[,\n]/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var idx = p.indexOf('=');
      if (idx < 0) throw new Error('变量格式应为 name=value，得到: ' + p);
      var name = p.slice(0, idx).trim();
      var valStr = p.slice(idx + 1).trim();
      var val = Number(valStr);
      if (!isFinite(val)) throw new Error('变量 ' + name + ' 取值非法: ' + valStr);
      scope[name] = val;
      vars.push(name);
    }
    return { scope: scope, vars: vars };
  }

  /** 将 Algebrite 返回字符串（可能是分数 "9/2"、含 sqrt/log 的表达式等）转为数值。 */
  function numFromAlg(str) {
    if (str == null) return null;
    str = String(str).trim();
    if (str === '') return null;
    var m = str.match(/^-?\d+$/);
    if (m) return parseFloat(str);
    // 分数 a/b
    var fm = str.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
    if (fm) { var d = parseFloat(fm[2]); return d === 0 ? null : parseFloat(fm[1]) / d; }
    try {
      var ast = compile(str);
      var v = evaluate(ast, {});
      return isFinite(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function linspaceFallback(a, b, n) {
    var out = [];
    if (n <= 1) { out.push(a); return out; }
    var step = (b - a) / (n - 1);
    for (var i = 0; i < n; i++) out.push(a + step * i);
    return out;
  }

  // ===================== 模型 =====================

  function CalculatorModel() {
    this.algebriteAvailable = !!getAlgebrite();
    this.numericAvailable = hasNumeric();
    this.mathAvailable = hasMath();
  }

  CalculatorModel.prototype.refreshDeps = function () {
    this.algebriteAvailable = !!getAlgebrite();
    this.numericAvailable = hasNumeric();
    this.mathAvailable = hasMath();
  };

  // ---------- 1. 通用计算器（符号） ----------

  CalculatorModel.prototype.simplify = function (expr) {
    return runAlgSafe('simplify(' + expr + ')');
  };
  CalculatorModel.prototype.factor = function (expr) {
    return runAlgSafe('factor(' + expr + ')');
  };
  CalculatorModel.prototype.derivative = function (expr, variable) {
    return runAlgSafe('d(' + expr + ', ' + (variable || 'x') + ')');
  };
  CalculatorModel.prototype.integral = function (expr, variable) {
    return runAlgSafe('integral(' + expr + ', ' + (variable || 'x') + ')');
  };

  /** 符号代入后数值化；返回 {value(数值或null), expr(字符串), symbolic(是否走Algebrite)}。 */
  CalculatorModel.prototype.substitute = function (expr, scope) {
    var exprStr = String(expr);
    var alg = getAlgebrite();
    if (alg) {
      try {
        var script = exprStr;
        for (var key in scope) {
          if (Object.prototype.hasOwnProperty.call(scope, key)) {
            script = 'subst(' + key + ', ' + scope[key] + ', ' + script + ')';
          }
        }
        var res = runAlgSafe(script);
        var num = numFromAlg(res);
        return { value: num, expr: res, symbolic: true };
      } catch (e) { /* 退化到自研求值器 */ }
    }
    var ast = compile(exprStr);
    var val = evaluate(ast, scope);
    return { value: val, expr: String(val), symbolic: false };
  };

  /**
   * 智能求值（math.js 引擎）。
   * 使用 math.evaluate 解析表达式，支持分数、BigNumber、复数、单位等，
   * 并注入竞赛常用辅助函数（gcd/lcm/modpow/comb/factorial/choose/perm/nthRoot），
   * 使 math.js 能直接处理如 C(10,3)、gcd(12,18)、modpow(2,10,1000) 等写法。
   * 返回 { value(数值或null), exact(精确字符串), hasMath(是否走 math.js), error }。
   * 仅在 math.js 加载时可用，否则抛出错误（由调用方决定回退）。
   */
  CalculatorModel.prototype.smartEvaluate = function (expr, scope) {
    var math = getMath();
    if (!math) throw new Error('math.js 未加载（需联网加载 CDN 提供的 math.js）');

    scope = scope || {};
    var scopeObj = {};
    for (var key in scope) {
      if (Object.prototype.hasOwnProperty.call(scope, key)) scopeObj[key] = scope[key];
    }
    // 注入竞赛辅助函数（以 math.js 的 BigNumber 友好形式）
    scopeObj.gcd = function (a, b) { return Number(gcdBig(a, b)); };
    scopeObj.lcm = function (a, b) { return Number(lcmBig(a, b)); };
    scopeObj.modpow = function (b, e, m) { return Number(modpowBig(b, e, m)); };
    scopeObj.comb = scopeObj.choose = scopeObj.C = function (n, k) { return Number(bigComb(n, k)); };
    scopeObj.perm = scopeObj.P = function (n, k) { return Number(bigFactorial(n)) / Number(bigFactorial(Math.max(0, n - k))); };
    scopeObj.factorial = scopeObj.fact = function (n) { return Number(bigFactorial(n)); };
    scopeObj.nthRoot = math.nthRoot;
    // 数论 / 单值函数（对整数 N）
    scopeObj.primeCount = function (n) { return Number(primeCountBig(n)); };
    scopeObj.divisorCount = function (n) { return Number(divisorCountBig(n)); };
    scopeObj.omega = function (n) { return Number(primeFactorCountsBig(n).omega); };
    scopeObj.bigomega = function (n) { return Number(primeFactorCountsBig(n).Omega); };
    scopeObj.mobius = function (n) { return Number(mobiusBig(n)); };
    scopeObj.eulerPhi = function (n) { return Number(eulerPhiBig(n)); };
    scopeObj.partitionNumber = function (n) { return Number(partitionNumberBig(n)); };
    scopeObj.factorize = function (n) { return factorizeStrBig(n); };

    var node;
    try {
      node = math.parse(String(expr));
    } catch (e) {
      throw new Error('math.js 解析失败: ' + (e && e.message ? e.message : e));
    }
    var res;
    try {
      res = node.evaluate(scopeObj);
    } catch (e) {
      throw new Error('math.js 求值失败: ' + (e && e.message ? e.message : e));
    }
    // 精确串：分数/BigNumber/复数尽量保留原样
    var exact;
    try { exact = math.format(res, { precision: 14 }); } catch (e) { exact = String(res); }
    // 数值：能转成 Number 就转
    var num = null;
    try {
      var n = math.number(res);
      if (typeof n === 'number' && isFinite(n)) num = n;
    } catch (e) { /* 非实数（如复数），num 保持 null */ }
    return { value: num, exact: exact, hasMath: true, complex: (typeof num !== 'number') };
  };

  // ---------- 2. 函数绘制 ----------

  // 仅对正整数自变量有意义的函数（跨实数区间绘制时，非整数点会被跳过）。
  var INTEGER_ONLY_FUNCS = {
    eulerphi: 1, primecount: 1, divisorcount: 1, omega: 1, bigomega: 1,
    mobius: 1, partitionnumber: 1, factorize: 1, isprime: 1, nextprime: 1
  };

  /** 收集表达式中出现的函数名（小写），展开用户自定义函数体（防止递归死循环用 visited）。 */
  function collectFuncNames(node, out, funcs, visited) {
    out = out || {};
    if (!node) return out;
    if (node.type === 'call') {
      var nm = String(node.name).toLowerCase();
      out[nm] = true;
      if (funcs && funcs[nm] && !(visited && visited[nm])) {
        visited = visited || {};
        visited[nm] = true;
        collectFuncNames(funcs[nm].body, out, funcs, visited);
      }
      for (var i = 0; i < node.args.length; i++) collectFuncNames(node.args[i], out, funcs, visited);
    } else if (node.type === 'binary' || node.type === 'unary') {
      collectFuncNames(node.left, out, funcs, visited);
      collectFuncNames(node.right, out, funcs, visited);
      collectFuncNames(node.arg, out, funcs, visited);
    }
    return out;
  }

  /**
   * 解析用户自定义函数定义（每行一个，形如 name(params) = expr）。
   * 返回 { name(小写): { params:[...], body: AST } }。解析失败抛出带行号的错误。
   * 自定义函数可引用其他自定义函数、内建函数、绘图额外参数与自变量 x。
   */
  function parseUserFunctions(str) {
    var funcs = {};
    var lines = String(str || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var eqIdx = line.indexOf('=');
      if (eqIdx < 0) throw new Error('第 ' + (i + 1) + ' 行自定义函数缺少 "="：' + line);
      var lhs = line.slice(0, eqIdx).trim();
      var rhs = line.slice(eqIdx + 1).trim();
      if (!rhs) throw new Error('第 ' + (i + 1) + ' 行自定义函数右端表达式为空');
      var m = lhs.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/);
      if (!m) throw new Error('第 ' + (i + 1) + ' 行函数定义格式应为 name(params) = expr，得到：' + lhs);
      var name = m[1].toLowerCase();
      var paramsStr = m[2].trim();
      var params = paramsStr ? paramsStr.split(',').map(function (p) { return p.trim(); }) : [];
      var seen = {};
      for (var pi = 0; pi < params.length; pi++) {
        var p = params[pi];
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p)) throw new Error('第 ' + (i + 1) + ' 行参数名非法：' + p);
        if (seen[p]) throw new Error('第 ' + (i + 1) + ' 行参数重名：' + p);
        seen[p] = true;
      }
      var bodyAst = compile(rhs);
      funcs[name] = { params: params, body: bodyAst };
    }
    return funcs;
  }

  function stypeOf(isDiscrete) { return isDiscrete ? 'discrete' : 'continuous'; }

  CalculatorModel.prototype.plot = function (fnsStr, xmin, xmax, samples, paramsScope, userFuncs, forcedType) {
    // 一行一个函数（因 comb(n,k) 等内建函数含逗号，分隔符改用换行而非逗号）
    var fns = String(fnsStr).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!fns.length) throw new Error('请至少输入一个函数');
    var asts = fns.map(function (f) { return compile(f); });
    // 预先判断每个函数是否含「仅整数」函数（展开自定义函数体），用于区分离散型 / 连续型
    var intOnlyFlags = asts.map(function (ast) {
      var names = collectFuncNames(ast, {}, userFuncs);
      for (var k in names) { if (INTEGER_ONLY_FUNCS[k]) return true; }
      return false;
    });
    var series = [];
    var ymin = Infinity, ymax = -Infinity;
    var warnings = [];
    // 连续型用均匀采样；离散型 x 轴只取整数（floor(xmin)..ceil(xmax)），不做连续采样
    function makeXs(isDiscrete) {
      if (!isDiscrete) {
        return hasNumeric() ? window.numeric.linspace(xmin, xmax, samples) : linspaceFallback(xmin, xmax, samples);
      }
      var lo = Math.ceil(xmin - 1e-9), hi = Math.floor(xmax + 1e-9);
      var arr = [];
      for (var i = lo; i <= hi; i++) arr.push(i);
      // 整数点过少时回退到均匀采样，避免空图
      if (arr.length < 2) {
        if (hasNumeric()) return window.numeric.linspace(xmin, xmax, Math.min(samples, 64));
        return linspaceFallback(xmin, xmax, Math.min(samples, 64));
      }
      return arr;
    }
    for (var s = 0; s < asts.length; s++) {
      // 离散判定：手动覆写优先，否则按是否含仅整数函数自动判定
      var isDiscrete = forcedType === 'discrete' ? true
        : forcedType === 'continuous' ? false
        : !!intOnlyFlags[s];
      var xs = makeXs(isDiscrete);
      var pts = [];
      var validCount = 0;
      var firstErr = '';
      for (var k = 0; k < xs.length; k++) {
        var xv = xs[k];
        var scope = Object.assign({}, paramsScope, { x: xv });
        var y;
        try {
          y = evaluate(asts[s], scope, userFuncs);
        } catch (e) { y = NaN; if (!firstErr) firstErr = e.message; }
        pts.push({ x: xv, y: y });
        if (isFinite(y)) { validCount++; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
      }
      if (isDiscrete && validCount === 0) {
        warnings.push('函数「' + fns[s] + '」仅对整数自变量有效，当前 x 范围（' + xmin + '~' + xmax + '）无整数点，未绘制。');
      } else if (validCount === 0 && firstErr) {
        warnings.push('函数「' + fns[s] + '」所有采样点无法计算: ' + firstErr);
      }
      // 含仅整数函数的视为「离散型」（散点，x 仅整数），其余为「连续型」（连线）
      series.push({ points: pts, type: stypeOf(isDiscrete) });
    }
    if (!isFinite(ymin)) { ymin = -1; ymax = 1; }
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    return { series: series, labels: fns, xmin: xmin, xmax: xmax, ymin: ymin, ymax: ymax, warnings: warnings };
  };

  // ---------- 2.5 符号方程求解（nerdamer / Algebrite） ----------

  var nerdamerCache = null;
  var nerdamerReady = false;

  /** 返回 nerdamer 符号代数引擎（浏览器打包版暴露为 window.nerdamer）。 */
  function getNerdamer() {
    if (nerdamerReady) return nerdamerCache;
    nerdamerReady = true;
    if (typeof window.nerdamer !== 'undefined' && typeof window.nerdamer === 'function') {
      nerdamerCache = window.nerdamer;
      return nerdamerCache;
    }
    nerdamerCache = null;
    return null;
  }

  /**
   * 符号方程求解：输入形如 "lhs = rhs" 的方程与要求解的变量名，
   * 输出该变量的解析表达式（含参）。优先 nerdamer（专门符号求解，对含参方程稳定），
   * 缺载时回退 Algebrite 的 solve。返回 { solutions:[字符串...], engine, multi }。
   */
  CalculatorModel.prototype.solveEquation = function (eqStr, varName) {
    eqStr = String(eqStr).trim();
    varName = String(varName || '').trim();
    if (!eqStr) throw new Error('请输入方程');
    if (!varName) throw new Error('请指定求解变量');

    var nerd = getNerdamer();
    if (nerd) {
      try {
        var res = nerd('solve(' + eqStr + ', ' + varName + ')');
        var str = res.toString();
        // 形如 [a, b, c] 或 (a, b) 或单值
        var sols = parseSolutionList(str);
        if (!sols.length) throw new Error('未得到显式解');
        return { solutions: sols, engine: 'nerdamer', multi: sols.length > 1 };
      } catch (e) {
        // 回退 Algebrite
        if (!/未得到显式解/.test(e.message)) {
          // 解析错误，尝试回退
        }
      }
    }

    // 回退 Algebrite
    var alg = getAlgebrite();
    if (alg) {
      try {
        // 将 lhs = rhs 转换为 lhs - rhs = 0 形式，避免等号被当作赋值
        var body = eqStr;
        if (eqStr.indexOf('=') >= 0) {
          var pr = eqStr.split('=');
          if (pr.length === 2) body = pr[0].trim() + ' - (' + pr[1].trim() + ')';
        }
        var out = runAlgSafe('solve(' + body + ', ' + varName + ')');
        var sols2 = parseSolutionList(String(out).trim());
        if (!sols2.length) throw new Error('Algebrite 未返回解');
        return { solutions: sols2, engine: 'Algebrite', multi: sols2.length > 1 };
      } catch (e2) {
        throw new Error('符号求解失败: ' + (e2 && e2.message ? e2.message : e2));
      }
    }

    throw new Error('nerdamer 与 Algebrite 均未加载（需联网加载 CDN），无法进行符号方程求解');
  };

  /** 解析 "solve" 结果字符串为解数组（识别 [a, b] / (a, b) / 单值）。 */
  function parseSolutionList(str) {
    str = String(str).trim();
    if (!str) return [];
    var m = str.match(/^\[(.+)\]$/) || str.match(/^\((.+)\)$/);
    if (m) {
      return m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return [str];
  }

  // ---------- 3. 数值计算（numeric.js） ----------

  CalculatorModel.prototype.numericIntegrate = function (fnStr, a, b, paramsScope) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法数值积分');
    var ast = compile(fnStr);
    var f = function (x) { return evaluate(ast, Object.assign({}, paramsScope, { x: x })); };
    return window.numeric.integrate(f, a, b);
  };
  CalculatorModel.prototype.numericDerivative = function (fnStr, x0, paramsScope) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法数值求导');
    var ast = compile(fnStr);
    var f = function (x) { return evaluate(ast, Object.assign({}, paramsScope, { x: x })); };
    return window.numeric.derivative(f, x0);
  };
  CalculatorModel.prototype.findRoot = function (fnStr, x0, x1, paramsScope) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法方程求根');
    var ast = compile(fnStr);
    var f = function (x) { return evaluate(ast, Object.assign({}, paramsScope, { x: x })); };
    var r = window.numeric.secant(f, x0, x1);
    return r;
  };
  CalculatorModel.prototype.solveLinear = function (A, b) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法求解线性方程组');
    return window.numeric.solve(A, b);
  };

  // ---------- 3.5 矩阵解析 ----------

  /** 将多行文本解析为数值矩阵（每行一行，元素空格/逗号分隔，校验为矩形）。 */
  function parseMatrixStr(str) {
    var lines = String(str).trim().split(/\n+/).filter(function (l) { return l.trim(); });
    if (!lines.length) throw new Error('矩阵为空');
    var M = lines.map(function (line) {
      var parts = line.trim().split(/[\s,]+/).filter(Boolean);
      if (!parts.length) throw new Error('矩阵存在空行');
      return parts.map(function (p) {
        var v = Number(p);
        if (!isFinite(v)) throw new Error('矩阵元素非法: ' + p);
        return v;
      });
    });
    var cols = M[0].length;
    for (var i = 1; i < M.length; i++) {
      if (M[i].length !== cols) throw new Error('矩阵各行元素个数不一致（第 ' + (i + 1) + ' 行）');
    }
    return M;
  }

  /**
   * 将一行文本按「列」拆分为单元格表达式。
   * 列分隔符：竖线 | 、分号 ; 、制表符、连续 2+ 空格。
   * 单个空格与逗号不作为列分隔（保留给函数参数，如 gcd(6, 4)、a b 视为一列须写在括号内）。
   * 为兼容常见「空格分隔纯数字」，当整行不含函数调用括号且不含 | ; 时，退化为按空白/逗号拆分。
   */
  function splitMatrixRow(line) {
    var s = line.trim();
    if (/[|;\t]/.test(s) || /\s{2,}/.test(s)) {
      return s.split(/\s*[|;]\s*|\t+|\s{2,}/).map(function (c) { return c.trim(); }).filter(function (c) { return c !== ''; });
    }
    // 无显式分隔符：若含括号（函数调用）则整行视为一个可能含空格的表达式序列，用单空格拆分但保护括号
    if (s.indexOf('(') >= 0) {
      return splitOnSpaceOutsideParens(s);
    }
    return s.split(/[\s,]+/).filter(Boolean);
  }

  /** 按空格拆分，但忽略位于圆括号内的空格与逗号，使 gcd(6, 4) 保持为一个单元格。 */
  function splitOnSpaceOutsideParens(s) {
    var out = [], buf = '', depth = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(') { depth++; buf += ch; }
      else if (ch === ')') { depth = Math.max(0, depth - 1); buf += ch; }
      else if (depth === 0 && (ch === ' ' || ch === ',' || ch === '\t')) {
        if (buf.trim() !== '') { out.push(buf.trim()); buf = ''; }
      } else buf += ch;
    }
    if (buf.trim() !== '') out.push(buf.trim());
    return out;
  }

  /**
   * 解析「支持变量与函数表达式」的矩阵。
   * 每个单元格可以是数字、变量（取自 scope）、或表达式（sin(t)、a+b、gcd(6,4) 等）。
   * @param {string} str 多行矩阵文本
   * @param {object} scope 变量取值 { a: 1, t: 0.5 }
   * @param {object} funcs 用户自定义函数（parseUserFunctions 结果）
   * @returns {number[][]}
   */
  function parseMatrixExpr(str, scope, funcs) {
    scope = scope || {};
    funcs = funcs || {};
    var lines = String(str).trim().split(/\n+/).filter(function (l) { return l.trim(); });
    if (!lines.length) throw new Error('矩阵为空');
    var M = lines.map(function (line, ri) {
      var cells = splitMatrixRow(line);
      if (!cells.length) throw new Error('矩阵第 ' + (ri + 1) + ' 行为空');
      return cells.map(function (cell) {
        var v;
        try {
          v = evaluate(compile(cell), scope, funcs);
        } catch (e) {
          throw new Error('第 ' + (ri + 1) + ' 行元素 "' + cell + '" 解析失败：' + e.message);
        }
        if (typeof v !== 'number' || !isFinite(v)) {
          throw new Error('第 ' + (ri + 1) + ' 行元素 "' + cell + '" 求值非有限数：' + v);
        }
        return v;
      });
    });
    var cols = M[0].length;
    for (var i = 1; i < M.length; i++) {
      if (M[i].length !== cols) throw new Error('矩阵各行元素个数不一致（第 ' + (i + 1) + ' 行有 ' + M[i].length + ' 个，应为 ' + cols + ' 个）');
    }
    return M;
  }

  /** 解析向量（一维），支持变量与函数表达式，元素用空格/逗号/竖线分隔。 */
  function parseVectorExpr(str, scope, funcs) {
    var flat = parseMatrixExpr(String(str).replace(/\n+/g, ' '), scope, funcs);
    // 上面会得到 [[...]]，取第一行
    return flat[0];
  }

  // ---------- 6. 线性代数（numeric.js） ----------

  CalculatorModel.prototype.parseMatrix = parseMatrixStr;
  CalculatorModel.prototype.parseMatrixExpr = parseMatrixExpr;
  CalculatorModel.prototype.parseVectorExpr = parseVectorExpr;

  CalculatorModel.prototype.matrixDet = function (A) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法求行列式');
    return window.numeric.det(A);
  };
  CalculatorModel.prototype.matrixInv = function (A) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法求逆');
    return window.numeric.inv(A);
  };
  CalculatorModel.prototype.matrixTranspose = function (A) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法转置');
    return window.numeric.transpose(A);
  };
  CalculatorModel.prototype.matrixTrace = function (A) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法求迹');
    var s = 0;
    for (var i = 0; i < A.length; i++) s += A[i][i];
    return s;
  };
  CalculatorModel.prototype.matrixNeg = function (A) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法取负');
    return window.numeric.neg(A);
  };
  CalculatorModel.prototype.matrixAdd = function (A, B) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法相加');
    return window.numeric.add(A, B);
  };
  CalculatorModel.prototype.matrixSub = function (A, B) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法相减');
    return window.numeric.sub(A, B);
  };
  CalculatorModel.prototype.matrixMul = function (A, B) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法相乘');
    // numeric.js 无 mmul，矩阵乘法用 numeric.dot（自动分发到 dotMMsmall/big）
    return window.numeric.dot(A, B);
  };
  CalculatorModel.prototype.matrixScalarMul = function (k, A) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法标量乘');
    k = Number(k);
    return A.map(function (row) { return row.map(function (v) { return v * k; }); });
  };
  CalculatorModel.prototype.matrixEig = function (A) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法求特征值');
    return window.numeric.eig(A);
  };
  CalculatorModel.prototype.matrixPow = function (A, k) {
    if (!hasNumeric()) throw new Error('numeric.js 未加载，无法求矩阵幂');
    k = Math.trunc(Number(k));
    if (!isFinite(k) || k < 0) throw new Error('矩阵幂要求非负整数');
    if (k === 0) {
      var n = A.length;
      var I = [];
      for (var i = 0; i < n; i++) { I.push([]); for (var j = 0; j < n; j++) I[i].push(i === j ? 1 : 0); }
      return I;
    }
    var R = A.map(function (row) { return row.slice(); });
    for (var p = 1; p < k; p++) R = window.numeric.dot(R, A);
    return R;
  };
  /** 矩阵秩：高斯消元到行最简形后统计主元个数（浮点容差）。 */
  CalculatorModel.prototype.matrixRank = function (A) {
    var M = A.map(function (row) { return row.slice(); });
    var rows = M.length, cols = M[0].length;
    var r = 0, tol = 1e-9;
    for (var c = 0; c < cols && r < rows; c++) {
      var pivot = r;
      for (var i = r + 1; i < rows; i++) {
        if (Math.abs(M[i][c]) > Math.abs(M[pivot][c])) pivot = i;
      }
      if (Math.abs(M[pivot][c]) < tol) continue;
      var tmp = M[r]; M[r] = M[pivot]; M[pivot] = tmp;
      var pv = M[r][c];
      for (var j = c; j < cols; j++) M[r][j] /= pv;
      for (var i2 = 0; i2 < rows; i2++) {
        if (i2 !== r) {
          var f = M[i2][c];
          if (f !== 0) { for (var j2 = c; j2 < cols; j2++) M[i2][j2] -= f * M[r][j2]; }
        }
      }
      r++;
    }
    return r;
  };

  // ---------- 4. 算法复杂度估算 ----------

  CalculatorModel.prototype.complexity = function (opExpr, N) {
    var ast = compile(opExpr);
    var scope = { n: N };
    var value;
    try { value = evaluate(ast, scope); } catch (e) { value = NaN; }
    var L;
    try { L = magnitudeLog10(ast, scope); } catch (e) { L = NaN; }
    var sci = (isFinite(value) && Math.abs(value) < 1e300) ? formatSci(value) : formatMagnitude(L);
    return {
      value: value, log10: L,
      sci: sci,
      magnitude: formatMagnitude(L),
      magnitudeSup: formatMagnitudeSup(L),
      feasible: feasibility(value, L)
    };
  };

  CalculatorModel.prototype.complexityTable = function (opExpr, Ns) {
    var self = this;
    return Ns.map(function (N) {
      var r = self.complexity(opExpr, N);
      return { N: N, sci: r.sci, magnitudeSup: r.magnitudeSup, feasible: r.feasible };
    });
  };

  // ---------- 5. 数论 / CP 工具（接口统一） ----------

  CalculatorModel.prototype.gcd = function (a, b) { return gcdBig(a, b).toString(); };
  CalculatorModel.prototype.lcm = function (a, b) { return lcmBig(a, b).toString(); };
  CalculatorModel.prototype.modpow = function (base, exp, mod) { return modpowBig(base, exp, mod).toString(); };
  CalculatorModel.prototype.comb = function (n, k) { return bigComb(n, k).toString(); };
  CalculatorModel.prototype.factorial = function (n) { return bigFactorial(n).toString(); };
  CalculatorModel.prototype.isPrime = function (n) { return isPrimeBig(n); };
  CalculatorModel.prototype.eulerPhi = function (n) { return eulerPhiBig(n); };
  CalculatorModel.prototype.nextPrime = function (n) { return nextPrimeBig(n); };
  CalculatorModel.prototype.logb = function (x, base) {
    x = Number(x); base = Number(base);
    if (x <= 0 || base <= 0 || base === 1) throw new Error('对数要求 x>0 且 base>0、base≠1');
    return Math.log(x) / Math.log(base);
  };

  // ---------- 6. 单值数论函数（对单个整数 N） ----------

  var PRIME_COUNT_MAX = 10000000;   // 素数计数 π(N) 上限（埃氏筛，10^7 约 10MB）
  var NT_TRIAL_MAX = 1000000000000; // 试除法类函数上限（10^12，sqrt 约 10^6 次）

  function checkTrialN(n) {
    n = Math.trunc(Number(n));
    if (!isFinite(n) || n < 1) throw new Error('请输入正整数');
    if (n > NT_TRIAL_MAX) throw new Error('N 过大（上限 ' + NT_TRIAL_MAX.toLocaleString() + '）');
    return n;
  }

  /** π(N)：≤ N 的素数个数（埃氏筛）。 */
  function primeCountBig(n) {
    n = Math.trunc(Number(n));
    if (!isFinite(n) || n < 2) return 0n;
    if (n > PRIME_COUNT_MAX) throw new Error('素数计数上限为 ' + PRIME_COUNT_MAX.toLocaleString());
    var N = n;
    var sieve = new Uint8Array(N + 1);
    var cnt = 0n;
    for (var i = 2; i <= N; i++) {
      if (!sieve[i]) {
        cnt++;
        for (var j = i * i; j <= N; j += i) sieve[j] = 1;
      }
    }
    return cnt;
  }

  /** d(N)：因子（约数）个数。 */
  function divisorCountBig(n) {
    n = bigFromNum(checkTrialN(n));
    if (n === 1n) return 1n;
    var d = 1n, m = n;
    for (var p = 2n; p * p <= m; p++) {
      if (m % p === 0n) {
        var e = 0n;
        while (m % p === 0n) { m /= p; e++; }
        d *= (e + 1n);
      }
    }
    if (m > 1n) d *= 2n;
    return d;
  }

  /** ω(N)/Ω(N)：不同 / 总质因子个数（含重复）。 */
  function primeFactorCountsBig(n) {
    n = bigFromNum(checkTrialN(n));
    if (n < 2n) return { omega: 0n, Omega: 0n };
    var omega = 0n, Om = 0n, m = n;
    for (var p = 2n; p * p <= m; p++) {
      if (m % p === 0n) {
        omega++;
        while (m % p === 0n) { m /= p; Om++; }
      }
    }
    if (m > 1n) { omega++; Om++; }
    return { omega: omega, Omega: Om };
  }

  /** μ(N)：莫比乌斯函数。 */
  function mobiusBig(n) {
    n = bigFromNum(checkTrialN(n));
    if (n === 1n) return 1;
    var m = n, sign = 1, square = false;
    for (var p = 2n; p * p <= m; p++) {
      if (m % p === 0n) {
        var e = 0;
        while (m % p === 0n) { m /= p; e++; }
        if (e >= 2) { square = true; break; }
        sign = -sign;
      }
    }
    if (square) return 0;
    if (m > 1n) sign = -sign;
    return sign;
  }

  /** 质因数分解字符串（如 12 → 2²×3）。 */
  function factorizeStrBig(n) {
    n = bigFromNum(checkTrialN(n));
    if (n < 2n) return n === 1n ? '1' : String(n);
    var parts = [], m = n;
    for (var p = 2n; p * p <= m; p++) {
      if (m % p === 0n) {
        var e = 0n;
        while (m % p === 0n) { m /= p; e++; }
        parts.push(e === 1n ? String(p) : (p + toSuperscript(Number(e))));
      }
    }
    if (m > 1n) parts.push(String(m));
    return parts.join('×');
  }

  /** p(N)：分拆数（Euler 五角数定理递推，BigInt 精确）。 */
  function partitionNumberBig(n) {
    n = Math.trunc(Number(n));
    if (!isFinite(n) || n < 0) throw new Error('分拆数要求非负整数');
    if (n > 50000) throw new Error('分拆数上限为 50000（计算量过高）');
    var p = [1n];
    for (var k = 1; k <= n; k++) {
      var sum = 0n;
      for (var i = 1; ; i++) {
        var g1 = (i * (3 * i - 1)) / 2;
        var g2 = (i * (3 * i + 1)) / 2;
        if (g1 > k && g2 > k) break;
        var sgn = (i % 2 === 1) ? 1n : -1n;
        if (g1 <= k) sum += sgn * p[k - g1];
        if (g2 <= k) sum += sgn * p[k - g2];
      }
      p[k] = sum;
    }
    return p[n];
  }

  // ---------- 工具方法（供控制器使用） ----------

  CalculatorModel.prototype.compile = compile;
  CalculatorModel.prototype.evaluate = evaluate;
  CalculatorModel.prototype.parseScope = parseScope;
  CalculatorModel.prototype.formatSci = formatSci;
  CalculatorModel.prototype.formatMagnitude = formatMagnitude;
  CalculatorModel.prototype.formatMagnitudeSup = formatMagnitudeSup;
  CalculatorModel.prototype.numFromAlg = numFromAlg;
  CalculatorModel.prototype.toSuperscript = toSuperscript;
  CalculatorModel.prototype.algAvailable = function () { return !!getAlgebrite(); };
  CalculatorModel.prototype.numericAvail = hasNumeric;
  CalculatorModel.prototype.mathAvail = hasMath;
  CalculatorModel.prototype.nerdamerAvail = function () { return !!getNerdamer(); };

  // 暴露内部无状态辅助函数，供 solver-helpers.js（代入验证 / 美化）复用
  CalculatorModel.prototype._gcdBig = gcdBig;
  CalculatorModel.prototype._lcmBig = lcmBig;
  CalculatorModel.prototype._bigComb = bigComb;
  CalculatorModel.prototype._bigFactorial = bigFactorial;
  CalculatorModel.prototype._compile = compile;
  CalculatorModel.prototype._evaluate = evaluate;

  CalculatorModel.prototype.parseUserFunctions = parseUserFunctions;

  NS.models.CalculatorModel = CalculatorModel;
})();
