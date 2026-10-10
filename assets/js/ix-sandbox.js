/* ix-sandbox.js — Interactive · the borrowed gradient (#ix-sandbox, Section 1). ILLUSTRATIVE.
   The 2-D toy behind Figure 1 and the hero animation, ported exactly from its physics module (slowsteps.py):
     loss surface      ℒ(x, y) = amp · (1 − exp(−q / temp)),  q = (u / a)² + (v / b)²,  (u, v) = (x, y) rotated by `rot`
     gradient          central finite differences, step `eps`
     Standard QAT      r = offset + step · round((w − offset) / step)          (coarse, fixed grid)
     QUASAR            r = z + step · round((w − z) / step), z ∈ 41-point grid, z minimising Σ h (r − w)² at the
                       run's start point, then held fixed: one lattice for the whole run (as in the hero video)
     STE update        r = Q(w);  w ← w − lr · ∇ℒ(r)                              (same fixed lr for both)
     full precision    r = w (exact gradient), same start and lr
   Constants come from assets/data/ix-sandbox.json (tools/extract_ix_sandbox.py); np.round's half-to-even is reproduced.
   The page shows labels and the step count only. Needs window.Viz (viz.js). */
(function (G) {
  "use strict";

  // ================================================================ physics (pure; also used by the parity check)
  function makeSim(D) {
    const P = D.surface, cR = Math.cos(P.rot), sR = Math.sin(P.rot);
    const A = P.a, B = P.b, AMP = P.amp, TT = P.temp, E = P.eps, E2 = 2 * E;
    const LR = D.lr, AT_MIN = D.at_min == null ? 0 : D.at_min;
    const OFF = D.standard_qat.offset, DS = D.standard_qat.step;
    const Z = D.quasar.z, DQ = D.quasar.step, H0 = D.quasar.h[0], H1 = D.quasar.h[1];

    function loss(x, y) {
      const u = x * cR + y * sR, v = -x * sR + y * cR;
      const a = u / A, b = v / B;
      return AMP * (1.0 - Math.exp(-(a * a + b * b) / TT));
    }
    function grad(x, y) {
      return [(loss(x + E, y) - loss(x - E, y)) / E2, (loss(x, y + E) - loss(x, y - E)) / E2];
    }
    // numpy's round: half to even
    function rint(x) {
      const f = Math.floor(x), d = x - f;
      return d < 0.5 ? f : d > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1);
    }
    function reconStd(w) {
      return [OFF[0] + DS * rint((w[0] - OFF[0]) / DS), OFF[1] + DS * rint((w[1] - OFF[1]) / DS)];
    }
    function reconZ(w, z) {
      return [z + DQ * rint((w[0] - z) / DQ), z + DQ * rint((w[1] - z) / DQ)];
    }
    // QUASAR's loss-aware lattice choice at w: the offset z minimising Σ h (r − w)² (first minimum, as slowsteps)
    function selectZ(w) {
      let best = null, bs = 0;
      for (let i = 0; i < Z.length; i++) {
        const r = reconZ(w, Z[i]), d0 = r[0] - w[0], d1 = r[1] - w[1];
        const s = H0 * (d0 * d0) + H1 * (d1 * d1);
        if (best === null || s < bs) { bs = s; best = Z[i]; }
      }
      return best;
    }
    const reconQ = (w) => reconZ(w, selectZ(w));   // slowsteps.recon_quasar (lattice re-selected at w)
    function angle(a, b) {
      const na = Math.sqrt(a[0] * a[0] + a[1] * a[1]), nb = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
      if (!(na > 1e-12) || !(nb > 1e-12)) return null;   // undefined for a zero vector
      const c = (a[0] * b[0] + a[1] * b[1]) / (na * nb + 1e-12);
      return Math.acos(Math.max(-1, Math.min(1, c))) * (180 / Math.PI);
    }
    // n STE steps from w0 for both rules (+ the full-precision path). Each rule keeps one lattice for the run
    // (`lat` = its offset): Standard QAT's fixed grid; QUASAR's chosen once, at w0, by selectZ.
    function simulate(w0, n) {
      const out = {}, zq = selectZ(w0);
      const rules = [["std", reconStd, OFF.slice()], ["q", (w) => reconZ(w, zq), [zq, zq]]];
      for (const [key, rec, lat] of rules) {
        const T = { w: [], r: [], u: [], ut: [], ang: [], lat };
        let w = [w0[0], w0[1]];
        for (let i = 0; i <= n; i++) {
          const r = rec(w), g = grad(r[0], r[1]), gt = grad(w[0], w[1]);
          const u = [-LR * g[0], -LR * g[1]], ut = [-LR * gt[0], -LR * gt[1]];
          T.w.push(w); T.r.push(r); T.u.push(u); T.ut.push(ut);
          T.ang.push(loss(w[0], w[1]) > AT_MIN ? angle(u, ut) : null);   // at the minimum the true gradient has no direction to compare
          w = [w[0] + u[0], w[1] + u[1]];
        }
        out[key] = T;
      }
      const F = { w: [] };
      let w = [w0[0], w0[1]];
      for (let i = 0; i <= n; i++) {
        F.w.push(w);
        const g = grad(w[0], w[1]);
        w = [w[0] + -LR * g[0], w[1] + -LR * g[1]];
      }
      out.fp = F;
      return out;
    }
    return { loss, grad, reconStd, reconQ, reconZ, selectZ, angle, simulate, rint };
  }
  G.IxSandboxCore = { makeSim };

  // ================================================================ page component
  const V = G.Viz;
  if (!V || typeof document === "undefined") return;
  const SRC = document.currentScript ? document.currentScript.src : "";
  const dataURL = (f) => (SRC ? new URL("../data/" + f, SRC).href : "assets/data/" + f);
  const el = V.el, h = V.h;
  const reduce = V.reducedMotion;

  const KEYS = ["std", "q"];
  const NAME = { std: "Standard QAT", q: "QUASAR" };
  const COL = { std: "#3F4245", q: "#D1495B" };       // arrows, ring, grid
  const COLD = { std: "#3F4245", q: "#A13040" };      // latent ball + trail (QUASAR text / small marks: rose dark)
  const GOLD = "#C9A227", INK = "#1D1F22", TETHER = "#9AA0A6";
  const PH = ["apply", "recon", "grad", "move", "true", "rest"];
  const DUR = {   // seconds per phase (slowsteps' order: reconstruct, gradient at r, move it to w, true gradient, apply)
    slow: { apply: 0.7, recon: 0.5, grad: 0.42, move: 0.48, true: 0.38 },
    brisk: { apply: 0.38, recon: 0.22, grad: 0.17, move: 0.21, true: 0.13 },
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  let UID = 0;

  function sandbox(node, D) {
    const sim = makeSim(D);
    const MAX = D.max_steps, NAUTO = D.steps, LIM = D.view.lim, SLIM = D.view.start_lim;
    const uid = "ixs" + (++UID);
    node.textContent = "";
    node.style.minHeight = "0";
    const root = h("div", { class: "ixs" }, node);

    // ---------------- state
    let start = D.w0.slice();
    let T = sim.simulate(start, MAX);
    let st = { k: 0, ph: "recon", t: 0 };     // cycle k, phase, progress; this = before the first reconstruction
    let target = 0, slowUntil = 0, auto = false, raf = 0, last = 0, rmTimer = 0;
    let interacted = false, autoplayed = false;
    let preview = null;          // step shown while hovering / tapping a trail vertex

    // ---------------- controls
    const bar = h("div", { class: "ixs-bar" }, root);
    const btns = h("div", { class: "ixs-btns", role: "group", "aria-label": "Controls" }, bar);
    const ICON = {
      play: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1.2v7.6L8.6 5z" fill="currentColor"/></svg>',
      pause: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1.4h2.1v7.2H2zM5.9 1.4H8v7.2H5.9z" fill="currentColor"/></svg>',
      step: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.4 1.4v7.2L6.6 5z" fill="currentColor"/><path d="M7.4 1.4h1.6v7.2H7.4z" fill="currentColor"/></svg>',
      reset: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.3 3.6A3.4 3.4 0 1 1 1.7 6.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M1 1.4v3h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    };
    const bStep = h("button", { type: "button", class: "ixs-btn" }, btns, ICON.step + "<span>Step</span>");
    const bPlay = h("button", { type: "button", class: "ixs-btn on" }, btns, ICON.play + "<span>Play</span>");
    const bReset = h("button", { type: "button", class: "ixs-btn" }, btns, ICON.reset + "<span>Reset</span>");
    const count = h("div", { class: "ixs-count", "data-label": "" }, bar);

    // ---------------- panels
    const panelsDiv = h("div", { class: "ixs-panels" }, root);
    const PAN = {};
    for (const key of KEYS) {
      const p = h("div", { class: "ixs-panel " + key }, panelsDiv);
      const head = h("div", { class: "ixs-ph" }, p);
      h("span", { class: "ixs-title " + key, "data-label": "" }, head, NAME[key]);
      const plot = h("div", { class: "ixs-plot", tabindex: "0", role: "group",
        "aria-label": NAME[key] + " — start point: arrow keys move it, Enter takes a step" }, p);
      const canvas = h("canvas", { "aria-hidden": "true" }, plot);
      PAN[key] = { key, p, plot, canvas, svg: null, n: {} };
    }

    // ---------------- key
    const legend = h("div", { class: "ixs-legend", "aria-hidden": "true" }, root);
    function key(svg, label, q) {
      const li = h("span", { class: "ixs-li" + (q ? " q" : "") }, legend);
      h("span", { class: "ixs-gl" }, li, svg);
      h("span", null, li, label);
    }
    key('<svg viewBox="0 0 14 14" width="14" height="14"><circle cx="7" cy="7" r="5" fill="#44484f" stroke="#fff" stroke-width="1.5"/></svg>', '<span class="ixs-m">w</span>');
    key('<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="5.6" fill="#fff" stroke="#44484f" stroke-width="2"/></svg>', '<span class="ixs-m">r</span>');
    key('<svg viewBox="0 0 46 12" width="46" height="12"><path d="M3 6h11" stroke="#44484f" stroke-width="2.4" stroke-dasharray="0 4" stroke-linecap="round"/><path d="M14 2.6 19 6l-5 3.4z" fill="#44484f"/><path d="M26 6h12" stroke="#44484f" stroke-width="2.6"/><path d="M37 2.4 43 6l-6 3.6z" fill="#44484f"/></svg>',
      '−∇<span class="ixs-m">ℒ</span>(<span class="ixs-m">r</span>)');
    key('<svg viewBox="0 0 22 12" width="22" height="12"><path d="M3 6h11" stroke="#1D1F22" stroke-opacity=".7" stroke-width="2" stroke-dasharray="0 3.6" stroke-linecap="round"/><path d="M14 3 19 6l-5 3z" fill="#1D1F22" fill-opacity=".7"/></svg>',
      '−∇<span class="ixs-m">ℒ</span>(<span class="ixs-m">w</span>)');
    key('<svg viewBox="0 0 34 14" width="34" height="14"><path d="M2 7h18" stroke="' + GOLD + '" stroke-width="2.2" stroke-dasharray="4.5 3"/><path d="M27 1.8l1.5 3.3 3.6.4-2.7 2.4.8 3.5L27 9.6l-3.2 1.8.8-3.5-2.7-2.4 3.6-.4z" fill="' + GOLD + '" stroke="#fff" stroke-width=".8"/></svg>',
      "full precision");

    // ================================================================ layout + static drawing
    let W = 0, PS = 0, K = 1, stacked = false;
    const sx = (x) => ((x + LIM) / (2 * LIM)) * PS;
    const sy = (y) => ((LIM - y) / (2 * LIM)) * PS;
    const px = (p) => [sx(p[0]), sy(p[1])];
    const fromPx = (x, y) => [-LIM + (x / PS) * 2 * LIM, LIM - (y / PS) * 2 * LIM];

    // colour field (the hero's lightened coolwarm), rendered once per size at devicePixelRatio
    const CMAP = D.cmap, VMIN = D.view.vmin, VMAX = D.view.vmax;
    let fieldCache = null;
    function field(n) {
      if (fieldCache && fieldCache.n === n) return fieldCache.img;
      const img = new ImageData(n, n), d = img.data, m = CMAP.length - 1;
      for (let j = 0; j < n; j++) {
        const y = LIM - ((j + 0.5) / n) * 2 * LIM;
        for (let i = 0; i < n; i++) {
          const x = -LIM + ((i + 0.5) / n) * 2 * LIM;
          const t = clamp((sim.loss(x, y) - VMIN) / (VMAX - VMIN), 0, 1) * m;
          const a = Math.min(m - 1, Math.floor(t)), f = t - a, c0 = CMAP[a], c1 = CMAP[a + 1], o = (j * n + i) * 4;
          d[o] = c0[0] + (c1[0] - c0[0]) * f; d[o + 1] = c0[1] + (c1[1] - c0[1]) * f; d[o + 2] = c0[2] + (c1[2] - c0[2]) * f; d[o + 3] = 255;
        }
      }
      fieldCache = { n, img };
      return img;
    }

    function arrowNodes(g, color, lw, dotted, faint) {
      const a = {
        halo: el("line", { stroke: "#fff", "stroke-width": lw + 3.2 * K, "stroke-linecap": "round", "stroke-opacity": faint ? 0.55 : 0.85 }, g),
        line: el("line", { stroke: color, "stroke-width": lw, "stroke-linecap": dotted ? "round" : "butt",
          "stroke-dasharray": dotted ? "0 " + (lw * (faint ? 2.05 : 1.85)).toFixed(2) : null }, g),
        head: el("path", { fill: color, stroke: "#fff", "stroke-width": 1.3 * K, "stroke-linejoin": "round", "paint-order": "stroke" }, g),
        lw, faint, hl: (faint ? 9 : 11.5) * K, hw: (faint ? 4.6 : 6.2) * K,
      };
      return a;
    }

    function drawPanel(P) {
      const key = P.key, n = (P.n = {});
      P.latFor = null; P.al = null;
      const dpr = Math.min(3, window.devicePixelRatio || 1), N = Math.round(PS * dpr);
      P.canvas.width = N; P.canvas.height = N;
      P.canvas.getContext("2d").putImageData(field(N), 0, 0);
      if (P.svg) P.svg.remove();
      const svg = (P.svg = el("svg", { width: PS, height: PS, viewBox: `0 0 ${PS} ${PS}`, role: "img" }, P.plot));
      const defs = el("defs", null, svg);
      const cp = el("clipPath", { id: uid + key + "c" }, defs);
      el("rect", { x: 0, y: 0, width: PS, height: PS, rx: 8 }, cp);
      const fg = el("g", { "clip-path": `url(#${uid + key}c)` }, svg);
      // isolines: the surface's level sets are ellipses
      const c = [sx(0), sy(0)], s = PS / (2 * LIM), deg = (-D.surface.rot * 180) / Math.PI;
      for (const L of D.view.levels) {
        const q = -D.surface.temp * Math.log(1 - L / D.surface.amp);
        el("ellipse", { cx: c[0], cy: c[1], rx: D.surface.a * Math.sqrt(q) * s, ry: D.surface.b * Math.sqrt(q) * s,
          transform: `rotate(${deg} ${c[0]} ${c[1]})`, class: "ixs-iso" }, fg);
      }
      n.lat = el("path", { fill: COL[key], stroke: "#fff", "stroke-width": 0.8, "fill-opacity": key === "std" ? 0.85 : 0.7, "stroke-opacity": 0.8 }, fg);
      // full-precision ghost path + minimum
      n.fp = el("path", { fill: "none", stroke: GOLD, "stroke-width": 2.3 * K, "stroke-dasharray": `${4.6 * K} ${3.2 * K}`, "stroke-linecap": "butt" }, svg);
      n.fpBall = el("circle", { r: 5.2 * K, fill: "none", stroke: GOLD, "stroke-width": 2.2 * K }, svg);
      n.star = el("path", { d: starPath(c[0], c[1], 9.5 * K), fill: GOLD, stroke: "#fff", "stroke-width": 1.4 * K, "stroke-linejoin": "round" }, svg);
      // trail
      n.trFut = el("path", { fill: "none", stroke: COLD[key], "stroke-width": 2 * K, "stroke-opacity": 0.22, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      n.trHalo = el("path", { fill: "none", stroke: "#fff", "stroke-width": 5.6 * K, "stroke-opacity": 0.75, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      n.tr = el("path", { fill: "none", stroke: COLD[key], "stroke-width": 2.6 * K, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      n.trPts = el("path", { class: "ixs-vx", fill: COLD[key], stroke: "#fff", "stroke-width": 1.1 * K }, svg);
      // tether w – r
      n.tethH = el("line", { stroke: "#fff", "stroke-width": 4.2 * K, "stroke-linecap": "round", "stroke-opacity": 0.85 }, svg);
      n.teth = el("line", { stroke: TETHER, "stroke-width": 1.7 * K, "stroke-linecap": "round" }, svg);
      n.ring = el("circle", { r: 8.4 * K, fill: "#fff", stroke: COL[key], "stroke-width": 2.8 * K }, svg);
      // arrows: computed at r (dotted), the same arrow applied at w (solid), the true one at w (faint, dotted)
      n.aR = arrowNodes(svg, COL[key], 3.1 * K, true, false);
      n.aW = arrowNodes(svg, COL[key], 3.6 * K, false, false);
      n.aT = arrowNodes(svg, "rgba(29,31,34,.72)", 2.3 * K, true, true);
      n.ball = el("circle", { r: 6.6 * K, fill: COLD[key], stroke: "#fff", "stroke-width": 2 * K }, svg);
      n.ringTop = el("circle", { r: 8.4 * K, fill: "none", stroke: COL[key], "stroke-width": 1.8 * K }, svg);
      n.labW = el("text", { class: "ixs-lab", "text-anchor": "middle", dy: "0.32em" }, svg); n.labW.textContent = "w";
      n.labR = el("text", { class: "ixs-lab", "text-anchor": "middle", dy: "0.32em", fill: COLD[key] }, svg); n.labR.textContent = "r";
      // hover: a vertex highlight and the would-be start point
      n.hi = el("circle", { r: 9.5 * K, fill: "none", stroke: INK, "stroke-width": 1.4, "stroke-dasharray": "2 2.2", opacity: 0 }, svg);
      n.ghost = el("circle", { r: 6.6 * K, fill: "#fff", "fill-opacity": 0.35, stroke: INK, "stroke-width": 1.4, "stroke-dasharray": "2.4 2.2", opacity: 0, "pointer-events": "none" }, svg);
    }

    function starPath(x, y, R) {
      const ri = R * 0.46;
      let d = "";
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? ri : R, a = -Math.PI / 2 + (i * Math.PI) / 5;
        d += (i ? "L" : "M") + (x + rr * Math.cos(a)).toFixed(2) + "," + (y + rr * Math.sin(a)).toFixed(2);
      }
      return d + "Z";
    }
    function dots(pts, r) {
      let d = "";
      for (const p of pts) d += `M${(p[0] - r).toFixed(2)},${p[1].toFixed(2)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
      return d;
    }
    function lattice(key, off) {
      const d = key === "std" ? D.standard_qat.step : D.quasar.step, m = LIM - 0.04, out = [];
      const xs = [], ys = [];
      for (let i = Math.ceil((-m - off[0]) / d); off[0] + i * d <= m; i++) xs.push(off[0] + i * d);
      for (let i = Math.ceil((-m - off[1]) / d); off[1] + i * d <= m; i++) ys.push(off[1] + i * d);
      for (const y of ys) for (const x of xs) out.push(px([x, y]));
      return dots(out, (key === "std" ? 3.1 : 2.15) * K);
    }

    // ================================================================ render (pure function of state)
    function cycleView(key, k, ph, t) {
      // geometry of method `key` in cycle k at phase ph (progress t)
      const M = T[key], e = ease(t), o = {};
      const prev = k > 0 ? k - 1 : 0;
      o.w = ph === "apply" ? lerp2(M.w[prev], M.w[k], e) : M.w[k];
      o.trail = M.w.slice(0, k).concat([o.w]);
      o.verts = M.w.slice(0, ph === "apply" ? k : k + 1);
      o.ring = null; o.aR = null; o.aW = null; o.aT = null; o.labW = 1; o.labR = 0;
      if (ph === "apply") {
        o.ring = { p: M.r[prev], a: 1 - e };
        o.teth = { a: o.w, b: M.r[prev], al: 1 - e };
        o.aR = { b: M.r[prev], v: M.u[prev], al: 0.7 * (1 - e) };
        o.aW = { b: o.w, v: [M.u[prev][0] * (1 - e), M.u[prev][1] * (1 - e)], al: 1 };
        o.aT = { b: M.w[prev], v: M.ut[prev], al: 1 - e };
        o.labW = clamp(1 - 3 * t, 0, 1);
        o.lk = prev;
      } else {
        const r = M.r[k];
        o.lk = k;
        if (ph === "recon") {
          o.ring = { p: lerp2(M.w[k], r, e), a: Math.min(1, 3 * t) };
          o.labR = clamp((t - 0.6) / 0.4, 0, 1);
          o.labW = k === 0 ? 1 : clamp(t * 3, 0, 1);
        } else { o.ring = { p: r, a: 1 }; o.labR = 1; }
        o.teth = { a: M.w[k], b: o.ring.p, al: o.ring.a };
        if (ph === "grad") o.aR = { b: r, v: [M.u[k][0] * e, M.u[k][1] * e], al: 1 };
        else if (ph === "move") {
          o.aR = { b: r, v: M.u[k], al: lerp(1, 0.7, e) };
          o.aW = { b: lerp2(r, M.w[k], e), v: M.u[k], al: 1 };
        } else if (ph === "true" || ph === "rest") {
          o.aR = { b: r, v: M.u[k], al: 0.7 };
          o.aW = { b: M.w[k], v: M.u[k], al: 1 };
          o.aT = { b: M.w[k], v: M.ut[k], al: ph === "true" ? e : 1 };
        }
      }
      return o;
    }
    function fpView(k, ph, t) {
      const F = T.fp.w, e = ease(t), prev = k > 0 ? k - 1 : 0;
      const p = ph === "apply" ? lerp2(F[prev], F[k], e) : F[k];
      return { p, trail: F.slice(0, k).concat([p]) };
    }

    function setArrow(a, spec) {
      if (!spec || spec.al <= 0.01) { a.halo.setAttribute("opacity", 0); a.line.setAttribute("opacity", 0); a.head.setAttribute("opacity", 0); return; }
      const p0 = px(spec.b), p1 = px([spec.b[0] + spec.v[0], spec.b[1] + spec.v[1]]);
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy);
      if (L < 2.5) { setArrow(a, null); return; }
      const ux = dx / L, uy = dy / L, hl = Math.min(a.hl, 0.6 * L), hw = (a.hw * hl) / a.hl;
      const bx = p1[0] - ux * hl, by = p1[1] - uy * hl;
      const ex = a.line.getAttribute("stroke-dasharray") ? bx - ux * a.lw * 0.6 : bx + ux * hl * 0.3;
      const ey = a.line.getAttribute("stroke-dasharray") ? by - uy * a.lw * 0.6 : by + uy * hl * 0.3;
      for (const n of [a.halo, a.line]) {
        n.setAttribute("x1", p0[0].toFixed(2)); n.setAttribute("y1", p0[1].toFixed(2));
        n.setAttribute("x2", ex.toFixed(2)); n.setAttribute("y2", ey.toFixed(2));
        n.setAttribute("opacity", spec.al.toFixed(3));
      }
      const tx = p1[0] + ux * 0.8, ty = p1[1] + uy * 0.8;
      a.head.setAttribute("d", `M${tx.toFixed(2)},${ty.toFixed(2)}L${(bx - uy * hw).toFixed(2)},${(by + ux * hw).toFixed(2)}L${(bx + uy * hw).toFixed(2)},${(by - ux * hw).toFixed(2)}Z`);
      a.head.setAttribute("opacity", spec.al.toFixed(3));
    }
    const polyD = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + "," + p[1].toFixed(2)).join("");

    // label direction: the free side of the marker (largest angular gap to the arrows / tether / trail)
    function freeDir(p, dirs, r) {
      let best = -1, bestA = -Math.PI * 0.75;
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI + (i * Math.PI) / 8;
        const x = p[0] + Math.cos(a) * r, y = p[1] + Math.sin(a) * r;
        let s = Math.PI;
        for (const d of dirs) { let g = Math.abs(a - d) % (2 * Math.PI); if (g > Math.PI) g = 2 * Math.PI - g; s = Math.min(s, g); }
        if (x < 8 || x > PS - 8 || y < 8 || y > PS - 8) s -= 2;
        s -= 0.02 * Math.abs(a + Math.PI * 0.75);     // ties: prefer upper left
        if (s > best) { best = s; bestA = a; }
      }
      return [p[0] + Math.cos(bestA) * r, p[1] + Math.sin(bestA) * r];
    }
    const dirOf = (v) => Math.atan2(-v[1], v[0]);   // screen angle of a domain vector

    function renderPanel(P, k, ph, t, pv) {
      const key = P.key, n = P.n, M = T[key];
      const o = pv != null ? cycleView(key, pv, "rest", 1) : cycleView(key, k, ph, t);
      const f = pv != null ? fpView(pv, "rest", 1) : fpView(k, ph, t);
      if (P.latFor !== M.lat) { P.latFor = M.lat; n.lat.setAttribute("d", lattice(key, M.lat)); }   // one lattice per run
      n.fp.setAttribute("d", f.trail.length > 1 ? polyD(f.trail.map(px)) : "");
      const fp = px(f.p); n.fpBall.setAttribute("cx", fp[0]); n.fpBall.setAttribute("cy", fp[1]);
      // trail (in a preview, the rest of the path so far stays faint)
      const tr = o.trail.map(px);
      const d = tr.length > 1 ? polyD(tr) : "";
      n.tr.setAttribute("d", d); n.trHalo.setAttribute("d", d);
      n.trPts.setAttribute("d", dots(o.verts.slice(0, -1).map(px), 2.7 * K));
      if (pv != null) {
        const kk = st.ph === "apply" ? st.k - 1 : st.k;
        n.trFut.setAttribute("d", kk > pv ? polyD(M.w.slice(pv, kk + 1).map(px)) : "");
      } else n.trFut.setAttribute("d", "");
      // ring + tether
      const wp = px(o.w);
      if (o.ring && o.ring.a > 0.01) {
        const rp = px(o.ring.p);
        for (const c of [n.ring, n.ringTop]) { c.setAttribute("cx", rp[0]); c.setAttribute("cy", rp[1]); c.setAttribute("opacity", o.ring.a.toFixed(3)); }
        const tb = px(o.teth.b), ta = px(o.teth.a);
        for (const l of [n.tethH, n.teth]) { l.setAttribute("x1", ta[0]); l.setAttribute("y1", ta[1]); l.setAttribute("x2", tb[0]); l.setAttribute("y2", tb[1]); l.setAttribute("opacity", o.teth.al.toFixed(3)); }
      } else for (const c of [n.ring, n.ringTop, n.tethH, n.teth]) c.setAttribute("opacity", 0);
      setArrow(n.aR, o.aR); setArrow(n.aW, o.aW); setArrow(n.aT, o.aT);
      n.ball.setAttribute("cx", wp[0]); n.ball.setAttribute("cy", wp[1]);
      // labels
      const lk = o.lk, R0 = M.r[lk], W0 = M.w[lk];
      const dW = [dirOf(M.u[lk]), dirOf(M.ut[lk])];
      if (lk > 0) dW.push(dirOf([M.w[lk - 1][0] - W0[0], M.w[lk - 1][1] - W0[1]]));
      if (Math.hypot(R0[0] - W0[0], R0[1] - W0[1]) > 1e-6) dW.push(dirOf([R0[0] - W0[0], R0[1] - W0[1]]));
      const lw = freeDir(wp, dW, 16 * K + 4);
      n.labW.setAttribute("x", lw[0].toFixed(1)); n.labW.setAttribute("y", lw[1].toFixed(1)); n.labW.setAttribute("opacity", o.labW.toFixed(3));
      if (o.ring && o.labR > 0.01) {
        const rp = px(o.ring.p), dR = [dirOf(M.u[lk])];
        if (Math.hypot(R0[0] - W0[0], R0[1] - W0[1]) > 1e-6) dR.push(dirOf([W0[0] - R0[0], W0[1] - R0[1]]));
        const lr = freeDir(rp, dR, 17 * K + 4);
        n.labR.setAttribute("x", lr[0].toFixed(1)); n.labR.setAttribute("y", lr[1].toFixed(1));
        n.labR.setAttribute("opacity", (o.labR * o.ring.a).toFixed(3));
      } else n.labR.setAttribute("opacity", 0);
      // accessible name
      const al = `${NAME[key]}, step ${pv != null ? pv : ph === "apply" ? Math.max(0, k - 1) : k}`;
      if (al !== P.al) { P.al = al; P.svg.setAttribute("aria-label", al); }
    }

    function shownK() { return st.ph === "apply" ? st.k - 1 : st.k; }
    function render() {
      if (!PAN.std.svg) return;
      const pv = preview != null && preview <= shownK() ? preview : null;
      for (const key of KEYS) renderPanel(PAN[key], st.k, st.ph, st.t, pv);
      const sk = Math.max(0, shownK());
      const ct = 'step <b>' + (pv != null ? pv : sk) + '</b><span class="ixs-of">/ ' + MAX + "</span>";
      if (ct !== count.__h) { count.__h = ct; count.innerHTML = ct; }
      updateButtons();
    }

    // ================================================================ timeline
    const heroStep = (s) => (s.ph === "apply" ? s.k : s.k + 1);
    const durOf = (s) => (heroStep(s) <= slowUntil ? DUR.slow : DUR.brisk)[s.ph] * 1000;
    const atGoal = () => st.ph === "rest" && st.k >= target;
    function advance(dt) {
      let guard = 0;
      while (dt > 0 && !atGoal() && guard++ < 64) {
        if (st.ph === "rest") { st = { k: st.k + 1, ph: "apply", t: 0 }; continue; }
        const d = durOf(st), rem = (1 - st.t) * d;
        if (dt < rem) { st.t += dt / d; dt = 0; } else { dt -= rem; st = { k: st.k, ph: PH[PH.indexOf(st.ph) + 1], t: 0 }; }
      }
    }
    function tick(now) {
      const dt = Math.min(80, now - last);
      last = now;
      advance(dt);
      render();
      if (!atGoal()) raf = requestAnimationFrame(tick);
      else { raf = 0; auto = false; render(); }
    }
    function stopAll() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (rmTimer) clearTimeout(rmTimer);
      rmTimer = 0;
    }
    function run() {
      if (atGoal()) { auto = false; render(); return; }
      if (reduce) {                // no motion: whole steps, shown one at a time
        stopAll();
        const next = () => {
          st = { k: st.ph === "rest" ? Math.min(target, st.k + 1) : st.k, ph: "rest", t: 1 };
          render();
          if (!atGoal()) rmTimer = setTimeout(next, 450); else { rmTimer = 0; auto = false; render(); }
        };
        if (st.ph !== "rest") { st = { k: st.k, ph: "rest", t: 1 }; render(); rmTimer = atGoal() ? 0 : setTimeout(next, 450); if (atGoal()) auto = false; return; }
        next();
        return;
      }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
      render();
    }
    const busy = () => !atGoal();

    function doStep() {
      interacted = true;
      if (busy()) {
        if (!raf && !rmTimer) slowUntil = heroStep(st) + 1;   // before the first reconstruction: reveal step 0, then take one step
        target = Math.min(MAX, target + 1); auto = false; run(); return;
      }
      if (st.k >= MAX) return;
      slowUntil = st.k + 2;
      target = st.k + 1;
      auto = false;
      run();
    }
    function doPlay() {
      interacted = true;
      if (auto && busy()) { auto = false; target = Math.max(st.ph === "rest" ? st.k : st.k, 0); render(); if (reduce) { stopAll(); st = { k: st.k, ph: "rest", t: 1 }; render(); } return; }
      if (st.ph === "rest" && st.k >= MAX) { stopAll(); st = { k: 0, ph: "rest", t: 1 }; }
      slowUntil = Math.min(slowUntil, heroStep(st) - 1);
      target = MAX;
      auto = true;
      run();
    }
    function doReset() {
      interacted = true;
      stopAll();
      auto = false;
      st = { k: 0, ph: "rest", t: 1 };
      target = 0;
      render();
    }
    function setStart(p, animate) {
      interacted = true;
      stopAll();
      start = [clamp(p[0], -SLIM, SLIM), clamp(p[1], -SLIM, SLIM)];
      T = sim.simulate(start, MAX);
      preview = null;
      if (animate && !reduce) {
        st = { k: 0, ph: "recon", t: 0 };
        slowUntil = 1;
        target = NAUTO;
        auto = true;
        run();
      } else {
        st = { k: 0, ph: "rest", t: 1 };
        target = animate ? NAUTO : 0;
        auto = !!animate;
        if (animate) run(); else render();
      }
    }
    function autoplay() {
      if (autoplayed || interacted) return;
      autoplayed = true;
      if (reduce) { st = { k: NAUTO, ph: "rest", t: 1 }; target = NAUTO; render(); return; }
      slowUntil = 1;
      target = NAUTO;
      auto = true;
      run();
    }
    function finish() {   // print: the end state, no motion
      stopAll();
      autoplayed = true;
      auto = false;
      const k = interacted ? Math.max(target, st.k) : NAUTO;
      st = { k: Math.min(MAX, k), ph: "rest", t: 1 };
      target = st.k;
      preview = null;
      render();
    }
    function updateButtons() {
      const playing = auto && busy();
      if (playing !== bPlay.__p) {
        bPlay.__p = playing;
        bPlay.innerHTML = (playing ? ICON.pause + "<span>Pause</span>" : ICON.play + "<span>Play</span>");
        bPlay.setAttribute("aria-pressed", String(playing));
      }
      bStep.disabled = !busy() && st.ph === "rest" && st.k >= MAX;
    }
    bStep.addEventListener("click", doStep);
    bPlay.addEventListener("click", doPlay);
    bReset.addEventListener("click", doReset);

    // ================================================================ interaction
    function setPreview(j) {
      const v = j == null ? null : clamp(j, 0, Math.max(0, shownK()));
      if (v === preview) return;
      preview = v;
      for (const key of KEYS) {
        const n = PAN[key].n;
        if (!n.hi) continue;
        if (v == null) n.hi.setAttribute("opacity", 0);
        else { const p = px(T[key].w[v]); n.hi.setAttribute("cx", p[0]); n.hi.setAttribute("cy", p[1]); n.hi.setAttribute("opacity", 0.9); }
      }
      render();
    }
    // touch: a tap outside the panels ends a step preview
    document.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      if (!panelsDiv.contains(e.target) && preview != null) setPreview(null);
    }, { passive: true });

    for (const key of KEYS) {
      const P = PAN[key], plot = P.plot;
      const local = (e) => { const b = plot.getBoundingClientRect(), f = PS / (b.width || PS); return [(e.clientX - b.left) * f, (e.clientY - b.top) * f]; };
      const nearest = (q, rad) => {
        const m = Math.max(0, shownK());
        let best = null, bd = (rad || 11) * Math.max(1, K);
        for (let j = 0; j <= m; j++) { const p = px(T[key].w[j]); const dd = Math.hypot(p[0] - q[0], p[1] - q[1]); if (dd < bd) { bd = dd; best = j; } }
        return best;
      };
      let t0 = null;
      plot.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const q = local(e);
        const j = nearest(q);
        const g = P.n.ghost;
        if (j != null) {
          g.setAttribute("opacity", 0);
          plot.classList.add("on-pt");
          setPreview(j);
        } else {
          plot.classList.remove("on-pt");
          if (preview != null) setPreview(null);
          const s = fromPx(q[0], q[1]), c = px([clamp(s[0], -SLIM, SLIM), clamp(s[1], -SLIM, SLIM)]);
          g.setAttribute("cx", c[0]); g.setAttribute("cy", c[1]); g.setAttribute("opacity", 1);
        }
      });
      plot.addEventListener("pointerleave", (e) => {
        if (e.pointerType !== "mouse") return;
        P.n.ghost.setAttribute("opacity", 0);
        plot.classList.remove("on-pt");
        setPreview(null);
      });
      plot.addEventListener("pointerdown", (e) => { if (e.button === 0 || e.pointerType !== "mouse") t0 = [e.clientX, e.clientY]; });
      plot.addEventListener("pointercancel", () => { t0 = null; });
      plot.addEventListener("pointerup", (e) => {
        if (!t0) return;
        const moved = Math.hypot(e.clientX - t0[0], e.clientY - t0[1]);
        t0 = null;
        if (moved >= 10) return;
        const q = local(e);
        P.n.ghost.setAttribute("opacity", 0);
        if (e.pointerType !== "mouse") {  // touch: a tap on a step previews it; elsewhere it restarts the run
          const j = nearest(q, 18);
          if (j != null) { setPreview(j); return; }
        }
        setStart(fromPx(q[0], q[1]), true);
      });
      plot.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 0.5 : 0.1;
        const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
        if (mv) { e.preventDefault(); setStart([start[0] + mv[0], start[1] + mv[1]], false); return; }
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doStep(); }
        else if (e.key === "Home") { e.preventDefault(); setStart(D.w0, false); }
      });
    }

    // ================================================================ responsive draw
    function draw(width) {
      W = width;
      stacked = W < 600;
      const gap = stacked ? 18 : 20;
      panelsDiv.classList.toggle("stack", stacked);
      PS = Math.floor(stacked ? W : (W - gap) / 2);
      K = clamp(PS / 440, 0.8, 1.06);
      for (const key of KEYS) drawPanel(PAN[key]);
      if (preview != null) { const p = preview; preview = null; setPreview(p); }
      render();
    }
    V.responsive(root, draw);
    V.onVisible(panelsDiv, autoplay, { threshold: 0.45 });
    return { finish };
  }

  // ================================================================ boot (lazy, print-safe)
  const FILE = "ix-sandbox.json";
  const finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "ixs-fail", "data-label": "" }, node, "— data unavailable —");
  }
  let startFn = null;
  function mount() {
    const node = document.getElementById("ix-sandbox");
    if (!node) return;
    let started = false;
    startFn = () => {
      if (started) return;
      started = true;
      V.json(dataURL(FILE))
        .then((D) => { const r = sandbox(node, D); if (r && r.finish) { finals.push(r.finish); if (printing) r.finish(); } })
        .catch((err) => { if (window.console) console.error("[ix-sandbox]", err); fail(node); });
    };
    V.onVisible(node, startFn, { rootMargin: "800px", threshold: 0 });
  }
  window.addEventListener("beforeprint", () => {
    printing = true;
    if (startFn) startFn();
    finals.forEach((f) => f());
  });
  window.addEventListener("afterprint", () => { printing = false; });
  function prefetch() {
    const go = () => V.json(dataURL(FILE)).catch(() => {});
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1500);
  }
  if (document.readyState === "complete") prefetch();
  else window.addEventListener("load", prefetch, { once: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})(typeof window !== "undefined" ? window : globalThis);
