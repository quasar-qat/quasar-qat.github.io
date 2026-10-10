/*
 * quasar-core.js — computational core of the "quantize one real weight group" widget.
 *
 * A float64 port of QUASAR's per-group reconstruction (paper Algorithm 1 /
 * Algorithm "QUASAR for affine integer quantization") and of Standard QAT's
 * min-max reconstruction, mirroring the numpy reference quasar_np.py line by line:
 *
 *   Standard QAT:  z = min w,  s = (max w - min w) / (2^b - 1),
 *                  q = clamp(round((w - z) / s)),  r = s q + z
 *   QUASAR:        c = (min w + max w) / 2,  rho = (max w - min w) / 2
 *                  for f in F:  codes on I_f = [c - f rho, c + f rho] (round + clamp),
 *                               (s_f, z_f) = h-weighted least squares fit of r = s q + z,
 *                               S_f = sum_i h_i (r_i - w_i)^2
 *                  keep f* = argmin S_f (ties keep the smaller f, as the release kernel does)
 *
 * The paper's fit (Eq. ridgefit) has no ridge term; `lambda` (default 0) exists
 * only for parity with quasar_np.py's legacy `lmd` knob. `eps` (default 1e-12)
 * is quasar_np.py's division guard; the code release uses 1e-8.
 *
 * Rounding is round-half-to-even (numpy / torch.round) and every reduction
 * replays numpy's pairwise summation, so on identical inputs the outputs are
 * bit-identical to quasar_np.py (verified by tools/run_quasar_parity.sh).
 *
 * Also included: an NVFP4 variant (E2M1 codes, E4M3 group scales of 16 weights,
 * one FP32 tensor scale) mirroring quasar-qat/quasar/quant/{quasar,nvfp4,baselines}.py.
 *
 * Plain script, no dependencies, no modules: attaches window.QuasarCore
 * (globalThis.QuasarCore outside a browser).
 */
(function (root) {
  'use strict';

  var PAPER_GRID = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75,
                    0.80, 0.85, 0.90, 0.95, 1.00];
  var NVFP4_GRID = [0.8, 0.9, 1.0, 1.25, 1.5];   // code release NVFP4_GRID
  var EPS_NP = 1e-12;                             // quasar_np.py guard
  var EPS_RELEASE = 1e-8;                         // code release config.EPS

  // ------------------------------------------------------------- numerics
  function toF64(a) {
    if (a instanceof Float64Array) return a;
    var out = new Float64Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = +a[i];
    return out;
  }

  // numpy's float64 add.reduce: 0.0 + pairwise_sum(a) (8-way unrolled blocks of <= 128).
  function pairwise(a, lo, n) {
    var i, res;
    if (n < 8) {
      res = 0.0;
      for (i = 0; i < n; i++) res += a[lo + i];
      return res;
    }
    if (n <= 128) {
      var r0 = a[lo], r1 = a[lo + 1], r2 = a[lo + 2], r3 = a[lo + 3],
          r4 = a[lo + 4], r5 = a[lo + 5], r6 = a[lo + 6], r7 = a[lo + 7];
      var end = n - (n % 8);
      for (i = 8; i < end; i += 8) {
        r0 += a[lo + i];     r1 += a[lo + i + 1]; r2 += a[lo + i + 2]; r3 += a[lo + i + 3];
        r4 += a[lo + i + 4]; r5 += a[lo + i + 5]; r6 += a[lo + i + 6]; r7 += a[lo + i + 7];
      }
      res = ((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7));
      for (; i < n; i++) res += a[lo + i];
      return res;
    }
    var n2 = Math.floor(n / 2);
    n2 -= n2 % 8;
    return pairwise(a, lo, n2) + pairwise(a, lo + n2, n - n2);
  }
  function sum(a) { return 0.0 + pairwise(a, 0, a.length); }

  function roundHalfEven(x) {
    var f = Math.floor(x), d = x - f;           // exact for doubles
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return (f % 2 === 0) ? f : f + 1;
  }

  function minMax(w) {
    var lo = w[0], hi = w[0];
    for (var i = 1; i < w.length; i++) {
      if (w[i] < lo) lo = w[i];
      if (w[i] > hi) hi = w[i];
    }
    return [lo, hi];
  }

  // ------------------------------------------------------------- INT (affine)
  /** Codes q_f of w on [c - f rho, c + f rho] (round + clamp). quasar_np.codes
   *  Two "clipping" notions are returned (q is the same either way):
   *    outside / nOutside  w outside the assignment range I_f = [lo, hi] (the paper's
   *                        "f < 1 clips weights outside it"; what the widget rings),
   *    clipped / nClipped  the rounded code saturates (raw < 0 or > 2^b - 1), i.e.
   *                        quasar_np's `clip` (kept for the numpy parity test).
   *  `outside` uses a 1e-9 * rho tolerance so the f = 1 range (lo = min, hi = max up to
   *  rounding) never flags the group's own extremes. */
  function codes(w, f, bits, opts) {
    w = toF64(w);
    var eps = (opts && opts.eps != null) ? opts.eps : EPS_NP;
    var qmax = Math.pow(2, bits) - 1;
    var mm = minMax(w);
    var c = (opts && opts.center != null) ? opts.center : (mm[1] + mm[0]) / 2;
    var rho = (opts && opts.half != null) ? opts.half : (mm[1] - mm[0]) / 2;
    var lo = c - f * rho, hi = c + f * rho;
    var den = hi - lo + eps;
    var tol = 1e-9 * Math.abs(rho);
    var n = w.length, q = new Float64Array(n), clipped = new Uint8Array(n), nClip = 0;
    var outside = new Uint8Array(n), nOut = 0;
    for (var i = 0; i < n; i++) {
      var raw = roundHalfEven((w[i] - lo) / den * qmax);
      if (raw < 0 || raw > qmax) { clipped[i] = 1; nClip++; }
      if (w[i] < lo - tol || w[i] > hi + tol) { outside[i] = 1; nOut++; }
      q[i] = raw < 0 ? 0 : (raw > qmax ? qmax : raw);
    }
    return { q: q, clipped: clipped, nClipped: nClip, outside: outside, nOutside: nOut,
             lo: lo, hi: hi, c: c, rho: rho };
  }

  /** Closed-form saliency-weighted least squares (s*, z*) for r = s q + z. quasar_np.fit_dequant */
  function fitDequant(w, q, h, lambda, eps) {
    w = toF64(w); q = toF64(q); h = toF64(h);
    var lmd = lambda || 0.0, e = (eps != null) ? eps : EPS_NP;
    var n = w.length, H = sum(h);
    var hn = new Float64Array(n), t = new Float64Array(n);
    for (var i = 0; i < n; i++) hn[i] = h[i] / H;
    for (i = 0; i < n; i++) t[i] = hn[i] * q[i];
    var qb = sum(t);
    for (i = 0; i < n; i++) t[i] = hn[i] * w[i];
    var wb = sum(t);
    for (i = 0; i < n; i++) t[i] = hn[i] * q[i] * q[i];
    var varQ = sum(t) - qb * qb;
    for (i = 0; i < n; i++) t[i] = hn[i] * q[i] * w[i];
    var cov = sum(t) - qb * wb;
    var s = cov / (varQ + lmd + e);
    return { s: s, z: wb - s * qb };
  }

  /** Loss-aware reconstruction error  S_hat = sum_i h_i (r_i - w_i)^2 */
  function sHat(w, h, r) {
    w = toF64(w); h = toF64(h); r = toF64(r);
    var n = w.length, t = new Float64Array(n);
    for (var i = 0; i < n; i++) { var d = r[i] - w[i]; t[i] = h[i] * (d * d); }
    return sum(t);
  }

  /** Per-weight loss-aware error h_i (r_i - w_i)^2 (for heatmaps). */
  function perWeightError(w, h, r) {
    var n = w.length, out = new Float64Array(n);
    for (var i = 0; i < n; i++) { var d = r[i] - w[i]; out[i] = h[i] * (d * d); }
    return out;
  }

  function reconstruct(q, s, z) {
    var r = new Float64Array(q.length);
    for (var i = 0; i < q.length; i++) r[i] = s * q[i] + z;
    return r;
  }

  /** Dequantization levels z + s k, k = 0 .. 2^b - 1. */
  function levels(s, z, bits) {
    var L = Math.pow(2, bits), out = new Float64Array(L);
    for (var k = 0; k < L; k++) out[k] = z + s * k;
    return out;
  }

  /** Standard QAT / RTN: grid from the group's min and max, no fitting. quasar_np.standard_qat
   *  (h optional: when given, S is filled in.) */
  function standardQAT(w, bits, h) {
    w = toF64(w);
    var qmax = Math.pow(2, bits) - 1, mm = minMax(w), lo = mm[0], hi = mm[1];
    var s = (hi - lo) / qmax, n = w.length, q = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var raw = s > 0 ? roundHalfEven((w[i] - lo) / s) : 0;  // constant group: one level
      q[i] = raw < 0 ? 0 : (raw > qmax ? qmax : raw);
    }
    var r = reconstruct(q, s, lo);
    var out = { f: 1.0, s: s, z: lo, q: q, r: r, lo: lo, hi: hi, bits: bits };
    if (h) out.S = sHat(w, h, r);
    return out;
  }

  /**
   * QUASAR: scale search over `factors` + closed-form fit; keeps f* = argmin S_hat(f).
   * opts: { lambda: 0, eps: 1e-12 }.
   * Returns { best, sweep, c, rho, bits, factors } where best / every sweep entry is
   *   { f, index, s, z, q, r, S, obj, lo, hi, clipped, nClipped, clip, outside, nOutside }.
   * (lo, hi) is the assignment range I_f; q are codes 0..2^b-1 (Float64Array);
   * outside / clipped: see codes().
   */
  function quasar(w, h, bits, factors, opts) {
    w = toF64(w); h = toF64(h);
    factors = factors || PAPER_GRID;
    opts = opts || {};
    var lmd = opts.lambda || 0.0, eps = (opts.eps != null) ? opts.eps : EPS_NP;
    var H = sum(h), sweep = [], best = null;
    for (var k = 0; k < factors.length; k++) {
      var f = factors[k];
      var cd = codes(w, f, bits, { eps: eps });
      var fit = fitDequant(w, cd.q, h, lmd, eps);
      var r = reconstruct(cd.q, fit.s, fit.z);
      var S = sHat(w, h, r);
      var obj = S / H + lmd * fit.s * fit.s;   // == S ranking at lambda = 0
      var e = { f: f, index: k, s: fit.s, z: fit.z, q: cd.q, r: r, S: S, obj: obj,
                lo: cd.lo, hi: cd.hi, clipped: cd.clipped, nClipped: cd.nClipped,
                clip: cd.nClipped / w.length, outside: cd.outside, nOutside: cd.nOutside };
      sweep.push(e);
      if (best === null || obj < best.obj) best = e;   // strict: ties keep the earlier f
    }
    var mm = minMax(w);
    return { best: best, sweep: sweep, c: (mm[1] + mm[0]) / 2, rho: (mm[1] - mm[0]) / 2,
             bits: bits, factors: factors.slice() };
  }

  /** Both reconstructions of one group + the headline ratio S_std / S_quasar. */
  function compare(w, h, bits, factors, opts) {
    w = toF64(w); h = toF64(h);
    var std = standardQAT(w, bits, h);
    var res = quasar(w, h, bits, factors, opts);
    return { standard: std, quasar: res, Sstd: std.S, Squasar: res.best.S,
             gain: std.S / res.best.S };
  }

  // ------------------------------------------------------------- code statistics
  /** Counts of each code 0 .. 2^b - 1. */
  function codeHistogram(q, bits) {
    var L = Math.pow(2, bits), c = new Array(L);
    for (var k = 0; k < L; k++) c[k] = 0;
    for (var i = 0; i < q.length; i++) c[q[i] | 0]++;
    return c;
  }

  /** Effective bits = Shannon entropy (bits) of the code distribution. */
  function effectiveBits(q, bits) {
    var c = codeHistogram(q, bits), n = q.length, Hb = 0;
    for (var k = 0; k < c.length; k++) {
      if (c[k] > 0) { var p = c[k] / n; Hb -= p * Math.log2(p); }
    }
    return Hb;
  }

  function normalizeSaliency(h) {
    h = toF64(h);
    var m = sum(h) / h.length, out = new Float64Array(h.length);
    for (var i = 0; i < h.length; i++) out[i] = h[i] / m;
    return out;
  }

  // ------------------------------------------------------------- NVFP4 (optional)
  var E2M1_LEVELS = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0];
  var E2M1_MIDS = [0.25, 0.75, 1.25, 1.75, 2.5, 3.5, 5.0];
  var E2M1_MAX = 6.0, E4M3_MAX = 448.0, E4M3_MIN = Math.pow(2, -9);
  var FP32_TINY = Math.pow(2, -126);

  /** Nearest signed E2M1 level; exact midpoints round toward zero; |y| > 6 saturates. */
  function e2m1(y) {
    var a = Math.abs(y), k = 0;
    while (k < 7 && a > E2M1_MIDS[k]) k++;
    var v = E2M1_LEVELS[k];
    return y > 0 ? v : (y < 0 ? -v : 0);
  }

  /** Round to the nearest E4M3 (fn) value, ties to even, saturating at +-448. */
  function e4m3(x) {
    if (x !== x) return x;
    var s = x < 0 ? -1 : 1, a = Math.abs(x);
    if (a >= E4M3_MAX) return s * E4M3_MAX;
    if (a === 0) return 0 * s;
    var ulp;
    if (a < Math.pow(2, -6)) {
      ulp = Math.pow(2, -9);                      // subnormals k * 2^-9
    } else {
      var e = Math.floor(Math.log2(a));
      while (Math.pow(2, e) > a) e--;
      while (Math.pow(2, e + 1) <= a) e++;
      ulp = Math.pow(2, e - 3);                   // 3 mantissa bits
    }
    var v = roundHalfEven(a / ulp) * ulp;
    return s * Math.min(v, E4M3_MAX);
  }

  // fp32 helpers for the per-tensor reference (deployment stores it in fp32)
  var _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
  function nextUpF32(x) {          // x > 0 finite fp32
    _f32[0] = x; _u32[0] = _u32[0] + 1; return _f32[0];
  }
  /** code release nvfp4.ct_divisor_snap: smallest fp32 ref' >= ref whose S = ref'/448 survives 1/(1/S). */
  function ctDivisorSnap(ref) {
    var out = Math.fround(ref), fr = Math.fround;
    for (var i = 0; i < 64; i++) {
      var second = fr(out / E4M3_MAX);
      if (fr(1 / fr(1 / second)) === second) return out;
      out = nextUpF32(out);
    }
    throw new Error('ct divisor snap did not converge');
  }

  function nvfpBlocks(w, group) {
    group = group || 16;
    if (w.length % group) throw new Error('length must be a multiple of ' + group);
    return w.length / group;
  }
  /** Per-tensor reference ref = snap(factor * max_g absmax_g / 6) in fp32 (all blocks of w = one tensor). */
  function nvfp4TensorRef(w, factor, group) {
    group = group || 16;
    var nb = nvfpBlocks(w, group), mb = 0;
    for (var b = 0; b < nb; b++) {
      var am = 0;
      for (var i = 0; i < group; i++) am = Math.max(am, Math.abs(w[b * group + i]));
      mb = Math.max(mb, Math.fround(Math.fround(am) / E2M1_MAX));
    }
    return ctDivisorSnap(Math.fround(mb * (factor == null ? 1.0 : factor)));
  }
  function secondLevel(ref) { return Math.max(Math.fround(ref / E4M3_MAX), FP32_TINY); }
  function twoLevelScale(s, second) {
    return second * e4m3(Math.min(Math.max(s / second, E4M3_MIN), E4M3_MAX));
  }

  /** Standard QAT (NVFP4): absmax group scales on the two-level lattice. */
  function nvfp4Standard(w, h, opts) {
    w = toF64(w); opts = opts || {};
    var group = opts.group || 16, eps = (opts.eps != null) ? opts.eps : EPS_RELEASE;
    var ref = (opts.ref != null) ? opts.ref : nvfp4TensorRef(w, 1.0, group);
    var second = secondLevel(ref), nb = nvfpBlocks(w, group);
    var r = new Float64Array(w.length), q = new Float64Array(w.length), scales = [];
    for (var b = 0; b < nb; b++) {
      var am = 0, o = b * group, i;
      for (i = 0; i < group; i++) am = Math.max(am, Math.abs(w[o + i]));
      var s = twoLevelScale(am / E2M1_MAX, second);
      for (i = 0; i < group; i++) { q[o + i] = e2m1(w[o + i] / (s + eps)); r[o + i] = s * q[o + i]; }
      scales.push(s);
    }
    var out = { r: r, q: q, scales: scales, ref: ref, second: second };
    if (h) out.S = sHat(w, h, r);
    return out;
  }

  /** QUASAR (NVFP4): per block of 16, search f, E2M1 codes on the E4M3-rounded assignment
   *  scale, h-weighted LS fit of one scale rounded onto the E4M3 lattice; keep argmin. */
  function nvfp4Quasar(w, h, factors, opts) {
    w = toF64(w); h = toF64(h); opts = opts || {};
    factors = factors || NVFP4_GRID;
    var group = opts.group || 16, eps = (opts.eps != null) ? opts.eps : EPS_RELEASE;
    var fmax = Math.max.apply(null, factors);
    var ref = (opts.ref != null) ? opts.ref : nvfp4TensorRef(w, fmax, group);
    var second = secondLevel(ref), nb = nvfpBlocks(w, group);
    var r = new Float64Array(w.length), q = new Float64Array(w.length), blocks = [];
    for (var b = 0; b < nb; b++) {
      var o = b * group, am = 0, i, hs = 0;
      for (i = 0; i < group; i++) { am = Math.max(am, Math.abs(w[o + i])); hs += h[o + i]; }
      hs = Math.max(hs, eps);
      var base = am / E2M1_MAX, best = null, sweep = [];
      for (var k = 0; k < factors.length; k++) {
        var sc = twoLevelScale(base * factors[k], second);
        var qq = new Float64Array(group), sqx = 0, sqq = 0;
        for (i = 0; i < group; i++) {
          qq[i] = e2m1(w[o + i] / (sc + eps));
          sqx += h[o + i] * qq[i] * w[o + i]; sqq += h[o + i] * qq[i] * qq[i];
        }
        var a = (sqx / hs) / (sqq / hs + eps);
        var st = second * e4m3(Math.min(Math.max(a / second, -E4M3_MAX), E4M3_MAX));
        var err = 0;
        for (i = 0; i < group; i++) { var d = st * qq[i] - w[o + i]; err += h[o + i] * d * d; }
        err /= hs;
        var e = { f: factors[k], index: k, assignScale: sc, s: st, q: qq, err: err };
        sweep.push(e);
        if (best === null || err < best.err) best = e;  // strict: ties keep the earlier f
      }
      for (i = 0; i < group; i++) { q[o + i] = best.q[i]; r[o + i] = best.s * best.q[i]; }
      blocks.push({ f: best.f, s: best.s, err: best.err, sweep: sweep });
    }
    return { r: r, q: q, blocks: blocks, ref: ref, second: second, S: sHat(w, h, r) };
  }

  root.QuasarCore = {
    PAPER_GRID: PAPER_GRID, NVFP4_GRID: NVFP4_GRID, EPS_NP: EPS_NP, EPS_RELEASE: EPS_RELEASE,
    standardQAT: standardQAT, quasar: quasar, compare: compare,
    codes: codes, fitDequant: fitDequant, reconstruct: reconstruct, levels: levels,
    sHat: sHat, perWeightError: perWeightError,
    codeHistogram: codeHistogram, effectiveBits: effectiveBits,
    normalizeSaliency: normalizeSaliency,
    nvfp4Standard: nvfp4Standard, nvfp4Quasar: nvfp4Quasar, nvfp4TensorRef: nvfp4TensorRef,
    e2m1: e2m1, e4m3: e4m3,
    _sum: sum, _roundHalfEven: roundHalfEven
  };
})(typeof window !== 'undefined' ? window : globalThis);
