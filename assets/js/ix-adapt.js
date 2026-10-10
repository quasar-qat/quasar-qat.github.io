/* ix-adapt.js — interactive adaptation-appendix figures (Qwen3-4B-Base on OpenMathReasoning).
   Mounts: #ix-fig30 (perplexity curves), #ix-fig31 (INT2 answer outcomes),
           #ix-fig32 (INT2 pass@8 / avg@1), #ix-fig33 (KL to FP-SFT by trace decile).
   Data:   assets/data/ix-adapt.json, written by tools/extract_ix_adapt.py from the paper's own
           figure code (Figures 30–33). Renders data labels and numbers only. Needs window.Viz. */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const DATA = SRC ? new URL("../data/ix-adapt.json", SRC).href : "assets/data/ix-adapt.json";
  const el = V.el, h = V.h;
  const reduce = V.reducedMotion;
  const NARROW = 560;
  const ROSE_T = "#A13040", INK = "#1D1F22", INK2 = "#44484F", MUTED = "#6B6F75", GOLD_T = "#7D6310";
  const COL = {
    quasar: "#D1495B", standard_qat: "#3F4245", lsq: "#80B1A8", denoising_qat: "#8E6C9A", bitdistiller: "#C98A2B",
    rtn: "#C6CACE", gptq: "#686F77", awq: "#979DA4", fp_sft: "#C9A227", base: "#CAC4B8",
  };
  const NAME = {
    quasar: "QUASAR", standard_qat: "Standard QAT", lsq: "LSQ", denoising_qat: "Denoising QAT", bitdistiller: "BitDistiller",
    rtn: "RTN", gptq: "GPTQ", awq: "AWQ", fp_sft: "FP-SFT", base: "Base (no SFT)",
  };
  const textColor = (k) => (k === "quasar" ? ROSE_T : k === "fp_sft" ? GOLD_T : INK2);
  let UID = 0;

  // ---------------------------------------------------------------- small helpers
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const thousands = (v) => Math.round(v).toLocaleString("en-US");
  const lerp = (a, b, t) => a + (b - a) * t;
  function decimals(list) {
    for (let d = 0; d <= 4; d++) {
      const f = Math.pow(10, d);
      if (list.every((t) => Math.abs(Math.round(t * f) - t * f) < 1e-6)) return d;
    }
    return 4;
  }
  const innerTicks = (lo, hi, n) => V.niceTicks(lo, hi, n).filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
  const pct1 = (v) => (100 * v).toFixed(1) + "%";
  // integer percent as the paper prints it (Python's round-half-even on exact halves)
  function pct0(v) {
    const x = 100 * v, f = Math.floor(x);
    return String(Math.abs(x - f - 0.5) < 1e-9 ? (f % 2 ? f + 1 : f) : Math.round(x));
  }
  let CTX = null;
  function textW(s, size, weight, family) {
    CTX = CTX || document.createElement("canvas").getContext("2d");
    CTX.font = `${weight || 500} ${size || 12}px ${family || "Inter, ui-sans-serif, system-ui, sans-serif"}`;
    return CTX.measureText(s).width;
  }
  function whenFonts(cb) { if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(cb); }

  // tooltip markup: header (mono caps), then rows keyed by a short stroke / swatch, values in bold
  function key(color, dashed, swatch) {
    const bg = dashed ? `repeating-linear-gradient(90deg,${color} 0 4px,transparent 4px 6px)` : color;
    return `<i class="ia-k${swatch ? " sw" : ""}" style="background:${bg}"></i>`;
  }
  function tipHTML(head, rows, sub) {
    let s = `<div class="tt">${head}</div>`;
    if (sub) s += `<div class="ia-sub${sub.q ? " q" : ""}">${esc(sub.label)}</div>`;
    for (const r of rows) {
      s += `<div class="row ia-row${r.q ? " q" : ""}${r.hot ? " hot" : ""}"><span class="ia-n">${r.color ? key(r.color, r.dashed, r.swatch) : ""}` +
        `${esc(r.label)}</span><b>${esc(r.value)}</b></div>`;
    }
    return s;
  }
  function srTable(node, caption, head, rows) {
    node.innerHTML = `<caption>${esc(caption)}</caption><thead><tr>${head.map((x) => `<th scope="col">${esc(x)}</th>`).join("")}</tr></thead><tbody>` +
      rows.map((r) => "<tr>" + r.map((x, i) => (i ? `<td>${esc(x)}</td>` : `<th scope="row">${esc(x)}</th>`)).join("") + "</tr>").join("") + "</tbody>";
  }
  function figName(root) {
    const card = root.closest(".viz"), kick = card && card.querySelector(".viz-kicker");
    return kick ? kick.textContent.split("·")[0].trim() : "chart";
  }

  // Pointer input on an overlay. Mouse / hovering pen track the pointer. Touch shows values on a tap
  // (< 10 px of travel) or a horizontal scrub; a vertical swipe stays a page scroll, and the
  // pointercancel the browser sends when it takes the gesture over clears the hover state.
  function bindOverlay(ov, move, off, scrubbable) {
    let t0 = null, scrub = false;
    ov.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") { move(e); return; }
      t0 = [e.clientX, e.clientY]; scrub = false;
    });
    ov.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") { move(e); return; }
      if (!t0) { if (e.pointerType === "pen") move(e); return; }
      const dx = e.clientX - t0[0], dy = e.clientY - t0[1];
      if (scrubbable !== false && (scrub || (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy)))) { scrub = true; move(e); }
    });
    ov.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse" && t0 && !scrub && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 10) move(e);
      t0 = null; scrub = false;
    });
    ov.addEventListener("pointercancel", () => { t0 = null; scrub = false; off(); });
    ov.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") off(); });
  }
  function outsideTap(node, fn) {
    document.addEventListener("pointerdown", (e) => { if (!node.contains(e.target)) fn(); }, { passive: true });
  }
  function controlGroup(row, label) {
    const grp = h("div", { class: "ia-ctl" }, row);
    h("span", { class: "lab", "aria-hidden": "true" }, grp, esc(label));
    return grp;
  }
  // multi-state chips (aria-pressed buttons) keyed by a short stroke
  function chip(parent, k, label, opt) {
    opt = opt || {};
    const b = h("button", { type: "button", class: "ia-chip" + (k === "quasar" ? " q" : ""), "aria-pressed": "false", "data-k": k }, parent);
    const s = el("svg", { viewBox: "0 0 18 10", width: 18, height: 10, "aria-hidden": "true" }, b);
    if (opt.swatch) el("rect", { x: 3, y: 0.5, width: 12, height: 9, rx: 2, fill: opt.color }, s);
    else el("line", { x1: 2, x2: 16, y1: 5, y2: 5, stroke: opt.color, "stroke-width": k === "quasar" ? 3 : 2.2, "stroke-linecap": "round", "stroke-dasharray": opt.dashed ? "3.5 2.5" : null }, s);
    h("span", null, b, esc(label));
    return b;
  }
  // clipped polyline for curves that leave the plot by orders of magnitude (RTN-init PPL ~1e5):
  // segments are cut at a margin around the plot so the visible slope is exact
  function pathClipped(pts, lo, hi) {
    let d = "";
    const ins = (y) => y >= lo && y <= hi;
    const cut = (a, b, yb) => [a[0] + ((b[0] - a[0]) * (yb - a[1])) / (b[1] - a[1]), yb];
    const P = (p) => p[0].toFixed(2) + "," + p[1].toFixed(2);
    for (let i = 0; i < pts.length; i++) {
      const b = pts[i];
      if (b[1] == null || !isFinite(b[1])) continue;
      if (i === 0 || !d) { if (ins(b[1])) d += "M" + P(b); else if (i > 0) { const a = pts[i - 1]; if (a && ins(a[1])) d += "M" + P(a) + "L" + P(cut(a, b, b[1] < lo ? lo : hi)); } continue; }
      const a = pts[i - 1], ia = ins(a[1]), ib = ins(b[1]);
      if (ia && ib) d += "L" + P(b);
      else if (ia && !ib) d += "L" + P(cut(a, b, b[1] < lo ? lo : hi));
      else if (!ia && ib) d += "M" + P(cut(a, b, a[1] < lo ? lo : hi)) + "L" + P(b);
      else if ((a[1] < lo && b[1] > hi) || (a[1] > hi && b[1] < lo)) {
        d += "M" + P(cut(a, b, a[1] < lo ? lo : hi)) + "L" + P(cut(a, b, b[1] < lo ? lo : hi));
      }
    }
    return d;
  }
  function fadeTo(nodes, o, ms) {
    for (const n of nodes) if (n) { n.style.transition = reduce || !ms ? "none" : `opacity ${ms}ms ease`; n.style.opacity = o; }
  }

  // ================================================================ Fig. 30 — adaptation perplexity
  function fig30(root, D) {
    const A = D.fig30;
    const legendOrder = A.methods.slice();                       // QUASAR, baselines, FP-SFT
    const drawOrder = A.methods.filter((k) => k !== "quasar" && k !== "fp_sft").concat(["fp_sft", "quasar"]);
    const dashed = new Set(A.dashed);
    const XT = A.x.train, XE = A.x.eval;
    const PANELS = [
      { id: "train", title: "train PPL · full run" },
      { id: "zoom", title: "train PPL · final 1,000 steps" },
      { id: "eval", title: "held-out PPL" },
    ];
    const st = { bits: A.bits.includes("INT2") ? "INT2" : A.bits[0], hover: null, pin: null };
    root.classList.add("ia", "ia30");
    const row = h("div", { class: "controls ia-controls" }, root);
    V.pills(controlGroup(row, "bits"), A.bits.map((b) => ({ value: b, label: b })), st.bits, (v) => { st.bits = v; update(); }, "adaptation perplexity bit width");
    const chipsRow = h("div", { class: "ia-chips ia-narrow", role: "group", "aria-label": "adaptation perplexity methods" }, root);
    const chips = {};
    for (const k of legendOrder) {
      const b = chips[k] = chip(chipsRow, k, NAME[k], { color: COL[k], dashed: dashed.has(k) });
      b.addEventListener("click", () => pinTo(st.pin === k ? null : k));
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hoverKey(k); });
      b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hoverKey(null); });
    }
    const plot = h("div", { class: "ia-plot", tabindex: "0", role: "group" }, root);
    plot.setAttribute("aria-label", figName(root) + " chart, use left and right arrow keys to step through held-out evaluations");
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    const tip = V.tooltip(plot);
    let K = null, cur = null, revealed = reduce, swept = reduce, tok = 0, hoverIdx = null, hoverFocus = null;

    function viewOf(bits) {
      const ax = A.axes[bits], s = A.series[bits];
      const v = { bits, ylim: {}, ticks: {}, s: {} };
      v.ylim.train = ax.train.ylim; v.ticks.train = ax.train.yticks;
      v.ylim.zoom = ax.zoom.ylim; v.ticks.zoom = innerTicks(ax.zoom.ylim[0], ax.zoom.ylim[1], 4);
      v.ylim.eval = ax.eval.ylim; v.ticks.eval = ax.eval.yticks;
      for (const k of A.methods) v.s[k] = { train: s[k].train, eval: s[k].eval };
      return v;
    }
    const ZX = A.axes[st.bits].zoom.xlim;
    const zIdx = XT.map((x, i) => (x >= ZX[0] && x <= ZX[1] ? i : -1)).filter((i) => i >= 0);

    function geom(width) {
      const g = { width, wide: width >= 800, narrow: width < NARROW };
      g.mL = 42; g.titleH = 26;
      if (g.wide) {
        g.R = 120; g.gap = 30;
        g.pw = Math.floor((width - 3 * g.mL - 2 * g.gap - g.R) / 3);
        g.ph = clamp(Math.round(g.pw * 0.95), 200, 250);
        g.P = PANELS.map((p, i) => ({ id: p.id, title: p.title, x: g.mL + i * (g.mL + g.pw + g.gap), y: g.titleH }));
        g.height = g.titleH + g.ph + 50;
        g.xTitle = { x: width / 2 - g.R / 2, y: g.titleH + g.ph + 44 };
      } else {
        g.R = 8; g.gap = 18;
        g.pw = width - g.mL - g.R;
        g.ph = clamp(Math.round(g.pw * 0.42), 140, 210);
        const blk = g.titleH + g.ph + 26 + g.gap;
        g.P = PANELS.map((p, i) => ({ id: p.id, title: p.title, x: g.mL, y: g.titleH + i * blk }));
        g.height = 3 * blk - g.gap + 18;
        g.xTitle = { x: g.mL + g.pw / 2, y: g.height - 4 };
      }
      for (const P of g.P) {
        P.sx = V.lin(P.id === "train" ? A.xlim.train : P.id === "eval" ? A.xlim.eval : ZX, [0, g.pw]);
        P.xs = P.id === "eval" ? XE : XT;
        P.idx = P.id === "zoom" ? zIdx : P.xs.map((_, i) => i);
      }
      return g;
    }

    function build(width) {
      const g = geom(width);
      const fr = V.frame(plot, width, g.height, { t: 0, r: 0, b: 0, l: 0 });
      const svg = fr.svg, root0 = fr.g;
      svg.classList.add("ia-svg");
      const id = "ia30-" + ++UID;
      const defs = el("defs", null, svg);
      K = { g, svg, panels: {}, labels: null };
      for (const P of g.P) {
        const gp = el("g", { transform: `translate(${P.x},${P.y})` }, root0);
        const cp = el("clipPath", { id: `${id}-${P.id}` }, defs);
        el("rect", { x: 0, y: -1, width: g.pw, height: g.ph + 2 }, cp);
        const rv = (q) => el("rect", { x: -4, y: -20, width: revealed ? g.pw + 8 : 0, height: g.ph + 40 }, el("clipPath", { id: `${id}-${P.id}-${q}` }, defs));
        const N = { P, g: gp, grid: el("g", { class: "grid" }, gp), yt: el("g", { class: "axis" }, gp), paths: {} };
        el("text", { class: "axis-title", x: -g.mL, y: -12 }, gp).textContent = P.title;
        const xticks = P.id === "zoom" ? [ZX[0], (ZX[0] + ZX[1]) / 2, ZX[1]] : A.xticks;
        V.axisBottom(gp, P.sx, g.ph, { ticks: xticks, fmt: (v) => (v === 0 ? "0" : +(v / 1024).toFixed(1) + "k") });
        if (P.id === "zoom") el("rect", { class: "ia-zf", x: 0, y: 0, width: g.pw, height: g.ph }, gp);
        N.zbox = P.id === "train" ? el("rect", { class: "ia-zr" }, gp) : null;
        const data = el("g", { "clip-path": `url(#${id}-${P.id})` }, gp);
        N.rB = rv("b"); N.rQ = rv("q");
        const gB = el("g", { "clip-path": `url(#${id}-${P.id}-b)` }, data);
        const gQ = el("g", { "clip-path": `url(#${id}-${P.id}-q)` }, data);
        for (const k of drawOrder) {
          N.paths[k] = el("path", {
            class: "ia-line", fill: "none", stroke: COL[k], "stroke-linejoin": "round", "stroke-linecap": "round",
            "stroke-dasharray": dashed.has(k) ? "5 3" : null, "data-k": k,
          }, k === "quasar" ? gQ : gB);
        }
        N.hov = el("g", { "pointer-events": "none" }, gp);
        N.ov = el("rect", { class: "ia-overlay", x: 0, y: 0, width: g.pw, height: g.ph, fill: "transparent" }, gp);
        bindOverlay(N.ov, (e) => { const r = N.ov.getBoundingClientRect(); hover(P.id, e.clientX - r.left, e.clientY - r.top); }, unhover);
        K.panels[P.id] = N;
      }
      el("text", { class: "axis-title", x: g.xTitle.x, y: g.xTitle.y, "text-anchor": "middle" }, root0).textContent = "training step";
      if (g.wide) K.labels = el("g", { class: "ia-ends", role: "group", "aria-label": "adaptation perplexity methods" }, root0);
      if (K.labels && !swept) K.labels.style.opacity = 0;
      buildLabels();
      chipsRow.classList.toggle("on", !g.wide);
      root.style.minHeight = "0";
      paint(cur);
      applyFocus();
      if (hoverIdx) hover(hoverIdx.panel, null, null, hoverIdx.i);
    }

    function paint(v) {
      if (!K || !v) return;
      const g = K.g;
      for (const id in K.panels) {
        const N = K.panels[id], P = N.P;
        const yl = v.ylim[id];
        const sy = V.lin(yl, [g.ph, 0]);
        N.sy = sy;
        // ticks; during a morph old ticks fade out over the first half and new ones in over the second
        N.grid.textContent = ""; N.yt.textContent = "";
        const sets = v.mix ? [[v.mix.from[id], clamp(1 - 2 * v.mix.r, 0, 1)], [v.ticks[id], clamp(2 * v.mix.r - 1, 0, 1)]] : [[v.ticks[id], 1]];
        const shared = v.mix ? new Set(v.mix.from[id].filter((t) => v.ticks[id].some((u) => Math.abs(u - t) < 1e-9))) : new Set();
        const seen = new Set();
        sets.forEach(([list, a]) => {
          const d = decimals(list);
          for (const t of list) {
            const full = shared.has(t) || [...shared].some((u) => Math.abs(u - t) < 1e-9);
            const op = full ? 1 : a;
            if (op <= 0.001 || seen.has(t.toFixed(4))) continue;
            seen.add(t.toFixed(4));
            const y = sy(t);
            if (y < -0.5 || y > g.ph + 0.5) continue;
            el("line", { x1: 0, x2: g.pw, y1: y, y2: y, opacity: op < 1 ? op.toFixed(3) : null }, N.grid);
            el("text", { x: -8, y: y + 4, "text-anchor": "end", opacity: op < 1 ? op.toFixed(3) : null }, N.yt).textContent = t.toFixed(d);
          }
        });
        for (const k of drawOrder) {
          const ys = id === "eval" ? v.s[k].eval : v.s[k].train;
          const pts = P.idx.map((i) => [P.sx(P.xs[i]), sy(ys[i])]);
          const p = N.paths[k];
          p.setAttribute("d", pathClipped(pts, -60, g.ph + 60));
          const q = k === "quasar";
          p.setAttribute("stroke-width", id === "eval" ? (q ? 2.6 : 1.6) : id === "zoom" ? (q ? 2.2 : 1.3) : (q ? 1.8 : 1.05));
        }
        if (N.zbox) {
          const z = v.ylim.zoom, x0 = P.sx(ZX[0]), x1 = P.sx(ZX[1]);
          const y0 = clamp(sy(z[1]), 0, g.ph), y1 = clamp(sy(z[0]), 0, g.ph);
          N.zbox.setAttribute("x", x0); N.zbox.setAttribute("width", x1 - x0);
          N.zbox.setAttribute("y", y0); N.zbox.setAttribute("height", Math.max(0, y1 - y0));
        }
      }
      paintLabels(v);
    }

    // direct end labels at the right of the held-out panel (wide layout); built once per draw, moved on paint
    function buildLabels() {
      K.ends = {};
      if (!K.labels) return;
      for (const k of legendOrder) {
        const q = k === "quasar";
        const grp = el("g", { class: "ia-end", "data-k": k, tabindex: "0", role: "button", "aria-pressed": String(st.pin === k), "aria-label": NAME[k] }, K.labels);
        const hit = el("rect", { height: 15, fill: "transparent" }, grp);
        const lead = el("path", { stroke: COL[k], "stroke-width": q ? 2.6 : 1.7, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": dashed.has(k) ? "3 2" : null }, grp);
        const txt = el("text", { class: "ia-endt" + (q ? " q" : ""), fill: textColor(k) }, grp);
        txt.textContent = NAME[k];
        grp.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hoverKey(k); });
        grp.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hoverKey(null); });
        grp.addEventListener("click", () => pinTo(st.pin === k ? null : k));
        grp.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pinTo(st.pin === k ? null : k); } });
        K.ends[k] = { grp, hit, lead, txt };
      }
    }
    function paintLabels(v) {
      if (!K.labels) return;
      const g = K.g, N = K.panels.eval, P = N.P;
      const items = legendOrder.map((k) => ({ k, y: clamp(N.sy(v.s[k].eval[v.s[k].eval.length - 1]), 0, g.ph) }));
      V.dodge(items, 15, -4, g.ph + 6);
      const x = P.x + g.pw;
      for (const it of items) {
        const E = K.ends[it.k], yy = P.y + it.ly, y0 = P.y + it.y;
        E.hit.setAttribute("x", x + 2); E.hit.setAttribute("y", (yy - 7.5).toFixed(2)); E.hit.setAttribute("width", g.R - 4);
        E.lead.setAttribute("d", Math.abs(it.ly - it.y) < 1.5 ? `M${x + 5},${yy.toFixed(2)}L${x + 14},${yy.toFixed(2)}`
          : `M${x + 2},${y0.toFixed(2)}L${x + 6},${yy.toFixed(2)}L${x + 14},${yy.toFixed(2)}`);
        E.txt.setAttribute("x", x + 18); E.txt.setAttribute("y", (yy + 4).toFixed(2));
      }
    }

    // ---- focus (highlight one series across all three panels)
    function focusKey() { return st.pin || hoverFocus; }
    function applyFocus() {
      if (!K) return;
      const f = focusKey();
      for (const id in K.panels) for (const k in K.panels[id].paths) {
        const p = K.panels[id].paths[k];
        p.style.opacity = !f || f === k ? 1 : 0.16;
      }
      if (K.labels) K.labels.querySelectorAll(".ia-end").forEach((n) => {
        const k = n.getAttribute("data-k");
        n.style.opacity = !f || f === k ? 1 : 0.38;
        n.setAttribute("aria-pressed", String(st.pin === k));
      });
      for (const k in chips) chips[k].setAttribute("aria-pressed", String(st.pin === k));
    }
    function hoverKey(k) { hoverFocus = k; applyFocus(); }
    function pinTo(k) { st.pin = k; hoverFocus = null; applyFocus(); if (hoverIdx) hover(hoverIdx.panel, null, null, hoverIdx.i); }

    // ---- shared crosshair
    const fmtPPL = (v) => (v >= 1000 ? thousands(v) : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
    // at step 4,096 the held-out value is Table 2's PPL (the plotted curve is a centered moving average)
    const evalAt = (bits, k, j, v) => (j === XE.length - 1 && A.final_ppl && A.final_ppl[bits] && A.final_ppl[bits][k] != null ? A.final_ppl[bits][k] : v);
    function nearest(xs, idx, xv) {
      let best = idx[0];
      for (const i of idx) if (Math.abs(xs[i] - xv) < Math.abs(xs[best] - xv)) best = i;
      return best;
    }
    function hover(pid, px, py, forceI) {
      if (!K || !cur || !revealed) return;
      const g = K.g, H = K.panels[pid], P = H.P;
      const i = forceI != null ? forceI : nearest(P.xs, P.idx, P.sx.invert(px));
      const step = P.xs[i];
      hoverIdx = { panel: pid, i };
      // series nearest the pointer (hovered panel) gets the focus across panels
      const vals = (id, j) => legendOrder.map((k) => ({ k, v: id === "eval" ? cur.s[k].eval[j] : cur.s[k].train[j] }));
      if (py != null && !st.pin) {
        let best = null;
        for (const r of vals(pid, i)) { const d = Math.abs(H.sy(r.v) - py); if (d < 14 && (!best || d < best.d)) best = { k: r.k, d }; }
        hoverFocus = best ? best.k : null;
        applyFocus();
      }
      for (const id in K.panels) {
        const N = K.panels[id], Q = N.P;
        N.hov.textContent = "";
        let j = null;
        if (id === pid) j = i;
        else if (id === "eval") { const c = nearest(XE, Q.idx, step); if (Math.abs(XE[c] - step) <= 64) j = c; }
        else if (id === "zoom") { if (step >= ZX[0] - 25 && step <= ZX[1] + 25) j = nearest(XT, Q.idx, step); }
        else j = nearest(XT, Q.idx, step);
        if (j == null) continue;
        const x = Q.sx(Q.xs[j]);
        el("line", { class: "ia-xh", x1: x, x2: x, y1: 0, y2: g.ph }, N.hov);
        const f = focusKey();
        for (const r of vals(id, j)) {
          const y = N.sy(r.v);
          if (y < -1 || y > g.ph + 1) continue;
          el("circle", { class: "ia-hd", cx: x, cy: y, r: r.k === "quasar" ? 4.2 : 3.2, fill: COL[r.k], opacity: !f || f === r.k ? 1 : 0.25 }, N.hov);
        }
      }
      const f = focusKey();
      const rows = vals(pid, i).sort((a, b) => a.v - b.v).map((r) => ({ label: NAME[r.k], color: COL[r.k], dashed: dashed.has(r.k), value: fmtPPL(pid === "eval" ? evalAt(cur.bits, r.k, i, r.v) : r.v), q: r.k === "quasar", hot: f === r.k }));
      const head = `${cur.bits} · step ${thousands(step)} · ${pid === "eval" ? "held-out PPL" : "train PPL"}`;
      const qy = H.sy(cur.s.quasar[pid === "eval" ? "eval" : "train"][i]);
      tip.show(P.x + P.sx(step), P.y + (py != null ? py : clamp(qy, 10, g.ph)), tipHTML(head, rows));
    }
    function unhover() {
      hoverIdx = null;
      if (K) for (const id in K.panels) K.panels[id].hov.textContent = "";
      tip.hide();
      if (hoverFocus) { hoverFocus = null; applyFocus(); }
    }
    plot.addEventListener("keydown", (e) => {
      if (!cur) return;
      const n = XE.length;
      let i = hoverIdx && hoverIdx.panel === "eval" ? hoverIdx.i : n - 1;
      if (e.key === "ArrowRight") i = Math.min(n - 1, i + (e.shiftKey ? 4 : 1));
      else if (e.key === "ArrowLeft") i = Math.max(0, i - (e.shiftKey ? 4 : 1));
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault();
      hover("eval", null, null, i);
    });
    plot.addEventListener("focus", () => { if (cur && plot.matches(":focus-visible")) hover("eval", null, null, hoverIdx && hoverIdx.panel === "eval" ? hoverIdx.i : XE.length - 1); });
    plot.addEventListener("focusout", (e) => { if (!plot.contains(e.relatedTarget)) unhover(); });
    outsideTap(root, () => { unhover(); });

    // ---- reveal, bit switches, print
    function setReveal(t, tq) {
      if (!K) return;
      for (const id in K.panels) {
        const N = K.panels[id];
        N.rB.setAttribute("width", Math.max(0, t) * (K.g.pw + 8));
        N.rQ.setAttribute("width", Math.max(0, tq) * (K.g.pw + 8));
      }
    }
    function sweep() {
      const my = ++tok;
      if (reduce) { setReveal(1, 1); swept = true; return; }
      setReveal(0, 0);
      V.tween(1300, (t) => { if (my === tok) setReveal(t, Math.max(0, (t - 0.12) / 0.88)); }, () => {
        swept = true;
        if (K && K.labels) fadeTo([K.labels], 1, 380);
      });
    }
    function lerpView(a, b, t) {
      const r = 1 - Math.cbrt(1 - t);  // un-eased progress paces the tick hand-off
      const v = { bits: b.bits, ylim: {}, ticks: b.ticks, s: {}, mix: { from: a.ticks, r } };
      for (const id of ["train", "zoom", "eval"]) v.ylim[id] = [lerp(a.ylim[id][0], b.ylim[id][0], t), lerp(a.ylim[id][1], b.ylim[id][1], t)];
      for (const k of A.methods) v.s[k] = {
        train: b.s[k].train.map((y, i) => lerp(a.s[k].train[i], y, t)),
        eval: b.s[k].eval.map((y, i) => lerp(a.s[k].eval[i], y, t)),
      };
      return v;
    }
    function describe(v) {
      const last = (a) => a[a.length - 1];
      srTable(sr, `${figName(root)} · ${A.model} · ${v.bits}`, ["method", `train PPL · step ${thousands(last(XT))}`, `held-out PPL · step ${thousands(last(XE))}`],
        legendOrder.map((k) => [NAME[k], fmtPPL(last(v.s[k].train)), fmtPPL(evalAt(v.bits, k, XE.length - 1, last(v.s[k].eval)))]));
      if (K) K.svg.setAttribute("aria-label", `${figName(root)} · train PPL (full run and final 1,000 steps) and held-out PPL by training step · ${A.model} · ${v.bits}`);
    }
    let shown = null;
    function update() {
      const next = viewOf(st.bits);
      const from = cur;
      const my = ++tok;
      shown = next;
      describe(next);
      tip.hide(); hoverIdx = null;
      if (K) for (const id in K.panels) K.panels[id].hov.textContent = "";
      if (hoverFocus && !(K && K.labels && K.labels.matches(":hover"))) { hoverFocus = null; applyFocus(); }
      if (!from || !revealed || reduce) { cur = next; paint(cur); setReveal(1, 1); return; }
      setReveal(1, 1);
      if (!swept) { swept = true; if (K && K.labels) fadeTo([K.labels], 1, 300); }
      V.tween(620, (t) => { if (my !== tok) return; cur = lerpView(from, next, clamp(t, 0, 1)); paint(cur); }, () => { if (my === tok) { cur = next; paint(cur); } });
    }
    function finish() {
      ++tok; revealed = true; swept = true;
      cur = shown || viewOf(st.bits);
      unhover();
      if (K) { paint(cur); setReveal(1, 1); if (K.labels) fadeTo([K.labels], 1, 0); }
    }

    cur = shown = viewOf(st.bits);
    describe(cur);
    const R = V.responsive(plot, (w) => { build(w); describe(cur); });
    whenFonts(() => R.redraw());
    V.onVisible(root, () => { if (revealed) return; revealed = true; sweep(); }, { threshold: 0.3 });
    if (revealed) setReveal(1, 1);
    return finish;
  }

  // ================================================================ shared: horizontal row chart scaffolding
  // rows with a label column on the left; INT2 arms, a dashed separator, then the two references
  function rowGeom(width, rows, opt) {
    const g = { width, narrow: width < NARROW };
    const labMax = Math.max(...rows.map((r) => textW(NAME[r.key], 12, r.key === "quasar" ? 700 : 500)));
    g.labW = Math.ceil(labMax) + 14;
    g.x0 = g.labW;
    g.x1 = width - (opt.right || 6);
    g.P = g.narrow ? 25 : 27;
    g.bh = g.narrow ? 16 : 18;
    g.top = opt.top || 4;
    g.sep = 18;
    g.n = rows.length;
    g.nArms = rows.filter((r) => !r.ref).length;
    g.axisY = g.top + g.n * g.P + g.sep + 4;
    g.height = g.axisY + 40;
    return g;
  }
  const rowY = (g, i) => g.top + i * g.P + g.P / 2 + (i >= g.nArms ? g.sep : 0);

  // ================================================================ Fig. 31 — INT2 answer outcomes
  function fig31(root, D) {
    const B = D.fig31;
    const OUT = {
      right: { color: "#2E6F55", ink: "#FFFFFF" },
      wrong: { color: "#DDB967", ink: INK },
      none: { color: "#BDC1C6", ink: INK },
    };
    const OK = B.outcomes.map((o) => o[0]);
    const OL = Object.fromEntries(B.outcomes);
    const BENCH = Object.fromEntries(B.benchmarks);
    const st = { bench: B.benchmarks[0][0], align: "right" };
    root.classList.add("ia", "ia31");
    const row = h("div", { class: "controls ia-controls" }, root);
    V.pills(controlGroup(row, "benchmark"), B.benchmarks.map(([k, l]) => ({ value: k, label: l })), st.bench, (v) => { st.bench = v; update(true); }, "answer outcomes benchmark");
    const plot = h("div", { class: "ia-plot ia-rows" }, root);
    // outcome key = alignment control: the chosen outcome starts every bar at 0 and is labelled
    const keyRow = h("div", { class: "ia-key", role: "radiogroup", "aria-label": "answer outcome" }, root);
    const keyBtns = OK.map((o) => {
      const b = h("button", { type: "button", role: "radio", class: "ia-kb", "aria-checked": String(o === st.align), "data-o": o, tabindex: o === st.align ? "0" : "-1" }, keyRow);
      h("i", { class: "ia-sw", style: `background:${OUT[o].color}` }, b);
      h("span", null, b, esc(OL[o]));
      b.addEventListener("click", () => setAlign(o, b));
      b.addEventListener("keydown", (e) => {
        const ks = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        let j = OK.indexOf(st.align);
        if (e.key in ks) j = (j + ks[e.key] + OK.length) % OK.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = OK.length - 1;
        else return;
        e.preventDefault();
        setAlign(OK[j]); keyBtns[j].focus();
      });
      return b;
    });
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    const tip = V.tooltip(plot);
    let K = null, revealed = reduce, tok = 0, hot = null, curGeo = null;

    const rowsOf = (bench) => B.rows[bench];
    function target(g) {
      // per key: y, segment [x, w] per outcome (aligned outcome first), label for the aligned outcome
      const out = {};
      const sx = V.lin([0, 1], [g.x0, g.x1]);
      rowsOf(st.bench).forEach((r, i) => {
        const order = [st.align].concat(OK.filter((o) => o !== st.align));
        let acc = 0;
        const segs = {};
        for (const o of order) { segs[o] = [sx(acc), sx(acc + r[o]) - sx(acc)]; acc += r[o]; }
        out[r.key] = { y: rowY(g, i), segs, r };
      });
      return out;
    }
    function build(width) {
      const rows = rowsOf(st.bench);
      const g = rowGeom(width, rows, { right: 8 });
      const fr = V.frame(plot, width, g.height, { t: 0, r: 0, b: 0, l: 0 });
      const svg = fr.svg, G0 = fr.g;
      svg.classList.add("ia-svg");
      K = { g, svg, rows: {} };
      const sx = V.lin([0, 100], [g.x0, g.x1]);
      const grid = el("g", { class: "grid" }, G0);
      for (const t of [0, 20, 40, 60, 80, 100]) el("line", { x1: sx(t), x2: sx(t), y1: g.top, y2: g.axisY }, grid);
      const ax = V.axisBottom(G0, sx, g.axisY, { ticks: [0, 20, 40, 60, 80, 100], fmt: (v) => String(v), title: "share of generated samples (%)", titleY: 34 });
      const at = ax.querySelector(".axis-title");  // centred on the bars, but never past the card edge on phones
      if (at) { const hw = at.getComputedTextLength() / 2; if (hw) at.setAttribute("x", Math.max(hw + 2, Math.min((g.x0 + g.x1) / 2, width - hw - 2))); }
      const sepY = g.top + g.nArms * g.P + g.sep / 2;
      el("line", { class: "ia-sep", x1: 0, x2: g.x1, y1: sepY, y2: sepY }, G0);
      K.bands = el("g", null, G0);
      const bars = el("g", null, G0);
      const labs = el("g", null, G0);
      for (const r of rows) {
        const N = K.rows[r.key] = {};
        N.band = el("rect", { class: "ia-band", x: 0, y: -g.P / 2 + 1, width: g.x1, height: g.P - 2, rx: 5 }, K.bands);
        N.g = el("g", null, bars);
        N.name = el("text", { class: "ia-rl" + (r.key === "quasar" ? " q" : ""), x: g.labW - 10, y: 4, "text-anchor": "end", fill: textColor(r.key) }, N.g);
        N.name.textContent = NAME[r.key];
        N.seg = {};
        for (const o of OK) N.seg[o] = el("rect", { class: "ia-seg", y: -g.bh / 2, height: g.bh, fill: OUT[o].color, "data-o": o }, N.g);
        N.lab = el("text", { class: "ia-bv", y: 4.2 }, labs);
      }
      K.ov = el("rect", { class: "ia-overlay rows", x: 0, y: g.top, width: g.width, height: g.n * g.P + g.sep, fill: "transparent" }, G0);
      bindOverlay(K.ov, (e) => { const b = K.ov.getBoundingClientRect(); rowHover(e.clientY - b.top + g.top, e.clientX - b.left); }, unhover, false);
      root.style.minHeight = "0";
      curGeo = null;
      place(revealed ? 1 : 0, true);
      describe();
    }
    // draw at progress t (0 = bars collapsed at x0, 1 = full) between curGeo and the target geometry
    function place(grow, instant) {
      if (!K) return;
      const g = K.g, T = target(g);
      const from = curGeo;
      const draw = (geo, gr) => {
        for (const k in K.rows) {
          const N = K.rows[k], q = geo[k];
          if (!q) continue;
          N.g.setAttribute("transform", `translate(0,${q.y.toFixed(2)})`);
          N.band.setAttribute("y", (q.y - g.P / 2 + 1).toFixed(2));
          for (const o of OK) {
            const [x, w] = q.segs[o];
            N.seg[o].setAttribute("x", (g.x0 + (x - g.x0) * gr).toFixed(2));
            N.seg[o].setAttribute("width", Math.max(0, w * gr).toFixed(2));
          }
        }
      };
      const labels = (geo) => {
        for (const k in K.rows) {
          const N = K.rows[k], q = geo[k];
          const v = q.r[st.align], [x, w] = q.segs[st.align];
          const s = st.align === "right" && q.r.lab != null ? q.r.lab : pct0(v);
          N.lab.textContent = s;
          const tw = textW(s, 12, 600);
          const inside = w >= tw + 10;
          N.lab.setAttribute("x", (inside ? x + w - 5 : x + w + 5).toFixed(2));
          N.lab.setAttribute("y", (q.y + 4.2).toFixed(2));
          N.lab.setAttribute("text-anchor", inside ? "end" : "start");
          N.lab.setAttribute("class", "ia-bv" + (inside ? (OUT[st.align].ink === "#FFFFFF" ? " on" : " in") : " out") + (k === "quasar" ? " q" : ""));
        }
      };
      for (const k in K.rows) for (const o of OK) K.rows[k].seg[o].style.opacity = o === st.align || st.align === "right" ? 1 : 0.62;
      const my = ++tok;
      if (instant || !from || reduce) {
        draw(T, grow);
        labels(T);
        fadeTo(Object.values(K.rows).map((n) => n.lab), grow >= 1 ? 1 : 0, 0);
        curGeo = grow >= 1 ? T : null;
        return;
      }
      fadeTo(Object.values(K.rows).map((n) => n.lab), 0, 120);
      V.tween(560, (t) => {
        if (my !== tok) return;
        const geo = {};
        for (const k in T) {
          const a = from[k] || T[k], b = T[k];
          const segs = {};
          for (const o of OK) segs[o] = [lerp(a.segs[o][0], b.segs[o][0], t), lerp(a.segs[o][1], b.segs[o][1], t)];
          geo[k] = { y: lerp(a.y, b.y, t), segs, r: b.r };
        }
        draw(geo, 1);
      }, () => {
        if (my !== tok) return;
        draw(T, 1); labels(T); curGeo = T;
        fadeTo(Object.values(K.rows).map((n) => n.lab), 1, 260);
      });
    }
    function grow() {
      if (!K) return;
      const my = ++tok, g = K.g, T = target(g), keys = Object.keys(T);
      fadeTo(Object.values(K.rows).map((n) => n.lab), 0, 0);
      if (reduce) { place(1, true); return; }
      const n = keys.length;
      V.tween(1100, (t) => {
        if (my !== tok) return;
        keys.forEach((k, i) => {
          const N = K.rows[k], q = T[k];
          const lt = clamp((t * (1 + 0.06 * n) - 0.06 * i), 0, 1);
          for (const o of OK) {
            const [x, w] = q.segs[o];
            N.seg[o].setAttribute("x", (g.x0 + (x - g.x0) * lt).toFixed(2));
            N.seg[o].setAttribute("width", Math.max(0, w * lt).toFixed(2));
          }
        });
      }, () => {
        if (my !== tok) return;
        const labs = Object.values(K.rows).map((n) => n.lab);
        place(1, true);
        fadeTo(labs, 0, 0);
        labs[0] && labs[0].getBoundingClientRect();
        fadeTo(labs, 1, 320);
      });
    }
    function setAlign(o) {
      if (o === st.align) return;
      st.align = o;
      keyBtns.forEach((b) => { const on = b.getAttribute("data-o") === o; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
      update(false);
    }
    function update() {
      unhover();
      if (!K) return;
      place(1, !revealed);
      describe();
    }
    function rowHover(y, x) {
      if (!K || !revealed) return;
      const g = K.g, rows = rowsOf(st.bench);
      let best = null;
      rows.forEach((r, i) => { const d = Math.abs(rowY(g, i) - y); if (d <= g.P / 2 + g.sep / 2 && (!best || d < best.d)) best = { r, i, d }; });
      if (!best) { unhover(); return; }
      setHot(best.r.key);
      const r = best.r;
      const head = `${BENCH[st.bench]} · ${thousands(r.n * r.k)} samples`;
      const rowsT = OK.map((o) => ({ label: OL[o], color: OUT[o].color, swatch: true, value: pct1(r[o]), hot: o === st.align }));
      tip.show(x != null ? x : g.x1 - 40, rowY(g, best.i) - g.P / 2 + 4, tipHTML(head, rowsT, { label: NAME[r.key], q: r.key === "quasar" }));
    }
    function setHot(k) { hot = k; if (K) for (const kk in K.rows) K.rows[kk].band.classList.toggle("hot", kk === k); }
    function unhover() { setHot(null); tip.hide(); }
    outsideTap(root, unhover);
    function describe() {
      const rows = rowsOf(st.bench);
      srTable(sr, `${figName(root)} · ${BENCH[st.bench]} · INT2`, ["checkpoint"].concat(OK.map((o) => OL[o] + " (%)")),
        rows.map((r) => [NAME[r.key]].concat(OK.map((o) => (100 * r[o]).toFixed(1)))));
      if (K) K.svg.setAttribute("aria-label", `${figName(root)} · answer outcomes of the INT2 checkpoints on ${BENCH[st.bench]}, with the base model and FP-SFT`);
    }
    function finish() { ++tok; revealed = true; unhover(); place(1, true); fadeTo(K ? Object.values(K.rows).map((n) => n.lab) : [], 1, 0); }

    const R = V.responsive(plot, build);
    whenFonts(() => R.redraw());
    V.onVisible(root, () => { if (revealed) return; revealed = true; grow(); }, { threshold: 0.3 });
    return finish;
  }

  // ================================================================ Fig. 32 — INT2 pass@8 / avg@1
  function fig32(root, D) {
    const C = D.fig32;
    const rows = C.rows;
    const st = { view: "ratio" };
    const VIEWS = [{ value: "ratio", label: "pass@8 / avg@1" }, { value: "split", label: "avg@1 · pass@8" }];
    root.classList.add("ia", "ia32");
    const row = h("div", { class: "controls ia-controls" }, root);
    V.pills(controlGroup(row, "view"), VIEWS, st.view, (v) => { st.view = v; morph(); }, "pass@8 / avg@1 view");
    const plot = h("div", { class: "ia-plot ia-rows" }, root);
    // key row: the two reference lines (ratio view) or the two dot types (avg@1 · pass@8 view)
    const keyRow = h("div", { class: "ia-key ia-dkey", "aria-hidden": "true" }, root);
    const kR = h("span", { class: "ia-kset r" }, keyRow);
    const k1 = h("span", { class: "ia-ki" }, kR); h("i", { class: "ia-vl one" }, k1); h("span", null, k1, "pass@8 / avg@1 = 1");
    const k2 = h("span", { class: "ia-ki" }, kR); h("i", { class: "ia-vl fp" }, k2); h("span", { class: "g" }, k2, "FP-SFT");
    const kS = h("span", { class: "ia-kset s" }, keyRow);
    const kA = h("span", { class: "ia-ki" }, kS); h("i", { class: "ia-dot hollow" }, kA); h("span", null, kA, "avg@1");
    const kP = h("span", { class: "ia-ki" }, kS); h("i", { class: "ia-dot" }, kP); h("span", null, kP, "pass@8");
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    const tip = V.tooltip(plot);
    let K = null, revealed = reduce, tok = 0, mixT = 0;  // mixT: 0 = ratio bars, 1 = avg@1 · pass@8
    const RMAX = Math.ceil(Math.max(...rows.map((r) => r.ratio)) * 1.08);
    const fp = rows.find((r) => r.key === C.ref_line);

    function build(width) {
      const g = rowGeom(width, rows, { right: 8, top: 6 });
      const valW = Math.ceil(textW("6.07", 12, 700)) + 10;
      g.sxR = V.lin([0, RMAX], [g.x0, g.x1 - valW]);
      g.sxS = V.lin([0, 100], [g.x0, g.x1 - Math.ceil(textW("100", 12, 600)) - 12]);
      const fr = V.frame(plot, width, g.height, { t: 0, r: 0, b: 0, l: 0 });
      const svg = fr.svg, G0 = fr.g;
      svg.classList.add("ia-svg");
      K = { g, svg, rows: [] };
      K.axR = el("g", null, G0); K.axS = el("g", null, G0);
      // ratio axis: grid, the 1 reference, FP-SFT dashed line
      const gridR = el("g", { class: "grid" }, K.axR);
      const tR = []; for (let t = 0; t <= RMAX; t++) tR.push(t);
      for (const t of tR) if (t !== 1) el("line", { x1: g.sxR(t), x2: g.sxR(t), y1: g.top, y2: g.axisY }, gridR);
      V.axisBottom(K.axR, g.sxR, g.axisY, { ticks: tR, fmt: (v) => String(v), title: "pass@8 / avg@1", titleY: 34 });
      // split axis
      const gridS = el("g", { class: "grid" }, K.axS);
      const tS = [0, 20, 40, 60, 80, 100];
      for (const t of tS) el("line", { x1: g.sxS(t), x2: g.sxS(t), y1: g.top, y2: g.axisY }, gridS);
      V.axisBottom(K.axS, g.sxS, g.axisY, { ticks: tS, fmt: (v) => String(v), title: "MATH-500 (%)", titleY: 34 });
      const sepY = g.top + g.nArms * g.P + g.sep / 2;
      el("line", { class: "ia-sep", x1: 0, x2: g.x1, y1: sepY, y2: sepY }, G0);
      K.bands = el("g", null, G0);
      const body = el("g", null, G0);
      rows.forEach((r, i) => {
        const y = rowY(g, i), q = r.key === "quasar";
        const band = el("rect", { class: "ia-band", x: 0, y: y - g.P / 2 + 1, width: g.x1, height: g.P - 2, rx: 5 }, K.bands);
        const name = el("text", { class: "ia-rl" + (q ? " q" : ""), x: g.labW - 10, y: y + 4, "text-anchor": "end", fill: textColor(r.key) }, body);
        name.textContent = NAME[r.key];
        const bar = el("rect", { class: "ia-bar", fill: COL[r.key], rx: 2 }, body);
        const dA = el("circle", { class: "ia-da", r: q ? 4.6 : 4, cy: y, stroke: COL[r.key] }, body);
        const dP = el("circle", { class: "ia-dp", r: q ? 4.6 : 4, cy: y, fill: COL[r.key] }, body);
        const val = el("text", { class: "ia-bv out" + (q ? " q" : ""), y: y + 4.2 }, body);
        const vA = el("text", { class: "ia-sv", y: y + 4.2, "text-anchor": "end" }, body);
        const vP = el("text", { class: "ia-sv" + (q ? " q" : ""), y: y + 4.2 }, body);
        K.rows.push({ r, y, band, bar, dA, dP, val, vA, vP });
      });
      // reference lines over the bars: ratio 1 (same problems solved on every attempt) and FP-SFT
      K.refs = el("g", { class: "ia-refs" }, G0);
      el("line", { class: "ia-one", x1: g.sxR(1), x2: g.sxR(1), y1: g.top - 2, y2: g.axisY }, K.refs);
      el("line", { class: "ia-fpl", x1: g.sxR(fp.ratio), x2: g.sxR(fp.ratio), y1: g.top - 2, y2: g.axisY }, K.refs);
      K.ov = el("rect", { class: "ia-overlay rows", x: 0, y: g.top, width: g.width, height: g.n * g.P + g.sep, fill: "transparent" }, G0);
      bindOverlay(K.ov, (e) => { const b = K.ov.getBoundingClientRect(); rowHover(e.clientY - b.top + g.top, e.clientX - b.left); }, unhover, false);
      root.style.minHeight = "0";
      paint(mixT, revealed ? 1 : 0);
      describe();
    }
    // m: 0 = ratio bars, 1 = dumbbells; grow: first-view bar growth
    function paint(m, grow) {
      if (!K) return;
      const g = K.g, bh = g.bh;
      K.axR.style.opacity = 1 - m; K.axS.style.opacity = m;
      K.axR.style.display = m >= 0.999 ? "none" : ""; K.axS.style.display = m <= 0.001 ? "none" : "";
      K.refs.style.opacity = (1 - m) * grow;
      keyRow.classList.toggle("split", m > 0.5);
      for (const R of K.rows) {
        const r = R.r;
        const xr0 = g.x0, wr = (g.sxR(r.ratio) - g.x0) * grow;
        const xa = g.sxS(100 * r.avg1), xp = g.sxS(100 * r.pass8);
        const x = lerp(xr0, xa, m), w = lerp(wr, Math.max(0, xp - xa), m), hh = lerp(bh, 3, m);
        R.bar.setAttribute("x", x.toFixed(2)); R.bar.setAttribute("width", Math.max(0, w).toFixed(2));
        R.bar.setAttribute("y", (R.y - hh / 2).toFixed(2)); R.bar.setAttribute("height", hh.toFixed(2));
        R.bar.setAttribute("rx", lerp(2, 1.5, m).toFixed(2));
        R.bar.style.opacity = lerp(1, ["rtn", "awq", "base"].includes(r.key) ? 1 : 0.7, m);
        for (const [d, cx] of [[R.dA, xa], [R.dP, xp]]) { d.setAttribute("cx", cx.toFixed(2)); d.style.opacity = clamp(2 * m - 1, 0, 1); }
        R.val.textContent = r.ratio.toFixed(2);
        R.val.setAttribute("x", (xr0 + wr + 5).toFixed(2));
        R.val.style.opacity = clamp(1 - 2 * m, 0, 1) * (grow >= 1 ? 1 : 0);
        // dumbbell values: avg@1 left of its dot when it fits, pass@8 right of its dot
        const sa = (100 * r.avg1).toFixed(1), sp = (100 * r.pass8).toFixed(1);
        R.vA.textContent = sa; R.vP.textContent = sp;
        R.vA.setAttribute("x", (xa - 8).toFixed(2)); R.vP.setAttribute("x", (xp + 8).toFixed(2));
        const fitA = xa - 8 - textW(sa, 12, 500) > g.x0 + 2;
        R.vA.style.opacity = fitA ? clamp(2 * m - 1, 0, 1) : 0;
        R.vP.style.opacity = clamp(2 * m - 1, 0, 1);
      }
    }
    function morph() {
      unhover();
      const to = st.view === "split" ? 1 : 0, from = mixT, my = ++tok;
      if (!K || !revealed || reduce) { mixT = to; paint(mixT, 1); describe(); return; }
      V.tween(640, (t) => { if (my !== tok) return; mixT = lerp(from, to, t); paint(mixT, 1); }, () => { if (my === tok) { mixT = to; paint(mixT, 1); } });
      describe();
    }
    function grow() {
      const my = ++tok;
      if (reduce) { paint(mixT, 1); return; }
      V.tween(1000, (t) => { if (my === tok) paint(mixT, t >= 1 ? 1 : t * 0.999); }, () => { if (my === tok) paint(mixT, 1); });
    }
    function rowHover(y, x) {
      if (!K || !revealed) return;
      const g = K.g;
      let best = null;
      K.rows.forEach((R) => { const d = Math.abs(R.y - y); if (d <= g.P / 2 + g.sep / 2 && (!best || d < best.d)) best = { R, d }; });
      if (!best) { unhover(); return; }
      const R = best.R, r = R.r;
      K.rows.forEach((Q) => Q.band.classList.toggle("hot", Q === R));
      const rowsT = [
        { label: "pass@8", value: pct1(r.pass8) },
        { label: "avg@1", value: pct1(r.avg1) },
        { label: "pass@8 / avg@1", value: r.ratio.toFixed(2), hot: st.view === "ratio" },
      ];
      tip.show(x != null ? x : g.x1 - 40, R.y - g.P / 2 + 4, tipHTML(`MATH-500 · ${C.k} samples`, rowsT, { label: NAME[r.key], q: r.key === "quasar" }));
    }
    function unhover() { if (K) K.rows.forEach((Q) => Q.band.classList.remove("hot")); tip.hide(); }
    outsideTap(root, unhover);
    function describe() {
      srTable(sr, `${figName(root)} · MATH-500 · INT2`, ["checkpoint", "pass@8 / avg@1", "pass@8 (%)", "avg@1 (%)"],
        rows.map((r) => [NAME[r.key], r.ratio.toFixed(2), (100 * r.pass8).toFixed(1), (100 * r.avg1).toFixed(1)]));
      if (K) K.svg.setAttribute("aria-label", `${figName(root)} · ${st.view === "ratio" ? "ratio of pass@8 to avg@1" : "avg@1 and pass@8"} on MATH-500 for the INT2 checkpoints, with the base model and FP-SFT`);
    }
    function finish() { ++tok; revealed = true; unhover(); mixT = st.view === "split" ? 1 : 0; paint(mixT, 1); }

    const R = V.responsive(plot, build);
    whenFonts(() => R.redraw());
    V.onVisible(root, () => { if (revealed) return; revealed = true; grow(); }, { threshold: 0.3 });
    return finish;
  }

  // ================================================================ Fig. 33 — KL to FP-SFT by trace decile
  function fig33(root, D) {
    const E = D.fig33;
    const S = E.series.map((s, i) => Object.assign({ id: "s" + i, q: s.key === "quasar" }, s));
    const on = new Set(S.map((s) => s.id));
    const st = { hover: null, focus: null };
    root.classList.add("ia", "ia33");
    const chipsRow = h("div", { class: "ia-chips on", role: "group", "aria-label": "divergence along traces checkpoints" }, root);
    const chips = {};
    for (const s of S) {
      const b = chips[s.id] = chip(chipsRow, s.key, s.label, { color: COL[s.key], dashed: s.dashed });
      b.setAttribute("aria-pressed", "true");
      b.addEventListener("click", () => {
        if (on.has(s.id) && on.size === 1) return;  // keep at least one checkpoint
        on.has(s.id) ? on.delete(s.id) : on.add(s.id);
        b.setAttribute("aria-pressed", String(on.has(s.id)));
        st.focus = on.has(s.id) && (b.matches(":hover") || b.matches(":focus-visible")) ? s.id : null;
        rescale();
      });
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && on.has(s.id)) setFocus(s.id); });
      b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") setFocus(null); });
      b.addEventListener("focus", () => { if (b.matches(":focus-visible") && on.has(s.id)) setFocus(s.id); });
      b.addEventListener("blur", () => setFocus(null));
    }
    const plot = h("div", { class: "ia-plot", tabindex: "0", role: "group" }, root);
    plot.setAttribute("aria-label", figName(root) + " chart, use left and right arrow keys to step through trace deciles");
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    const tip = V.tooltip(plot);
    let K = null, revealed = reduce, tok = 0, ylim = null, yticks = null;
    const fmtKL = (v) => (v >= 0.01 ? v.toFixed(3) : v.toFixed(4));

    function domain() {
      const vis = S.filter((s) => on.has(s.id));
      const mx = Math.max(...vis.flatMap((s) => s.kl));
      const t = V.niceTicks(0, mx * 1.05, 4);
      let top = mx * 1.08;
      const ticks = t.filter((v) => v <= top + 1e-12);
      return { ylim: [0, top], ticks };
    }
    function build(width) {
      const narrow = width < NARROW;
      const height = narrow ? 260 : 300;
      const m = { t: 26, r: narrow ? 12 : 24, b: 46, l: 50 };
      const fr = V.frame(plot, width, height, m);
      const { svg, g, W, H } = fr;
      svg.classList.add("ia-svg");
      const id = "ia33-" + ++UID;
      const defs = el("defs", null, svg);
      const cp = el("clipPath", { id: id + "c" }, defs);
      const rv = el("rect", { x: -10, y: -20, width: revealed ? W + 20 : 0, height: H + 40 }, cp);
      const sx = V.lin([0.7, 10.3], [0, W]);
      K = { svg, g, W, H, m, sx, rv, narrow };
      K.grid = el("g", { class: "grid" }, g);
      K.yt = el("g", { class: "axis" }, g);
      el("text", { class: "axis-title", x: -m.l, y: -12 }, g).textContent = "KL to FP-SFT";
      V.axisBottom(g, sx, H, { ticks: E.x, fmt: (v) => String(v), title: "decile of the reasoning trace", titleY: 36 });
      K.band = el("rect", { class: "ia-dband", y: 0, height: H, width: Math.max(12, Math.min(44, (sx(2) - sx(1)) * 0.5)), x: -100, rx: 4 }, g);
      const data = el("g", { "clip-path": `url(#${id}c)` }, g);
      K.lines = {};
      // baselines first, QUASAR on top
      const order = S.filter((s) => !s.q).concat(S.filter((s) => s.q));
      for (const s of order) {
        const grp = el("g", { class: "ia-s", "data-id": s.id }, data);
        const path = el("path", { fill: "none", stroke: COL[s.key], "stroke-width": s.q ? 2.6 : 1.8, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": s.dashed ? "7 4" : null }, grp);
        const dots = s.kl.map(() => el("circle", { r: s.q ? 3.4 : 3, fill: COL[s.key] }, grp));
        K.lines[s.id] = { grp, path, dots };
      }
      K.hov = el("g", { "pointer-events": "none" }, g);
      K.ov = el("rect", { class: "ia-overlay", x: 0, y: 0, width: W, height: H, fill: "transparent" }, g);
      bindOverlay(K.ov, (e) => { const r = K.ov.getBoundingClientRect(); hover(e.clientX - r.left, e.clientY - r.top); }, unhover);
      root.style.minHeight = "0";
      if (!ylim) { const d = domain(); ylim = d.ylim; yticks = d.ticks; }
      paint(ylim, yticks, null);
      applyFocus();
      describe();
      if (st.hover != null) hover(null, null, st.hover);
    }
    function paint(yl, ticks, mix) {
      if (!K) return;
      const { W, H, sx } = K;
      const sy = V.lin(yl, [H, 0]);
      K.sy = sy;
      K.grid.textContent = ""; K.yt.textContent = "";
      const sets = mix ? [[mix.from, clamp(1 - 2 * mix.r, 0, 1)], [ticks, clamp(2 * mix.r - 1, 0, 1)]] : [[ticks, 1]];
      const seen = new Set();
      const both = mix ? new Set(mix.from.filter((t) => ticks.some((u) => Math.abs(u - t) < 1e-12)).map((t) => t.toFixed(4))) : new Set();
      for (const [list, a] of sets) {
        const d = decimals(list);
        for (const t of list) {
          const kk = t.toFixed(4), op = both.has(kk) ? 1 : a;
          if (op <= 0.001 || seen.has(kk)) continue;
          seen.add(kk);
          const y = sy(t);
          if (y < -0.5 || y > H + 0.5) continue;
          el("line", { x1: 0, x2: W, y1: y, y2: y, opacity: op < 1 ? op.toFixed(3) : null }, K.grid);
          el("text", { x: -8, y: y + 4, "text-anchor": "end", opacity: op < 1 ? op.toFixed(3) : null }, K.yt).textContent = t.toFixed(Math.max(2, d));
        }
      }
      for (const s of S) {
        const L = K.lines[s.id];
        const pts = E.x.map((x, i) => [sx(x), sy(s.kl[i])]);
        L.path.setAttribute("d", pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + "," + p[1].toFixed(2)).join(""));
        L.dots.forEach((c, i) => { c.setAttribute("cx", pts[i][0].toFixed(2)); c.setAttribute("cy", pts[i][1].toFixed(2)); });
      }
    }
    function applyFocus() {
      if (!K) return;
      for (const s of S) {
        const L = K.lines[s.id];
        const vis = on.has(s.id);
        L.grp.style.opacity = !vis ? 0 : !st.focus || st.focus === s.id ? 1 : 0.28;
      }
    }
    function setFocus(idv) { st.focus = idv; applyFocus(); if (st.hover != null) hover(null, null, st.hover, true); }
    function rescale() {
      const d = domain(), from = { ylim, ticks: yticks }, my = ++tok;
      applyFocus();
      if (!K || reduce || !revealed) { ylim = d.ylim; yticks = d.ticks; paint(ylim, yticks, null); describe(); if (st.hover != null) hover(null, null, st.hover, true); return; }
      V.tween(560, (t) => {
        if (my !== tok) return;
        const r = 1 - Math.cbrt(1 - t);
        ylim = [0, lerp(from.ylim[1], d.ylim[1], t)];
        paint(ylim, d.ticks, { from: from.ticks, r });
        if (st.hover != null) hover(null, null, st.hover, true);
      }, () => { if (my === tok) { ylim = d.ylim; yticks = d.ticks; paint(ylim, yticks, null); if (st.hover != null) hover(null, null, st.hover, true); } });
      describe();
    }
    function hover(px, py, forceI, keepFocus) {
      if (!K || !revealed) return;
      const { H, sx, sy } = K;
      const i = forceI != null ? forceI : clamp(Math.round(sx.invert(px)) - 1, 0, E.x.length - 1);
      st.hover = i;
      const x = sx(E.x[i]);
      K.band.setAttribute("x", (x - K.band.getAttribute("width") / 2).toFixed(2));
      K.band.style.opacity = 1;
      const vis = S.filter((s) => on.has(s.id));
      if (py != null && !keepFocus) {
        let best = null;
        for (const s of vis) { const d = Math.abs(sy(s.kl[i]) - py); if (d < 16 && (!best || d < best.d)) best = { id: s.id, d }; }
        st.focus = best ? best.id : null;
        applyFocus();
      }
      K.hov.textContent = "";
      el("line", { class: "ia-xh", x1: x, x2: x, y1: 0, y2: H }, K.hov);
      for (const s of vis) {
        el("circle", { class: "ia-hd", cx: x, cy: sy(s.kl[i]), r: s.q ? 5 : 4.2, fill: COL[s.key], opacity: !st.focus || st.focus === s.id ? 1 : 0.3 }, K.hov);
      }
      const rows = vis.slice().sort((a, b) => b.kl[i] - a.kl[i]).map((s) => ({ label: s.label, color: COL[s.key], dashed: s.dashed, value: fmtKL(s.kl[i]), q: s.q, hot: st.focus === s.id }));
      const top = vis.reduce((a, s) => Math.min(a, sy(s.kl[i])), H);
      tip.show(K.m.l + x, K.m.t + (py != null ? py : top), tipHTML(`decile ${E.x[i]} · KL to FP-SFT`, rows));
    }
    function unhover() {
      st.hover = null;
      if (K) { K.hov.textContent = ""; K.band.style.opacity = 0; }
      tip.hide();
      const ae = document.activeElement;
      if (st.focus && !(ae && ae.closest && ae.closest(".ia-chip"))) { st.focus = null; applyFocus(); }
    }
    plot.addEventListener("keydown", (e) => {
      const n = E.x.length;
      let i = st.hover == null ? 0 : st.hover;
      if (e.key === "ArrowRight") i = Math.min(n - 1, i + 1);
      else if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault();
      hover(null, null, i);
    });
    plot.addEventListener("focus", () => { if (plot.matches(":focus-visible")) hover(null, null, st.hover == null ? 0 : st.hover); });
    plot.addEventListener("blur", unhover);
    outsideTap(root, unhover);
    function describe() {
      const vis = S.filter((s) => on.has(s.id));
      srTable(sr, `${figName(root)} · KL to FP-SFT by trace decile · MATH-500 · ${E.n_traces} traces`, ["decile"].concat(vis.map((s) => s.label)),
        E.x.map((x, i) => [String(x)].concat(vis.map((s) => fmtKL(s.kl[i])))));
      if (K) K.svg.setAttribute("aria-label", `${figName(root)} · forward KL to FP-SFT by decile of the reasoning trace · ${vis.map((s) => s.label).join(", ")}`);
    }
    function sweep() {
      const my = ++tok;
      if (!K || reduce) { if (K) K.rv.setAttribute("width", K.W + 20); return; }
      K.rv.setAttribute("width", 0);
      V.tween(1200, (t) => { if (my === tok && K) K.rv.setAttribute("width", t * (K.W + 20)); });
    }
    function finish() {
      ++tok; revealed = true; unhover();
      const d = domain(); ylim = d.ylim; yticks = d.ticks;
      if (K) { paint(ylim, yticks, null); K.rv.setAttribute("width", K.W + 20); }
    }

    const R = V.responsive(plot, build);
    whenFonts(() => R.redraw());
    V.onVisible(root, () => { if (revealed) return; revealed = true; sweep(); }, { threshold: 0.3 });
    return finish;
  }

  // ================================================================ boot
  // Each figure fetches + draws only once it comes within 800px of the viewport.
  // Printing first mounts anything still pending, then forces every figure to its final drawn state.
  const pending = [], finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "ia-fail", "data-label": "" }, node, "— data unavailable —");
  }
  function mount(id, fn) {
    const node = document.getElementById(id);
    if (!node) return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      V.json(DATA)
        .then((d) => {
          node.textContent = "";
          const fin = fn(node, d);
          if (fin) { finals.push(fin); if (printing) fin(); }
        })
        .catch((err) => { if (window.console) console.error("[ix-adapt] " + id, err); fail(node); });
    };
    pending.push(start);
    V.onVisible(node, start, { rootMargin: "800px", threshold: 0 });
  }
  window.addEventListener("beforeprint", () => {
    printing = true;
    pending.forEach((s) => s());
    finals.forEach((f) => f());
  });
  window.addEventListener("afterprint", () => { printing = false; });
  function prefetch() {
    const go = () => V.json(DATA).catch(() => {});
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1500);
  }
  if (document.readyState === "complete") prefetch();
  else window.addEventListener("load", prefetch, { once: true });
  function boot() {
    mount("ix-fig30", fig30);
    mount("ix-fig31", fig31);
    mount("ix-fig32", fig32);
    mount("ix-fig33", fig33);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
