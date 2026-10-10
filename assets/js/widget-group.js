/* widget-group.js — "quantize one real weight group" (method section centerpiece).
   Mount: #group-widget. Needs window.Viz (viz.js), window.QuasarCore (quasar-core.js) and
   assets/data/groups.json (real bf16 Qwen3-4B-Instruct-2507 groups, g = 128, with saliency h).
   Every number shown is computed live by QuasarCore (Algorithm 1 + Standard QAT); the widget
   renders data labels only. Dev hooks: window.GW_DEV = {group, bits, f, mode, nointro, search}. */
(function () {
  "use strict";
  const SCRIPT_SRC = document.currentScript ? document.currentScript.src : "";

  function boot() {
    const V = window.Viz, Q = window.QuasarCore;
    const mount = document.getElementById("group-widget");
    if (!mount || !V || !Q || mount.dataset.gwReady) return;
    mount.dataset.gwReady = "1";
    const url = mount.getAttribute("data-src") ||
      (SCRIPT_SRC ? new URL("../data/groups.json", SCRIPT_SRC).href : "assets/data/groups.json");
    V.json(url).then((data) => build(mount, data, V, Q)).catch((e) => console.error("[group-widget]", e));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  function build(mount, data, V, Q) {
    const RM = V.reducedMotion;
    const DEV = window.GW_DEV || {};
    const C = { rose: "#D1495B", roseD: "#A13040", graph: "#3F4245", steel: "#2E6F95", ink: "#1D1F22", muted: "#6B6F75" };
    const GRID = Q.PAPER_GRID, NF = GRID.length;
    const G = data.groups, POP = data.population || {};
    const BITS = [2, 3, 4];
    const BITS_UI = [4, 3, 2];   // pill order = every results chart on the page
    const MINUS = "−";
    const COARSE = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    const STEP_MS = 190;

    // ------------------------------------------------------------------ formatting
    const sgn = (s) => String(s).replace(/^-/, MINUS);
    const fmtF = (f) => (+f).toFixed(2);
    function fmtRatio(r) {
      if (r >= 10) return r.toFixed(1);
      if (r >= 0.095) return r.toFixed(2);
      return (+r.toPrecision(2)).toString();
    }
    const fmtW = (v) => (v === 0 ? "0" : sgn((+v).toPrecision(3)));
    const fmtH = (v) => (v >= 0.01 ? (+v.toPrecision(3)).toString() : v.toExponential(2).replace("e-", "e" + MINUS));
    function tickDec(step) {
      let d = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
      while (d < 8 && Math.abs(Math.round(step * Math.pow(10, d)) - step * Math.pow(10, d)) > 1e-6) d++;
      return d;
    }
    const fmtTick = (v) => String(+v.toPrecision(3)) + "×";
    const shortName = (g) => "L" + g.layer + " " + g.proj;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    // saliency colour: white -> steel blue on t = sqrt(h / max h)
    function mix(t) {
      t = Math.max(0, Math.min(1, t));
      const a = [255, 255, 255], b = [46, 111, 149];
      return "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",") + ")";
    }

    // ------------------------------------------------------------------ model
    const mcache = {};
    function model(gi) {
      if (mcache[gi]) return mcache[gi];
      const g = G[gi];
      const w = Float64Array.from(g.w), h = Float64Array.from(g.h), n = w.length;
      let hmax = 0, wmin = Infinity, wmax = -Infinity;
      for (let i = 0; i < n; i++) { hmax = Math.max(hmax, h[i]); wmin = Math.min(wmin, w[i]); wmax = Math.max(wmax, w[i]); }
      const t = new Float64Array(n);
      for (let i = 0; i < n; i++) t[i] = Math.sqrt(h[i] / hmax);
      let lo = wmin, hi = wmax;
      const byBits = {};
      for (const b of BITS) {
        const std = Q.standardQAT(w, b, h);
        const res = Q.quasar(w, h, b, GRID);
        const ratio = res.sweep.map((e) => e.S / std.S);
        const lev = res.sweep.map((e) => Array.from(Q.levels(e.s, e.z, b)));
        const hist = res.sweep.map((e) => Q.codeHistogram(e.q, b));
        const stdLev = Array.from(Q.levels(std.s, std.z, b));
        for (const L of lev) for (const v of L) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        byBits[b] = { std, res, ratio, lev, hist, stdLev, stdHist: Q.codeHistogram(std.q, b), best: res.best.index };
      }
      return (mcache[gi] = { g, w, h, t, n, hmax, wmin, wmax, c: (wmin + wmax) / 2, rho: (wmax - wmin) / 2, dom: [lo, hi], byBits });
    }

    // ------------------------------------------------------------------ state
    const clampI = (v, lo, hi, d) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
    const S = {
      gi: clampI(DEV.group, 0, G.length - 1, 0),
      bits: BITS.includes(+DEV.bits) ? +DEV.bits : 2,
      fi: 0, mode: "r", searching: false, searchK: -1, touched: false,
    };
    S.fi = model(S.gi).byBits[S.bits].best;
    if (DEV.f != null) { const k = GRID.findIndex((f) => Math.abs(f - +DEV.f) < 1e-9); if (k >= 0) S.fi = k; }
    if (DEV.mode === "w" || DEV.mode === "r") S.mode = DEV.mode;
    const wantIntro = !RM && !DEV.nointro && DEV.search == null && "IntersectionObserver" in window;
    // intro: the first frame is the search's first state (f = 0.30 only, no f*), never the answer
    let introPending = wantIntro;
    if (wantIntro) { S.mode = "w"; S.searching = true; S.searchK = 0; S.fi = 0; }

    // ------------------------------------------------------------------ animation (exponential smoothing)
    const chans = new Map();
    let raf = 0, lastT = 0;
    function channel(name, n, apply, tau) {
      const c = { cur: new Float64Array(n), tgt: new Float64Array(n), apply, tau: tau || null, init: false };
      chans.set(name, c);
      return c;
    }
    function setTarget(c, arr, instant) {
      for (let i = 0; i < c.tgt.length; i++) c.tgt[i] = arr[i];
      if (instant || RM || !c.init) { c.cur.set(c.tgt); c.init = true; c.apply(c.cur); }
      else if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
    }
    function tick(now) {
      const dt = Math.min(48, Math.max(1, now - lastT)); lastT = now;
      let active = false;
      for (const c of chans.values()) {
        let moved = false;
        for (let i = 0; i < c.cur.length; i++) {
          const d = c.tgt[i] - c.cur[i];
          if (d === 0) continue;
          if (Math.abs(d) < 0.12) c.cur[i] = c.tgt[i];
          else c.cur[i] += d * (1 - Math.exp(-dt / (c.tau ? c.tau[i] : 75)));
          moved = true;
        }
        if (moved) { c.apply(c.cur); active = true; }
      }
      raf = active ? requestAnimationFrame(tick) : 0;
    }

    // ------------------------------------------------------------------ DOM scaffold
    mount.classList.add("gw");
    mount.setAttribute("data-label", "");
    const root = V.h("div", { class: "gw-root" }, mount);

    const ctr = V.h("div", { class: "controls gw-controls" }, root);
    const fGroup = V.h("label", { class: "gw-field gw-f-group" }, ctr);
    V.h("span", { class: "lab" }, fGroup, "group");
    const selWrap = V.h("span", { class: "gw-select" }, fGroup);
    const sel = V.h("select", {}, selWrap);
    G.forEach((g, i) => { const o = V.h("option", { value: String(i) }, sel); o.textContent = shortName(g); });
    sel.value = String(S.gi);

    const fBits = V.h("div", { class: "gw-field" }, ctr);
    V.h("span", { class: "lab", "aria-hidden": "true" }, fBits, "bits");
    const pBits = V.pills(fBits, BITS_UI.map((b) => ({ value: b, label: "INT" + b })), S.bits, onBits, "bits");

    const fMode = V.h("div", { class: "gw-field" }, ctr);
    V.h("span", { class: "lab", "aria-hidden": "true" }, fMode, "show");
    const pMode = V.pills(fMode, [{ value: "w", label: "latent <i class='m'>w</i>" }, { value: "r", label: "reconstructed <i class='m'>r</i>" }], S.mode, onMode, "weights shown");

    const legend = V.h("div", { class: "gw-legend", "aria-hidden": "true" }, ctr,
      "<span class='gw-lg'><i class='sw grad'></i>saliency <i class='m'>h</i></span>" +
      "<span class='gw-lg'><i class='sw band'></i><span>assignment range</span><i class='m'>I</i><sub class='m'>f</sub></span>" +
      "<span class='gw-lg'><i class='sw ring'></i>clipped</span>" +
      "<span class='gw-lg gw-lg-r'><i class='sw wh'></i><i class='m'>r</i>&thinsp;" + MINUS + "&thinsp;<i class='m'>w</i></span>");

    const mainBox = V.h("div", { class: "gw-main chart" }, root);
    const tipMain = V.tooltip(mainBox);

    const panels = V.h("div", { class: "gw-panels" }, root);
    // (a) scale search curve + slider
    const pC = V.h("div", { class: "gw-panel gw-pc" }, panels);
    const pcHead = V.h("div", { class: "gw-ph" }, pC);
    V.h("div", { class: "gw-pt" }, pcHead, "scale search <span class='gw-pt-m'><i class='m'>Ŝ</i>(<i class='m'>f</i>)</span>");
    const btn = V.h("button", { type: "button", class: "gw-search" }, pcHead,
      "<svg viewBox='0 0 16 16' aria-hidden='true'><path d='M4.5 2.8v10.4l8.6-5.2z' fill='currentColor'/></svg><span class='gw-search-l'>Search</span>");
    const btnL = btn.querySelector(".gw-search-l");
    if (introPending) btn.setAttribute("aria-busy", "true");
    const curveBox = V.h("div", { class: "gw-curve chart" }, pC);
    const range = V.h("input", { type: "range", class: "gw-range", min: "0", max: String(NF - 1), step: "1", "aria-label": "clipping factor f" }, curveBox);
    const tipCurve = V.tooltip(curveBox);
    // (b) code usage
    const pH = V.h("div", { class: "gw-panel gw-ph-hist" }, panels);
    V.h("div", { class: "gw-ph" }, pH,
      "<div class='gw-pt'>weights per code <i class='m'>q</i></div>" +
      "<div class='gw-key'><span><i class='sw' style='background:" + C.graph + "'></i>Standard QAT</span><span class='q'><i class='sw' style='background:" + C.rose + "'></i>QUASAR</span></div>");
    const histBox = V.h("div", { class: "gw-hist chart" }, pH);
    const tipHist = V.tooltip(histBox);
    // (c) headline ratio
    const pB = V.h("div", { class: "gw-panel gw-pb" }, panels);
    V.h("div", { class: "gw-ph" }, pB, "<div class='gw-pt'>loss-aware reconstruction error</div>");
    const big = V.h("div", { class: "gw-big" }, pB, "<span class='v'></span><span class='x'>×</span><span class='f'></span>");
    const bigV = big.querySelector(".v"), bigF = big.querySelector(".f");
    const bars = V.h("div", { class: "gw-bars" }, pB,
      "<div class='gw-br s'><span class='nm'>Standard QAT</span><span class='tr'><i></i></span><span class='val'></span></div>" +
      "<div class='gw-br q'><span class='nm'>QUASAR</span><span class='tr'><i></i></span><span class='val'></span></div>");
    const barS = bars.querySelector(".s i"), barQ = bars.querySelector(".q i");
    const valS = bars.querySelector(".s .val"), valQ = bars.querySelector(".q .val");
    const pop = V.h("div", { class: "gw-pop" }, pB);
    const popHead = V.h("div", { class: "gw-pop-h" }, pop);
    const popBox = V.h("div", { class: "gw-pop-c chart" }, pop);
    const live = V.h("div", { class: "sr-only", "aria-live": "polite", "aria-atomic": "true" }, root);

    // ------------------------------------------------------------------ main panel
    let MG = null;
    function drawMain() {
      const width = Math.round(mainBox.clientWidth);
      if (!width) return;
      const M = model(S.gi);
      const narrow = width < 560, mid = width < 900;
      const gut = narrow ? 0 : mid ? 112 : 132;
      const laneH = narrow ? 94 : mid ? 112 : 124;
      const labH = narrow ? 22 : 0;
      const top = narrow ? 2 : 6, gap = narrow ? 10 : 22, tabH = 16;
      const L = [top + labH, 0];
      L[1] = L[0] + laneH + gap + labH;
      const axisY = L[1] + laneH + tabH;
      const height = axisY + 36;
      const x0 = gut + (narrow ? 6 : 14), x1 = width - (narrow ? 6 : 10);
      const pad = (M.dom[1] - M.dom[0]) * 0.02;
      const xs = V.lin([M.dom[0] - pad, M.dom[1] + pad], [x0, x1]);

      mainBox.querySelectorAll(":scope > svg").forEach((s) => s.remove());
      const svg = V.el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img",
        "aria-label": "Standard QAT and QUASAR reconstruction of " + M.n + " weights, " + shortName(M.g) }, null);
      mainBox.insertBefore(svg, mainBox.firstChild);

      // ---- density-scaled jitter (sinaplot) shared by both lanes; x is exact, only y is free
      const n = M.n, wx = new Float64Array(n);
      for (let i = 0; i < n; i++) wx[i] = xs(M.w[i]);
      const limit = laneH / 2 - 3;
      const r0 = narrow ? 3.6 : mid ? 4.5 : 5.0;
      const rs = Float64Array.from(M.t, (t) => r0 * (0.7 + 0.55 * t));
      const ys = sina(wx, rs, limit);
      const zorder = Array.from({ length: n }, (_, i) => i).sort((a, b) => M.h[a] - M.h[b]);

      const lanes = [];
      for (let k = 0; k < 2; k++) {
        const yT = L[k], yc = yT + laneH / 2;
        const gl = V.el("g", { class: "gw-lane " + (k ? "lq" : "ls") }, svg);
        V.el("rect", { class: "gw-lanebg", x: x0 - (narrow ? 6 : 10), y: yT, width: x1 - x0 + (narrow ? 12 : 18), height: laneH, rx: 9 }, gl);
        const band = V.el("rect", { class: "gw-band " + (k ? "q" : "s"), y: yT, height: laneH }, gl);
        const edges = [0, 1].map(() => V.el("line", { class: "gw-edge " + (k ? "q" : "s"), y1: yT, y2: yT + laneH }, gl));
        // reference: Standard QAT levels, faint, in the QUASAR lane
        const refLv = k ? Array.from({ length: 16 }, () => V.el("line", { class: "gw-lv ref", y1: yT + 3, y2: yT + laneH - 3 }, gl)) : null;
        const lv = Array.from({ length: 16 }, () => V.el("line", { class: "gw-lv " + (k ? "q" : "s"), y1: yT + 3, y2: yT + laneH - 3 }, gl));
        const gWh = V.el("g", { class: "gw-whisk" }, gl);
        const gGh = V.el("g", { class: "gw-ghost" }, gl);
        const gDot = V.el("g", { class: "gw-dots" }, gl);
        const wh = new Array(n), dots = new Array(n);
        for (const i of zorder) {
          const y = yc + ys[i];
          wh[i] = V.el("line", { x1: wx[i].toFixed(2), x2: wx[i].toFixed(2), y1: y.toFixed(2), y2: y.toFixed(2), stroke: mix(Math.max(0.3, M.t[i])), "stroke-opacity": (0.35 + 0.6 * M.t[i]).toFixed(2) }, gWh);
          V.el("circle", { cx: wx[i].toFixed(2), cy: y.toFixed(2), r: 1.5 }, gGh);
          dots[i] = V.el("circle", { class: "gw-dot", cx: wx[i].toFixed(2), cy: y.toFixed(2), r: rs[i].toFixed(2), fill: mix(M.t[i]), stroke: mix(Math.min(1, M.t[i] + 0.38)) }, gDot);
        }
        const hl = V.el("circle", { class: "gw-hl", r: 0, cx: -99, cy: -99 }, gl);
        lanes.push({ yT, yc, band, edges, lv, refLv, wh, dots, hl });
      }

      // band handles (QUASAR lane) + "assignment range I_f" label (the paper's term, §3)
      const handles = [0, 1].map((side) => {
        const g = V.el("g", { class: "gw-handle", "aria-hidden": "true" }, svg);
        // lane-edge hit: pan-y (touch drags only after horizontal intent); tab hit: >= 32px (40px on touch)
        const ew = COARSE ? 24 : 10, th = COARSE ? 40 : 32;
        V.el("rect", { class: "hit edge", x: -ew / 2, y: L[1], width: ew, height: laneH }, g);
        V.el("rect", { class: "hit tabhit", x: -th / 2, y: L[1] + laneH + tabH / 2 - th / 2, width: th, height: th }, g);
        V.el("rect", { class: "tab", x: -5.5, y: L[1] + laneH - 2, width: 11, height: tabH - 1, rx: 3.5 }, g);
        V.el("line", { class: "grip", x1: -1.5, x2: -1.5, y1: L[1] + laneH + 2.5, y2: L[1] + laneH + tabH - 6.5 }, g);
        V.el("line", { class: "grip", x1: 1.5, x2: 1.5, y1: L[1] + laneH + 2.5, y2: L[1] + laneH + tabH - 6.5 }, g);
        g.dataset.side = String(side);
        return g;
      });
      let ifLab = null;
      if (!narrow) {
        ifLab = V.el("text", { class: "gw-iflab", y: L[1] - 7, "text-anchor": "middle" }, svg);
        ifLab.innerHTML = "<tspan class='t'>assignment range </tspan><tspan class='m'>I</tspan><tspan class='m' dy='3' font-size='12'>f</tspan>";
      }

      // lane labels
      const lab = {};
      if (narrow) {
        const t0 = V.el("text", { class: "gw-ll", x: 0, y: L[0] - 8 }, svg);
        t0.innerHTML = "<tspan class='nm s'>Standard QAT</tspan><tspan class='sub' dx='8'><tspan class='m'>f</tspan> = 1 · min–max</tspan>";
        const t1 = V.el("text", { class: "gw-ll", x: 0, y: L[1] - 8 }, svg);
        t1.innerHTML = "<tspan class='nm q'>QUASAR</tspan><tspan class='sub' dx='8'></tspan><tspan class='clip' dx='0'></tspan>";
        lab.qf = t1.children[1]; lab.qc = t1.children[2];
      } else {
        const gx = 2;
        const s = V.el("g", { class: "gw-gl" }, svg);
        V.el("text", { class: "nm s", x: gx, y: lanes[0].yc - 4 }, s).textContent = "Standard QAT";
        const s2 = V.el("text", { class: "sub", x: gx, y: lanes[0].yc + 13 }, s);
        s2.innerHTML = "<tspan class='m'>f</tspan> = 1 · min–max";
        V.el("text", { class: "nm q", x: gx, y: lanes[1].yc - 12 }, s).textContent = "QUASAR";
        lab.qf = V.el("text", { class: "sub", x: gx, y: lanes[1].yc + 5 }, s);
        lab.qc = V.el("text", { class: "clip", x: gx, y: lanes[1].yc + 21 }, s);
      }

      // x axis
      const ga = V.el("g", {}, svg);
      const ticks = xs.ticks(narrow ? 5 : mid ? 6 : 8);
      const dec = tickDec(ticks.length > 1 ? ticks[1] - ticks[0] : 0.01);
      V.axisBottom(ga, xs, axisY, { ticks, fmt: (v) => (Math.abs(v) < 1e-12 ? "0" : sgn(v.toFixed(dec))) });
      const at = V.el("text", { class: "axis-title", x: (x0 + x1) / 2, y: axisY + 32, "text-anchor": "middle" }, svg);
      at.innerHTML = "weight value <tspan class='m'>w</tspan>";

      // animation channels
      const tau = Float64Array.from({ length: n }, (_, i) => 55 + 55 * frac(Math.sin(i * 12.9898) * 43758.5453));
      const chS = channel("sx", n, (cur) => applyDots(0, cur), tau);
      const chQ = channel("qx", n, (cur) => applyDots(1, cur), tau);
      const chLS = channel("lvS", 16, (cur) => { for (let k = 0; k < 16; k++) setX(lanes[0].lv[k], cur[k]); });
      const chLQ = channel("lvQ", 16, (cur) => { for (let k = 0; k < 16; k++) setX(lanes[1].lv[k], cur[k]); });
      const chB = channel("band", 2, (cur) => applyBand(cur));
      function applyDots(k, cur) {
        const ln = lanes[k];
        for (let i = 0; i < n; i++) { const x = cur[i].toFixed(2); ln.dots[i].setAttribute("cx", x); ln.wh[i].setAttribute("x2", x); }
        if (MG && MG.hover >= 0) placeHL(MG.hover);
      }
      function applyBand(cur) {
        const a = cur[0], b = cur[1];
        lanes[1].band.setAttribute("x", a.toFixed(2));
        lanes[1].band.setAttribute("width", Math.max(0, b - a).toFixed(2));
        setX(lanes[1].edges[0], a); setX(lanes[1].edges[1], b);
        handles[0].setAttribute("transform", `translate(${a.toFixed(2)},0)`);
        handles[1].setAttribute("transform", `translate(${b.toFixed(2)},0)`);
        if (ifLab) ifLab.setAttribute("x", ((a + b) / 2).toFixed(2));
      }
      // Standard QAT band = min–max (static)
      const sa = xs(M.wmin), sb = xs(M.wmax);
      lanes[0].band.setAttribute("x", sa); lanes[0].band.setAttribute("width", sb - sa);
      setX(lanes[0].edges[0], sa); setX(lanes[0].edges[1], sb);

      MG = { svg, xs, wx, ys, rs, lanes, handles, lab, chS, chQ, chLS, chLQ, chB, narrow, L, laneH, gap, labH, x0, x1, hover: -1, prevL: 0, gi: S.gi, ifLab };
      bindMain();
    }
    const frac = (v) => v - Math.floor(v);
    const setX = (el, x) => { const s = x.toFixed(2); el.setAttribute("x1", s); el.setAttribute("x2", s); };

    // van der Corput (base 2): neighbours in x get well-spread jitter
    function vdc(k) { let v = 0, d = 0.5; k += 1; while (k) { if (k & 1) v += d; k >>= 1; d /= 2; } return v; }
    function sina(xs, rs, limit) {
      const n = xs.length, ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
      const sorted = ord.map((i) => xs[i]);
      const q = (p) => sorted[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
      let mu = 0; for (let i = 0; i < n; i++) mu += xs[i]; mu /= n;
      let sd = 0; for (let i = 0; i < n; i++) sd += (xs[i] - mu) * (xs[i] - mu); sd = Math.sqrt(sd / n);
      const spread = Math.min(sd, (q(0.75) - q(0.25)) / 1.34) || sd || 1;
      const bw = Math.max(5, 1.06 * spread * Math.pow(n, -0.2));
      const dens = new Float64Array(n);
      let dmax = 0;
      for (let i = 0; i < n; i++) {
        let d = 0;
        for (let j = 0; j < n; j++) { const z = (xs[i] - xs[j]) / bw; d += Math.exp(-0.5 * z * z); }
        dens[i] = d; if (d > dmax) dmax = d;
      }
      const ys = new Float64Array(n);
      ord.forEach((i, rank) => {
        const half = Math.max(0, (limit - rs[i]) * Math.pow(dens[i] / dmax, 0.85));
        ys[i] = (2 * vdc(rank) - 1) * half;
      });
      // relax overlaps in y only
      const pad = 0.6;
      for (let it = 0; it < 60; it++) {
        let moved = false;
        for (let a = 0; a < n; a++) {
          const i = ord[a];
          for (let b = a + 1; b < n; b++) {
            const j = ord[b], dx = xs[j] - xs[i], d = rs[i] + rs[j] + pad;
            if (dx >= d) break;
            const dy = ys[j] - ys[i], dist2 = dx * dx + dy * dy;
            if (dist2 >= d * d) continue;
            const need = Math.sqrt(d * d - dx * dx) - Math.abs(dy);
            const sgn2 = dy === 0 ? (b % 2 ? 1 : -1) : Math.sign(dy);
            ys[j] += sgn2 * need * 0.5; ys[i] -= sgn2 * need * 0.5;
            moved = true;
          }
        }
        for (let i = 0; i < n; i++) { const lim = limit - rs[i]; if (ys[i] > lim) ys[i] = lim; if (ys[i] < -lim) ys[i] = -lim; }
        if (!moved) break;
      }
      return ys;
    }

    function updateMain(instant) {
      if (!MG) return;
      const M = model(S.gi), B = M.byBits[S.bits], e = B.res.sweep[S.fi];
      const n = M.n, Lv = 1 << S.bits, xs = MG.xs, r = S.mode === "r";
      const tS = new Float64Array(n), tQ = new Float64Array(n);
      for (let i = 0; i < n; i++) { tS[i] = r ? xs(B.std.r[i]) : MG.wx[i]; tQ[i] = r ? xs(e.r[i]) : MG.wx[i]; }
      setTarget(MG.chS, tS, instant); setTarget(MG.chQ, tQ, instant);
      const lS = new Float64Array(16), lQ = new Float64Array(16);
      const lev = B.lev[S.fi];
      for (let k = 0; k < 16; k++) {
        const kk = Math.min(k, Lv - 1);
        lS[k] = xs(B.stdLev[kk]); lQ[k] = xs(lev[kk]);
        const on = k < Lv;
        MG.lanes[0].lv[k].classList.toggle("off", !on);
        MG.lanes[1].lv[k].classList.toggle("off", !on);
        MG.lanes[1].refLv[k].classList.toggle("off", !on);
        if (on) setX(MG.lanes[1].refLv[k], lS[k]);
      }
      if (MG.prevL && MG.prevL !== Lv) {   // freshly shown levels start in place (no slide-in from stale spots)
        for (let k = MG.prevL; k < Lv; k++) { MG.chLS.cur[k] = lS[k]; MG.chLQ.cur[k] = lQ[k]; }
      }
      MG.prevL = Lv;
      setTarget(MG.chLS, lS, instant); setTarget(MG.chLQ, lQ, instant);
      setTarget(MG.chB, [xs(e.lo), xs(e.hi)], instant);
      // clipped = w outside the assignment range I_f (the shaded band), as in the caption
      for (let i = 0; i < n; i++) MG.lanes[1].dots[i].classList.toggle("clip", !!e.outside[i]);
      MG.svg.classList.toggle("is-r", r);
      legend.classList.toggle("is-r", r);
      // labels
      const star = S.fi === B.best && !S.searching;
      if (MG.narrow) {
        MG.lab.qf.innerHTML = "<tspan class='m'>f</tspan> = " + fmtF(GRID[S.fi]) + (star ? " (<tspan class='m'>f</tspan>*)" : "");
        MG.lab.qc.textContent = " · " + e.nOutside + " clipped";
      } else {
        MG.lab.qf.innerHTML = "<tspan class='m'>f</tspan> = " + fmtF(GRID[S.fi]) + (star ? "  <tspan class='star'>= <tspan class='m'>f</tspan>*</tspan>" : "");
        MG.lab.qc.textContent = e.nOutside + " clipped";
      }
      if (MG.hover >= 0) showTipMain(MG.hover, MG.hoverLane, true);
    }

    // ---- main interactions: tooltips (hover + touch) and dragging the I_f edges
    function bindMain() {
      const svg = MG.svg;
      const pt = (ev) => { const b = svg.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
      let drag = null, pend = null, tap = null;
      MG.handles.forEach((hd) => {
        const start = (ev) => {
          tap = null;
          drag = { id: ev.pointerId, el: hd };
          try { hd.setPointerCapture(ev.pointerId); } catch (_) { /* noop */ }
          svg.classList.add("dragging");
          hideTipMain();
        };
        hd.addEventListener("pointerdown", (ev) => {
          // touch on the lane edge: wait for horizontal intent so a vertical swipe still scrolls the page
          if (ev.pointerType === "touch" && ev.target.classList.contains("edge")) {
            pend = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
            return;
          }
          if (ev.pointerType === "mouse" && ev.button !== 0) return;
          ev.preventDefault(); ev.stopPropagation();
          start(ev);
        });
        hd.addEventListener("pointermove", (ev) => {
          if (pend && ev.pointerId === pend.id) {
            const dx = ev.clientX - pend.x, dy = ev.clientY - pend.y;
            if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
            pend = null; start(ev);
          }
          if (!drag || ev.pointerId !== drag.id) return;
          const [mx] = pt(ev), M = model(S.gi);
          const cx = MG.xs(M.c), rp = MG.xs(M.c + M.rho) - cx;
          const fr = Math.abs(mx - cx) / (rp || 1);
          let best = 0;
          for (let k = 1; k < NF; k++) if (Math.abs(GRID[k] - fr) < Math.abs(GRID[best] - fr)) best = k;
          if (best !== S.fi) setF(best);
        });
        const end = (ev) => {
          if (pend && ev.pointerId === pend.id) pend = null;
          if (drag && ev.pointerId === drag.id) { drag = null; svg.classList.remove("dragging"); }
        };
        hd.addEventListener("pointerup", end); hd.addEventListener("pointercancel", end);
      });
      svg.addEventListener("pointermove", (ev) => {
        if (drag || ev.pointerType === "touch") return;
        const hit = nearestDot(pt(ev));
        if (hit) showTipMain(hit[0], hit[1]); else hideTipMain();
      });
      svg.addEventListener("pointerleave", (ev) => { if (ev.pointerType !== "touch") hideTipMain(); });
      // touch: the tooltip opens on a tap's pointerup (moved < 10px), never on the start of a scroll
      svg.addEventListener("pointerdown", (ev) => {
        if (ev.pointerType !== "touch" || drag) return;
        tap = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
      });
      svg.addEventListener("pointerup", (ev) => {
        if (!tap || ev.pointerId !== tap.id) return;
        const moved = Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y);
        tap = null;
        if (drag || moved >= 10) return;
        const hit = nearestDot(pt(ev), 20);
        if (hit) showTipMain(hit[0], hit[1]); else hideTipMain();
      });
      svg.addEventListener("pointercancel", (ev) => {   // e.g. the browser took the touch for a page scroll
        if (tap && ev.pointerId === tap.id) tap = null;
        if (ev.pointerType !== "mouse") hideTipMain();
      });
    }
    function nearestDot(p, tol) {
      const [mx, my] = p;
      let lane = -1;
      for (let k = 0; k < 2; k++) {
        const ln = MG.lanes[k];
        if (my >= ln.yT - MG.gap / 2 && my <= ln.yT + MG.laneH + MG.gap / 2) lane = k;
      }
      if (lane < 0) return null;
      const cur = (lane ? MG.chQ : MG.chS).cur, yc = MG.lanes[lane].yc;
      let bi = -1, bd = Infinity;
      for (let i = 0; i < cur.length; i++) {
        const dx = cur[i] - mx, dy = yc + MG.ys[i] - my, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bi = i; }
      }
      const lim = Math.max(tol || 12, MG.rs[bi] + 6);
      return bd <= lim * lim ? [bi, lane] : null;
    }
    function placeHL(i) {
      for (let k = 0; k < 2; k++) {
        const ln = MG.lanes[k], cur = (k ? MG.chQ : MG.chS).cur;
        ln.hl.setAttribute("cx", cur[i].toFixed(2)); ln.hl.setAttribute("cy", (ln.yc + MG.ys[i]).toFixed(2));
        ln.hl.setAttribute("r", (MG.rs[i] + 3.2).toFixed(2));
      }
    }
    function showTipMain(i, lane, quiet) {
      const M = model(S.gi), B = M.byBits[S.bits], e = B.res.sweep[S.fi];
      MG.hover = i; MG.hoverLane = lane;
      placeHL(i);
      MG.svg.classList.add("hovering");
      const cur = (lane ? MG.chQ : MG.chS).cur;
      const x = cur[i], y = MG.lanes[lane].yc + MG.ys[i];
      const row = (k, v, cls) => "<div class='row" + (cls ? " " + cls : "") + "'><span>" + k + "</span><b class='num'>" + v + "</b></div>";
      const html = "<div class='tt'>weight " + (i + 1) + " / " + M.n + "</div>" +
        row("<i class='m'>w</i>", fmtW(M.w[i])) + row("<i class='m'>h</i>", fmtH(M.h[i])) +
        "<div class='gw-tt-sep'></div>" +
        row("<span style='color:" + C.graph + "'>Standard QAT</span>", "<i class='m'>q</i> " + B.std.q[i] + " · <i class='m'>r</i> " + fmtW(B.std.r[i])) +
        row("<span style='color:" + C.roseD + ";font-weight:600'>QUASAR</span>", "<i class='m'>q</i> " + e.q[i] + " · <i class='m'>r</i> " + fmtW(e.r[i])) +
        (e.outside[i] ? "<div class='gw-tt-clip'>clipped</div>" : "");
      tipMain.show(x, y, html);
      if (!quiet) tipMain.node.classList.add("on");
    }
    function hideTipMain() {
      if (!MG) return;
      MG.hover = -1;
      MG.svg.classList.remove("hovering");
      MG.lanes.forEach((ln) => ln.hl.setAttribute("r", 0));
      tipMain.hide();
    }

    // ------------------------------------------------------------------ (a) scale-search curve + slider
    let CV = null;
    function drawCurve() {
      const width = Math.round(curveBox.clientWidth);
      if (!width) return;
      const B = model(S.gi).byBits[S.bits];
      const narrow = width < 420;
      const m = { t: 24, r: 18, b: 70, l: 42 };
      const height = narrow ? 228 : 236;
      const fr = V.frame(curveBox, width, height, m);
      const { svg, g, W, H } = fr;
      svg.setAttribute("aria-label", "loss-aware reconstruction error over the 15 clipping factors, relative to Standard QAT");
      const x = V.lin([GRID[0], GRID[NF - 1]], [0, W]);
      const rmin = Math.min.apply(null, B.ratio);
      // keep >= 30px under the minimum so the f* label always sits below it (every other point is higher)
      const yhi = 2.3, pr = Math.min(0.45, 30 / H);
      const ylo = Math.min(0.5, rmin / 1.45, Math.pow(10, (Math.log10(rmin) - pr * Math.log10(yhi)) / (1 - pr)));
      const y = V.log([ylo, yhi], [H, 0]);
      // ticks: 1× first, then others (decades before 2/5 steps) if they keep >= 20px clear of every chosen tick
      const wide = Math.log10(yhi / ylo) > 1.6;   // many decades: decades only
      const cand = [1, 0.1, 0.01, 0.001].concat(wide ? [] : [0.5, 2, 0.2, 0.05, 0.02]).filter((v) => v >= ylo && v <= yhi);
      const ticks = [];
      for (const v of cand) if (ticks.every((u) => Math.abs(y(u) - y(v)) >= 24)) ticks.push(v);
      ticks.sort((a, b) => a - b);
      V.axisLeft(g, y, W, { ticks, fmt: fmtTick });

      const id = "gwclip" + Math.random().toString(36).slice(2, 8);
      const defs = V.el("defs", {}, svg);
      const cp = V.el("clipPath", { id }, defs);
      V.el("rect", { x: -8, y: -2, width: W + 16, height: H + 4 }, cp);

      // Standard QAT reference (f = 1 is the min–max range; its error is the 1× line)
      const yr = y(1);
      V.el("line", { class: "gw-ref", x1: 0, x2: W, y1: yr, y2: yr }, g);
      // label: first candidate spot the curve does not cross
      const lw = 84, lh = 13, poly = B.ratio.map((r, k) => [x(GRID[k]), y(Math.min(r, yhi * 3))]);
      const hits = (bx, by) => {
        for (let k = 0; k + 1 < poly.length; k++) for (let s2 = 0; s2 <= 12; s2++) {
          const px = poly[k][0] + (poly[k + 1][0] - poly[k][0]) * s2 / 12, py = poly[k][1] + (poly[k + 1][1] - poly[k][1]) * s2 / 12;
          if (px >= bx - 4 && px <= bx + lw + 4 && py >= by - 5 && py <= by + lh + 5) return true;
        }
        return false;
      };
      const spots = [[x(1) - 12 - lw, yr - 6 - lh + 3], [2, yr - 6 - lh + 3], [2, yr + 5], [x(1) - 12 - lw, yr + 5], [W / 2 - lw / 2, yr - 6 - lh + 3]];
      const spot = spots.find((sp) => sp[1] > -4 && sp[1] + lh < H && !hits(sp[0], sp[1])) || spots[0];
      const sl = V.el("text", { class: "gw-reflab", x: spot[0], y: spot[1] + lh - 3 }, g);
      sl.textContent = "Standard QAT";
      const gc = V.el("g", { "clip-path": `url(#${id})` }, g);
      const path = V.el("path", { class: "gw-cpath" }, gc);
      const pts = B.ratio.map((r, k) => {
        const over = r > yhi;
        const c = V.el(over ? "path" : "circle", over
          ? { class: "gw-cpt over", d: `M${x(GRID[k]) - 4},6 L${x(GRID[k])},0 L${x(GRID[k]) + 4},6 Z` }
          : { class: "gw-cpt", cx: x(GRID[k]), cy: y(r), r: 3 }, over ? g : gc);
        return c;
      });
      const stdPt = V.el("circle", { class: "gw-stdpt", cx: x(1), cy: yr, r: 4.5 }, g);
      const fs = V.el("g", { class: "gw-fstar" }, g);
      const fsx = x(GRID[B.best]), fsy = y(Math.min(B.ratio[B.best], yhi));
      V.el("circle", { class: "pulse", cx: fsx, cy: fsy, r: 6 }, fs);
      V.el("circle", { class: "dot", cx: fsx, cy: fsy, r: 5.5 }, fs);
      const fl = V.el("text", { class: "lab", x: Math.max(8, fsx), y: fsy + 27, "text-anchor": "middle" }, fs);
      fl.innerHTML = "<tspan class='m'>f</tspan>*";
      const bestSoFar = V.el("circle", { class: "gw-bsf", r: 5.5, cx: -99, cy: -99 }, g);
      // current f
      const rule = V.el("line", { class: "gw-rule", y1: -6, y2: H }, g);
      const hov = V.el("circle", { class: "gw-hov", r: 7, cx: -99, cy: -99 }, g);   // hovered candidate (tooltip anchor)
      const ring = V.el("circle", { class: "gw-ring", r: 8.5 }, g);
      const ft = V.el("text", { class: "gw-ftxt", y: -11, "text-anchor": "middle" }, g);

      // slider track + ticks (the native range input sits on top of it)
      const ty = H + 19;
      V.el("line", { class: "gw-track", x1: 0, x2: W, y1: ty, y2: ty }, g);
      GRID.forEach((f, k) => {
        const cls = k === NF - 1 ? "gw-tk std" : "gw-tk";
        V.el("circle", { class: cls, cx: x(f), cy: ty, r: k === NF - 1 ? 3.2 : 2 }, g);
      });
      const tkStar = V.el("circle", { class: "gw-tk star", cx: x(GRID[B.best]), cy: ty, r: 3.4 }, g);
      const lab = V.el("g", { class: "axis" }, g);
      const every = W / 7 >= 30 ? 1 : 2;
      [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].forEach((f, j) => {
        if (j % every && f !== 1) return;
        if (every === 2 && f === 0.9) return;
        const t = V.el("text", { x: x(f), y: ty + 27, "text-anchor": "middle" }, lab);
        t.textContent = f.toFixed(1);
      });
      const xt = V.el("text", { class: "axis-title", x: W / 2, y: ty + 45, "text-anchor": "middle" }, g);
      xt.innerHTML = "clipping factor <tspan class='m'>f</tspan>";

      range.style.left = (m.l - 11) + "px";
      range.style.width = (W + 22) + "px";
      range.style.top = (m.t + ty - 16) + "px";

      CV = { svg, g, x, y, W, H, m, yhi, path, pts, fs, bestSoFar, rule, ring, hov, hk: null, ft, tkStar, stdPt, B };
      bindCurve();
    }
    function updateCurve() {
      if (!CV) return;
      const B = model(S.gi).byBits[S.bits];
      const { x, y, yhi } = CV;
      const K = S.searching ? S.searchK : NF - 1;
      let d = "";
      for (let k = 0; k <= K; k++) d += (k ? "L" : "M") + x(GRID[k]).toFixed(2) + "," + y(Math.min(B.ratio[k], yhi * 3)).toFixed(2);
      CV.path.setAttribute("d", d);
      CV.pts.forEach((p, k) => p.classList.toggle("hid", k > K));
      const done = !S.searching;
      CV.fs.classList.toggle("hid", !done);
      CV.tkStar.classList.toggle("hid", !done);
      if (S.searching) {
        let b = 0;
        for (let k = 1; k <= K; k++) if (B.ratio[k] < B.ratio[b]) b = k;
        CV.bestSoFar.setAttribute("cx", x(GRID[b])); CV.bestSoFar.setAttribute("cy", y(Math.min(B.ratio[b], yhi)));
      } else CV.bestSoFar.setAttribute("cx", -99);
      const f = GRID[S.fi], r = B.ratio[S.fi], cx = x(f);
      const cy = r > yhi ? 3 : y(r);
      CV.rule.setAttribute("x1", cx); CV.rule.setAttribute("x2", cx);
      CV.ring.setAttribute("cx", cx); CV.ring.setAttribute("cy", cy);
      const tx = Math.max(22, Math.min(CV.W - 22, cx));
      CV.ft.setAttribute("x", tx);
      CV.ft.innerHTML = "<tspan class='m'>f</tspan> = " + fmtF(f);
      range.value = String(S.fi);
      range.setAttribute("aria-valuetext", "f = " + fmtF(f) + ", " + fmtRatio(r) + "× Standard QAT");
      placeHov();
    }
    // The svg is the only pointer target of the curve + slider strip (the native range is
    // pointer-events:none and stays the keyboard / assistive-tech control).
    function bindCurve() {
      const svg = CV.svg;
      const fAt = (ev) => {
        const b = svg.getBoundingClientRect();
        const fx = CV.x.invert(ev.clientX - b.left - CV.m.l);
        let best = 0;
        for (let k = 1; k < NF; k++) if (Math.abs(GRID[k] - fx) < Math.abs(GRID[best] - fx)) best = k;
        return best;
      };
      let scrub = null, pend = null, hideT = 0;
      const begin = (ev) => {
        clearTimeout(hideT);
        scrub = ev.pointerId;
        try { svg.setPointerCapture(ev.pointerId); } catch (_) { /* noop */ }
        svg.classList.add("scrubbing");
        const k = fAt(ev);
        if (k !== S.fi || S.searching) setF(k);
        tipAt(k);
      };
      svg.addEventListener("pointerdown", (ev) => {
        if (ev.pointerType === "touch") {   // touch: tap selects on pointerup; scrub only after horizontal intent
          clearTimeout(hideT);
          pend = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
          return;
        }
        if (ev.button !== 0) return;
        if (ev.pointerType === "mouse") {   // like the native slider: a click focuses it so arrow keys continue
          ev.preventDefault();
          try { range.focus({ preventScroll: true, focusVisible: false }); } catch (_) { /* noop */ }
        }
        begin(ev);
      });
      svg.addEventListener("pointermove", (ev) => {
        if (pend && ev.pointerId === pend.id) {
          const dx = ev.clientX - pend.x, dy = ev.clientY - pend.y;
          if (Math.abs(dx) >= 8 && Math.abs(dx) > Math.abs(dy)) { pend = null; begin(ev); }
          return;
        }
        const k = fAt(ev);
        if (scrub === ev.pointerId) { if (k !== S.fi) setF(k); tipAt(k); }
        else if (ev.pointerType !== "touch") tipAt(k);
      });
      const hideLater = () => { clearTimeout(hideT); hideT = setTimeout(hideCurveTip, 1200); };
      svg.addEventListener("pointerup", (ev) => {
        if (pend && ev.pointerId === pend.id) {         // a plain tap selects
          const dx = ev.clientX - pend.x, dy = ev.clientY - pend.y;
          pend = null;
          if (dx * dx + dy * dy < 100) { const k = fAt(ev); if (k !== S.fi || S.searching) setF(k); tipAt(k); hideLater(); }
          return;
        }
        if (scrub === ev.pointerId) { scrub = null; svg.classList.remove("scrubbing"); }
        if (ev.pointerType === "touch") hideLater();
      });
      svg.addEventListener("pointercancel", (ev) => {   // e.g. the browser took the touch for a page scroll
        if (pend && ev.pointerId === pend.id) pend = null;
        if (scrub === ev.pointerId) { scrub = null; svg.classList.remove("scrubbing"); }
        if (ev.pointerType === "touch") hideCurveTip();
      });
      svg.addEventListener("pointerleave", (ev) => { if (ev.pointerType !== "touch" && scrub !== ev.pointerId) hideCurveTip(); });
    }
    function placeHov() {
      if (!CV) return;
      const k = CV.hk;
      if (k == null || k === S.fi) { CV.hov.classList.remove("on"); return; }   // the current-f ring already marks it
      const r = model(S.gi).byBits[S.bits].ratio[k];
      CV.hov.setAttribute("cx", CV.x(GRID[k]).toFixed(2));
      CV.hov.setAttribute("cy", (r > CV.yhi ? 3 : CV.y(r)).toFixed(2));
      CV.hov.classList.add("on");
    }
    function hideCurveTip() {
      tipCurve.hide();
      if (CV) { CV.hk = null; CV.hov.classList.remove("on"); }
    }
    function tipAt(k) {
      const B = model(S.gi).byBits[S.bits], e = B.res.sweep[k];
      const r = B.ratio[k];
      const px = CV.m.l + CV.x(GRID[k]), py = CV.m.t + (r > CV.yhi ? 0 : CV.y(r));
      CV.hk = k; placeHov();
      tipCurve.show(px, py,
        "<div class='tt'><i class='m'>f</i> = " + fmtF(GRID[k]) + (k === B.best ? " · <i class='m'>f</i>*" : "") + "</div>" +
        "<div class='row'><span><i class='m'>Ŝ</i>(<i class='m'>f</i>) / Standard QAT</span><b class='num'>" + fmtRatio(r) + "×</b></div>" +
        "<div class='row'><span>clipped</span><b class='num'>" + e.nOutside + "</b></div>");
    }

    // ------------------------------------------------------------------ (b) code-usage histogram
    let HG = null;
    function drawHist() {
      const width = Math.round(histBox.clientWidth);
      if (!width) return;
      const B = model(S.gi).byBits[S.bits];
      const Lv = 1 << S.bits;
      const m = { t: 18, r: 4, b: 40, l: 32 };
      const height = 200;
      const fr = V.frame(histBox, width, height, m);
      const { svg, g, W, H } = fr;
      svg.setAttribute("aria-label", "weights per code, Standard QAT and QUASAR");
      let ymax = Math.max.apply(null, B.stdHist);
      for (const hh of B.hist) ymax = Math.max(ymax, Math.max.apply(null, hh));
      const yt = V.niceTicks(0, ymax, 3);
      const top = yt[yt.length - 1] >= ymax ? yt[yt.length - 1] : ymax;
      const y = V.lin([0, top], [H, 0]);
      V.axisLeft(g, y, W, { ticks: yt.filter((v) => v <= top) });
      const band = W / Lv;
      const gw = band * (Lv <= 4 ? 0.6 : Lv <= 8 ? 0.8 : 0.84);
      const bw = Math.max(1.5, (gw - 2) / 2);
      const showLab = bw >= 11.5;
      const rects = [], labs = [], lx = [];
      for (let k = 0; k < Lv; k++) {
        const cx = band * (k + 0.5);
        for (let s = 0; s < 2; s++) {
          const xx = s ? cx + 1 : cx - 1 - bw;
          rects.push(V.el("rect", { class: s ? "gw-hb q" : "gw-hb s", x: xx.toFixed(2), width: bw.toFixed(2), y: H, height: 0, rx: Math.min(2, bw / 3) }, g));
          lx.push(xx + bw / 2);
          labs.push(showLab ? V.el("text", { class: "gw-hl-t " + (s ? "q" : "s"), x: (xx + bw / 2).toFixed(2), y: H - 4, "text-anchor": "middle" }, g) : null);
        }
      }
      // baseline + code labels
      V.el("line", { class: "gw-base", x1: 0, x2: W, y1: H, y2: H }, g);
      const ax = V.el("g", { class: "axis" }, g);
      const stepL = band >= (Lv > 10 ? 23 : 14) ? 1 : band >= 11 ? 2 : 4;
      for (let k = 0; k < Lv; k++) {
        if (k % stepL && k !== Lv - 1) continue;
        const t = V.el("text", { x: band * (k + 0.5), y: H + 16, "text-anchor": "middle" }, ax);
        t.textContent = String(k);
      }
      const xt = V.el("text", { class: "axis-title", x: W / 2, y: H + 34, "text-anchor": "middle" }, g);
      xt.innerHTML = "code <tspan class='m'>q</tspan>";
      const hov = V.el("rect", { class: "gw-hhov", y: 0, height: H, width: band, x: -999 }, g);
      g.insertBefore(hov, g.firstChild.nextSibling);
      const ch = channel("hist", 2 * Lv, (cur) => {
        for (let j = 0; j < cur.length; j++) {
          const hgt = Math.max(0, cur[j]);
          rects[j].setAttribute("y", (H - hgt).toFixed(2));
          rects[j].setAttribute("height", hgt.toFixed(2));
          if (labs[j]) labs[j].setAttribute("y", (H - hgt - 4).toFixed(2));
        }
      });
      ch.init = true;   // bars grow from the baseline on first update
      HG = { svg, g, y, H, W, band, bw, rects, labs, lx, ch, Lv, hov, m };
      bindHist();
    }
    function updateHist(instant) {
      if (!HG) return;
      const B = model(S.gi).byBits[S.bits], hq = B.hist[S.fi], Lv = HG.Lv;
      const t = new Float64Array(2 * Lv);
      for (let k = 0; k < Lv; k++) {
        t[2 * k] = HG.H - HG.y(B.stdHist[k]);
        t[2 * k + 1] = HG.H - HG.y(hq[k]);
        if (HG.labs[2 * k]) { HG.labs[2 * k].textContent = B.stdHist[k]; HG.labs[2 * k + 1].textContent = hq[k]; }
      }
      // a code's two count labels stay >= 2px apart on narrow bars (centres are bw + 2 apart)
      for (let k = 0; k < Lv; k++) {
        const a = HG.labs[2 * k], b = HG.labs[2 * k + 1];
        if (!a) continue;
        const d = Math.max(0, (a.getComputedTextLength() + b.getComputedTextLength()) / 2 + 2 - (HG.bw + 2)) / 2;
        a.setAttribute("x", (HG.lx[2 * k] - d).toFixed(2));
        b.setAttribute("x", (HG.lx[2 * k + 1] + d).toFixed(2));
      }
      setTarget(HG.ch, t, instant);
      if (HG.hk != null) histTip(HG.hk);
    }
    function bindHist() {
      const svg = HG.svg;
      const kAt = (ev) => {
        const b = svg.getBoundingClientRect();
        const k = Math.floor((ev.clientX - b.left - HG.m.l) / HG.band);
        return k >= 0 && k < HG.Lv ? k : -1;
      };
      const on = (ev) => { const k = kAt(ev); if (k < 0) off(); else histTip(k); };
      const off = () => { HG.hk = null; HG.hov.setAttribute("x", -999); tipHist.hide(); };
      // touch: show on a tap's pointerup (moved < 10px); a scroll that starts here leaves nothing behind
      let tap = null;
      svg.addEventListener("pointermove", (ev) => { if (ev.pointerType !== "touch") on(ev); });
      svg.addEventListener("pointerdown", (ev) => {
        if (ev.pointerType !== "touch") { on(ev); return; }
        tap = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
      });
      svg.addEventListener("pointerup", (ev) => {
        if (!tap || ev.pointerId !== tap.id) return;
        const moved = Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y);
        tap = null;
        if (moved < 10) on(ev);
      });
      svg.addEventListener("pointercancel", () => { tap = null; off(); });
      svg.addEventListener("pointerleave", (ev) => { if (ev.pointerType !== "touch") off(); });
    }
    function histTip(k) {
      const B = model(S.gi).byBits[S.bits];
      HG.hk = k;
      HG.hov.setAttribute("x", (HG.band * k).toFixed(2));
      const hmax = Math.max(B.stdHist[k], B.hist[S.fi][k]);
      tipHist.show(HG.m.l + HG.band * (k + 0.5), HG.m.t + HG.y(hmax),
        "<div class='tt'>code <i class='m'>q</i> = " + k + "</div>" +
        "<div class='row'><span><span class='sw' style='background:" + C.graph + "'></span>Standard QAT</span><b class='num'>" + B.stdHist[k] + "</b></div>" +
        "<div class='row'><span><span class='sw' style='background:" + C.rose + "'></span>QUASAR <i class='m'>f</i> = " + fmtF(GRID[S.fi]) + "</span><b class='num'>" + B.hist[S.fi][k] + "</b></div>");
    }

    // ------------------------------------------------------------------ (c) headline ratio + population strip
    function updateBig() {
      const B = model(S.gi).byBits[S.bits];
      const r = B.ratio[S.fi];
      bigV.textContent = fmtRatio(r);
      big.classList.toggle("worse", r >= 1);
      bigF.innerHTML = "<i class='m'>f</i> = " + fmtF(GRID[S.fi]) + (S.fi === B.best && !S.searching ? " · <i class='m'>f</i>*" : "");
      const mx = Math.max(1, r);
      barS.style.width = (100 / mx).toFixed(2) + "%";
      barQ.style.width = Math.max(0.6, (100 * r) / mx).toFixed(2) + "%";
      valS.textContent = "1.00×";
      valQ.textContent = fmtRatio(r) + "×";
      bars.classList.toggle("worse", r >= 1);
    }
    let PG = null;
    // Population strip disabled: its statistic (over the 2,352-group export) is not a paper number.
    const SHOW_POP = false;
    if (!SHOW_POP) pop.remove();
    function drawPop() {
      if (!SHOW_POP) return;
      const P = POP[String(S.bits)];
      const width = Math.round(popBox.clientWidth);
      if (!P || !P.gain_percentiles || !width) { pop.hidden = !P; return; }
      pop.hidden = false;
      const M = model(S.gi), B = M.byBits[S.bits];
      const rr = P.gain_percentiles.map((gn) => 1 / gn);
      const here = B.ratio[B.best];
      const lo = Math.min(Math.min.apply(null, rr), here) / 1.25, hi = 1.3;
      const m = { t: 22, r: 10, b: 22, l: 10 };
      const fr = V.frame(popBox, width, 66, m);
      const { svg, g, W, H } = fr;
      svg.setAttribute("aria-label", "loss-aware reconstruction error relative to Standard QAT across " + P.n_groups + " groups");
      const x = V.log([lo, hi], [0, W]);
      const ax = V.el("g", { class: "axis" }, g);
      V.el("line", { x1: 0, x2: W, y1: H, y2: H }, ax);
      [0.001, 0.01, 0.1, 1].filter((v) => v >= lo && v <= hi).forEach((v) => {
        V.el("line", { x1: x(v), x2: x(v), y1: H, y2: H + 3 }, ax);
        const t = V.el("text", { x: x(v), y: H + 15, "text-anchor": "middle" }, ax);
        t.textContent = fmtTick(v);
      });
      const rug = V.el("g", { class: "gw-rug" }, g);
      rr.forEach((v) => V.el("line", { x1: x(v).toFixed(2), x2: x(v).toFixed(2), y1: H - 12, y2: H - 2 }, rug));
      const med = 1 / P.gain_median;
      V.el("line", { class: "gw-med", x1: x(med), x2: x(med), y1: H - 16, y2: H - 1 }, g);
      V.el("line", { class: "gw-one", x1: x(1), x2: x(1), y1: H - 16, y2: H - 1 }, g);
      const hx = x(here);
      V.el("line", { class: "gw-here", x1: hx, x2: hx, y1: H - 16, y2: H - 1 }, g);
      V.el("circle", { class: "gw-here-d", cx: hx, cy: H - 18, r: 3.6 }, g);
      const t = V.el("text", { class: "gw-here-t", x: hx, y: H - 26 }, g);
      t.innerHTML = esc(shortName(M.g)) + " · <tspan class='m'>f</tspan>*";
      const tw = (shortName(M.g).length + 5) * 7;
      const anchor = hx - tw / 2 < -m.l + 2 ? "start" : hx + tw / 2 > W + m.r - 2 ? "end" : "middle";
      t.setAttribute("text-anchor", anchor);
      if (anchor === "start") t.setAttribute("x", Math.max(hx - 6, -m.l + 2));
      if (anchor === "end") t.setAttribute("x", Math.min(hx + 6, W + m.r - 2));
      popHead.innerHTML = "<span>" + P.n_groups.toLocaleString("en-US") + " groups · INT" + S.bits + " · <i class='m'>f</i>*</span><span class='med'>median " + fmtRatio(med) + "×</span>";
      PG = { svg };
    }

    // ------------------------------------------------------------------ live region
    let liveT = 0;
    function announce() {
      clearTimeout(liveT);
      if (S.searching) return;
      liveT = setTimeout(() => {
        const B = model(S.gi).byBits[S.bits], e = B.res.sweep[S.fi];
        live.textContent = shortName(model(S.gi).g) + ", INT" + S.bits + ": f = " + fmtF(GRID[S.fi]) + (S.fi === B.best ? " (f*)" : "") +
          ", " + fmtRatio(B.ratio[S.fi]) + "× Standard QAT, " + e.nOutside + " clipped";
      }, 350);
    }

    // ------------------------------------------------------------------ orchestration
    function update(instant) {
      updateMain(instant);
      updateCurve();
      updateHist(instant);
      updateBig();
      if (S.searching) btnL.textContent = (S.searchK + 1) + " / " + NF;
      else btnL.textContent = "Search";
      announce();
    }
    function setF(k) {
      S.touched = true;
      stopSearch();
      S.fi = k;
      update();
    }
    function onBits(b) {
      S.touched = true; stopSearch();
      S.bits = b;
      S.fi = model(S.gi).byBits[b].best;
      drawCurve(); drawHist(); drawPop();
      update();
    }
    function onMode(v) { S.touched = true; cancelIntro(); S.mode = v; update(); }
    // a control touched before the intro ran: leave the pending first-search state for the answer
    function cancelIntro() {
      if (!introPending) return;
      introPending = false;
      if (S.searching && !timer) { stopSearch(); S.fi = model(S.gi).byBits[S.bits].best; }
    }
    sel.addEventListener("change", () => {
      S.touched = true; stopSearch();
      S.gi = +sel.value;
      S.fi = model(S.gi).byBits[S.bits].best;
      hideTipMain();
      drawMain(); drawCurve(); drawHist(); drawPop();
      fadeInDots(220);
      update(true);
      if (S.mode === "r" && !RM) {            // re-snap from w so the reconstruction is visible
        const keep = S.mode; S.mode = "w"; updateMain(true); S.mode = keep;
        setTimeout(() => update(), 260);
      }
    });
    range.addEventListener("input", () => { const k = +range.value; if (k !== S.fi || S.searching) setF(k); });
    // touch: a tap outside a chart dismisses its tooltip
    document.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType !== "touch") return;
      if (!mainBox.contains(ev.target)) hideTipMain();
      if (!curveBox.contains(ev.target)) hideCurveTip();
      if (HG && !histBox.contains(ev.target)) { HG.hk = null; HG.hov.setAttribute("x", -999); tipHist.hide(); }
    }, { passive: true });

    let timer = 0;
    function stopSearch() {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (S.searching) { S.searching = false; S.searchK = -1; btn.removeAttribute("aria-busy"); }
    }
    function runSearch(then) {
      introPending = false;
      stopSearch();
      const B = model(S.gi).byBits[S.bits];
      if (RM) { S.fi = B.best; update(); land(); if (then) then(); return; }
      S.searching = true; S.searchK = 0; S.fi = 0;
      btn.setAttribute("aria-busy", "true");
      update();
      const step = () => {
        timer = 0;
        if (DEV.search != null && S.searchK >= +DEV.search) return;   // dev: freeze mid-search
        if (S.searchK < NF - 1) {
          S.searchK++; S.fi = S.searchK; update();
          timer = setTimeout(step, STEP_MS);
        } else {
          timer = setTimeout(() => {
            timer = 0;
            S.searching = false; S.searchK = -1; S.fi = B.best;
            btn.removeAttribute("aria-busy");
            update(); land();
            if (then) then();
          }, 420);
        }
      };
      timer = setTimeout(step, STEP_MS);
    }
    function land() {
      if (RM) return;
      [CV && CV.fs, big].forEach((n) => { if (!n) return; n.classList.remove("land"); void n.getBoundingClientRect(); n.classList.add("land"); });
    }
    btn.addEventListener("click", () => { S.touched = true; runSearch(); });

    function fadeInDots(span) {
      if (RM || !MG) return;
      const x0 = MG.x0, x1 = MG.x1;
      MG.lanes.forEach((ln, k) => ln.dots.forEach((d, i) => {
        d.style.transition = "none"; d.style.opacity = "0";
        const delay = Math.round(((MG.wx[i] - x0) / (x1 - x0 || 1)) * span + k * 60);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          d.style.transition = `opacity 420ms ease ${delay}ms`; d.style.opacity = "";
        }));
      }));
      setTimeout(() => { if (MG) MG.lanes.forEach((ln) => ln.dots.forEach((d) => { d.style.transition = ""; })); }, span + 700);
    }

    let drawnW = 0;
    function layout(width) {
      drawnW = width;
      root.classList.toggle("gw-narrow", width < 560);
      root.classList.toggle("gw-mid", width >= 560 && width < 900);
      drawMain(); drawCurve(); drawHist(); drawPop();
      update(true);
    }

    pMode.set(S.mode, false);
    let introIO = null, introOff = false;
    if (wantIntro) {
      root.classList.add("gw-pre");
      V.responsive(root, layout);
      introIO = V.onVisible(mainBox, () => {
        if (introOff) return;
        root.classList.remove("gw-pre");
        fadeInDots(520);
        setTimeout(() => {
          if (introOff) return;
          if (S.touched) { cancelIntro(); update(); return; }
          runSearch(() => setTimeout(() => {
            if (S.touched || introOff) return;
            S.mode = "r"; pMode.set("r", false); update();
          }, 520));
        }, 500);
      }, { threshold: 0.6 });
    } else {
      V.responsive(root, layout);
      if (DEV.search != null) setTimeout(() => runSearch(), 300);
    }
    // print: never the pre-intro or a mid-search frame. Cancel the intro/search and render the
    // final state (f = f*, reconstructed r) synchronously; a state the reader picked prints as is.
    window.addEventListener("beforeprint", () => {
      const keep = S.touched && !S.searching;
      introOff = true; introPending = false;
      if (introIO) introIO.disconnect();
      stopSearch();
      if (!keep) { S.fi = model(S.gi).byBits[S.bits].best; S.mode = "r"; pMode.set("r", false); }
      root.classList.remove("gw-pre");
      if (MG) MG.lanes.forEach((ln) => ln.dots.forEach((d) => { d.style.transition = ""; d.style.opacity = ""; }));
      hideTipMain(); hideCurveTip();
      if (HG) { HG.hk = null; HG.hov.setAttribute("x", -999); tipHist.hide(); }
      update(true);
    });
    // the print layout is narrower than the screen: redraw at the page width when print media
    // applies (the change fires before the page is printed), and back at the screen width after
    if (window.matchMedia) {
      const mqP = window.matchMedia("print");
      const relayout = () => { const w = Math.round(root.clientWidth); if (w && w !== drawnW) layout(w); };
      if (mqP.addEventListener) mqP.addEventListener("change", relayout);
      else if (mqP.addListener) mqP.addListener(relayout);
      window.addEventListener("afterprint", relayout);
    }
    // tiny API for the dev page / other scripts
    window.GroupWidget = { state: S, setF, runSearch, model, set(o) { if (o.bits) { pBits.set(o.bits, true); } if (o.mode) pMode.set(o.mode, true); if (o.f != null) { const k = GRID.findIndex((f) => Math.abs(f - o.f) < 1e-9); if (k >= 0) setF(k); } } };
  }
})();
