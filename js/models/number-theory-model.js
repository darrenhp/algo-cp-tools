/**
 * 数论数据模型
 * 输入区间 [lo, hi]（lo >= 1, hi <= MAX_R），用线性筛（欧拉筛）O(hi) 一次性计算
 * 区间内每个整数的多种积性函数值，并派生质因数分解与约数列表。
 *
 * 计算项：
 *   isPrime       是否素数
 *   mu            莫比乌斯函数 μ(n)
 *   phi           欧拉函数 φ(n)
 *   d             约数个数 d(n)
 *   sigma         约数和 σ(n)
 *   omega         不同质因子个数 ω(n)
 *   Omega         总质因子个数 Ω(n)（含重复）
 *   factorization 质因数分解字符串（如 "2²×3"）
 *   divisors      约数列表（升序）
 *
 * 性能：hi <= 10^7 时，浏览器约 200-500ms，内存约 400MB（Int32Array）。
 * 约数列表仅对显示区间 [lo, hi] 生成，避免全量内存开销。
 */
(function () {
  'use strict';
  var NS = window.AlgoCPTools;

  // 筛上限：线性筛 [1, R] 的 R 上限（Int32Array，浏览器可接受）
  var MAX_R = 10000000;
  // 显示行数上限：表格仅展示前 MAX_ROWS 个数（统计仍为全量区间）
  var MAX_ROWS = 3000;
  // 软上限：筛规模超过此值仅警告（筛可能较慢）
  var WARN_ROWS = 1000000;

  // 上标数字（用于质因数分解的幂次显示）
  var SUP = {
    '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3',
    '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077',
    '8': '\u2078', '9': '\u2079'
  };

  function toSuperscript(n) {
    return String(n).split('').map(function (c) { return SUP[c] || c; }).join('');
  }

  function NumberTheoryModel() {
    this.lo = 1;
    this.hi = 1;
    this.results = [];
    this.primeCount = 0;
    this.maxDivisor = 0;
    this.maxDivisorN = 1;
    this.maxR = MAX_R;
    this.warnRows = WARN_ROWS;
  }

  NumberTheoryModel.prototype.MAX_R = MAX_R;
  NumberTheoryModel.prototype.MAX_ROWS = MAX_ROWS;
  NumberTheoryModel.prototype.WARN_ROWS = WARN_ROWS;

  /**
   * 计算区间 [lo, hi] 内所有整数的数论函数值。
   * 线性筛对全量 [1, hi] 计算；素数个数与最大因数个数为全量统计；
   * 表格结果仅生成前 MAX_ROWS 个（显示截断，不影响统计）。
   * @param {number} lo - 区间下界（>= 1）
   * @param {number} hi - 区间上界（>= lo，<= MAX_R）
   * @returns {Object} { results, count, displayCount, truncated, primeCount, maxDivisor, maxDivisorN, warn }
   * @throws {Error} 输入非法时抛出
   */
  NumberTheoryModel.prototype.compute = function (lo, hi) {
    lo = Math.floor(Number(lo));
    hi = Math.floor(Number(hi));
    if (!isFinite(lo) || !isFinite(hi)) throw new Error('请输入有效的整数');
    if (lo < 1) throw new Error('下界 L 必须 >= 1');
    if (hi < lo) throw new Error('上界 R 必须 >= 下界 L');
    if (hi > MAX_R) throw new Error('上界 R 不能超过 ' + MAX_R.toLocaleString());

    this.lo = lo;
    this.hi = hi;
    var count = hi - lo + 1;
    var warn = count > WARN_ROWS;

    // 线性筛计算 [1, hi] 的积性函数
    var sieve = linearSieve(hi);

    // 全量统计区间 [lo, hi] 内素数数量（基于筛的 isPrime 数组，与显示行数无关）
    var primeCount = 0;
    var primeStart = lo < 2 ? 2 : lo;
    for (var pc = primeStart; pc <= hi; pc++) {
      if (sieve.isPrime[pc] === 1) primeCount++;
    }

    // 全量统计区间 [lo, hi] 内最大约数个数 d(n) 及对应的 n
    var maxDivisor = 0;
    var maxDivisorN = lo;
    for (var md = lo; md <= hi; md++) {
      if (sieve.d[md] > maxDivisor) {
        maxDivisor = sieve.d[md];
        maxDivisorN = md;
      }
    }

    // 仅生成前 MAX_ROWS 个数的结果（表格显示用，统计已全量完成）
    var displayCount = Math.min(count, MAX_ROWS);
    var truncated = count > MAX_ROWS;
    var results = new Array(displayCount);
    for (var n = lo; n < lo + displayCount; n++) {
      var idx = n - lo;
      results[idx] = buildResult(n, sieve);
    }

    this.results = results;
    this.primeCount = primeCount;
    this.maxDivisor = maxDivisor;
    this.maxDivisorN = maxDivisorN;
    return {
      results: results,
      count: count,
      displayCount: displayCount,
      truncated: truncated,
      primeCount: primeCount,
      maxDivisor: maxDivisor,
      maxDivisorN: maxDivisorN,
      warn: warn
    };
  };

  /**
   * 线性筛（欧拉筛）O(N) 计算 [1, N] 的积性函数。
   * 返回对象包含各函数的数组（索引 0..N，0 位未用）。
   */
  function linearSieve(N) {
    // isPrime: 0/1 标记
    var isPrime = new Uint8Array(N + 1);
    // spf: 最小质因子
    var spf = new Int32Array(N + 1);
    // mu: 莫比乌斯函数（-1/0/1）
    var mu = new Int8Array(N + 1);
    // phi: 欧拉函数
    var phi = new Int32Array(N + 1);
    // omega: 不同质因子个数
    var omega = new Int8Array(N + 1);
    // Omega: 总质因子个数（含重复）
    var Omega = new Int8Array(N + 1);
    // d: 约数个数。d[n] = d[n / spf^k] * (k+1)
    //   为递推需记录 cnt[n] = n 中 spf 的幂次 k
    var d = new Int32Array(N + 1);
    var cnt = new Int32Array(N + 1); // spf 的幂次
    // sigma: 约数和。sigma[n] = sigma[n / spf^k] * (1 + spf + ... + spf^k)
    //   为递推需记录 pk[n] = spf^k（最高次幂）和 sp[n] = 1+spf+...+spf^k
    var sigma = new Int32Array(N + 1);
    var pk = new Int32Array(N + 1);   // spf 的最高次幂 spf^k
    var sp = new Int32Array(N + 1);   // 1 + spf + ... + spf^k

    var primes = [];

    // n = 1 特殊处理
    isPrime[1] = 0;
    spf[1] = 1;
    mu[1] = 1;
    phi[1] = 1;
    omega[1] = 0;
    Omega[1] = 0;
    d[1] = 1;
    cnt[1] = 0;
    sigma[1] = 1;
    pk[1] = 1;
    sp[1] = 1;

    for (var i = 2; i <= N; i++) {
      if (spf[i] === 0) {
        // i 是素数
        isPrime[i] = 1;
        spf[i] = i;
        mu[i] = -1;
        phi[i] = i - 1;
        omega[i] = 1;
        Omega[i] = 1;
        d[i] = 2;
        cnt[i] = 1;
        sigma[i] = i + 1;
        pk[i] = i;
        sp[i] = i + 1;
        primes.push(i);
      }
      for (var j = 0; j < primes.length; j++) {
        var p = primes[j];
        var ip = i * p;
        if (ip > N) break;
        spf[ip] = p;
        Omega[ip] = Omega[i] + 1;
        if (i % p === 0) {
          // p 是 i 的最小质因子
          // mu[ip] = 0（含平方因子 p^2）
          mu[ip] = 0;
          // phi[ip] = phi[i] * p
          phi[ip] = phi[i] * p;
          // omega[ip] = omega[i]（p 已在 i 中出现）
          omega[ip] = omega[i];
          // d[ip] = d[i] / (cnt[i]+1) * (cnt[i]+2)
          cnt[ip] = cnt[i] + 1;
          d[ip] = (d[i] / (cnt[i] + 1)) * (cnt[ip] + 1);
          // sigma[ip] = sigma[i] / sp[i] * (sp[i] + p^(cnt[i]+1))
          //   = sigma[i] / sp[i] * (sp[i] + p * pk[i])
          pk[ip] = pk[i] * p;
          sp[ip] = sp[i] + pk[ip];
          sigma[ip] = (sigma[i] / sp[i]) * sp[ip];
          break;
        } else {
          // p 不是 i 的因子（p < spf[i]）
          mu[ip] = -mu[i];
          phi[ip] = phi[i] * (p - 1);
          omega[ip] = omega[i] + 1;
          // d[ip] = d[i] * 2（p 是新因子，幂次 1）
          cnt[ip] = 1;
          d[ip] = d[i] * 2;
          // sigma[ip] = sigma[i] * (p + 1)
          pk[ip] = p;
          sp[ip] = p + 1;
          sigma[ip] = sigma[i] * (p + 1);
        }
      }
    }

    return {
      N: N,
      isPrime: isPrime,
      spf: spf,
      mu: mu,
      phi: phi,
      omega: omega,
      Omega: Omega,
      d: d,
      sigma: sigma
    };
  }

  /**
   * 为单个 n 构建结果对象。
   * @param {number} n
   * @param {Object} sieve - linearSieve 的返回值
   */
  function buildResult(n, sieve) {
    var isPrime = sieve.isPrime[n] === 1;
    var mu = sieve.mu[n];
    var phi = sieve.phi[n];
    var d = sieve.d[n];
    var sigma = sieve.sigma[n];
    var omega = sieve.omega[n];
    var Omega = sieve.Omega[n];

    // 质因数分解：由 spf 逐次除得到
    var factors = factorize(n, sieve.spf);
    var factorization = formatFactorization(factors);
    // 约数列表：由质因数分解 DFS 组合
    var divisors = listDivisors(factors);

    return {
      n: n,
      isPrime: isPrime,
      mu: mu,
      phi: phi,
      d: d,
      sigma: sigma,
      omega: omega,
      Omega: Omega,
      factorization: factorization,
      divisors: divisors
    };
  }

  /**
   * 由 spf 数组得到 n 的质因数分解。
   * @returns {Array<{p, e}>} 质因子及幂次，按 p 升序
   */
  function factorize(n, spf) {
    if (n === 1) return [];
    var factors = [];
    var cur = n;
    while (cur > 1) {
      var p = spf[cur];
      var e = 0;
      while (cur % p === 0) {
        cur = cur / p;
        e++;
      }
      factors.push({ p: p, e: e });
    }
    return factors;
  }

  /**
   * 格式化质因数分解为字符串。
   * 1 → "1"
   * 12 → "2²×3"
   * 8 → "2³"
   * @param {Array<{p, e}>} factors
   */
  function formatFactorization(factors) {
    if (factors.length === 0) return '1';
    return factors.map(function (f) {
      return f.e === 1 ? String(f.p) : (f.p + toSuperscript(f.e));
    }).join('\u00d7');
  }

  /**
   * 由质因数分解生成约数列表（升序）。
   * @param {Array<{p, e}>} factors
   * @returns {number[]}
   */
  function listDivisors(factors) {
    if (factors.length === 0) return [1];
    var divs = [1];
    for (var i = 0; i < factors.length; i++) {
      var p = factors[i].p;
      var e = factors[i].e;
      var curLen = divs.length;
      var pe = 1;
      for (var k = 1; k <= e; k++) {
        pe *= p;
        for (var j = 0; j < curLen; j++) {
          divs.push(divs[j] * pe);
        }
      }
    }
    divs.sort(function (a, b) { return a - b; });
    return divs;
  }

  NS.models.NumberTheoryModel = NumberTheoryModel;
})();
