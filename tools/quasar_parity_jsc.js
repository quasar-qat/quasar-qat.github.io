// JS-vs-numpy parity driver for assets/js/quasar-core.js (runs under JavaScriptCore's jsc).
//
//   jsc tools/quasar_parity_jsc.js -- <quasar-core.js> <groups.json> <ref.json>
//
// For every (group, bits) case in ref.json (written by tools/quasar_parity_ref.py from
// quasar_np.py, the numpy reference of Algorithm 1) recompute Standard QAT and QUASAR in JS and report:
// f* agreement, code agreement, max relative differences in S / s / z / r and the
// full per-f sweep, and how many values are bit-identical. Prints PASS or FAIL.
var args = (typeof arguments !== 'undefined') ? arguments : scriptArgs;
load(args[0]);
var Q = globalThis.QuasarCore;
var groups = JSON.parse(readFile(args[1])).groups;
var ref = JSON.parse(readFile(args[2]));
var byId = {};
var gridOk = Q.PAPER_GRID.length === ref.grid.length && Q.PAPER_GRID.every(function (f, i) { return f === ref.grid[i]; });
print("JS PAPER_GRID === numpy PAPER_GRID: " + gridOk);
groups.forEach(function (g) { byId[g.id] = g; });

var st = { cases: 0, fMismatch: 0, qMismatch: 0, stdQMismatch: 0, histMismatch: 0,
           relS: 0, relSstd: 0, relSweepS: 0, relS_s: 0, relZ: 0, relR: 0, relRelem: 0,
           relRstd: 0, effBits: 0, nVals: 0, nExact: 0, worst: '' };
function rel(a, b) { return a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), 1e-300); }
function exact(a, b) { st.nVals++; if (a === b) st.nExact++; }

ref.cases.forEach(function (c) {
  var g = byId[c.id], b = c.bits;
  st.cases++;
  var std = Q.standardQAT(g.w, b, g.h);
  var res = Q.quasar(g.w, g.h, b);  // default factors = Q.PAPER_GRID (checked below)
  var best = res.best;
  if (best.f !== c.best.f) { st.fMismatch++; print('f* mismatch ' + c.id + ' W' + b + ': js ' + best.f + ' np ' + c.best.f); }
  var i, rmax = 0, smax = 0;
  for (i = 0; i < g.w.length; i++) {
    if (best.q[i] !== c.best.q[i]) st.qMismatch++;
    if (std.q[i] !== c.std.q[i]) st.stdQMismatch++;
    rmax = Math.max(rmax, Math.abs(c.best.r[i])); smax = Math.max(smax, Math.abs(c.std.r[i]));
  }
  for (i = 0; i < g.w.length; i++) {
    var dr = Math.abs(best.r[i] - c.best.r[i]);
    st.relR = Math.max(st.relR, dr / rmax);
    if (c.best.r[i] !== 0) st.relRelem = Math.max(st.relRelem, dr / Math.abs(c.best.r[i]));
    st.relRstd = Math.max(st.relRstd, Math.abs(std.r[i] - c.std.r[i]) / smax);
    exact(best.r[i], c.best.r[i]); exact(std.r[i], c.std.r[i]);
  }
  var rS = rel(best.S, c.best.S);
  if (rS > st.relS) { st.relS = rS; st.worst = c.id + ' W' + b; }
  st.relSstd = Math.max(st.relSstd, rel(std.S, c.std.S));
  st.relS_s = Math.max(st.relS_s, rel(best.s, c.best.s));
  st.relZ = Math.max(st.relZ, rel(best.z, c.best.z));
  exact(best.S, c.best.S); exact(std.S, c.std.S); exact(best.s, c.best.s); exact(best.z, c.best.z);
  exact(std.s, c.std.s); exact(std.z, c.std.z);
  for (var k = 0; k < c.sweep.length; k++) {
    st.relSweepS = Math.max(st.relSweepS, rel(res.sweep[k].S, c.sweep[k].S));
    exact(res.sweep[k].S, c.sweep[k].S); exact(res.sweep[k].s, c.sweep[k].s); exact(res.sweep[k].z, c.sweep[k].z);
    if (res.sweep[k].nClipped !== c.sweep[k].n_clipped) st.qMismatch++;
  }
  var hist = Q.codeHistogram(best.q, b);
  if (hist.join() !== c.hist.join()) st.histMismatch++;
  st.effBits = Math.max(st.effBits, Math.abs(Q.effectiveBits(best.q, b) - c.eff_bits));
});

function e(x) { return x.toExponential(2); }
print('cases ' + st.cases + ' (groups x bits)');
print('f* mismatches        ' + st.fMismatch);
print('code mismatches      quasar ' + st.qMismatch + ', standard ' + st.stdQMismatch + ', histograms ' + st.histMismatch);
print('max rel diff S       quasar ' + e(st.relS) + ' (' + (st.worst || '-') + '), standard ' + e(st.relSstd) + ', full sweep ' + e(st.relSweepS));
print('max rel diff s, z    ' + e(st.relS_s) + ', ' + e(st.relZ));
print('max rel diff r       quasar ' + e(st.relR) + ' (of group max|r|), ' + e(st.relRelem) + ' (elementwise); standard ' + e(st.relRstd));
print('max |eff bits diff|  ' + e(st.effBits));
print('bit-identical values ' + st.nExact + ' / ' + st.nVals);
var ok = gridOk && st.fMismatch === 0 && st.qMismatch === 0 && st.stdQMismatch === 0 && st.histMismatch === 0 &&
         st.relS < 1e-6 && st.relSstd < 1e-6 && st.relSweepS < 1e-6 && st.relR < 1e-6 && st.relRelem < 1e-6 &&
         st.relRstd < 1e-6 && st.effBits < 1e-9;
print(ok ? 'PASS' : 'FAIL');
