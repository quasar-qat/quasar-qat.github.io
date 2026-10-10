/* ix-realw1.js — interactive versions of paper Figures 5 and 8 (real Qwen3-4B weights).
   Mounts: #ix-fig5  per-weight loss-aware reconstruction error, 14 groups at INT3 (Figure 5)
           #ix-fig8  saliency h in one layer (Figure 8)
   Data:   assets/data/ix-realw1-fig5.json, ix-realw1-fig8.json, written by tools/extract_ix_realw1.py from
           the paper generators' own arrays. Fig. 5 level lines are recomputed live with QuasarCore (the
           probe's factor grid and ridge, as stored) and checked against the stored reconstructions.
   Renders data labels only (no prose). Needs window.Viz (viz.js); uses window.QuasarCore when present. */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const dataURL = (f) => (SRC ? new URL("../data/" + f, SRC).href : "assets/data/" + f);
  const el = V.el, h = V.h;
  const C = { rose: "#D1495B", roseT: "#A13040", graph: "#3F4245", steel: "#2E6F95", ink: "#1D1F22", muted: "#6B6F75", ink2: "#44484F" };
  const reduce = V.reducedMotion;
  const MINUS = "−";
  let UID = 0;

  // ------------------------------------------------------------------ formatting
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sgn = (s) => String(s).replace(/^-/, MINUS);
  function num(v, sig) {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e4) return sgn(String(+v.toPrecision(sig || 3)));
    return sgn(v.toExponential((sig || 3) - 1));
  }
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const pow10 = (e) => "10" + String(e).split("").map((c) => SUP[c]).join("");
  // h from log10 h, two significant digits: 4.1·10⁻⁶
  function hSci(lg) {
    let e = Math.floor(lg), m = +Math.pow(10, lg - e).toPrecision(2);
    if (m >= 10) { m = +(m / 10).toPrecision(2); e += 1; }
    return m.toFixed(1) + "·" + pow10(e);
  }
  const fx = (v, d) => (+v).toFixed(d);
  const range = (a, b) => a + "–" + b;
  const ital = (s) => '<i class="xr-m">' + s + "</i>";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ color
  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  // the paper's error / saliency palette for Figure 5: RdYlGn_r tempered 42 % toward white (11 ColorBrewer stops)
  const RYG = ["#6ba78b", "#7ac39a", "#a6d9a5", "#cbe9a9", "#e9f6bc", "#ffffda", "#feedbc", "#fed0a3", "#f9aa92", "#e88782", "#cb6b81"].map(hex);
  // saliency h: near-white -> steel -> deep steel
  const STEEL = [[0, [248, 248, 245]], [0.25, [214, 227, 235]], [0.5, [158, 192, 212]], [0.78, [70, 128, 165]], [1, [22, 60, 86]]];
  function rampEven(stops, t) {
    t = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  function rampPos(stops, t) {
    t = clamp(t, 0, 1);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [p0, a] = stops[i], [p1, b] = stops[i + 1], f = (t - p0) / (p1 - p0 || 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  const rgb = (c) => "rgb(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + ")";
  const ryg = (t) => rgb(rampEven(RYG, t));
  const steelC = (t) => rgb(rampPos(STEEL, t));
  function gradientCSS(fn, n) {
    const s = [];
    for (let i = 0; i <= n; i++) s.push(fn(i / n) + " " + ((100 * i) / n).toFixed(1) + "%");
    return "linear-gradient(90deg," + s.join(",") + ")";
  }
  function percentile(arr, p) {   // numpy 'linear'
    const a = Float64Array.from(arr).sort(), k = (a.length - 1) * p / 100, f = Math.floor(k), c = Math.min(a.length - 1, f + 1);
    return a[f] + (a[c] - a[f]) * (k - f);
  }

  // ------------------------------------------------------------------ shared UI
  // Pointer input: a mouse (or hovering pen) tracks the pointer; touch acts on a tap (< 10 px of travel) or on a
  // horizontal scrub; a vertical swipe stays a page scroll and the pointercancel it causes clears the tooltip.
  function bindPointer(node, o) {
    let t0 = null, scrub = false;
    node.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      t0 = [e.clientX, e.clientY]; scrub = false;
    });
    node.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || (e.pointerType === "pen" && !t0)) { o.move(e, false); return; }
      if (!t0) return;
      const dx = e.clientX - t0[0], dy = e.clientY - t0[1];
      if (scrub || (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy))) { scrub = true; o.move(e, true); }
    });
    node.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") { if (e.button === 0 && o.tap) o.tap(e, false); return; }
      if (t0 && !scrub && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 10) { o.move(e, true); if (o.tap) o.tap(e, true); }
      t0 = null; scrub = false;
    });
    node.addEventListener("pointercancel", () => { t0 = null; scrub = false; o.leave(true); });
    node.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") o.leave(false); });
  }
  function outsideTap(node, fn) {
    document.addEventListener("pointerdown", (e) => { if (!node.contains(e.target)) fn(); }, { passive: true });
  }
  function local(node, e) { const b = node.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
  function figName(root) {
    const card = root.closest(".viz"), kick = card && card.querySelector(".viz-kicker");
    return kick ? kick.textContent.split("·")[0].trim() : "";
  }
  function tipRows(head, rows) {
    let s = '<div class="tt">' + head + "</div>";
    for (const r of rows) s += '<div class="row xr-row' + (r.q ? " q" : "") + '"><span class="xr-n">' + r.label + "</span><b>" + r.value + "</b></div>";
    return s;
  }
  function tween(ms, cb, done) {
    if (reduce || ms <= 0) { cb(1); if (done) done(); return { stop() {} }; }
    let live = true;
    const t0 = performance.now();
    const step = (now) => {
      if (!live) return;
      const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      cb(e);
      if (t < 1) requestAnimationFrame(step); else if (done) done();
    };
    requestAnimationFrame(step);
    return { stop() { if (live) { live = false; cb(1); if (done) done(); } } };
  }
  function txt(parent, attrs, s, cls) {
    const t = el("text", Object.assign({ class: cls || null }, attrs), parent);
    t.textContent = s;
    return t;
  }
  // text made of plain + italic-math runs: [["(b) ", 0], ["f", 1], ...]
  function runs(t, parts) {
    for (const [s, m] of parts) {
      const sp = el("tspan", m ? { class: "xr-mt" } : null, t);
      sp.textContent = s;
    }
    return t;
  }
  function legendChip(parent, kind, label, extra) {
    const li = h("span", { class: "xr-li" }, parent);
    const s = el("svg", { viewBox: "0 0 22 12", width: 22, height: 12, "aria-hidden": "true" }, li);
    if (kind === "dot") el("circle", { cx: 11, cy: 6, r: 3.6, fill: steelC(0.8), stroke: C.steel, "stroke-width": 0.8 }, s);
    else if (kind === "dash") el("line", { x1: 1, x2: 21, y1: 6, y2: 6, stroke: C.graph, "stroke-width": 1.4, "stroke-dasharray": "3 2.5" }, s);
    else if (kind === "rose") el("line", { x1: 1, x2: 21, y1: 6, y2: 6, stroke: C.rose, "stroke-width": 1.6 }, s);
    else if (kind === "conn") { el("line", { x1: 11, x2: 11, y1: 1, y2: 11, stroke: C.ink2, "stroke-width": 1.4 }, s); el("circle", { cx: 11, cy: 2.6, r: 2.4, fill: steelC(0.7), stroke: C.steel, "stroke-width": 0.7 }, s); }
    h("span", null, li, label);
    if (extra) li.classList.add(extra);
    return li;
  }

  // ================================================================== Figure 5
  function fig5(root, D) {
    const Q = window.QuasarCore;
    const G = D.groups, NR = G.length, NC = G[0].w.length, BITS = D.bits;
    root.classList.add("xr", "xr5");
    root.textContent = "";
    root.style.minHeight = "0";

    // ---- derived data: the generator's matrices, rebuilt from the stored w, h, r
    const rows = G.map((g, ri) => {
      const n = g.w.length;
      let hs = 0, hmax = 0;
      for (const v of g.h) { hs += v; if (v > hmax) hmax = v; }
      const hm = Math.max(hs / n, 1e-30);
      const ea = new Float64Array(n), eb = new Float64Array(n);
      let ss = 0;
      for (let c = 0; c < n; c++) {
        const i = g.order[c], sh = Math.sqrt(g.h[i] / hm);
        ea[c] = sh * (g.r_std[i] - g.w[i]); eb[c] = sh * (g.r_q[i] - g.w[i]);
        ss += ea[c] * ea[c];
      }
      const nrm = Math.sqrt(ss / n) || 1;
      const A = new Float64Array(n), B = new Float64Array(n), Df = new Float64Array(n);
      for (let c = 0; c < n; c++) { A[c] = Math.abs(ea[c]) / nrm; B[c] = Math.abs(eb[c]) / nrm; Df[c] = B[c] - A[c]; }
      return { ri, g, hm, hmax, ea, eb, A, B, Df, lv: null };
    });
    const allD = [];
    for (const R of rows) for (const v of R.Df) allD.push(Math.abs(v));
    const DMAX = percentile(allD, 98);
    const GAM = D.gamma, VMAX = D.vmax;
    const colA = (v) => ryg(Math.pow(clamp(v / VMAX, 0, 1), GAM));
    const colD = (d) => ryg(0.5 + 0.5 * Math.sign(d) * Math.pow(Math.min(1, Math.abs(d) / DMAX), GAM));

    // ---- level lines: QuasarCore (probe grid + ridge), checked against the stored reconstructions
    function levelsOf(ri) {
      const R = rows[ri];
      if (R.lv) return R.lv;
      const g = R.g, L = 1 << BITS;
      const fromStored = (rr, qq) => {   // s, z from two distinct codes of the stored arm
        let i0 = 0, i1 = -1;
        for (let i = 0; i < qq.length; i++) { if (qq[i] < qq[i0]) i0 = i; }
        for (let i = 0; i < qq.length; i++) { if (qq[i] !== qq[i0] && (i1 < 0 || qq[i] > qq[i1])) i1 = i; }
        const s = i1 < 0 ? 0 : (rr[i1] - rr[i0]) / (qq[i1] - qq[i0]), z = rr[i0] - s * qq[i0];
        return Array.from({ length: L }, (_, k) => z + s * k);
      };
      let lvS = null, lvQ = null, fQ = g.f, live = false;
      if (Q) {
        try {
          const std = Q.standardQAT(g.w, BITS);
          const res = Q.quasar(g.w, g.h, BITS, D.probe_grid, { lambda: D.probe_ridge });
          // same codes and f* as the stored arms (the probe ran in float32; r agrees to ~1e-5)
          let same = Math.abs(res.best.f - g.f) < 1e-6, dS = 0, dQ = 0;
          const span = Math.max(...g.w) - Math.min(...g.w);
          for (let i = 0; i < g.w.length && same; i++) {
            if (std.q[i] !== g.q_std[i] || res.best.q[i] !== g.q_q[i]) same = false;
            dS = Math.max(dS, Math.abs(std.r[i] - g.r_std[i])); dQ = Math.max(dQ, Math.abs(res.best.r[i] - g.r_q[i]));
          }
          if (same && dS < 1e-4 * span && dQ < 1e-4 * span) {
            lvS = Array.from(Q.levels(std.s, std.z, BITS)); lvQ = Array.from(Q.levels(res.best.s, res.best.z, BITS));
            fQ = res.best.f; live = true;
          } else if (window.console) console.warn("[ix-realw1] fig5 row " + (ri + 1) + ": QuasarCore differs from the stored arms", dS, dQ);
        } catch (err) { if (window.console) console.warn("[ix-realw1] QuasarCore", err); }
      }
      if (!lvS) { lvS = fromStored(g.r_std, g.q_std); lvQ = fromStored(g.r_q, g.q_q); }
      let lo = Infinity, hi = -Infinity;
      for (const v of g.w) { if (v < lo) lo = v; if (v > hi) hi = v; }
      for (const v of lvS.concat(lvQ)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const pad = (hi - lo) * 0.07 || 0.01;
      // zoom: the central 96 % of the weights, padded
      const q02 = percentile(g.w, 2), q98 = percentile(g.w, 98), zp = (q98 - q02) * 0.35 || 0.01;
      R.lv = { S: lvS, Q: lvQ, f: fQ, live, dom: [lo - pad, hi + pad], zdom: [q02 - zp, q98 + zp] };
      return R.lv;
    }

    // ---- DOM: controls + legend, plot, key, sr table
    const head = h("div", { class: "xr-head" }, root);
    const ctl = h("div", { class: "xr-ctl" }, head);
    h("span", { class: "lab", "aria-hidden": "true" }, ctl, "Color");
    const st = { sel: 0, mode: "err", zoom: "zoom", hov: null, cur: null, revealed: false };
    const pills = V.pills(ctl, [
      { value: "err", label: "|√" + ital("h") + " (" + ital("r") + "−" + ital("w") + ")|" },
      { value: "diff", label: "(b) − (a)" },
    ], st.mode, (v) => { st.mode = v; recolor(true); syncLegend(); }, "Color");
    const ctl2 = h("div", { class: "xr-ctl" }, head);
    h("span", { class: "lab", "aria-hidden": "true" }, ctl2, "Range");
    const zpills = V.pills(ctl2, [{ value: "full", label: "full" }, { value: "zoom", label: "zoom" }], st.zoom,
      (v) => { st.zoom = v; showStrip(st.sel, true); }, "Range");
    const legs = h("div", { class: "xr-legs", "aria-hidden": "true" }, head);
    const legE = h("div", { class: "xr-leg" }, legs);
    h("span", { class: "xr-lt" }, legE, "|√" + ital("h") + " (" + ital("r") + "−" + ital("w") + ")|");
    h("span", { class: "xr-lv" }, legE, "0");
    h("span", { class: "xr-bar", style: "background:" + gradientCSS((t) => colA(t * VMAX), 24) }, legE);
    h("span", { class: "xr-lv" }, legE, "high");
    const legD = h("div", { class: "xr-leg xr-legd" }, legs);
    h("span", { class: "xr-lt" }, legD, "(b) − (a)");
    h("span", { class: "xr-lv" }, legD, "(b) &lt; (a)");
    h("span", { class: "xr-bar", style: "background:" + gradientCSS((t) => colD((2 * t - 1) * DMAX), 24) }, legD);
    h("span", { class: "xr-lv" }, legD, "(b) &gt; (a)");
    function syncLegend() {
      legD.classList.toggle("on", st.mode === "diff");
      legE.classList.toggle("off-narrow", !!(sk && sk.L.narrow));
    }

    const plot = h("div", { class: "xr-plot", tabindex: "0" }, root);
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-label", (figName(root) || "chart") + ", arrow keys explore");
    const key = h("div", { class: "xr-key", "aria-hidden": "true" }, root);
    legendChip(key, "dot", ital("w") + " · saliency " + ital("h"));
    legendChip(key, "conn", ital("r") + " − " + ital("w"));
    legendChip(key, "dash", "Standard QAT levels");
    legendChip(key, "rose", "QUASAR levels", "q");
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    sr.innerHTML = "<caption>Ŝ (b) ÷ (a)</caption><thead><tr><th>row</th><th>f*</th><th>Ŝ (b) ÷ (a)</th></tr></thead><tbody>" +
      G.map((g, r) => "<tr><th scope=\"row\">row " + (r + 1) + "</th><td>" + fx(g.f, 2) + "</td><td>" + fx(g.S_ratio, 3) + "</td></tr>").join("") + "</tbody>";
    const tip = V.tooltip(plot);
    tip.node.classList.add("xr-tip");

    let sk = null, sweep = null, morph = null;

    // ---- geometry
    function layout(width) {
      const narrow = width < 700;
      if (!narrow) {   // left gutter: the strip's y ticks only (no row labels)
        const gutL = 48, gap = 30, gap2 = 22, sW = 104;
        const pw = Math.floor((width - gutL - gap - gap2 - sW) / 2);
        const rh = 17, titleH = 30, heatH = NR * rh, sGap = 30, stripH = 176, axH = 42;
        const top = titleH, sTop = top + heatH + sGap;
        return { narrow, width, gutL, pw, rh, heatH, stripH, sW,
          P: [{ x: gutL, top, sTop }, { x: gutL + pw + gap, top, sTop }], sx: gutL + 2 * pw + gap + gap2,
          height: sTop + stripH + axH, titleH };
      }
      const gutL = 34, side = 58, pw = width - gutL - 10 - side;
      const rh = 13, titleH = 28, heatH = NR * rh, sGap = 28, stripH = 136, axH = 40, blk = titleH + heatH + sGap + stripH + axH;
      return { narrow, width, gutL, pw, rh, heatH, stripH, sW: side,
        P: [{ x: gutL, top: titleH, sTop: titleH + heatH + sGap }, { x: gutL, top: blk + 14 + titleH, sTop: blk + 14 + titleH + heatH + sGap }],
        sx: gutL + pw + 10, height: 2 * blk + 14, titleH, blk };
    }
    const colX = (L, c) => (c * L.pw) / NC;

    function draw(width) {
      const L = layout(width);
      if (sweep) sweep.stop();
      const fr = V.frame(plot, width, L.height, { t: 0, r: 0, b: 0, l: 0 });
      const svg = fr.svg, g0 = fr.g;
      svg.setAttribute("aria-label", (figName(root) || "chart") + " error heatmaps");
      const id = "xr5" + ++UID;
      const defs = el("defs", null, svg);
      sk = { L, svg, cells: [[], []], P: [], id };
      syncLegend();

      // panels
      for (let p = 0; p < 2; p++) {
        const P = L.P[p], gP = el("g", { transform: `translate(${P.x},0)` }, g0);
        // title
        const tt = el("text", { x: 0, y: P.top - 10, class: "xr-ptitle" + (p ? " q" : "") }, gP);
        const tA = el("tspan", null, tt), tB = el("tspan", { class: "xr-psub", dx: 8 }, tt);
        // heatmap
        const cp = el("clipPath", { id: id + "c" + p }, defs);
        const cr = el("rect", { x: 0, y: P.top - 2, width: L.pw, height: L.heatH + 4 }, cp);
        const gH = el("g", { "clip-path": `url(#${id}c${p})` }, gP);
        el("rect", { x: 0, y: P.top, width: L.pw, height: L.heatH, fill: "#fff" }, gH);
        const cells = [];
        for (let r = 0; r < NR; r++) {
          const row = [], y = P.top + r * L.rh;
          for (let c = 0; c < NC; c++) {
            const x0 = colX(L, c), x1 = colX(L, c + 1);
            row.push(el("rect", { x: x0.toFixed(2), y, width: (x1 - x0 + (c < NC - 1 ? 0.5 : 0)).toFixed(2), height: L.rh - 1 }, gH));
          }
          cells.push(row);
        }
        sk.cells[p] = cells;
        el("rect", { class: "xr-frame", x: 0, y: P.top, width: L.pw, height: L.heatH - 1 }, gP);
        const selBox = el("rect", { class: "xr-sel", x: -1.5, width: L.pw + 3, height: L.rh + 2, rx: 2 }, gP);
        const hovRow = el("rect", { class: "xr-hrow", x: -0.5, width: L.pw + 1, height: L.rh, rx: 1.5 }, gP);
        const cur = el("rect", { class: "xr-cur", width: Math.max(4, L.pw / NC + 2), height: L.rh + 2, rx: 1.5 }, gP);
        // strip
        const sTop = P.sTop, S = { lane: null, lv: [], conn: [], dots: [], car: [], guide: null, ring: null };
        S.lane = el("rect", { class: "xr-lane", x: 0, y: sTop, width: L.pw, height: L.stripH, rx: 4 }, gP);
        S.gTicks = el("g", { class: "xr-sgrid" }, gP);
        const gLv = el("g", null, gP), gConn = el("g", { class: "xr-conns" }, gP), gDots = el("g", { class: "xr-dots" }, gP);
        for (let k = 0; k < 1 << BITS; k++) S.lv.push(el("line", { class: p ? "xr-lvq" : "xr-lvs", x1: 0, x2: L.pw }, gLv));
        for (let c = 0; c < NC; c++) {
          const x = (colX(L, c) + colX(L, c + 1)) / 2;
          S.conn.push(el("line", { x1: x, x2: x, class: p ? "xr-cq" : "xr-cs" }, gConn));
          S.dots.push(el("circle", { cx: x, r: L.narrow ? 1.7 : 2.3, class: "xr-dot" }, gDots));
          S.car.push(el("path", { class: "xr-car", "data-x": x }, gDots));  // off-scale weight: caret on the strip edge
        }
        S.guide = el("line", { class: "xr-guide", y1: sTop + 3, y2: sTop + L.stripH - 3 }, gP);
        S.ring = el("circle", { class: "xr-ring", r: L.narrow ? 4 : 5 }, gP);
        S.lab = el("text", { x: 0, y: sTop - 8, class: "xr-slab" + (p ? " q" : "") }, gP);
        const cpS = el("clipPath", { id: id + "s" + p }, defs);
        el("rect", { x: 0, y: sTop, width: L.pw, height: L.stripH }, cpS);
        gLv.setAttribute("clip-path", `url(#${id}s${p})`); gConn.setAttribute("clip-path", `url(#${id}s${p})`);
        // x axis (weights sorted by h)
        const ay = sTop + L.stripH;
        const ax = el("g", { class: "axis" }, gP);
        runs(txt(ax, { x: 0, y: ay + 16, "text-anchor": "start" }, ""), [["high ", 0], ["h", 1]]);
        runs(txt(ax, { x: L.pw, y: ay + 16, "text-anchor": "end" }, ""), [["low ", 0], ["h", 1]]);
        runs(txt(ax, { x: L.pw / 2, y: ay + 31, "text-anchor": "middle", class: "axis-title" }, ""), [["Weights sorted by ", 0], ["h", 1]]);
        // pointer overlay: heatmap + strip
        const ov = el("rect", { class: "xr-ov", x: 0, y: P.top, width: L.pw, height: sTop + L.stripH - P.top, fill: "transparent" }, gP);
        ov.dataset.p = p;
        sk.P.push({ gP, tA, tB, cr, selBox, hovRow, cur, S, ov, top: P.top, sTop, x: P.x });
      }

      // strip y-axis ticks (left of each strip)
      sk.yAx = [];
      for (let p = 0; p < 2; p++) {
        if (!L.narrow && p === 1) { sk.yAx.push(null); continue; }
        sk.yAx.push(el("g", { class: "axis xr-yax", transform: `translate(${L.P[p].x - 8},0)` }, g0));
      }
      if (!L.narrow) runs(txt(g0, { x: L.P[0].x - 8, y: L.P[0].sTop - 8, "text-anchor": "end", class: "xr-yt" }, ""), [["w", 1], [", ", 0], ["r", 1]]);

      // side column: S-hat ratio bars beside (b); stacked: colorbar beside (a)
      const pB = L.P[1], sX = L.sx, bw = L.narrow ? L.sW - 6 : L.sW - 40;
      const gS = el("g", { class: "xr-shat", transform: `translate(${sX},0)` }, g0);
      const sxs = V.lin([0, 1], [0, bw]);
      const st1 = el("text", { x: 0, y: pB.top - 10, class: "xr-stitle" }, gS);
      runs(st1, [["Ŝ", 1], L.narrow ? [" (b)/(a)", 0] : [" (b) ÷ (a)", 0]]);
      el("line", { class: "xr-ref", x1: sxs(1), x2: sxs(1), y1: pB.top - 2, y2: pB.top + L.heatH + 1 }, gS);
      el("line", { class: "xr-base", x1: 0, x2: 0, y1: pB.top - 2, y2: pB.top + L.heatH + 1 }, gS);
      sk.bars = []; sk.vals = [];
      for (let r = 0; r < NR; r++) {
        const y = pB.top + r * L.rh, ratio = G[r].S_ratio;
        sk.bars.push(el("rect", { class: "xr-sb", x: 0, y: y + (L.narrow ? 2 : 3), width: sxs(Math.min(1, ratio)), height: L.rh - (L.narrow ? 5 : 7), rx: 1.5 }, gS));
        if (!L.narrow) sk.vals.push(txt(gS, { x: L.sW, y: y + L.rh / 2 + 4, "text-anchor": "end", class: "xr-sv" }, fx(ratio, 2)));
      }
      const sa = el("g", { class: "axis" }, gS);
      txt(sa, { x: 0, y: pB.top + L.heatH + 15, "text-anchor": "middle" }, "0");
      txt(sa, { x: sxs(1), y: pB.top + L.heatH + 15, "text-anchor": "middle" }, "1");
      sk.sOv = el("rect", { class: "xr-ov", x: -4, y: pB.top, width: L.sW + 4, height: L.heatH, fill: "transparent" }, gS);
      if (L.narrow) {   // vertical colorbar beside (a)
        const pA = L.P[0], gC = el("g", { class: "xr-cbar", transform: `translate(${sX},0)` }, g0);
        const gid = id + "g";
        const lg = el("linearGradient", { id: gid, x1: 0, x2: 0, y1: 1, y2: 0 }, defs);
        for (let i = 0; i <= 16; i++) el("stop", { offset: (i / 16).toFixed(3), "stop-color": colA((i / 16) * VMAX) }, lg);
        el("rect", { x: 0, y: pA.top, width: 9, height: L.heatH - 1, fill: `url(#${gid})`, rx: 1.5 }, gC);
        txt(gC, { x: 14, y: pA.top + 9, class: "xr-cbl" }, "high");
        txt(gC, { x: 14, y: pA.top + L.heatH - 2, class: "xr-cbl" }, "0");
      }

      bindAll();
      recolor(false);
      titles();
      setSel(st.sel, false);
      if (st.cur) showCur(st.cur[0], st.cur[1], null);
      if (!st.revealed) {   // first view: hidden until the sweep runs
        for (const P of sk.P) P.cr.setAttribute("width", 0);
        plot.classList.add("pre");
      }
    }

    function titles() {
      const er = D.error_rel;
      const [a, b] = sk.P;
      a.tA.textContent = "(a) Standard QAT"; a.tB.textContent = "error " + fx(er.standard_qat, 2) + "×";
      if (st.mode === "diff") { b.tA.textContent = "(b) − (a)"; b.tB.textContent = ""; }
      else { b.tA.textContent = "(b) QUASAR"; b.tB.textContent = "error " + fx(er.quasar, 2) + "×"; }
      b.tA.parentNode.classList.toggle("q", st.mode !== "diff");
    }

    function recolor(anim) {
      if (!sk) return;
      for (let r = 0; r < NR; r++) {
        const R = rows[r];
        for (let c = 0; c < NC; c++) {
          sk.cells[0][r][c].setAttribute("fill", colA(R.A[c]));
          sk.cells[1][r][c].setAttribute("fill", st.mode === "diff" ? colD(R.Df[c]) : colA(R.B[c]));
        }
      }
      if (anim && !reduce) {   // brief cross-fade of the recolored (b) heatmap
        const tgt = sk.cells[1][0][0].parentNode;
        tgt.style.transition = "none"; tgt.style.opacity = 0.35;
        tgt.getBoundingClientRect();
        tgt.style.transition = "opacity .32s ease"; tgt.style.opacity = 1;
      }
      titles();
      if (st.hov) showCur(st.hov[0], st.hov[1], st.hovXY);
    }

    // ---- strip (selected row): dots at w, connectors to r, 8 level lines; morphs between rows
    function stripState(ri) {
      const R = rows[ri], g = R.g, lv = levelsOf(ri), o = g.order;
      const w = new Float64Array(NC), rs = new Float64Array(NC), rq = new Float64Array(NC), ht = new Float64Array(NC);
      for (let c = 0; c < NC; c++) { const i = o[c]; w[c] = g.w[i]; rs[c] = g.r_std[i]; rq[c] = g.r_q[i]; ht[c] = Math.sqrt(g.h[i] / R.hmax); }
      return { ri, w, rs, rq, ht, lvS: lv.S.slice(), lvQ: lv.Q.slice(), dom: (st.zoom === "zoom" ? lv.zdom : lv.dom).slice(), f: lv.f };
    }
    let shown = null;
    function paintStrip(A, B, t) {
      const L = sk.L, mix = (a, b) => a + (b - a) * t;
      const dom = [mix(A.dom[0], B.dom[0]), mix(A.dom[1], B.dom[1])];
      for (let p = 0; p < 2; p++) {
        const P = sk.P[p], S = P.S, top = P.sTop + 6, bot = P.sTop + L.stripH - 6;
        const y = (v) => bot - ((v - dom[0]) / (dom[1] - dom[0])) * (bot - top);
        const lA = p ? A.lvQ : A.lvS, lB = p ? B.lvQ : B.lvS;
        for (let k = 0; k < S.lv.length; k++) { const yy = y(mix(lA[k], lB[k])).toFixed(2); S.lv[k].setAttribute("y1", yy); S.lv[k].setAttribute("y2", yy); }
        const rA = p ? A.rq : A.rs, rB = p ? B.rq : B.rs;
        for (let c = 0; c < NC; c++) {
          const yw = y(mix(A.w[c], B.w[c])), yr = y(mix(rA[c], rB[c]));
          S.conn[c].setAttribute("y1", yw.toFixed(2)); S.conn[c].setAttribute("y2", yr.toFixed(2));
          const out = yw < top - 4 || yw > bot + 4;
          S.dots[c].setAttribute("cy", clamp(yw, top - 3, bot + 3).toFixed(2));
          S.dots[c].classList.toggle("out", out);
          const cx = +S.car[c].getAttribute("data-x"), hw = L.narrow ? 2.6 : 3.2, ch = L.narrow ? 4 : 5;
          S.car[c].setAttribute("d", !out ? "" : yw < top ? `M${cx - hw},${top - 1}L${cx + hw},${top - 1}L${cx},${top - 1 - ch}Z` : `M${cx - hw},${bot + 1}L${cx + hw},${bot + 1}L${cx},${bot + 1 + ch}Z`);
          if (t === 1 || t === 0) {
            const fc = steelC(0.12 + 0.88 * (t ? B.ht[c] : A.ht[c]));
            S.dots[c].setAttribute("fill", fc); S.car[c].setAttribute("fill", fc);
          }
        }
        P.yScale = y;
      }
      // y ticks (target domain)
      const tk = V.niceTicks(dom[0], dom[1], L.narrow ? 3 : 4).filter((v) => v >= dom[0] && v <= dom[1]);
      const dec = Math.max(0, ...tk.map((v) => { const s = String(+v.toPrecision(10)); return s.includes(".") ? s.split(".")[1].length : 0; }));
      for (let p = 0; p < 2; p++) {
        const P = sk.P[p];
        P.S.gTicks.textContent = "";
        for (const v of tk) {
          const yy = P.yScale(v);
          el("line", { x1: 0, x2: L.pw, y1: yy, y2: yy }, P.S.gTicks);
        }
        const ax = sk.yAx[p];
        if (ax) { ax.textContent = ""; for (const v of tk) txt(ax, { x: 0, y: P.yScale(v) + 4, "text-anchor": "end" }, v === 0 ? "0" : sgn(v.toFixed(dec))); }
      }
    }
    function stripLabels(B) {
      const [a, b] = sk.P, R = rows[B.ri];
      a.S.lab.textContent = ""; runs(a.S.lab, [["f", 1], [" = 1 · min–max", 0]]);
      b.S.lab.textContent = "";
      runs(b.S.lab, sk.L.narrow ? [["f", 1], ["* = " + fx(B.f, 2) + "  ·  ", 0], ["Ŝ", 1], [" (b)/(a) " + fx(R.g.S_ratio, 2), 0]] : [["f", 1], ["* = " + fx(B.f, 2), 0]]);
    }
    function showStrip(ri, anim) {
      const B = stripState(ri), A = shown && anim && !reduce ? shown : B;
      if (morph) morph.stop();
      stripLabels(B);
      if (A === B) { paintStrip(B, B, 1); shown = B; return; }
      morph = tween(420, (t) => paintStrip(A, B, t), () => { morph = null; });
      shown = B;
    }

    // ---- selection / hover
    function setSel(r, anim) {
      st.sel = r;
      const L = sk.L;
      for (const P of sk.P) P.selBox.setAttribute("y", P.top + r * L.rh - 1.5);
      sk.bars.forEach((b, i) => b.classList.toggle("on", i === r));
      sk.vals.forEach((b, i) => b.classList.toggle("on", i === r));
      showStrip(r, anim);
      if (st.hov) showCur(st.hov[0], st.hov[1], st.hovXY);
    }
    function hideCur() {
      st.hov = null;
      if (!sk) return;
      for (const P of sk.P) { P.cur.classList.remove("on"); P.hovRow.classList.remove("on"); P.S.guide.classList.remove("on"); P.S.ring.classList.remove("on"); }
      sk.bars.forEach((b) => b.classList.remove("hv"));
    }
    function showCur(r, c, xy, barOnly) {
      st.hov = [r, c]; st.hovXY = xy;
      const L = sk.L;
      for (const P of sk.P) {
        P.hovRow.setAttribute("y", P.top + r * L.rh - 0.5); P.hovRow.classList.toggle("on", r !== st.sel);
        if (barOnly) { P.cur.classList.remove("on"); P.S.guide.classList.remove("on"); P.S.ring.classList.remove("on"); continue; }
        const x0 = colX(L, c), x1 = colX(L, c + 1), cw = Math.max(4, x1 - x0 + 2);
        P.cur.setAttribute("x", ((x0 + x1) / 2 - cw / 2).toFixed(2)); P.cur.setAttribute("y", P.top + r * L.rh - 1); P.cur.setAttribute("width", cw.toFixed(2));
        P.cur.classList.add("on");
        const on = r === st.sel && P.yScale && shown && shown.ri === r;
        const x = (x0 + x1) / 2;
        P.S.guide.setAttribute("x1", x); P.S.guide.setAttribute("x2", x); P.S.guide.classList.toggle("on", !!on);
        if (on) { P.S.ring.setAttribute("cx", x); P.S.ring.setAttribute("cy", clamp(P.yScale(shown.w[c]), P.sTop + 3, P.sTop + L.stripH - 3)); }
        P.S.ring.classList.toggle("on", !!on);
      }
      sk.bars.forEach((b, i) => b.classList.toggle("hv", i === r));
      if (xy) tip.show(xy[0], xy[1], barOnly ? barTip(r) : cellTip(r, c));
    }
    function cellTip(r, c) {
      const R = rows[r], g = R.g, i = g.order[c];
      const head = "row " + (r + 1);
      const errS = Math.abs(R.ea[c]), errQ = Math.abs(R.eb[c]);
      let s = '<div class="tt">' + head + "</div>";
      s += '<div class="row xr-row"><span class="xr-n">weight</span><b>#' + i + " · " + ital("h") + " rank " + (c + 1) + "</b></div>";
      s += '<div class="row xr-row"><span class="xr-n">' + ital("w") + "</span><b>" + num(g.w[i]) + "</b></div>";
      s += '<div class="row xr-row"><span class="xr-n">' + ital("h") + " / mean " + ital("h") + "</span><b>" + num(g.h[i], 3) + "</b></div>";
      s += '<div class="xr-tg"><span></span><span class="xr-th">' + ital("r") + '</span><span class="xr-th">|√' + ital("h") + " (" + ital("r") + "−" + ital("w") + ")|</span>";
      s += '<span class="xr-n"><i class="xr-k" style="background:' + C.graph + '"></i>Standard QAT</span><b>' + num(g.r_std[i]) + "</b><b>" + num(errS, 2) + "</b>";
      s += '<span class="xr-n q"><i class="xr-k" style="background:' + C.rose + '"></i>QUASAR</span><b>' + num(g.r_q[i]) + "</b><b>" + num(errQ, 2) + "</b></div>";
      return s;
    }
    function barTip(r) {
      const g = G[r], lv = levelsOf(r);
      return tipRows("row " + (r + 1), [
        { label: ital("Ŝ") + " (b) ÷ (a)", value: fx(g.S_ratio, 3), q: true },
        { label: ital("f") + "*", value: fx(lv.f, 2) },
      ]);
    }

    function hitHeat(p, e) {
      const P = sk.P[p], L = sk.L, b = P.ov.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top + P.top;
      const c = clamp(Math.floor((x / L.pw) * NC), 0, NC - 1);
      if (y < P.top + L.heatH) return { r: clamp(Math.floor((y - P.top) / L.rh), 0, NR - 1), c, strip: false };
      if (y >= P.sTop - 4) return { r: st.sel, c, strip: true };
      return null;
    }
    function bindAll() {
      for (let p = 0; p < 2; p++) {
        const P = sk.P[p];
        bindPointer(P.ov, {
          move(e, touch) {
            const hit = hitHeat(p, e);
            if (!hit) { hideCur(); tip.hide(); dwell(null); return; }
            showCur(hit.r, hit.c, local(plot, e));
            if (!touch && !hit.strip) dwell(hit.r);
          },
          tap(e, touch) { const hit = hitHeat(p, e); if (!hit) return; if (hit.r !== st.sel) setSel(hit.r, true); if (!touch) showCur(hit.r, hit.c, local(plot, e)); },
          leave() { hideCur(); tip.hide(); dwell(null); },
        });
      }
      const hitBar = (e) => { const b = sk.sOv.getBoundingClientRect(); return clamp(Math.floor((e.clientY - b.top) / sk.L.rh), 0, NR - 1); };
      bindPointer(sk.sOv, {
        move(e) { showCur(hitBar(e), 0, local(plot, e), true); },
        tap(e) { const r = hitBar(e); if (r !== st.sel) setSel(r, true); showCur(r, 0, local(plot, e), true); },
        leave() { hideCur(); tip.hide(); },
      });
    }
    outsideTap(root, () => { hideCur(); tip.hide(); });
    // resting the mouse on a group row for a moment selects it (a quick pass on the way to the strips does not)
    let dwT = 0, dwR = null;
    function dwell(r) {
      if (r === dwR) return;
      clearTimeout(dwT); dwR = r;
      if (r != null && r !== st.sel) dwT = setTimeout(() => { if (dwR === r && st.hov && st.hov[0] === r) setSel(r, true); }, 450);
    }

    // keyboard: arrows move across weights (left/right) and groups (up/down, selects the group)
    plot.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "Escape") { st.cur = null; hideCur(); tip.hide(); return; }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(k)) return;
      e.preventDefault();
      let [r, c] = st.cur || [st.sel, 0];
      if (k === "ArrowLeft") c = Math.max(0, c - 1);
      if (k === "ArrowRight") c = Math.min(NC - 1, c + 1);
      if (k === "Home") c = 0;
      if (k === "End") c = NC - 1;
      if (k === "ArrowUp") r = Math.max(0, r - 1);
      if (k === "ArrowDown") r = Math.min(NR - 1, r + 1);
      st.cur = [r, c];
      if (r !== st.sel) setSel(r, true);
      keyTip();
    });
    function keyTip() {
      const [r, c] = st.cur, P = sk.P[sk.L.narrow ? 0 : 1], L = sk.L;
      const pb = plot.getBoundingClientRect(), ob = P.ov.getBoundingClientRect();
      showCur(r, c, [ob.left - pb.left + (colX(L, c) + colX(L, c + 1)) / 2, ob.top - pb.top + r * L.rh + L.rh / 2]);
    }
    plot.addEventListener("focus", () => { if (plot.matches(":focus-visible")) { st.cur = st.cur || [st.sel, 0]; keyTip(); } });
    plot.addEventListener("blur", () => { st.cur = null; hideCur(); tip.hide(); });

    // first view: sweep both heatmaps in from the high-h side, then the strip
    function reveal() {
      if (st.revealed) return;
      st.revealed = true;
      plot.classList.remove("pre");
      if (!sk) return;
      const W = sk.L.pw;
      sweep = tween(reduce ? 0 : 1100, (t) => { for (const P of sk.P) P.cr.setAttribute("width", (W * t).toFixed(1)); }, () => { sweep = null; });
    }
    function finish() { reveal(); if (sweep) sweep.stop(); if (morph) morph.stop(); }

    V.responsive(plot, draw);
    V.onVisible(plot, reveal, { threshold: 0.25 });
    // dev / QA handle
    root._ix = { select: (r) => setSel(r, true), mode: (m) => pills.set(m, true), hover: (r, c) => { const L = sk.L, P = sk.P[1], pb = plot.getBoundingClientRect(), ob = P.ov.getBoundingClientRect(); showCur(r, c, [ob.left - pb.left + colX(L, c), ob.top - pb.top + r * L.rh + L.rh / 2]); }, levels: levelsOf, rows, finish };
    return finish;
  }

  // ================================================================== Figure 8
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const IDX = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) IDX[B64.charCodeAt(i)] = i;
  function decode(e) {
    const s = e.data, n = s.length >> 1, out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = (e.base + IDX[s.charCodeAt(2 * i)] * 64 + IDX[s.charCodeAt(2 * i + 1)]) / 512 - 16;
    if (n !== e.rows * e.cols) throw new Error("fig8: bad payload");
    return out;
  }

  function fig8(root, D) {
    root.classList.add("xr", "xr8");
    root.textContent = "";
    root.style.minHeight = "0";
    const OV = decode(D.overview), LN = decode(D.lens);
    const oR = D.overview.rows, oC = D.overview.cols, POOL = D.pool, GS = D.group;
    const lR = D.lens.rows, lC = D.lens.cols, r0 = D.lens.r0, c0 = D.lens.c0, NG = lC / GS;
    const [HR, HC] = D.shape;
    const vmin = D.vmin, vmax = D.vmax;
    const tOf = (lg) => (lg - vmin) / (vmax - vmin);
    // LUT for painting
    const LUT = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) { const c = rampPos(STEEL, i / 255); LUT[3 * i] = c[0]; LUT[3 * i + 1] = c[1]; LUT[3 * i + 2] = c[2]; }

    // within-group statistics of the full-resolution window (complete 128-weight groups)
    const grp = [];
    for (let r = 0; r < lR; r++) for (let k = 0; k < NG; k++) {
      let mx = -Infinity, mn = Infinity;
      for (let c = k * GS; c < (k + 1) * GS; c++) { const v = LN[r * lC + c]; if (v > mx) mx = v; if (v < mn) mn = v; }
      grp.push({ r, k, mx, mn, ratio: Math.pow(10, mx - mn) });
    }
    const byRatio = grp.slice().sort((a, b) => a.ratio - b.ratio);
    const med = byRatio[(byRatio.length - 1) >> 1];

    // ---- DOM
    const head = h("div", { class: "xr-head" }, root);
    h("span", { class: "xr-layer", "data-label": "" }, head, "Layer " + D.layer + " · " + esc(D.proj));
    const leg = h("div", { class: "xr-leg xr-legh", "aria-hidden": "true" }, head);
    h("span", { class: "xr-lt" }, leg, ital("h"));
    const lb = h("span", { class: "xr-hbar" }, leg);
    h("span", { class: "xr-bar", style: "background:" + gradientCSS((t) => steelC(t), 16) }, lb);
    const lticks = h("span", { class: "xr-hticks" }, lb);
    for (let e = Math.ceil(vmin); e <= Math.floor(vmax); e++) {
      const s = h("span", { style: "left:" + (100 * tOf(e)).toFixed(1) + "%" }, lticks, pow10(e));
      void s;
    }
    const plot = h("div", { class: "xr-plot", tabindex: "0" }, root);
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-label", (figName(root) || "chart") + ", arrow keys explore");
    const sr = h("p", { class: "sr-only", "data-label": "" }, root);
    sr.textContent = "h · layer " + D.layer + " " + D.proj + " · " + HR + " × " + HC + " · output " + range(r0, r0 + lR - 1) + " · input " + range(c0, c0 + lC - 1) +
      " · max h / min h " + Math.round(byRatio[0].ratio) + "–" + Math.round(byRatio[byRatio.length - 1].ratio) + "×, median " + Math.round(med.ratio) + "×";
    const tip = V.tooltip(plot);
    tip.node.classList.add("xr-tip");
    const st = { pin: { r: med.r, c: c0 + med.k * GS + (GS >> 1) }, prev: null, revealed: false, kc: null };
    let sk = null;

    function paint(vals, rows, cols, Wpx, Hpx) {
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const cw = Math.max(1, Math.round(Wpx * dpr)), ch = Math.max(1, Math.round(Hpx * dpr));
      const cv = document.createElement("canvas");
      cv.width = cw; cv.height = ch;
      const ctx = cv.getContext("2d"), im = ctx.createImageData(cw, ch), d = im.data;
      const colIx = new Int32Array(cw);
      for (let x = 0; x < cw; x++) colIx[x] = Math.min(cols - 1, Math.floor(((x + 0.5) / cw) * cols));
      for (let y = 0; y < ch; y++) {
        const r = Math.min(rows - 1, Math.floor(((y + 0.5) / ch) * rows)), base = r * cols;
        for (let x = 0; x < cw; x++) {
          const t = Math.round(clamp(tOf(vals[base + colIx[x]]), 0, 1) * 255) * 3, o = (y * cw + x) * 4;
          d[o] = LUT[t]; d[o + 1] = LUT[t + 1]; d[o + 2] = LUT[t + 2]; d[o + 3] = 255;
        }
      }
      ctx.putImageData(im, 0, 0);
      return cv.toDataURL("image/png");
    }

    function layout(width) {
      const wide = width >= 720;
      const ml = 46, mr = 6, top = 22, bH = 90;
      if (wide) {
        const ow = Math.round(width * 0.56), pw = ow - ml - mr;
        const oh = Math.round(clamp(pw * 0.62, 170, 340));
        const rx = ow + 40, rw = width - rx - mr;
        const lh = Math.round(rw * lR / lC);
        const lTop = top, bHead = lTop + lh + 46, bTop = bHead + 14;
        return { wide, width, ml, ow, pw, oh, oTop: top, rx, rw, lTop, lh, bHead, bTop, bH, height: Math.max(top + oh + 44, bTop + bH + 8) };
      }
      const pw = width - ml - mr, oh = Math.round(clamp(pw * 0.42, 130, 300)), two = width < 360;
      const lTop = top + oh + 64, lh = Math.round(clamp(pw * 0.4, 110, 260)), bHead = lTop + lh + 44, bTop = bHead + (two ? 34 : 14);
      return { wide, width, ml, ow: width, pw, oh, oTop: top, rx: ml, rw: pw, lTop, lh, bHead, bTop, bH, two, height: bTop + bH + 8 };
    }

    function draw(width) {
      const L = layout(width);
      const fr = V.frame(plot, width, L.height, { t: 0, r: 0, b: 0, l: 0 });
      const svg = fr.svg, g0 = fr.g;
      svg.setAttribute("aria-label", (figName(root) || "chart") + " saliency heatmaps");
      const id = "xr8" + ++UID, defs = el("defs", null, svg);
      sk = { L };
      // ---- overview
      const ox = L.ml, oy = L.oTop;
      const sxo = V.lin([0, HC], [ox, ox + L.pw]), syo = V.lin([0, HR], [oy, oy + L.oh]);
      const gO = el("g", { class: "xr-ovw" }, g0);
      el("image", { href: paint(OV, oR, oC, L.pw, L.oh), x: ox, y: oy, width: L.pw, height: L.oh, preserveAspectRatio: "none", class: "xr-img" }, gO);
      const gR = el("g", { class: "xr-grules" }, gO);
      for (let k = 1; k < HC / GS; k++) el("line", { x1: sxo(k * GS), x2: sxo(k * GS), y1: oy, y2: oy + L.oh }, gR);
      el("rect", { class: "xr-frame", x: ox, y: oy, width: L.pw, height: L.oh }, gO);
      // axes
      const ax = el("g", { class: "axis" }, g0);
      for (const v of [0, 1000, 2000, 3000, 4000]) {
        if (v > HC) continue;
        el("line", { x1: sxo(v), x2: sxo(v), y1: oy + L.oh, y2: oy + L.oh + 4 }, ax);
        txt(ax, { x: sxo(v), y: oy + L.oh + 17, "text-anchor": "middle" }, String(v));
      }
      txt(ax, { x: ox + L.pw / 2, y: oy + L.oh + 33, "text-anchor": "middle", class: "axis-title" }, "Input dim");
      for (const v of [0, 1000, 2000]) {
        el("line", { x1: ox - 4, x2: ox, y1: syo(v), y2: syo(v) }, ax);
        txt(ax, { x: ox - 7, y: syo(v) + 4, "text-anchor": "end" }, String(v));
      }
      txt(ax, { x: 0, y: oy - 9, "text-anchor": "start", class: "axis-title" }, "Output dim");
      // window box + connectors to the lens
      const bx0 = sxo(c0), bx1 = sxo(c0 + lC), by0 = syo(r0), by1 = syo(r0 + lR);
      const gB = el("g", { class: "xr-win" }, g0);
      const lx0 = L.rx, lx1 = L.rx + L.rw, ly0 = L.lTop, ly1 = L.lTop + L.lh;
      if (L.wide) {   // box -> right edge of the overview -> lens corners
        const ex = ox + L.pw + 4;
        el("polyline", { class: "xr-conn", points: `${bx1},${by0} ${ex},${by0} ${lx0},${ly0}` }, gB);
        el("polyline", { class: "xr-conn", points: `${bx1},${by1} ${ex},${by1} ${lx0},${ly1}` }, gB);
      } else {        // box -> straight down past the axis -> lens corners
        const ey = oy + L.oh + 40;
        el("polyline", { class: "xr-conn", points: `${bx0},${by1} ${bx0},${ey} ${lx0},${ly0 - 1}` }, gB);
        el("polyline", { class: "xr-conn", points: `${bx1},${by1} ${bx1},${ey} ${lx1},${ly0 - 1}` }, gB);
      }
      el("rect", { class: "xr-box", x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 }, gB);
      // overview hover marks
      const oHov = el("rect", { class: "xr-ohov" }, g0);
      const oOv = el("rect", { class: "xr-ov", x: ox, y: oy, width: L.pw, height: L.oh, fill: "transparent" }, g0);

      // ---- lens (full resolution)
      const sxl = V.lin([c0, c0 + lC], [lx0, lx1]), syl = V.lin([r0, r0 + lR], [ly0, ly1]);
      const gL = el("g", { class: "xr-lens" }, g0);
      el("image", { href: paint(LN, lR, lC, L.rw, L.lh), x: lx0, y: ly0, width: L.rw, height: L.lh, preserveAspectRatio: "none", class: "xr-img" }, gL);
      for (let k = 1; k < NG; k++) el("line", { class: "xr-lrule", x1: sxl(c0 + k * GS), x2: sxl(c0 + k * GS), y1: ly0, y2: ly1 }, gL);
      el("rect", { class: "xr-frame", x: lx0, y: ly0, width: L.rw, height: L.lh }, gL);
      const lax = el("g", { class: "axis" }, g0);
      for (let k = 0; k <= NG; k++) {
        const v = c0 + k * GS;
        el("line", { x1: sxl(v), x2: sxl(v), y1: ly1, y2: ly1 + 4 }, lax);
        txt(lax, { x: sxl(v), y: ly1 + 17, "text-anchor": k === 0 ? "start" : k === NG ? "end" : "middle" }, String(v));
      }
      for (const v of [r0, r0 + lR]) {
        el("line", { x1: lx0 - 4, x2: lx0, y1: syl(v), y2: syl(v) }, lax);
        txt(lax, { x: lx0 - 7, y: syl(v) + 4, "text-anchor": "end" }, String(v));
      }
      const gSel = el("rect", { class: "xr-gsel" }, gL);
      const gHov = el("rect", { class: "xr-ghov" }, g0);
      const lCur = el("rect", { class: "xr-lcur" }, g0);
      const lOv = el("rect", { class: "xr-ov", x: lx0, y: ly0, width: L.rw, height: L.lh, fill: "transparent" }, g0);

      // ---- sorted h of one group
      const bx = L.rx, bw = L.rw, bt = L.bTop, bh = L.bH - 18;
      const gBar = el("g", { class: "xr-bars" }, g0);
      const bax = el("g", { class: "axis" }, g0);
      const bGrid = el("g", null, gBar), bTicks = el("g", null, bax);
      const bRects = [];
      for (let i = 0; i < GS; i++) bRects.push(el("rect", { x: (bx + (i * bw) / GS).toFixed(2), width: Math.max(0.6, bw / GS - (bw / GS > 2.4 ? 0.6 : 0.2)).toFixed(2), class: "xr-b" }, gBar));
      el("line", { class: "xr-bbase", x1: bx, x2: bx + bw, y1: bt + bh, y2: bt + bh }, gBar);
      const bMean = el("line", { class: "xr-bmean", x1: bx, x2: bx + bw }, gBar);
      const bMeanT = el("text", { x: bx + bw, "text-anchor": "end", class: "xr-bmt" }, gBar);
      const bTitle = txt(g0, { x: L.wide ? bx - 40 : 0, y: L.bHead, "text-anchor": "start", class: "axis-title" }, "");
      const bRatio = el("text", { x: bx + bw, y: L.bHead + (L.two ? 21 : 1), "text-anchor": "end", class: "xr-big" }, g0);
      runs(txt(bax, { x: bx, y: bt + bh + 16, "text-anchor": "start" }, ""), [["high ", 0], ["h", 1]]);
      runs(txt(bax, { x: bx + bw, y: bt + bh + 16, "text-anchor": "end" }, ""), [["low ", 0], ["h", 1]]);
      const bHov = el("rect", { class: "xr-bhov" }, g0);
      const bOv = el("rect", { class: "xr-ov", x: bx, y: bt - 2, width: bw, height: bh + 4, fill: "transparent" }, g0);

      Object.assign(sk, { sxo, syo, sxl, syl, bGrid, bTicks, bMean, bMeanT, oHov, oOv, lOv, gSel, gHov, lCur, bRects, bTitle, bRatio, bHov, bOv, bx, bw, bt, bh, gB, gO, gL });
      bind();
      showGroup(st.prev || st.pin, false);
      markSel();
      if (!st.revealed) { gB.style.opacity = 0; gL.style.opacity = 0; gBar.style.opacity = 0; }
      sk.gBar = gBar;
    }

    // ---- group display
    function groupOf(p) { const k = Math.floor((p.c - c0) / GS); return { r: p.r, k, g: grp[p.r * NG + k] }; }
    function markSel() {
      const { r, k } = groupOf(st.pin);
      const x0 = sk.sxl(c0 + k * GS), x1 = sk.sxl(c0 + (k + 1) * GS), y0 = sk.syl(r0 + r), y1 = sk.syl(r0 + r + 1);
      Object.entries({ x: x0 - 1, y: y0 - 2, width: x1 - x0 + 2, height: y1 - y0 + 4 }).forEach(([a, v]) => sk.gSel.setAttribute(a, v.toFixed(2)));
    }
    function showGroup(p, hov) {
      const { r, k, g } = groupOf(p);
      const vals = [];
      for (let c = k * GS; c < (k + 1) * GS; c++) vals.push({ v: LN[r * lC + c], c: c0 + c });
      vals.sort((a, b) => b.v - a.v);
      sk.sorted = vals; sk.shownG = { r, k };
      // log h on the group's own range (half-decade steps): the spread inside one group
      const base = sk.bt + sk.bh, vmx = vals[0].v, vmn = vals[vals.length - 1].v;
      let d0 = Math.floor(vmn * 2) / 2, d1 = Math.ceil(vmx * 2) / 2;
      if (d1 - d0 < 1) d0 = d1 - 1;
      const yb = (lg) => base - ((lg - d0) / (d1 - d0)) * sk.bh;
      sk.bGrid.textContent = ""; sk.bTicks.textContent = "";
      const decs = [];
      for (let e = Math.ceil(d0); e <= Math.floor(d1); e++) decs.push(e);
      const tks = [];
      for (let e = Math.floor(d0); e <= Math.ceil(d1); e++) for (const m of [1, 2, 5]) {
        const lg = e + Math.log10(m);
        if (lg >= d0 - 1e-9 && lg <= d1 + 1e-9) tks.push({ lg, m, e });
      }
      for (const t of tks) {
        const y = yb(t.lg), lab = t.m === 1 ? pow10(t.e) : decs.length < 2 ? t.m + "·" + pow10(t.e) : null;
        el("line", { class: "xr-bgrid" + (t.m === 1 ? "" : " minor"), x1: sk.bx, x2: sk.bx + sk.bw, y1: y, y2: y }, sk.bGrid);
        if (lab) txt(sk.bTicks, { x: sk.bx - 7, y: y + 4, "text-anchor": "end" }, lab);
      }
      let sum = 0;
      vals.forEach((o, i) => {
        const y = yb(o.v);
        sum += Math.pow(10, o.v);
        sk.bRects[i].setAttribute("y", y.toFixed(2));
        sk.bRects[i].setAttribute("height", Math.max(0.8, base - y).toFixed(2));
      });
      const ym = yb(Math.log10(sum / vals.length));
      sk.bMean.setAttribute("y1", ym.toFixed(2)); sk.bMean.setAttribute("y2", ym.toFixed(2));
      sk.bMeanT.setAttribute("y", (ym - 4).toFixed(2)); sk.bMeanT.textContent = "mean";
      sk.bTitle.textContent = "Output " + (r0 + r) + " · input " + range(c0 + k * GS, c0 + (k + 1) * GS - 1);
      sk.bRatio.textContent = "";
      runs(sk.bRatio, [["max ", 0], ["h", 1], [" / min ", 0], ["h", 1], ["  " + Math.round(g.ratio) + "×", 0]]);
      sk.bRatio.classList.toggle("hv", !!hov);
      if (hov) {
        const x0 = sk.sxl(c0 + k * GS), x1 = sk.sxl(c0 + (k + 1) * GS), y0 = sk.syl(r0 + r), y1 = sk.syl(r0 + r + 1);
        Object.entries({ x: x0 - 1, y: y0 - 2, width: x1 - x0 + 2, height: y1 - y0 + 4 }).forEach(([a, v]) => sk.gHov.setAttribute(a, v.toFixed(2)));
        sk.gHov.classList.add("on");
      } else sk.gHov.classList.remove("on");
    }
    function lensTip(p) {
      const { r, k, g } = groupOf(p), v = LN[r * lC + (p.c - c0)];
      return tipRows("output " + (r0 + r) + " · input " + p.c, [
        { label: ital("h"), value: hSci(v) },
        { label: "group", value: "input " + range(c0 + k * GS, c0 + (k + 1) * GS - 1) },
        { label: "max " + ital("h") + " / min " + ital("h"), value: Math.round(g.ratio) + "×" },
      ]);
    }
    function lensCur(p) {
      const x0 = sk.sxl(p.c), x1 = sk.sxl(p.c + 1), y0 = sk.syl(r0 + p.r), y1 = sk.syl(r0 + p.r + 1);
      const w = Math.max(4, x1 - x0 + 2), hh = Math.max(4, y1 - y0 + 2);
      Object.entries({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - hh / 2, width: w, height: hh }).forEach(([a, v]) => sk.lCur.setAttribute(a, v.toFixed(2)));
      sk.lCur.classList.add("on");
    }
    function clearLens() {
      st.prev = null;
      if (!sk) return;
      sk.lCur.classList.remove("on"); sk.bHov.classList.remove("on");
      showGroup(st.pin, false);
    }

    function bind() {
      const L = sk.L;
      // overview: 16 x 16 max-pooled blocks
      const hitO = (e) => {
        const [x, y] = local(sk.oOv, e);
        return { pr: clamp(Math.floor((y / L.oh) * oR), 0, oR - 1), pc: clamp(Math.floor((x / L.pw) * oC), 0, oC - 1) };
      };
      bindPointer(sk.oOv, {
        move(e) {
          const { pr, pc } = hitO(e), v = OV[pr * oC + pc];
          const k = Math.floor((pc * POOL) / GS), x0 = sk.sxo(k * GS), x1 = sk.sxo((k + 1) * GS), y0 = sk.syo(pr * POOL), y1 = sk.syo((pr + 1) * POOL);
          const hh = Math.max(5, y1 - y0);
          Object.entries({ x: x0, y: (y0 + y1) / 2 - hh / 2, width: x1 - x0, height: hh }).forEach(([a, val]) => sk.oHov.setAttribute(a, val.toFixed(2)));
          sk.oHov.classList.add("on");
          tip.show(...local(plot, e), tipRows("output " + range(pr * POOL, pr * POOL + POOL - 1) + " · input " + range(pc * POOL, pc * POOL + POOL - 1), [
            { label: "max " + ital("h") + " (16 × 16)", value: hSci(v) },
            { label: "group", value: "input " + range(k * GS, (k + 1) * GS - 1) },
          ]));
        },
        leave() { sk.oHov.classList.remove("on"); tip.hide(); },
      });
      // lens: one weight; its 128-weight group outlined and shown sorted below
      const hitL = (e) => {
        const [x, y] = local(sk.lOv, e);
        return { r: clamp(Math.floor((y / L.lh) * lR), 0, lR - 1), c: c0 + clamp(Math.floor((x / L.rw) * lC), 0, lC - 1) };
      };
      bindPointer(sk.lOv, {
        move(e) { const p = hitL(e); st.prev = p; lensCur(p); showGroup(p, true); tip.show(...local(plot, e), lensTip(p)); },
        tap(e, touch) { const p = hitL(e); st.pin = p; st.prev = touch ? null : p; markSel(); showGroup(p, !touch); if (touch) { lensCur(p); tip.show(...local(plot, e), lensTip(p)); } },
        leave() { clearLens(); tip.hide(); },
      });
      // sorted bars
      const hitB = (e) => clamp(Math.floor((local(sk.bOv, e)[0] / sk.bw) * GS), 0, GS - 1);
      bindPointer(sk.bOv, {
        move(e) {
          const i = hitB(e), o = sk.sorted[i], { r } = sk.shownG;
          const x = sk.bx + (i * sk.bw) / GS, w = Math.max(3, sk.bw / GS);
          Object.entries({ x: x - (w - sk.bw / GS) / 2 - 1, y: sk.bt - 2, width: w + 2, height: sk.bh + 4 }).forEach(([a, v]) => sk.bHov.setAttribute(a, v.toFixed(2)));
          sk.bHov.classList.add("on");
          lensCur({ r, c: o.c });
          tip.show(...local(plot, e), tipRows("output " + (r0 + r) + " · input " + o.c, [
            { label: ital("h"), value: hSci(o.v) },
            { label: "rank in group", value: (i + 1) + " / " + GS },
          ]));
        },
        leave() { sk.bHov.classList.remove("on"); sk.lCur.classList.remove("on"); tip.hide(); },
      });
    }
    outsideTap(root, () => { if (sk) { sk.oHov.classList.remove("on"); } clearLens(); tip.hide(); });

    // keyboard: arrows walk the full-resolution window; the group under the cursor is shown and selected
    plot.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "Escape") { st.kc = null; clearLens(); tip.hide(); return; }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(k)) return;
      e.preventDefault();
      const p = Object.assign({}, st.kc || st.pin);
      const step = e.shiftKey ? 8 : 1;
      if (k === "ArrowLeft") p.c = Math.max(c0, p.c - step);
      if (k === "ArrowRight") p.c = Math.min(c0 + lC - 1, p.c + step);
      if (k === "ArrowUp") p.r = Math.max(0, p.r - step);
      if (k === "ArrowDown") p.r = Math.min(lR - 1, p.r + step);
      if (k === "Home") p.c = c0;
      if (k === "End") p.c = c0 + lC - 1;
      if (k === "PageUp") p.r = Math.max(0, p.r - 16);
      if (k === "PageDown") p.r = Math.min(lR - 1, p.r + 16);
      st.kc = p; st.pin = p; markSel(); keyShow();
    });
    function keyShow() {
      const p = st.kc;
      lensCur(p); showGroup(p, false);
      const pb = plot.getBoundingClientRect(), sb = plot.querySelector("svg").getBoundingClientRect();
      tip.show(sb.left - pb.left + sk.sxl(p.c + 0.5), sb.top - pb.top + sk.syl(r0 + p.r + 0.5), lensTip(p));
    }
    plot.addEventListener("focus", () => { if (plot.matches(":focus-visible")) { st.kc = st.kc || Object.assign({}, st.pin); keyShow(); } });
    plot.addEventListener("blur", () => { st.kc = null; clearLens(); tip.hide(); });

    function reveal() {
      if (st.revealed) return;
      st.revealed = true;
      if (!sk) return;
      const items = [[sk.gB, 120], [sk.gL, 300], [sk.gBar, 480]];
      for (const [n, d] of items) {
        n.style.transition = reduce ? "none" : `opacity 420ms ease ${d}ms`;
        n.style.opacity = 1;
      }
    }
    function finish() { reveal(); if (sk) for (const n of [sk.gB, sk.gL, sk.gBar]) { n.style.transition = "none"; n.style.opacity = 1; } }
    V.responsive(plot, draw);
    V.onVisible(plot, reveal, { threshold: 0.25 });
    root._ix = { pin: (r, c) => { st.pin = { r, c }; markSel(); showGroup(st.pin, false); }, grp, med, finish };
    return finish;
  }

  // ================================================================== boot
  const pending = [], finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "xr-fail", "data-label": "" }, node, "— data unavailable —");
  }
  function mount(id, file, fn) {
    const node = document.getElementById(id);
    if (!node) return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      V.json(dataURL(file))
        .then((d) => { const fin = fn(node, d); if (fin) { finals.push(fin); if (printing) fin(); } })
        .catch((err) => { if (window.console) console.error("[ix-realw1] " + id, err); fail(node); });
    };
    pending.push(start);
    V.onVisible(node, start, { rootMargin: "800px", threshold: 0 });
  }
  window.addEventListener("beforeprint", () => { printing = true; pending.forEach((s) => s()); finals.forEach((f) => f()); });
  window.addEventListener("afterprint", () => { printing = false; });
  function prefetch() {
    const go = () => ["ix-realw1-fig5.json", "ix-realw1-fig8.json"].forEach((f) => V.json(dataURL(f)).catch(() => {}));
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1500);
  }
  if (document.readyState === "complete") prefetch();
  else window.addEventListener("load", prefetch, { once: true });
  function boot() {
    mount("ix-fig5", "ix-realw1-fig5.json", fig5);
    mount("ix-fig8", "ix-realw1-fig8.json", fig8);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
