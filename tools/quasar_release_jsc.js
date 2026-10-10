// assets/js/quasar-core.js vs the quasar-qat code release (torch fp32), under jsc.
//   jsc tools/quasar_release_jsc.js -- <quasar-core.js> <groups.json> <quasar_release_ref.json>
// (the reference is written by tools/quasar_release_ref.py, default tools/_private/quasar_release_ref.json)
// INT: f* agreement (release EPS 1e-8 and fp32 vs the JS float64 core) and max |dr| / max|r|.
// NVFP4: per-block f*, tensor reference, QUASAR and Standard QAT reconstructions.
var args = (typeof arguments !== 'undefined') ? arguments : scriptArgs;
load(args[0]);
var Q = globalThis.QuasarCore;
var groups = JSON.parse(readFile(args[1])).groups, byId = {};
groups.forEach(function (g) { byId[g.id] = g; });
var ref = JSON.parse(readFile(args[2]));

function maxRel(a, b) {
  var m = 0, d = 0;
  for (var i = 0; i < b.length; i++) { m = Math.max(m, Math.abs(b[i])); d = Math.max(d, Math.abs(a[i] - b[i])); }
  return d / m;
}
var n = 0, f32 = 0, f32e = 0, fbf = 0, rInt = 0, rIntE = 0;
var nb = 0, fN = 0, refEq = 0, rN = 0, rStd = 0, nvBlocksDiff = [];
ref.cases.forEach(function (c) {
  var g = byId[c.id];
  [2, 3, 4].forEach(function (b) {
    var R = c.int[String(b)];
    var a = Q.quasar(g.w, g.h, b, ref.int_grid).best;                       // quasar_np semantics
    var e = Q.quasar(g.w, g.h, b, ref.int_grid, { eps: Q.EPS_RELEASE }).best; // release EPS
    n++;
    var F = Math.fround;  // the release stores the winning factor as fp32
    if (F(a.f) === F(R.f_fp32)) f32++;
    if (F(e.f) === F(R.f_fp32)) f32e++;
    if (F(a.f) === F(R.f_bf16)) fbf++; else print('  INT bf16-scored f* differs ' + c.id + ' W' + b + ': js ' + a.f + ' release(bf16) ' + R.f_bf16);
    if (F(a.f) === F(R.f_fp32)) rInt = Math.max(rInt, maxRel(a.r, R.r_fp32));
    if (F(e.f) === F(R.f_fp32)) rIntE = Math.max(rIntE, maxRel(e.r, R.r_fp32));
  });
  var v = Q.nvfp4Quasar(g.w, g.h, ref.nvfp4_grid);
  var s = Q.nvfp4Standard(g.w, g.h);
  if (v.ref === c.nvfp4.ref) refEq++;
  for (var k = 0; k < v.blocks.length; k++) {
    nb++;
    if (Math.fround(v.blocks[k].f) === Math.fround(c.nvfp4.f[k])) fN++; else nvBlocksDiff.push(c.id + '#' + k + ' js ' + v.blocks[k].f + ' release ' + c.nvfp4.f[k]);
  }
  rN = Math.max(rN, maxRel(v.r, c.nvfp4.r));
  rStd = Math.max(rStd, maxRel(s.r, c.nvfp4.r_std));
});
function e(x) { return x.toExponential(2); }
print('INT   f* = release fp32: ' + f32 + '/' + n + ' (JS eps 1e-12), ' + f32e + '/' + n + ' (JS eps 1e-8); = release bf16-scored: ' + fbf + '/' + n);
print('INT   max |dr|/max|r| vs release fp32: ' + e(rInt) + ' (eps 1e-12), ' + e(rIntE) + ' (eps 1e-8)');
print('NVFP4 tensor ref identical: ' + refEq + '/' + ref.cases.length + '; block f* equal: ' + fN + '/' + nb +
      (nvBlocksDiff.length ? ' (' + nvBlocksDiff.join('; ') + ')' : ''));
print('NVFP4 max |dr|/max|r|: QUASAR ' + e(rN) + ', Standard QAT ' + e(rStd));
