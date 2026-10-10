/* ix-theory1.js — interactive appendix theory scatters for the QUASAR page.
   Mounts: #ix-fig10 (Fig. 10), #ix-fig14 (Fig. 14), #ix-fig15 (Fig. 15).
   Data:   assets/data/ix-theory1.json (tools/extract_ix_theory1.py) — every number comes from there.
   Renders labels and numbers only (no prose). Needs window.Viz (viz.js). */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const DATA = SRC ? new URL("../data/ix-theory1.json", SRC).href : "assets/data/ix-theory1.json";
  const el = V.el, h = V.h, reduce = V.reducedMotion;
  const ROSE = "#D1495B", INK2 = "#44484f", MUTED = "#6B6F75", STEEL = "#2E6F95", GRAY = "#5A5D60", FITC = "#8f9297";
  const SHAPE = { INT4: "circle", INT3: "triangle", INT2: "square" };
  let UID = 0;

  // ---------------------------------------------------------------- formatting
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const pow10 = (e) => "10" + String(e).split("").map((c) => SUP[c]).join("");
  function sci(v, sig) {
    let e = Math.floor(Math.log10(v) + 1e-9);
    let m = +(v / Math.pow(10, e)).toPrecision(sig);
    if (m >= 10) { m = +(m / 10).toPrecision(sig); e += 1; }
    return m === 1 && sig === 1 ? pow10(e) : (sig > 1 ? m.toFixed(sig - 1) : m) + "·" + pow10(e);
  }
  const tick = (v) => sci(v, 1);
  const kl = (v) => (v >= 1 ? v.toFixed(2) : v.toFixed(3));
  const big = (v) => (v >= 1000 ? Math.round(v).toLocaleString("en-US") : String(+v.toPrecision(3)));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const M = (s) => '<span class="t1-m">' + s + "</span>";
  const S_T = M("Ŝ") + "<sub>T</sub>";
  const S_R = M("Ŝ") + "(" + M("r") + ")";
  const MISMATCH = "‖∇" + M("L") + "(" + M("r") + ") − ∇" + M("L") + "(" + M("w") + ")‖²";

  // tooltip markup: head (+ optional swatch / sub-line), then label → value rows
  function tipHTML(head, rows, o) {
    o = o || {};
    let s = '<div class="tt">' + (o.color ? '<i class="t1-k" style="background:' + o.color + '"></i>' : "") +
      (o.q ? '<span class="t1-tq">' + head + "</span>" : head) + (o.sub ? '<span class="t1-sm">' + o.sub + "</span>" : "") + "</div>";
    for (const r of rows) s += '<div class="row t1-row"><span class="t1-n">' + r[0] + "</span><b>" + esc(r[1]) + "</b></div>";
    return s;
  }

  // marker centred on (0,0); shapes match the page's other theory scatters (INT4 ○, INT3 △, INT2 □, search ★)
  function marker(g, shape, r, fill, extra) {
    let n;
    if (shape === "square") n = el("rect", { x: -r * 0.88, y: -r * 0.88, width: r * 1.76, height: r * 1.76, rx: 1.4 }, g);
    else if (shape === "triangle") {
      const a = r * 1.32;
      n = el("path", { d: `M0,${-a}L${a * 0.92},${a * 0.6}L${-a * 0.92},${a * 0.6}Z`, "stroke-linejoin": "round" }, g);
    } else if (shape === "star") {
      const R = r * 1.7, ri = R * 0.46;
      let d = "";
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? ri : R, a = -Math.PI / 2 + (i * Math.PI) / 5;
        d += (i ? "L" : "M") + (rr * Math.cos(a)).toFixed(2) + "," + (rr * Math.sin(a)).toFixed(2);
      }
      n = el("path", { d: d + "Z", "stroke-linejoin": "round" }, g);
    } else n = el("circle", { cx: 0, cy: 0, r }, g);
    n.setAttribute("fill", fill);
    if (extra) for (const k in extra) n.setAttribute(k, extra[k]);
    return n;
  }
  function glyph(parent, items) {  // small inline svg key: items [{shape, color, dash}]
    const w = items.length > 1 ? 14 * items.length : 18;
    const s = el("svg", { viewBox: `0 0 ${w} 12`, width: w, height: 12, "aria-hidden": "true" }, parent);
    s.style.width = w + "px";
    items.forEach((it, i) => {
      const cx = items.length > 1 ? 7 + 14 * i : 9;
      if (it.dash) el("line", { x1: 1, x2: 17, y1: 6, y2: 6, stroke: it.color, "stroke-width": 1.4, "stroke-dasharray": it.dash }, s);
      else marker(el("g", { transform: `translate(${cx},6)` }, s), it.shape, it.r || 3.6, it.color);
    });
    return s;
  }
  // SVG text made of plain + math runs: parts [[text, cls?, dy?]]
  function rich(t, parts) {
    for (const p of parts) {
      const ts = el("tspan", p[1] ? { class: p[1] } : null, t);
      if (p[2]) ts.setAttribute("dy", p[2]);
      ts.textContent = p[0];
    }
    return t;
  }
  function srTable(node, head, rows) {
    node.innerHTML = "<thead><tr>" + head.map((x) => "<th>" + esc(x) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((x, i) => (i ? "<td>" : '<th scope="row">') + esc(x) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody>";
  }
  function plotAria(plot, root) {
    const card = root.closest(".viz"), kick = card && card.querySelector(".viz-kicker");
    const name = kick ? kick.textContent.split("·")[0].trim() : "";
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-label", (name ? name + " chart" : "Chart") + ", use left and right arrow keys to step through points");
  }
  function outsideTap(node, fn) {
    document.addEventListener("pointerdown", (e) => { if (!node.contains(e.target)) fn(); }, { passive: true });
  }
  // Pointer input on a scatter overlay: a mouse (or hovering pen) tracks the pointer; touch shows values only
  // on a tap (< 10 px of travel). A vertical swipe stays a page scroll; its pointercancel clears the tooltip.
  function bindPoints(ov, move, off) {
    let t0 = null;
    ov.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") move(e); else t0 = [e.clientX, e.clientY]; });
    ov.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || (e.pointerType === "pen" && !t0)) move(e); });
    ov.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse" && t0 && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 10) move(e);
      t0 = null;
    });
    ov.addEventListener("pointercancel", () => { t0 = null; off(); });
    ov.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") off(); });
  }
  function nearest(nodes, x, y, rad, ok) {
    let b = -1, bd = rad * rad;
    nodes.forEach((n, i) => { if (ok && !ok(n)) return; const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; b = i; } });
    return b;
  }
  function fadeTo(nodes, o, ms, delay) {
    for (const n of nodes) {
      if (!n) continue;
      n.style.transition = reduce || !ms ? "none" : `opacity ${ms}ms ease ${delay || 0}ms`;
      n.style.opacity = o;
    }
  }
  function whenFonts(cb) { if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(cb); }
  function drawFit(p, ms) {
    p.style.opacity = 1;
    if (reduce || !p.getTotalLength) return;
    const L = p.getTotalLength();
    p.style.strokeDasharray = L + " " + L; p.style.strokeDashoffset = L;
    p.getBoundingClientRect();
    p.style.transition = `stroke-dashoffset ${ms}ms cubic-bezier(.3,.6,.2,1)`;
    p.style.strokeDashoffset = 0;
    setTimeout(() => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; p.style.transition = ""; }, ms + 60);
  }
  function settleFit(p) { p.style.transition = "none"; p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; p.style.opacity = 1; }
  // log-log axes with tick labels, grid lines and titles. o: {xt, yt, xtitle:[parts], ytitle:[parts], yLabels}
  function axes(g, sx, sy, W, H, m, o) {
    const gr = el("g", { class: "grid" }, g);
    const ay = el("g", { class: "axis" }, g);
    for (const t of o.yt) {
      const y = sy(t);
      el("line", { x1: 0, x2: W, y1: y, y2: y }, gr);
      if (o.yLabels !== false) el("text", { x: -8, y: y + 4, "text-anchor": "end" }, ay).textContent = (o.yfmt || tick)(t);
    }
    const ax = el("g", { class: "axis", transform: `translate(0,${H})` }, g);
    el("line", { x1: 0, x2: W, y1: 0, y2: 0 }, ax);
    for (const t of o.xt) {
      const x = sx(t);
      el("line", { x1: x, x2: x, y1: 0, y2: 4 }, ax);
      el("text", { x, y: 17, "text-anchor": "middle" }, ax).textContent = tick(t);
    }
    if (o.xtitle) rich(el("text", { class: "axis-title", x: W / 2, y: 37, "text-anchor": "middle" }, ax), o.xtitle);
    if (o.ytitle) rich(el("text", { class: "axis-title", x: -m.l, y: o.ytitleY || -17 }, g), o.ytitle);
  }

  // ---------------------------------------------------------------- stepped slider (role=slider)
  // o: {label: html, aria, stops: [{label, pos 0..1, text}], index, onChange(i)}
  function stepSlider(parent, o) {
    const wrap = h("div", { class: "t1-ctl t1-ctl-sl" }, parent);
    h("span", { class: "lab", "aria-hidden": "true" }, wrap, o.label);
    const n = o.stops.length;
    const sl = h("div", { class: "t1-sl", role: "slider", tabindex: "0", "aria-label": o.aria, "aria-valuemin": 0, "aria-valuemax": n - 1 }, wrap);
    const rail = h("div", { class: "t1-sl-rail" }, sl);
    o.stops.forEach((s) => { const t = h("div", { class: "t1-sl-tick" }, rail); t.style.left = s.pos * 100 + "%"; });
    const knob = h("div", { class: "t1-sl-knob" }, rail);
    const labs = h("div", { class: "t1-sl-labs", "aria-hidden": "true" }, sl);
    const spans = o.stops.map((s) => { const sp = h("span", null, labs, esc(s.label)); sp.style.left = s.pos * 100 + "%"; return sp; });
    let cur = -1;
    const api = {
      node: sl,
      get: () => cur,
      set(i, fire) {
        i = clamp(i, 0, n - 1);
        const changed = i !== cur;
        cur = i;
        knob.style.left = o.stops[i].pos * 100 + "%";
        spans.forEach((sp, j) => sp.classList.toggle("on", j === i));
        sl.setAttribute("aria-valuenow", i);
        sl.setAttribute("aria-valuetext", o.stops[i].text || o.stops[i].label);
        if (fire && changed) o.onChange(i);
      },
    };
    const at = (e) => {
      const r = rail.getBoundingClientRect(), f = (e.clientX - r.left) / Math.max(1, r.width);
      let b = 0;
      o.stops.forEach((s, j) => { if (Math.abs(s.pos - f) < Math.abs(o.stops[b].pos - f)) b = j; });
      return b;
    };
    // mouse: press + drag; touch/pen: a tap, or a drag that starts horizontal (vertical swipes scroll the page)
    let t0 = null, drag = false, pid = null;
    sl.addEventListener("pointerdown", (e) => {
      pid = e.pointerId;
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        drag = true; sl.classList.add("drag");
        try { sl.setPointerCapture(pid); } catch (_) { /* ignore */ }
        api.set(at(e), true);
      } else { t0 = [e.clientX, e.clientY]; drag = false; }
    });
    sl.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pid) return;
      if (!drag && t0) {
        const dx = e.clientX - t0[0], dy = e.clientY - t0[1];
        if (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy)) {
          drag = true; sl.classList.add("drag");
          try { sl.setPointerCapture(pid); } catch (_) { /* ignore */ }
        }
      }
      if (drag) api.set(at(e), true);
    });
    const end = (e, cancel) => {
      if (e.pointerId !== pid) return;
      if (!cancel && !drag && t0 && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 10) api.set(at(e), true);
      t0 = null; drag = false; pid = null; sl.classList.remove("drag");
    };
    sl.addEventListener("pointerup", (e) => end(e, false));
    sl.addEventListener("pointercancel", (e) => end(e, true));
    sl.addEventListener("keydown", (e) => {
      let i = cur;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") i++;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") i--;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else return;
      e.preventDefault();
      api.set(i, true);
    });
    api.set(o.index, false);
    return api;
  }

  // ================================================================ Fig. 10 — reconstruction error tracks final KL
  function fig10(root, D) {
    const P = D.panels, A = D.axes;
    const COL = { quasar: ROSE, denoising_qat: V.C.denoising_qat, standard_qat: V.C.standard_qat };
    const METHODS = ["quasar", "denoising_qat", "standard_qat"];
    const LABEL = {};
    P[0].points.forEach((p) => (LABEL[p.key] = p.method));
    const ORDER = ["denoising_qat", "standard_qat", "quasar"];  // draw order as in the paper: Standard QAT over Denoising QAT, QUASAR on top
    const id = (p) => p.key + "|" + p.bits;
    const ids = P[0].points.map(id).sort((a, b) => ORDER.indexOf(a.split("|")[0]) - ORDER.indexOf(b.split("|")[0]));
    const byId = P.map((pan) => { const o = {}; pan.points.forEach((p) => (o[id(p)] = p)); return o; });
    const st = { mi: 0, iso: { key: null, bits: null }, prev: null, revealed: false, hov: null };
    let disp = { from: 0, to: 0, t: 1 }, mTok = 0, sk = null;

    root.classList.add("t1");
    const ctl = h("div", { class: "controls t1-controls" }, root);
    const mctl = h("div", { class: "t1-ctl" }, ctl);
    h("span", { class: "lab", "aria-hidden": "true" }, mctl, "model");
    V.pills(mctl, P.map((p, i) => ({ value: String(i), label: esc(p.short) })), "0", (v) => setModel(+v), "model");
    const plot = h("div", { class: "t1-plot", tabindex: "0" }, root);
    plotAria(plot, root);
    const leg = h("div", { class: "t1-legend" }, root);
    const chips = [];
    const gMeth = h("div", { class: "t1-lg", role: "group", "aria-label": "isolate method" }, leg);
    const gBits = h("div", { class: "t1-lg", role: "group", "aria-label": "isolate bit width" }, leg);
    const chip = (kind, value, label, items, q) => {
      const b = h("button", { type: "button", class: "t1-chip" + (q ? " q" : ""), "aria-pressed": "false" }, kind === "key" ? gMeth : gBits);
      glyph(b, items);
      h("span", null, b, esc(label));
      b.addEventListener("click", () => { st.iso[kind] = st.iso[kind] === value ? null : value; st.prev = null; syncChips(); paintIso(); });
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { st.prev = { kind, value }; paintIso(); } });
      b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { st.prev = null; paintIso(); } });
      chips.push({ b, kind, value });
    };
    METHODS.forEach((k) => chip("key", k, LABEL[k], [{ shape: "circle", color: COL[k] }], k === "quasar"));
    ["INT4", "INT3", "INT2"].forEach((b) => chip("bits", b, b, [{ shape: SHAPE[b], color: "#6f7378" }]));
    function syncChips() {
      for (const c of chips) c.b.setAttribute("aria-pressed", String(st.iso[c.kind] === c.value));
      leg.classList.toggle("iso", !!(st.iso.key || st.iso.bits));
    }
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    srTable(sr, ["model", "method", "bits", "final reconstruction error", "final held-out KL"],
      P.flatMap((pan) => pan.points.map((p) => [pan.model, p.method, p.bits, sci(p.ST, 3), kl(p.kl)])));
    const tip = V.tooltip(plot);

    function draw(width) {
      const two = width >= 720, narrow = width < 420;
      ctl.style.display = two ? "none" : "";
      const height = narrow ? 282 : two ? 316 : 304;
      const m = { t: two ? 50 : 30, r: 12, b: 46, l: 46 };
      const fr = V.frame(plot, width, height, m);
      const { svg, g, W, H } = fr;
      svg.setAttribute("aria-label", "final held-out KL against final loss-aware reconstruction error · " +
        (two ? P.map((p) => p.model).join(" and ") : P[st.mi].model));
      const gap = two ? 40 : 0, pw = two ? (W - gap) / 2 : W;
      const panels = [];
      const gAll = el("g", { class: st.revealed ? "t1-in" : "" }, g);
      for (let i = 0; i < (two ? 2 : 1); i++) {
        const ox = i * (pw + gap);
        const gp = el("g", { transform: `translate(${ox},0)` }, gAll);
        const sx = V.log(A.xlim, [0, pw]), sy = V.log(A.ylim, [H, 0]);
        axes(gp, sx, sy, pw, H, m, {
          xt: A.xticks, yt: A.yticks, yfmt: (t) => String(t), yLabels: i === 0,
          xtitle: narrow ? [["reconstruction error "], ["Ŝ", "t1-m"], ["T", "t1-sub", 4]] : [["final loss-aware reconstruction error "], ["Ŝ", "t1-m"], ["T", "t1-sub", 4]],
          ytitle: i === 0 ? [["final held-out KL"]] : null, ytitleY: two ? -34 : -17,
        });
        if (two) el("text", { class: "t1-ptitle", x: pw / 2, y: -12, "text-anchor": "middle" }, gp).textContent = P[i].model;
        const fit = el("path", { class: "t1-fit", stroke: FITC }, gp);
        const r2 = el("text", { class: "t1-ann t1-fade", x: 6, y: 13 }, gp);
        const gPts = el("g", null, gp);
        const nodes = ids.map((k, j) => {
          const p = byId[0][k];
          const gpt = el("g", { class: "t1-pt" }, gPts);
          const shp = marker(gpt, SHAPE[p.bits], narrow ? 5 : 5.4, COL[p.key], { stroke: "#fdfdfd", "stroke-width": 1.5 });
          shp.style.transitionDelay = (reduce ? 0 : 140 + j * 60 + i * 120) + "ms";
          return { k, key: p.key, bits: p.bits, g: gpt, x: 0, y: 0, panel: i };
        });
        const gH = el("g", { "pointer-events": "none" }, gp);
        panels.push({ i, ox, gp, sx, sy, fit, r2, nodes, gH, fixed: two ? i : null });
      }
      const ov = el("rect", { class: "t1-ov", x: -8, y: -8, width: W + 16, height: H + 16, fill: "transparent" }, g);
      sk = { two, narrow, W, H, m, panels, gAll, ov };
      for (const pp of panels) place(pp);
      if (!st.revealed) for (const pp of panels) { pp.fit.style.opacity = 0; fadeTo([pp.r2], 0); }
      paintIso();
      const at = (e) => { const r = ov.getBoundingClientRect(); return [e.clientX - r.left - 8, e.clientY - r.top - 8]; };
      bindPoints(ov, (e) => {
        const [x, y] = at(e);
        const all = panels.flatMap((pp) => pp.nodes.map((n) => ({ n, x: n.x + pp.ox, y: n.y })));
        const b = nearest(all, x, y, 26, (q) => matches(q.n));
        if (b < 0) unhover(); else hover(all[b].n);
      }, unhover);
    }

    // positions for one panel: fixed model (two-panel layout) or the current morph between models
    function place(pp) {
      const a = pp.fixed != null ? pp.fixed : disp.from, b = pp.fixed != null ? pp.fixed : disp.to;
      const t = pp.fixed != null ? 1 : disp.t;
      const ll = (u, v) => Math.pow(10, lerp(Math.log10(u), Math.log10(v), t));
      for (const n of pp.nodes) {
        const p0 = byId[a][n.k], p1 = byId[b][n.k];
        n.x = pp.sx(ll(p0.ST, p1.ST)); n.y = pp.sy(ll(p0.kl, p1.kl));
        n.g.setAttribute("transform", `translate(${n.x.toFixed(2)},${n.y.toFixed(2)})`);
      }
      const end = (pi, j) => { const f = P[pi].fit, x = f.x_range[j]; return [x, Math.pow(10, f.intercept + f.slope * Math.log10(x))]; };
      const e0 = [end(a, 0), end(b, 0)], e1 = [end(a, 1), end(b, 1)];
      const p0 = [ll(e0[0][0], e0[1][0]), ll(e0[0][1], e0[1][1])], p1 = [ll(e1[0][0], e1[1][0]), ll(e1[0][1], e1[1][1])];
      pp.fit.setAttribute("d", `M${pp.sx(p0[0]).toFixed(1)},${pp.sy(p0[1]).toFixed(1)}L${pp.sx(p1[0]).toFixed(1)},${pp.sy(p1[1]).toFixed(1)}`);
      const show = t < 0.5 ? a : b;
      pp.r2.textContent = "";
      rich(pp.r2, [["R", "t1-m"], ["²", null], [" = " + P[show].fit.display.r2]]);
      if (st.revealed && pp.fixed == null && a !== b) pp.r2.style.transition = "none", pp.r2.style.opacity = Math.abs(1 - 2 * t).toFixed(3);
    }
    function matches(n) {
      const f = st.prev ? Object.assign({}, st.iso, { [st.prev.kind]: st.prev.value }) : st.iso;
      return (!f.key || n.key === f.key) && (!f.bits || n.bits === f.bits);
    }
    function paintIso() {
      if (!sk) return;
      for (const pp of sk.panels) for (const n of pp.nodes) n.g.style.opacity = matches(n) ? 1 : 0.14;
      if (st.hov && !matches(st.hov)) unhover();
    }
    function setModel(i) {
      if (i === st.mi) return;
      const from = st.mi;
      st.mi = i;
      unhover();
      if (sk) sk.ov.ownerSVGElement.setAttribute("aria-label", "final held-out KL against final loss-aware reconstruction error · " + P[i].model);
      if (!sk || sk.two || !st.revealed || reduce) { disp = { from: i, to: i, t: 1 }; if (sk) sk.panels.forEach(place); return; }
      const my = ++mTok;
      V.tween(700, (t) => { if (my !== mTok) return; disp = { from, to: i, t }; sk.panels.forEach(place); }, () => {
        if (my !== mTok) return;
        disp = { from: i, to: i, t: 1 }; sk.panels.forEach(place);
        sk.panels.forEach((pp) => { pp.r2.style.opacity = 1; });
      });
    }

    function hover(n) {
      if (!sk || !st.revealed) return;
      st.hov = n;
      const pi = sk.two ? n.panel : disp.to, p = byId[pi][n.k];
      for (const pp of sk.panels) {
        pp.gH.textContent = "";
        const m = pp.nodes.find((q) => q.k === n.k);
        el("circle", { cx: m.x, cy: m.y, r: 10.5, class: m === n ? "t1-ring" : "t1-hring", stroke: COL[n.key] }, pp.gH);
      }
      const pp = sk.panels[n.panel];
      tip.show(sk.m.l + pp.ox + n.x, sk.m.t + n.y, tipHTML(esc(p.method) + " · " + p.bits,
        [[S_T, sci(p.ST, 3)], ["held-out KL", kl(p.kl)]], { color: COL[n.key], q: n.key === "quasar", sub: esc(P[pi].short) }));
    }
    function unhover() { st.hov = null; if (sk) for (const pp of sk.panels) pp.gH.textContent = ""; tip.hide(); }
    plot.addEventListener("keydown", (e) => {
      if (!sk) return;
      const list = sk.panels.flatMap((pp) => pp.nodes.slice().sort((a, b) => a.x - b.x)).filter(matches);
      let j = list.indexOf(st.hov);
      if (e.key === "ArrowRight") j = Math.min(list.length - 1, j + 1);
      else if (e.key === "ArrowLeft") j = j < 0 ? 0 : Math.max(0, j - 1);
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault();
      if (list[j]) hover(list[j]);
    });
    plot.addEventListener("blur", unhover);
    outsideTap(plot, unhover);
    const R = V.responsive(plot, draw);
    whenFonts(() => R.redraw());
    function reveal() {
      if (st.revealed || !sk) return;
      st.revealed = true;
      sk.gAll.classList.add("t1-in");
      sk.panels.forEach((pp, i) => { setTimeout(() => drawFit(pp.fit, 900), reduce ? 0 : i * 120); fadeTo([pp.r2], 1, 450, 650); });
    }
    V.onVisible(root, reveal, { threshold: 0.3 });
    return function finish() {
      ++mTok; disp = { from: st.mi, to: st.mi, t: 1 };
      st.revealed = true;
      unhover();
      if (!sk) return;
      sk.gAll.classList.add("t1-in");
      sk.gAll.querySelectorAll(".t1-pt > *").forEach((n) => { n.style.transition = "none"; n.style.transitionDelay = "0ms"; });
      sk.panels.forEach((pp) => { place(pp); settleFit(pp.fit); fadeTo([pp.r2], 1); });
    };
  }

  // ================================================================ Fig. 14 — reconstruction error controls gradient mismatch
  function fig14(root, D) {
    const B = D.bits, F = D.factors, A = D.axes;
    // tag text darker than the INT4/INT3 marker fills (contrast); anchors = the paper figure's tag positions
    const TXT = { INT4: "#4A7796", INT3: "#2F6489", INT2: "#1D4E6E" };
    // cluster tags: INT4 above-left and INT3 below-right of their clusters (as in the paper), INT2 left of its cluster
    const TAG = { INT4: [4.7e-5, 60, "start"], INT3: [4.4e-4, 60, "start"], INT2: [5.9e-4, 7e4, "end"] };
    const f1 = (f) => (Number.isInteger(f) ? f.toFixed(1) : String(f));
    const st = { fi: F.length - 1, prev: null, revealed: false, hov: null };
    let sk = null;

    root.classList.add("t1");
    const ctl = h("div", { class: "controls t1-controls" }, root);
    const lo = F[0], hi = F[F.length - 1];
    const slider = stepSlider(ctl, {
      label: 'clipping factor <span class="t1-m">f</span>', aria: "clipping factor f",
      stops: F.map((f) => ({ label: f1(f), text: "f = " + f1(f), pos: (f - lo) / (hi - lo) })),
      index: st.fi, onChange: (i) => { st.fi = i; st.prev = null; paint(); },
    });
    const plot = h("div", { class: "t1-plot", tabindex: "0" }, root);
    plotAria(plot, root);
    // per-bit fit statistics: in the plot's empty top-left corner, or as a key row under narrow plots
    const statRow = h("div", { class: "t1-legend t1-stats", "aria-hidden": "true" }, root);
    B.slice().reverse().forEach((b) => {
      const s = h("span", { class: "t1-li" }, statRow);
      glyph(s, [{ shape: SHAPE[b.bits], color: b.color }]);
      h("span", null, s, '<b style="color:' + TXT[b.bits] + '">' + b.bits + "</b> slope " + b.fit.display.slope + " · " + M("R") + "² = " + b.fit.display.r2);
    });
    const leg = h("div", { class: "t1-legend", "aria-hidden": "true" }, root);
    const li = (items, html) => { const s = h("span", { class: "t1-li" }, leg); glyph(s, items); h("span", null, s, html); };
    li([{ shape: "star", color: "#6f7378", r: 3.4 }], "per-group search argmin");
    li([{ shape: "circle", color: "#6f7378", r: 3 }, { shape: "triangle", color: "#6f7378", r: 3 }, { shape: "square", color: "#6f7378", r: 3 }], 'fixed <span class="t1-m">f</span>');
    li([{ dash: "4 3", color: "#6f7378" }], "OLS fit");
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    srTable(sr, ["bits", "clipping factor", "loss-aware reconstruction error", "gradient mismatch"],
      B.flatMap((b) => b.points.map((p) => [b.bits, "f = " + p.f, sci(p.S, 3), big(p.g)]).concat([[b.bits, "per-group search argmin", sci(b.star.S, 3), big(b.star.g)]])));
    const tip = V.tooltip(plot);

    function draw(width) {
      const narrow = width < 420;
      const height = narrow ? 300 : 320;
      const m = { t: 30, r: 12, b: 46, l: 42 };
      const fr = V.frame(plot, width, height, m);
      const { svg, g, W, H } = fr;
      svg.setAttribute("aria-label", "squared gradient mismatch against loss-aware reconstruction error · INT4, INT3, INT2");
      const sx = V.log(A.xlim, [0, W]), sy = V.log(A.ylim, [H, 0]);
      axes(g, sx, sy, W, H, m, {
        xt: A.xticks, yt: A.yticks,
        xtitle: narrow ? [["reconstruction error "], ["Ŝ", "t1-m"], ["("], ["r", "t1-m"], [")"]] : [["loss-aware reconstruction error "], ["Ŝ", "t1-m"], ["("], ["r", "t1-m"], [")"]],
        ytitle: [["gradient mismatch "], ["‖∇", null], ["L", "t1-m"], ["("], ["r", "t1-m"], [") − ∇"], ["L", "t1-m"], ["("], ["w", "t1-m"], [")‖²"]],
      });
      const gAll = el("g", { class: st.revealed ? "t1-in" : "" }, g);
      const gFit = el("g", null, gAll), gGuide = el("g", null, gAll), gRing = el("g", { "pointer-events": "none" }, gAll);
      const gPts = el("g", null, gAll), gTag = el("g", { class: "t1-fade" }, gAll);
      const fits = [], nodes = [];
      let j = 0;
      for (const b of B) {
        const f = b.fit, fy = (x) => Math.pow(10, f.intercept + f.slope * Math.log10(x));
        const x0 = f.x_range[0], x1 = f.x_range[1];
        fits.push(el("path", { class: "t1-fit", stroke: b.color, d: `M${sx(x0).toFixed(1)},${sy(fy(x0)).toFixed(1)}L${sx(x1).toFixed(1)},${sy(fy(x1)).toFixed(1)}` }, gFit));
        const add = (p, star) => {
          const x = sx(p.S), y = sy(p.g);
          const gp = el("g", { class: "t1-pt", transform: `translate(${x.toFixed(2)},${y.toFixed(2)})` }, gPts);
          const shp = marker(gp, star ? "star" : SHAPE[b.bits], star ? (narrow ? 5.6 : 6) : (narrow ? 4.6 : 5), b.color, { stroke: "#fdfdfd", "stroke-width": star ? 1.2 : 1.4 });
          shp.style.transitionDelay = (reduce ? 0 : 140 + j++ * 35) + "ms";
          nodes.push({ b, p, star, f: star ? null : p.f, x, y, g: gp });
        };
        b.points.forEach((p) => add(p, false));
        add(b.star, true);
        const [tx, ty, anc] = TAG[b.bits];
        el("text", { class: "t1-tag t1-halo", x: sx(tx), y: sy(ty) + 4, fill: TXT[b.bits], "text-anchor": anc }, gTag).textContent = b.bits;
      }
      // per-bit fit statistics, top left (INT2 first, matching the clusters' vertical order)
      statRow.style.display = narrow ? "" : "none";
      if (!narrow) B.slice().reverse().forEach((b, i) => {
        const y = 12 + i * 18, f = b.fit;
        marker(el("g", { transform: `translate(6,${y - 4})` }, gTag), SHAPE[b.bits], 3.8, b.color);
        el("text", { class: "t1-tag", x: 16, y, fill: TXT[b.bits] }, gTag).textContent = b.bits;
        rich(el("text", { class: "t1-stat", x: 52, y }, gTag), [["slope " + f.display.slope + " · "], ["R", "t1-m"], ["²"], [" = " + f.display.r2]]);
      });
      // stars on top of the factor markers
      nodes.filter((n) => n.star).forEach((n) => gPts.appendChild(n.g));
      const gH = el("g", { "pointer-events": "none" }, g);
      const ov = el("rect", { class: "t1-ov", x: -8, y: -8, width: W + 16, height: H + 16, fill: "transparent" }, g);
      sk = { W, H, m, sx, sy, gAll, fits, nodes, gGuide, gRing, gTag, gH, ov, narrow };
      if (!st.revealed) { fits.forEach((p) => (p.style.opacity = 0)); fadeTo([gTag, gGuide, gRing], 0); }
      paint();
      const at = (e) => { const r = ov.getBoundingClientRect(); return [e.clientX - r.left - 8, e.clientY - r.top - 8]; };
      bindPoints(ov, (e) => { const [x, y] = at(e); const b = nearest(nodes, x, y, 22); if (b < 0) unhover(); else hover(nodes[b]); }, unhover);
    }

    // highlight the selected clipping factor (slider, or the hovered point's) in every bit width
    function paint() {
      if (!sk) return;
      const sel = st.prev != null ? st.prev : F[st.fi];
      sk.gGuide.textContent = ""; sk.gRing.textContent = "";
      for (const n of sk.nodes) {
        const on = n.star ? true : n.f === sel;
        n.g.style.opacity = n.star || on ? 1 : 0.45;
        if (on && !n.star) {
          const s = sk.nodes.find((q) => q.star && q.b === n.b);
          el("path", { class: "t1-guide", stroke: TXT[n.b.bits], d: `M${s.x.toFixed(1)},${s.y.toFixed(1)}L${n.x.toFixed(1)},${n.y.toFixed(1)}` }, sk.gGuide);
          el("circle", { class: "t1-ring", cx: n.x, cy: n.y, r: sk.narrow ? 9 : 10, stroke: TXT[n.b.bits] }, sk.gRing);
        }
        if (n.star && sel === "star") el("circle", { class: "t1-ring", cx: n.x, cy: n.y, r: sk.narrow ? 11 : 12, stroke: TXT[n.b.bits] }, sk.gRing);
      }
    }
    function hover(n) {
      if (!sk || !st.revealed) return;
      st.hov = n;
      const prev = n.star ? "star" : n.f;
      if (prev !== st.prev) { st.prev = prev; paint(); }
      sk.gH.textContent = "";
      if (!n.star) el("circle", { class: "t1-hring", cx: n.x, cy: n.y, r: 12.5, stroke: TXT[n.b.bits] }, sk.gH);
      const head = n.b.bits + " · " + (n.star ? "per-group search argmin" : M("f") + " = " + n.f);
      tip.show(sk.m.l + n.x, sk.m.t + n.y, tipHTML(head, [[S_R, sci(n.p.S, 3)], [MISMATCH, big(n.p.g)]], { color: n.b.color }));
    }
    function unhover() {
      st.hov = null;
      if (st.prev != null) { st.prev = null; paint(); }
      if (sk) sk.gH.textContent = "";
      tip.hide();
    }
    plot.addEventListener("keydown", (e) => {
      if (!sk) return;
      const list = sk.nodes.slice().sort((a, b) => a.x - b.x);
      let j = list.indexOf(st.hov);
      if (e.key === "ArrowRight") j = Math.min(list.length - 1, j + 1);
      else if (e.key === "ArrowLeft") j = j < 0 ? 0 : Math.max(0, j - 1);
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault();
      hover(list[j]);
    });
    plot.addEventListener("blur", unhover);
    outsideTap(plot, unhover);
    const R = V.responsive(plot, draw);
    whenFonts(() => R.redraw());
    V.onVisible(root, () => {
      if (st.revealed || !sk) return;
      st.revealed = true;
      sk.gAll.classList.add("t1-in");
      sk.fits.forEach((p, i) => setTimeout(() => drawFit(p, 900), reduce ? 0 : 200 + i * 140));
      fadeTo([sk.gTag], 1, 450, 800);
      fadeTo([sk.gGuide, sk.gRing], 1, 400, 1100);
    }, { threshold: 0.3 });
    return function finish() {
      st.revealed = true;
      unhover();
      if (!sk) return;
      sk.gAll.classList.add("t1-in");
      sk.gAll.querySelectorAll(".t1-pt > *").forEach((n) => { n.style.transition = "none"; n.style.transitionDelay = "0ms"; });
      sk.fits.forEach(settleFit);
      fadeTo([sk.gTag, sk.gGuide, sk.gRing], 1);
    };
  }

  // ================================================================ Fig. 15 — saliency tracks curvature
  function fig15(root, D) {
    const PTS = D.points, A = D.axes, LAYERS = D.layers;
    const MOD = (p) => p.block + "." + p.proj + "_proj";
    const st = { proj: "all", li: 0, revealed: false, hov: null };
    let sk = null;

    root.classList.add("t1");
    const ctl = h("div", { class: "controls t1-controls" }, root);
    const pc = h("div", { class: "t1-ctl" }, ctl);
    h("span", { class: "lab", "aria-hidden": "true" }, pc, "projection");
    V.pills(pc, [{ value: "all", label: "all" }].concat(D.projections.map((p) => ({ value: p, label: p }))), "all",
      (v) => { st.proj = v; paint(true); }, "projection");
    const stops = [{ label: "all", text: "all layers", pos: 0 }].concat(LAYERS.map((l, i) => ({ label: String(l), text: "layer " + l, pos: (i + 1) / LAYERS.length })));
    stepSlider(ctl, { label: "layer", aria: "layer", stops, index: 0, onChange: (i) => { st.li = i; paint(true); } });
    const plot = h("div", { class: "t1-plot", tabindex: "0" }, root);
    plotAria(plot, root);
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    srTable(sr, ["layer", "module", "mean saliency h", "mean Hessian diagonal (Hutchinson)"], PTS.map((p) => [String(p.layer), MOD(p), sci(p.h, 3), sci(p.hess, 3)]));
    const tip = V.tooltip(plot);

    function draw(width) {
      const narrow = width < 420;
      const height = narrow ? 286 : 306;
      const m = { t: 30, r: 12, b: 46, l: 44 };
      const fr = V.frame(plot, width, height, m);
      const { svg, g, W, H } = fr;
      svg.setAttribute("aria-label", "mean Hutchinson Hessian diagonal against mean saliency h per weight matrix · INT2 Qwen3-4B-Thinking-2507");
      const sx = V.log(A.xlim, [0, W]), sy = V.log(A.ylim, [H, 0]);
      axes(g, sx, sy, W, H, m, {
        xt: A.xticks, yt: A.yticks,
        xtitle: narrow ? [["saliency "], ["h", "t1-m"]] : [["saliency "], ["h", "t1-m"], [" (Adam second moment)"]],
        ytitle: narrow ? [["Hessian diagonal"]] : [["Hessian diagonal (Hutchinson)"]],
      });
      const gAll = el("g", { class: st.revealed ? "t1-in" : "" }, g);
      const ann = el("text", { class: "t1-ann t1-fade", x: 6, y: 13 }, gAll);
      rich(ann, [["correlation "], ["r", "t1-m"], [" = " + D.display.r]]);
      const gPts = el("g", null, gAll), gLab = el("g", { "pointer-events": "none" }, gAll);
      const order = PTS.map((p, i) => i).sort((a, b) => PTS[a].h - PTS[b].h);  // pop in from low to high saliency
      const nodes = PTS.map((p, i) => {
        const x = sx(p.h), y = sy(p.hess);
        const gp = el("g", { class: "t1-pt", transform: `translate(${x.toFixed(2)},${y.toFixed(2)})` }, gPts);
        const c = el("circle", { cx: 0, cy: 0, r: narrow ? 4 : 4.4, fill: GRAY, "fill-opacity": 0.78 }, gp);
        c.style.transitionDelay = (reduce ? 0 : 100 + order.indexOf(i) * 14) + "ms";
        return { p, x, y, g: gp, c };
      });
      const gH = el("g", { "pointer-events": "none" }, g);
      const ov = el("rect", { class: "t1-ov", x: -8, y: -8, width: W + 16, height: H + 16, fill: "transparent" }, g);
      sk = { W, H, m, gAll, ann, gPts, gLab, nodes, gH, ov, narrow };
      if (!st.revealed) fadeTo([ann, gLab], 0);
      paint(false);
      const at = (e) => { const r = ov.getBoundingClientRect(); return [e.clientX - r.left - 8, e.clientY - r.top - 8]; };
      bindPoints(ov, (e) => { const [x, y] = at(e); const b = nearest(nodes, x, y, 20, (n) => n.on !== false); if (b < 0) unhover(); else hover(nodes[b]); }, unhover);
    }

    function paint(animate) {
      if (!sk) return;
      const layer = st.li ? LAYERS[st.li - 1] : null, proj = st.proj === "all" ? null : st.proj;
      const active = layer != null || proj != null;
      const sel = [];
      for (const n of sk.nodes) {
        const on = (!proj || n.p.proj === proj) && (layer == null || n.p.layer === layer);
        n.on = !active || on;
        n.c.style.transition = animate && !reduce ? "fill .25s ease, fill-opacity .25s ease, r .25s ease, opacity .3s ease, transform .55s cubic-bezier(.3,1.45,.5,1)" : n.c.style.transition;
        n.c.setAttribute("fill", active && on ? STEEL : GRAY);
        n.c.setAttribute("fill-opacity", !active ? 0.78 : on ? 1 : 0.16);
        n.c.setAttribute("r", active && on ? (sk.narrow ? 4.8 : 5.2) : (sk.narrow ? 4 : 4.4));
        n.c.setAttribute("stroke", active && on ? "#fdfdfd" : "none");
        n.c.setAttribute("stroke-width", 1.2);
        if (active && on) sel.push(n);
      }
      sel.forEach((n) => sk.gPts.appendChild(n.g));  // highlighted matrices on top
      // data labels on the highlighted matrices: layer (one projection), projection (one layer), or both
      sk.gLab.textContent = "";
      const boxes = sel.map((n) => [n.x - 6, n.y - 6, n.x + 6, n.y + 6]);
      const hit = (b) => boxes.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
      for (const n of sel.slice().sort((a, b) => a.x - b.x)) {
        const label = proj && layer == null ? String(n.p.layer) : layer != null && !proj ? n.p.proj : n.p.proj + " · " + n.p.layer;
        const t = el("text", { class: "t1-plab t1-halo", x: 0, y: 0 }, sk.gLab);
        t.textContent = label;
        const w = t.getComputedTextLength() || label.length * 7;
        const cands = [[8, 4, "start"], [-8, 4, "end"], [0, -9, "middle"], [0, 17, "middle"], [7, -6, "start"], [-7, -6, "end"], [7, 14, "start"], [-7, 14, "end"]];
        let placed = false;
        for (const [dx, dy, anc] of cands) {
          const x0 = anc === "start" ? n.x + dx : anc === "end" ? n.x + dx - w : n.x - w / 2;
          const b = [x0 - 1, n.y + dy - 10, x0 + w + 1, n.y + dy + 2];
          if (b[0] < -2 || b[2] > sk.W + 4 || b[1] < -4 || b[3] > sk.H || hit(b)) continue;
          t.setAttribute("x", n.x + dx); t.setAttribute("y", n.y + dy); t.setAttribute("text-anchor", anc);
          boxes.push(b); placed = true; break;
        }
        if (!placed) t.remove();
      }
      if (st.revealed) fadeTo([sk.gLab], 1);
      if (st.hov && !st.hov.on) unhover();
    }
    function hover(n) {
      if (!sk || !st.revealed) return;
      st.hov = n;
      sk.gH.textContent = "";
      el("circle", { class: "t1-ring", cx: n.x, cy: n.y, r: 9.5, stroke: n.on && (st.li || st.proj !== "all") ? STEEL : INK2 }, sk.gH);
      tip.show(sk.m.l + n.x, sk.m.t + n.y, tipHTML("layer " + n.p.layer,
        [[M("h") + " (saliency)", sci(n.p.h, 3)], ["Hessian diagonal", sci(n.p.hess, 3)]],
        { color: n.on && (st.li || st.proj !== "all") ? STEEL : GRAY, sub: '<span class="t1-code">' + esc(MOD(n.p)) + "</span>" }));
    }
    function unhover() { st.hov = null; if (sk) sk.gH.textContent = ""; tip.hide(); }
    plot.addEventListener("keydown", (e) => {
      if (!sk) return;
      const list = sk.nodes.filter((n) => n.on).sort((a, b) => a.x - b.x);
      let j = list.indexOf(st.hov);
      if (e.key === "ArrowRight") j = Math.min(list.length - 1, j + 1);
      else if (e.key === "ArrowLeft") j = j < 0 ? 0 : Math.max(0, j - 1);
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault();
      if (list[j]) hover(list[j]);
    });
    plot.addEventListener("blur", unhover);
    outsideTap(plot, unhover);
    const R = V.responsive(plot, draw);
    whenFonts(() => R.redraw());
    V.onVisible(root, () => {
      if (st.revealed || !sk) return;
      st.revealed = true;
      sk.gAll.classList.add("t1-in");
      fadeTo([sk.ann], 1, 450, 700);
      fadeTo([sk.gLab], 1, 300, 900);
    }, { threshold: 0.3 });
    return function finish() {
      st.revealed = true;
      unhover();
      if (!sk) return;
      sk.gAll.classList.add("t1-in");
      sk.nodes.forEach((n) => { n.c.style.transition = "none"; n.c.style.transitionDelay = "0ms"; });
      fadeTo([sk.ann, sk.gLab], 1);
    };
  }

  // ================================================================ boot
  // Each chart fetches + draws once it comes within 800px of the viewport. Printing first mounts anything
  // still pending, then forces every chart to its final drawn state.
  const FIGS = { "ix-fig10": ["fig10", fig10], "ix-fig14": ["fig14", fig14], "ix-fig15": ["fig15", fig15] };
  const pending = [], finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "t1-fail", "data-label": "" }, node, "— data unavailable —");
  }
  function start(node, key) {
    if (node.__t1) return;
    node.__t1 = true;
    const [blk, fn] = FIGS[key];
    V.json(DATA).then((d) => {
      if (!d || !d[blk]) throw new Error("missing block " + blk);
      node.style.minHeight = "0";
      const fin = fn(node, d[blk]);
      if (fin) { finals.push(fin); if (printing) fin(); }
    }).catch((err) => { if (window.console) console.error("[ix-theory1] " + key, err); fail(node); });
  }
  function mount(idOrNode, key) {
    const node = typeof idOrNode === "string" ? document.getElementById(idOrNode) : idOrNode;
    if (!node) return;
    key = key || node.id;
    if (!FIGS[key]) return;
    pending.push(() => start(node, key));
    V.onVisible(node, () => start(node, key), { rootMargin: "800px", threshold: 0 });
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
  function boot() { Object.keys(FIGS).forEach((k) => mount(k)); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  // dev pages mount extra instances (e.g. a wide card) with IxTheory1.mount(node, "ix-fig10")
  window.IxTheory1 = { mount };
})();
