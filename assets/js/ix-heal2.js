/* ix-heal2.js — interactive version of a healing-appendix figure of arXiv 2608.13966v2.
   Mount:  #ix-fig22 (Figure 22, per-task INT2 accuracy / full precision, radar).
   Data:   assets/data/ix-heal2.json, written by tools/extract_ix_heal2.py from the paper's own figure code.
   Renders data labels and numbers only (no prose). Needs window.Viz (viz.js). */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const DATA = SRC ? new URL("../data/ix-heal2.json", SRC).href : "assets/data/ix-heal2.json";
  const el = V.el, h = V.h;
  const reduce = V.reducedMotion;
  const ROSE = "#D1495B";
  const FPR = "#8A8D92";   // full-precision reference ring (dashed gray; the paper draws it black dashed)
  // house method colors
  const COLOR = { quasar: ROSE, standard_qat: "#3F4245", denoising_qat: "#8E6C9A", bitdistiller: "#C98A2B" };

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const colorOf = (m) => COLOR[m.key] || m.color || "#888";
  let ctx2d = null;
  function textW(s, font) {
    if (!ctx2d) ctx2d = document.createElement("canvas").getContext("2d");
    ctx2d.font = font;
    return ctx2d.measureText(s).width;
  }
  const FONT12 = '500 12px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  function whenFonts(cb) { if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(cb); }
  function srTable(node, head, rows) {
    node.innerHTML = "<thead><tr>" + head.map((x) => "<th>" + esc(x) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((x, i) => (i ? "<td>" : '<th scope="row">') + esc(x) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody>";
  }
  function kickerName(root) {
    const card = root.closest(".viz"), k = card && card.querySelector(".viz-kicker");
    return k ? k.textContent.split("·")[0].trim() : "";
  }
  function plotAria(plot, root) {
    const name = kickerName(root);
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-label", (name ? name + " chart" : "Chart") + " (arrow keys)");  // < 6 words: not prose
  }
  // close a touch tooltip when tapping elsewhere
  function outsideTap(node, fn) {
    document.addEventListener("pointerdown", (e) => { if (!node.contains(e.target)) fn(); }, { passive: true });
  }
  // Pointer input on a chart overlay. Mouse (and a hovering pen) tracks the pointer. Touch acts only on a tap
  // (< 10 px of travel); a swipe stays a page scroll, and the pointercancel the browser sends when it takes
  // the gesture over clears the hover state.
  function bindPointer(ov, move, off) {
    let t0 = null;
    ov.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") { move(e); return; }
      t0 = [e.clientX, e.clientY];
    });
    ov.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || (e.pointerType === "pen" && !t0)) move(e);
    });
    ov.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse" && t0 && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 10) move(e);
      t0 = null;
    });
    ov.addEventListener("pointercancel", () => { t0 = null; off(); });
    ov.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") off(); });
  }
  function swatchSVG(color, opts) {
    opts = opts || {};
    const w = opts.q ? 3 : 2;
    const dash = opts.dash ? ' stroke-dasharray="4 3"' : "";
    return '<svg viewBox="0 0 18 10" aria-hidden="true"><line x1="1.5" x2="16.5" y1="5" y2="5" stroke="' + color +
      '" stroke-width="' + w + '" stroke-linecap="' + (opts.dash ? "butt" : "round") + '"' + dash + "/></svg>";
  }
  // method chips: legend that doubles as visibility toggles (QUASAR and references are fixed) + hover highlight
  function chipRow(parent, items, on, onToggle, onHi, label) {
    const row = h("div", { class: "ih2-chips", role: "group", "aria-label": label || "methods", "data-label": "" }, parent);
    for (const it of items) {
      const fixed = !!it.fixed;
      const b = h(fixed ? "span" : "button", fixed ? { class: "ih2-chip fixed" + (it.q ? " q" : "") } :
        { class: "ih2-chip" + (it.q ? " q" : ""), type: "button", "aria-pressed": String(on[it.key] !== false) }, row,
        swatchSVG(it.color, it) + "<span>" + esc(it.label) + "</span>");
      if (!fixed) b.addEventListener("click", () => { on[it.key] = !on[it.key]; b.setAttribute("aria-pressed", String(on[it.key])); onToggle(it.key); });
      if (onHi && !it.noHi) {
        b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") onHi(it.key); });
        b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") onHi(null); });
        b.addEventListener("focus", () => { if (b.matches(":focus-visible")) onHi(it.key); });
        b.addEventListener("blur", () => onHi(null));
      }
    }
    return row;
  }
  // tooltip: one row per series, two value columns (cols = their heads)
  function tipRows(head, rows, cols) {
    let s = '<div class="tt">' + head + "</div>";
    s += '<div class="ih2-row hd"><span></span><span>' + cols[0] + "</span><span>" + cols[1] + "</span></div>";
    for (const r of rows) {
      const k = r.dash ? '<i class="ih2-k dash"></i>' : '<i class="ih2-k" style="background:' + r.color + '"></i>';
      s += '<div class="ih2-row' + (r.q ? " q" : "") + (r.ref ? " ref" : "") + '"><span class="ih2-n">' + k + esc(r.label) + "</span>" +
        '<span class="ih2-v2">' + esc(r.v2) + "</span><b>" + esc(r.value) + "</b></div>";
    }
    return s;
  }

  // ================================================================ Figure 22: per-task radar (INT2)
  function radarChart(root, D) {
    root.classList.add("ih2");
    const M = {};
    D.methods.forEach((m) => (M[m.key] = m));
    const draw = ["standard_qat", "denoising_qat", "bitdistiller", "quasar"].filter((k) => M[k]);
    const on = {}, grow = {};
    draw.forEach((k) => { on[k] = true; grow[k] = 0; });
    let fpGrow = 0, revealed = false, tok = {};
    const st = { spoke: null, panel: null, hi: null };
    const items = [{ key: "quasar", label: M.quasar.label, color: ROSE, q: true, fixed: true }]
      .concat(draw.filter((k) => k !== "quasar").map((k) => ({ key: k, label: M[k].label, color: colorOf(M[k]) })))
      .concat([{ key: "fp", label: D.fp_label, color: FPR, dash: true, fixed: true, noHi: true }]);
    chipRow(root, items, on, toggle, (k) => { st.hi = k; paintAll(); }, "methods");
    const grid = h("div", { class: "ih2-radars" }, root);
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    srTable(sr, ["model", "method"].concat(D.models[0].benchmarks),
      [].concat(...D.models.map((m) => draw.slice().reverse().map((k) => [m.name, M[k].label].concat(m.ratio[k].map((v, i) => v.toFixed(2) + " (" + m.acc[k][i].toFixed(1) + ")"))))));
    const panels = D.models.map((m, pi) => {
      const box = h("div", { class: "ih2-rp" }, grid);
      h("div", { class: "ih2-rt", "data-label": "" }, box, esc(m.name));
      const plot = h("div", { class: "ih2-plot", tabindex: "0" }, box);
      plotAria(plot, root);
      const P = { m, pi, box, plot, tip: V.tooltip(plot), sk: null };
      plot.addEventListener("keydown", (e) => {
        const n = m.benchmarks.length;
        let i = st.spoke == null ? 0 : st.spoke;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") i = st.spoke == null ? 0 : (i + 1) % n;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") i = st.spoke == null ? n - 1 : (i + n - 1) % n;
        else if (e.key === "Home") i = 0;
        else if (e.key === "End") i = n - 1;
        else if (e.key === "Escape") { spokeOff(); return; }
        else return;
        e.preventDefault();
        spokeOn(P, i);
      });
      plot.addEventListener("focus", () => { if (plot.matches(":focus-visible") && st.spoke == null) spokeOn(P, 0); });
      plot.addEventListener("blur", spokeOff);
      outsideTap(plot, () => { if (st.panel === P) spokeOff(); });
      return P;
    });

    function layout() {
      const w = grid.clientWidth;
      grid.classList.toggle("stack", w < 640);
    }
    function build(P, w) {
      const m = P.m, n = m.benchmarks.length;
      const ang = (i) => (i * 2 * Math.PI) / n;
      const gap = 9, allow = w < 440 ? 12 : 0;
      let R = Math.min(138, w / 2 - 24);
      m.benchmarks.forEach((b, i) => {
        const s = Math.abs(Math.sin(ang(i)));
        if (s > 0.2) R = Math.min(R, (w / 2 - textW(b, FONT12) - 3 + allow) / s - gap);
      });
      R = Math.max(56, Math.floor(R));
      const top = 24, height = top + 2 * R + 30;
      const fr = V.frame(P.plot, w, height, { t: 0, r: 0, b: 0, l: 0 });
      const { svg, g } = fr;
      svg.setAttribute("aria-label", m.name + " · INT2 ÷ " + D.fp_label);
      const cx = w / 2, cy = top + R, rs = R / D.rmax;
      const pt = (i, r) => [cx + r * rs * Math.sin(ang(i)), cy - r * rs * Math.cos(ang(i))];
      const gGrid = el("g", null, g);
      for (const r of D.rings) el("circle", { cx, cy, r: r * rs, fill: "none", class: "ih2-gridl" }, gGrid);
      el("circle", { cx, cy, r: R, fill: "none", stroke: "#cfccc5", "stroke-width": 1 }, gGrid);
      const spokes = m.benchmarks.map((b, i) => {
        const [x, y] = pt(i, D.rmax);
        return el("line", { x1: cx, y1: cy, x2: x, y2: y, class: "ih2-gridl" }, gGrid);
      });
      const gFP = el("path", { fill: "none", stroke: FPR, "stroke-width": 1.5, "stroke-dasharray": "5 4", "stroke-linejoin": "round" }, g);
      gFP.setAttribute("d", m.benchmarks.map((b, i) => (i ? "L" : "M") + pt(i, 1).map((v) => v.toFixed(2)).join(",")).join("") + "Z");
      const polys = {};
      for (const k of draw) {
        const q = k === "quasar", c = colorOf(M[k]);
        polys[k] = el("path", { class: "ih2-poly", fill: q ? c : "none", "fill-opacity": q ? 0.13 : 0, stroke: c, "stroke-width": q ? 2.6 : 1.6, "stroke-linejoin": "round" }, g);
      }
      // ring labels between the first two spokes (paper: 0.5 / 0.75 / 1.0), above the series lines: a white halo
      // plus a light backing plate, so no line shows through between the glyphs
      const ringLab = el("g", { "pointer-events": "none" }, g);
      const a0 = Math.PI / n;
      D.rings.forEach((r, j) => {
        const lab = D.ring_labels[j];
        if (!lab || (R < 100 && r !== 0.5 && r !== 1)) return;  // small radars: 0.5 and 1.0 only
        const plate = el("rect", { class: "ih2-tickbg", rx: 3 }, ringLab);
        const t = el("text", { x: cx + r * rs * Math.sin(a0) + 2, y: cy - r * rs * Math.cos(a0) + 4, class: "ih2-tick ih2-halo" }, ringLab);
        t.textContent = lab;
        const b = t.getBBox();
        if (b.width) { plate.setAttribute("x", b.x - 2); plate.setAttribute("y", b.y); plate.setAttribute("width", b.width + 4); plate.setAttribute("height", b.height); }
        else plate.remove();
      });
      const labs = m.benchmarks.map((b, i) => {
        const a = ang(i), s = Math.sin(a), c = Math.cos(a);
        const x = cx + (R + gap) * s, y = cy - (R + gap) * c + 4 - 6 * c;
        const t = el("text", { x, y, "text-anchor": Math.abs(s) < 0.2 ? "middle" : s > 0 ? "start" : "end", class: "ih2-lab ih2-blab" }, g);
        t.textContent = b;
        return t;
      });
      const gHi = el("g", { "pointer-events": "none" }, g);
      const ov = el("rect", { x: 0, y: 0, width: w, height, fill: "transparent", class: "ih2-ov" }, g);
      P.sk = { svg, w, height, cx, cy, R, rs, pt, polys, gFP, spokes, labs, gHi, ov, ringLab, n };
      bindPointer(ov, (e) => {
        const r = ov.getBoundingClientRect();
        const x = e.clientX - r.left - cx, y = e.clientY - r.top - cy;
        let a = Math.atan2(x, -y);
        if (a < 0) a += 2 * Math.PI;
        const i = Math.round(a / ((2 * Math.PI) / n)) % n;
        if (st.spoke !== i || st.panel !== P) spokeOn(P, i);
      }, () => spokeOff());
      paint(P);
      if (st.spoke != null) paintSpoke(P);
    }
    function paint(P) {
      const k0 = P.sk;
      if (!k0) return;
      const m = P.m;
      for (const k of draw) {
        const p = k0.polys[k], gr = grow[k];
        if (gr <= 0.001) { p.setAttribute("display", "none"); continue; }
        p.removeAttribute("display");
        p.setAttribute("d", m.ratio[k].map((r, i) => (i ? "L" : "M") + k0.pt(i, r * gr).map((v) => v.toFixed(2)).join(",")).join("") + "Z");
        const dim = st.hi && st.hi !== k;
        p.style.opacity = dim ? 0.16 : 1;
        if (k !== "quasar") {
          p.setAttribute("stroke-width", st.hi === k ? 2.6 : 1.6);
          p.setAttribute("fill", st.hi === k ? colorOf(M[k]) : "none");
          p.setAttribute("fill-opacity", st.hi === k ? 0.1 : 0);
        } else p.setAttribute("fill-opacity", st.hi && st.hi !== k ? 0.05 : 0.13);
      }
      k0.gFP.style.opacity = fpGrow;
    }
    function paintSpoke(P) {
      const k0 = P.sk;
      if (!k0) return;
      k0.gHi.textContent = "";
      k0.labs.forEach((t, i) => t.classList.toggle("on", i === st.spoke));
      if (st.spoke == null) return;
      const i = st.spoke, m = P.m;
      const [x1, y1] = k0.pt(i, D.rmax);
      el("line", { x1: k0.cx, y1: k0.cy, x2: x1, y2: y1, stroke: "#8a8d92", "stroke-width": 1, "stroke-dasharray": "2 3" }, k0.gHi);
      const [fx, fy] = k0.pt(i, 1);
      el("circle", { cx: fx, cy: fy, r: 3.6, fill: FPR, class: "ih2-hd" }, k0.gHi);
      for (const k of draw) {
        if (!on[k] || grow[k] < 0.99) continue;
        const [x, y] = k0.pt(i, m.ratio[k][i]);
        el("circle", { cx: x, cy: y, r: k === "quasar" ? 4.6 : 3.6, fill: colorOf(M[k]), class: "ih2-hd" }, k0.gHi);
      }
    }
    function spokeOn(P, i) {
      st.spoke = i; st.panel = P;
      panels.forEach(paintSpoke);
      const k0 = P.sk, m = P.m;
      if (!k0) return;
      const rows = draw.filter((k) => on[k]).map((k) => ({ label: M[k].label, color: colorOf(M[k]), q: k === "quasar", r: m.ratio[k][i], value: m.ratio[k][i].toFixed(2), v2: m.acc[k][i].toFixed(1) }))
        .sort((a, b) => b.r - a.r);
      rows.push({ label: D.fp_label, dash: true, ref: true, value: "1.00", v2: m.fp_acc[i].toFixed(1) });
      const html = tipRows(esc(m.benchmarks[i]), rows, ["acc. %", "÷ " + esc(D.fp_label)]);
      // the tooltip sits on the side of the radar away from the active spoke (stacked phones: above or below it)
      const [ax, ay] = k0.pt(i, 1);
      P.tip.show(ax, ay, html);
      const t = P.tip.node, tw = t.offsetWidth, th = t.offsetHeight, s = Math.sin((i * 2 * Math.PI) / k0.n), c = Math.cos((i * 2 * Math.PI) / k0.n);
      let left, top;
      if (k0.w < 2 * tw - 24) {
        left = k0.cx - tw / 2;
        top = c > 0.2 ? k0.cy + k0.R * 0.18 : c < -0.2 ? k0.cy - k0.R * 0.18 - th : k0.cy + 16;
      } else {
        left = s > 0.2 ? k0.cx - k0.R * 0.3 - tw : s < -0.2 ? k0.cx + k0.R * 0.3 : k0.cx + k0.R * 0.42;
        top = k0.cy - th / 2 + (Math.abs(s) <= 0.2 ? (c > 0 ? 18 : -18) : 0);
      }
      t.style.left = clamp(left, 4, k0.w - tw - 4) + "px";
      t.style.top = clamp(top, 2, k0.height - th - 2) + "px";
      panels.forEach((Q) => { if (Q !== P) Q.tip.hide(); });
    }
    function spokeOff() {
      if (st.spoke == null) return;
      st.spoke = null; st.panel = null;
      panels.forEach((P) => { paintSpoke(P); P.tip.hide(); });
    }
    function paintAll() { panels.forEach(paint); panels.forEach(paintSpoke); }
    function animate(k, to, ms, delay) {
      const my = (tok[k] = (tok[k] || 0) + 1), from = grow[k];
      const run = () => V.tween(ms, (t) => { if (tok[k] !== my) return; grow[k] = from + (to - from) * t; panels.forEach(paint); }, () => {
        if (tok[k] !== my) return;
        grow[k] = to; paintAll();
      });
      if (delay && !reduce) setTimeout(run, delay); else run();
    }
    function toggle(k) {
      if (st.spoke != null && st.panel) spokeOn(st.panel, st.spoke);
      animate(k, on[k] ? 1 : 0, 420, 0);
      if (!on[k] && st.hi === k) st.hi = null;
    }
    panels.forEach((P) => V.responsive(P.plot, (w) => { layout(); build(P, w); }));
    whenFonts(() => panels.forEach((P) => { if (P.sk) build(P, Math.round(P.plot.clientWidth)); }));
    V.onVisible(root, () => {
      if (revealed) return;
      revealed = true;
      if (reduce) { draw.forEach((k) => (grow[k] = 1)); fpGrow = 1; paintAll(); return; }
      V.tween(500, (t) => { fpGrow = t; panels.forEach(paint); });
      draw.forEach((k) => animate(k, 1, 900, k === "quasar" ? 380 : 120));
    }, { threshold: 0.3 });
    return function finish() {
      revealed = true;
      draw.forEach((k) => { tok[k] = (tok[k] || 0) + 1; grow[k] = on[k] ? 1 : 0; });
      fpGrow = 1; st.hi = null;
      spokeOff();
      paintAll();
    };
  }

  // ================================================================ boot
  // Each chart fetches + draws only once it comes within 800px of the viewport.
  // Printing first mounts anything still pending, then forces every chart to its final drawn state.
  const pending = [], finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "ih2-fail", "data-label": "" }, node, "— data unavailable —");
  }
  function mount(id, key, fn) {
    const node = document.getElementById(id);
    if (!node) return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      V.json(DATA)
        .then((d) => {
          if (!d || !d[key]) throw new Error("missing " + key);
          node.style.minHeight = "";
          const fin = fn(node, d[key]);
          if (fin) { finals.push(fin); if (printing) fin(); }
        })
        .catch((err) => { if (window.console) console.error("[ix-heal2] " + id, err); fail(node); });
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
    mount("ix-fig22", "fig22", radarChart);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
