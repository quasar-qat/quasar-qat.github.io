/* charts-results.js — results charts and checkpoint cards for the QUASAR page.
   Mounts: #heal-acc (Table 1), #adapt-chart (Table 2), #ckpt-kl (Table 3),
           #overhead (Table 4), #models-grid (checkpoints.json + Tables 11/12).
   Every number is read from assets/data/results.json or checkpoints.json.
   Text rendered here is data labels only (method / model / benchmark names, units, values). */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = (document.currentScript && document.currentScript.src) || "";
  const dataURL = (f) => (SRC ? new URL("../data/" + f, SRC).href : "assets/data/" + f);
  const RM = V.reducedMotion;
  const el = V.el, hh = V.h;

  // ROSE = QUASAR marks/lines; ROSE_D = QUASAR text below ~18px; GOLD_D = gold text (contrast on the light card)
  const MUTED = "#6B6F75";
  const ROSE = V.C.quasar, ROSE_D = V.C.quasarDark || "#A13040", GOLD = V.C.bf16, GOLD_D = "#7D6310";
  const Q = "QUASAR";
  const colorOf = (m) => (m === Q ? ROSE : V.METHOD[m] ? V.METHOD[m].color : V.C.ptq);
  const PTQ_SET = new Set(["RTN", "GPTQ", "AWQ", "imatrix (PTQ)"]);

  /* ------------------------------------------------------------------ *
   * glide: one rAF loop that tweens numeric attribute bags on nodes.    *
   * ------------------------------------------------------------------ */
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const active = new Map();
  let raf = 0;
  function loop(now) {
    raf = 0;
    active.forEach((a, n) => {
      const t = (now - a.t0 - a.delay) / a.ms;
      if (t < 0) return;
      const k = a.ease(Math.min(1, t));
      const v = {};
      for (const key in a.to) v[key] = a.from[key] + (a.to[key] - a.from[key]) * k;
      n.__v = v;
      a.apply(n, v);
      if (t >= 1) active.delete(n);
    });
    if (active.size) raf = requestAnimationFrame(loop);
  }
  function put(n, to, apply) {
    active.delete(n);
    n.__v = Object.assign({}, to);
    apply(n, n.__v);
  }
  function glide(n, to, apply, o) {
    o = o || {};
    if (RM || !n.__v || o.ms === 0) return put(n, to, apply);
    const from = {};
    for (const k in to) from[k] = n.__v[k] != null ? n.__v[k] : to[k];
    active.set(n, { from, to: Object.assign({}, to), apply, ms: o.ms || 650, delay: o.delay || 0, ease: o.ease || easeIO, t0: performance.now() });
    if (!raf) raf = requestAnimationFrame(loop);
  }
  // jump every running tween to its end state (print)
  function flushAll() {
    active.forEach((a, n) => { n.__v = Object.assign({}, a.to); a.apply(n, n.__v); });
    active.clear();
  }
  // charts register a function that jumps to the final, revealed state (beforeprint)
  const finishers = [];
  let printing = false;   // beforeprint .. afterprint: charts that mount now draw straight in their final state
  function finishAll() { finishers.forEach((f) => f()); flushAll(); }
  // mode: "set" (no motion), "start" (pre-entrance), "enter" (first reveal), "glide" (state change)
  function go(n, to, apply, mode, delay, ms) {
    if (mode === "set" || mode === "start") return put(n, to, apply);
    glide(n, to, apply, mode === "enter" ? { ms: ms || 950, delay: delay || 0, ease: easeOut } : { ms: ms || 620, delay: delay || 0, ease: easeIO });
  }
  const f2 = (v) => (+v).toFixed(2);
  const AP = {
    row: (n, v) => { n.setAttribute("transform", `translate(0,${f2(v.y)})`); n.setAttribute("opacity", f2(v.o)); },
    x: (n, v) => { n.setAttribute("transform", `translate(${f2(v.x)},0)`); if (v.o != null) n.setAttribute("opacity", f2(v.o)); },
    xy: (n, v) => { n.setAttribute("transform", `translate(${f2(v.x)},${f2(v.y)})`); if (v.o != null) n.setAttribute("opacity", f2(v.o)); },
    op: (n, v) => n.setAttribute("opacity", f2(v.o)),
    seg: (n, v) => { n.setAttribute("x", f2(Math.min(v.a, v.b))); n.setAttribute("width", f2(Math.max(0.001, Math.abs(v.b - v.a)))); if (v.o != null) n.setAttribute("opacity", f2(v.o)); },
    line: (n, v) => { n.setAttribute("x1", f2(v.a)); n.setAttribute("x2", f2(v.b)); if (v.o != null) n.setAttribute("opacity", f2(v.o)); },
  };
  // number label: {x, v, o}; n.__fmt formats the value
  function numAP(n, v) {
    if (v.x != null) n.setAttribute("x", f2(v.x));
    if (v.o != null) n.setAttribute("opacity", f2(v.o));
    n.textContent = n.__fmt(v.v);
    if (n.__bg) {  // opaque plate behind a label that can sit on a reference line
      const w = textW(n.textContent, n.__bgFont[0], n.__bgFont[1]);
      n.__bg.setAttribute("x", f2((v.x != null ? v.x : 0) - 2));
      n.__bg.setAttribute("width", f2(w + 4));
      if (v.o != null) n.__bg.setAttribute("opacity", f2(v.o));
    }
  }

  /* ------------------------------------------------------------------ *
   * small helpers                                                        *
   * ------------------------------------------------------------------ */
  const mctx = document.createElement("canvas").getContext("2d");
  function textW(s, px, wt, fam) {
    mctx.font = `${wt || 400} ${px}px ${fam || "Inter, system-ui, sans-serif"}`;
    return mctx.measureText(s).width;
  }
  const MONO = "'JetBrains Mono', ui-monospace, monospace";
  function T(parent, s, attrs) { const t = el("text", attrs, parent); t.textContent = s; return t; }
  function starPath(R) {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * 0.45 : R, a = -Math.PI / 2 + (i * Math.PI) / 5;
      d += (i ? "L" : "M") + (r * Math.cos(a)).toFixed(2) + "," + (r * Math.sin(a)).toFixed(2);
    }
    return d + "Z";
  }
  const diamond = (s) => `M0,${-s}L${s},0L0,${s}L${-s},0Z`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sw = (c, shape) => `<i class="sw${shape ? " " + shape : ""}" style="background:${c}"></i>`;
  const pretty = (s) => s.replace(/'(\d\d)/g, "’$1");

  // Tooltip on hover (mouse) and tap (touch / pen). on(key) / off() drive the row highlight.
  // Touch / pen open only on a pointerup within TAP px of its pointerdown: a scroll that starts on a
  // chart ends in pointercancel (the browser takes the pan) and closes the tooltip instead of leaving it open.
  const TAP = 10;
  function hoverTip(target, root, tip, html, on, off) {
    const show = (e) => {
      const r = root.getBoundingClientRect();
      tip.show(e.clientX - r.left, e.clientY - r.top, html());
      if (on) on();
    };
    const hide = () => { tip.hide(); if (off) off(); };
    let t0 = null;
    target.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") show(e); });
    target.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") t0 = [e.clientX, e.clientY]; });
    target.addEventListener("pointerup", (e) => {
      if (t0 && e.pointerType !== "mouse" && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < TAP) show(e);
      t0 = null;
    });
    target.addEventListener("pointercancel", () => { t0 = null; hide(); });
    target.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
  }
  // close on a press outside the chart, and on any touch scroll that starts inside it (pointercancel bubbles)
  function tapAway(root, tip, off) {
    const hide = () => { tip.hide(); if (off) off(); };
    document.addEventListener("pointerdown", (e) => { if (!root.contains(e.target)) hide(); }, { passive: true });
    root.addEventListener("pointercancel", hide);
  }
  function srTable(holder, caption, head, rows) {
    holder.innerHTML = "<table><caption>" + esc(caption) + "</caption><thead><tr>" + head.map((x) => "<th>" + esc(x) + "</th>").join("") +
      "</tr></thead><tbody>" + rows.map((r) => "<tr>" + r.map((x, i) => (i ? "<td>" : "<th>") + esc(x) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody></table>";
  }
  function ctlGroup(row, label) {
    const g = hh("div", { class: "rc-ctl" }, row);
    hh("span", { class: "lab", "aria-hidden": "true" }, g, esc(label));
    return g;
  }
  // Re-run a draw function once web fonts are ready (text widths are measured).
  function afterFonts(api) { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => api.redraw()); }

  /* ================================================================== *
   * A. Table 1 — Cleveland dot plot (+ KL side panel)                  *
   * ================================================================== */
  function healAcc(root, R) {
    const TB = R.healing.hard_tasks;
    const MODELS = [
      { value: "Qwen3-4B-Thinking-2507", label: "Qwen3-4B-Thinking" },
      { value: "Llama-3.1-8B-Instruct", label: "Llama-3.1-8B" },
    ];
    const BITS = ["INT4", "INT3", "INT2"].map((b) => ({ value: b, label: b }));
    const BENCH = ["HMMT '26", "AIME '25", "MATH-500", "MMLU-Pro", "SuperGPQA", "LCB v6", "LongBench-v2", "RULER", "Avg."];
    const PTQ = ["RTN", "GPTQ", "AWQ"], QAT = ["Standard QAT", "LSQ", "Denoising QAT", "BitDistiller"];
    const TCH = "Teacher (BF16)";
    const DRAW = PTQ.concat(QAT, [TCH, Q]);
    const KLM = PTQ.concat(QAT, [Q]);
    const LEG = [Q, "Standard QAT", "LSQ", "Denoising QAT", "BitDistiller", "RTN", "GPTQ", "AWQ", TCH];
    const st = { model: MODELS[0].value, bits: "INT2" };
    const cOf = (m) => (m === TCH ? GOLD : colorOf(m));
    const fKL = (v) => (+v).toFixed(3);

    function data() {
      const M = TB.models[st.model], rows = {};
      for (const r of M[st.bits]) rows[r.method] = r.values;
      rows[TCH] = M.full_precision[0].values;
      return { rows, bench: BENCH.filter((b) => TB.columns[st.model].includes(b)) };
    }

    root.textContent = "";
    root.classList.add("rc");
    const top = hh("div", { class: "rc-top", "data-label": "" }, root);
    const ctl = hh("div", { class: "controls" }, top);
    V.pills(ctlGroup(ctl, "model"), MODELS, st.model, (v) => { st.model = v; update(); }, "model");
    V.pills(ctlGroup(ctl, "bits"), BITS, st.bits, (v) => { st.bits = v; update(); }, "bits");
    const leg = hh("div", { class: "rc-legend", "aria-hidden": "true" }, top);
    for (const m of LEG) {
      const c = hh("span", { class: "rc-chip" + (m === Q ? " q" : ""), "data-m": m }, leg);
      hh("i", { class: "sw" + (m === TCH ? " dia" : PTQ.includes(m) ? " sm" : ""), style: `background:${cOf(m)}` }, c);
      hh("span", null, c, esc(m));
      c.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") focus(m); });
      c.addEventListener("pointerleave", () => focus(null));
    }
    const plot = hh("div", { class: "rc-plot" }, root);
    const tip = V.tooltip(root);
    const sr = hh("div", { class: "sr-only", "data-label": "" }, root);
    let G = null, N = null, svg = null, seen = RM;

    function focus(m) {
      if (!svg) return;
      svg.classList.toggle("rc-focus", !!m);
      svg.querySelectorAll("[data-m]").forEach((n) => n.classList.toggle("on", n.getAttribute("data-m") === m));
    }

    function geom(width) {
      const g = { width, side: width >= 760 };
      const narrow = width < 520;
      g.narrow = narrow;
      g.lfs = 12;
      g.labW = Math.ceil(Math.max(...BENCH.map((b) => textW(pretty(b), g.lfs, 700)))) + (narrow ? 14 : 30);
      g.valW = narrow ? 40 : 60;
      g.klW = g.side ? Math.round(Math.min(310, Math.max(240, width * 0.25))) : width;
      g.klGap = g.side ? 46 : 0;
      g.x0 = g.labW;
      g.x1 = width - g.valW - (g.side ? g.klGap + g.klW : 0);
      g.P = narrow ? 33 : 38;
      g.AG = 14;
      g.top = 30;
      g.rowsH = 9 * g.P + g.AG;
      g.axisY = g.top + g.rowsH + 2;
      g.sx = V.lin([0, 100], [g.x0, g.x1]);
      g.r = { q: narrow ? 6.5 : 7.5, qat: narrow ? 4.7 : 5.6, ptq: narrow ? 3.4 : 4, dia: narrow ? 5.6 : 6.6 };
      if (g.side) {
        g.kx = width - g.klW; g.kx0 = g.kx + 104; g.kx1 = width - 8;
        g.ktop = g.top; g.kP = g.rowsH / 8; g.kaxisY = g.axisY;
        g.height = g.axisY + 40;
      } else {
        g.kx = 0; g.kx0 = narrow ? 104 : 124; g.kx1 = width - 10;
        g.ktop = g.axisY + 70; g.kP = 25; g.kaxisY = g.ktop + 8 * g.kP + 2;
        g.height = g.kaxisY + 34;
      }
      g.ksx = V.log(klDomain(), [g.kx0, g.kx1]);
      return g;
    }

    // KL axis bounds on a 1-2-5 grid around the current state's values
    function klDomain() {
      const { rows } = data();
      const v = KLM.map((m) => rows[m].KL);
      const steps = [];
      for (let e = -3; e <= 3; e++) for (const k of [1, 2, 5]) steps.push(+(k * Math.pow(10, e)).toPrecision(3));
      const lo = Math.min(...v) / 1.3, hi = Math.max(...v) * 1.15;
      return [steps.filter((x) => x <= lo).pop(), steps.find((x) => x >= hi)];
    }
    function klAxis() {
      const ag = N.kaxis;
      ag.textContent = "";
      let ticks = G.ksx.ticks();
      const dec = ticks.filter((t) => Math.abs(Math.log10(t) - Math.round(Math.log10(t))) < 1e-9);
      if (dec.length >= 3) ticks = dec;
      else if (ticks.length > 5) ticks = ticks.filter((t) => !/^2/.test(t.toExponential()));
      const grid = el("g", { class: "grid" }, ag);
      for (const t of ticks) el("line", { x1: G.ksx(t), x2: G.ksx(t), y1: G.ktop - 8, y2: G.kaxisY }, grid);
      V.axisBottom(ag, G.ksx, G.kaxisY, { ticks, fmt: (v) => String(v) });
    }

    function build(width) {
      G = geom(width);
      const fr = V.frame(plot, width, G.height, { t: 0, r: 0, b: 0, l: 0 });
      svg = fr.svg;
      const g = fr.g;
      svg.classList.add("rc-svg");
      N = { rows: {}, kl: {} };

      // grid + axis
      const grid = el("g", { class: "grid" }, g);
      const ticks = [0, 20, 40, 60, 80, 100];
      for (const t of ticks) el("line", { x1: G.sx(t), x2: G.sx(t), y1: G.top - 8, y2: G.axisY }, grid);
      V.axisBottom(g, G.sx, G.axisY, { ticks, title: "accuracy (%)", fmt: (v) => String(v) });
      T(g, Q, { class: "rc-k q", x: G.narrow ? G.x1 + G.valW : G.x1 + 14, y: G.top - 14, "text-anchor": G.narrow ? "end" : "start" });

      const rowsG = el("g", null, g);
      BENCH.forEach((b) => {
        const avg = b === "Avg.";
        const rg = el("g", { class: "rc-row" + (avg ? " avg" : "") }, rowsG);
        const band = el("rect", { class: "band", x: 4, y: -G.P / 2 + 1, width: G.x1 + G.valW - 4, height: G.P - 2, rx: 6 }, rg);
        if (avg) el("line", { x1: 4, x2: G.x1 + G.valW, y1: -G.P / 2 - G.AG / 2, y2: -G.P / 2 - G.AG / 2, stroke: "#e2ddd3" }, rg);
        el("line", { class: "track", x1: G.x0, x2: G.x1, y1: 0, y2: 0 }, rg);
        T(rg, pretty(b), { class: "rlab", x: G.labW - (G.narrow ? 10 : 14), y: 4, "text-anchor": "end", "font-size": G.lfs });
        const conn = el("rect", { y: -2.5, height: 5, rx: 2.5, fill: "rgba(209,73,91,.28)" }, rg);
        const dots = {};
        for (const m of DRAW) {
          const d = el("g", { "data-m": m, class: "dot" }, rg);
          if (m === TCH) el("path", { d: diamond(G.r.dia), fill: GOLD, stroke: "#fff", "stroke-width": 1.2 }, d);
          else {
            const r = m === Q ? G.r.q : PTQ.includes(m) ? G.r.ptq : G.r.qat;
            el("circle", { r, fill: colorOf(m), stroke: "#fff", "stroke-width": m === Q ? 1.6 : 1.1 }, d);
          }
          dots[m] = d;
        }
        const val = T(rg, "", { class: "rval" + (avg ? " avg" : ""), x: G.x1 + 14, y: avg ? 5 : 4.5 });
        val.__fmt = (v) => (+v).toFixed(1);
        let delta = null;
        if (avg) {
          delta = T(rg, "", { class: "rdelta", y: -G.r.q - 6, "text-anchor": "middle" });
          delta.__fmt = (v) => { const d = Math.round(v * 10) / 10; return (d > 0 ? "+" : d < 0 ? "−" : "±") + Math.abs(d).toFixed(1); };
        }
        const hit = el("rect", { x: 0, y: -G.P / 2, width: G.x1 + G.valW, height: G.P, fill: "transparent", class: "hit" }, rg);
        hoverTip(hit, root, tip, () => rowTip(b), () => hot(b), () => hot(null));
        N.rows[b] = { g: rg, band, conn, dots, val, delta, hit };
      });

      // KL panel
      const kg = el("g", { class: "rc-kl" }, g);
      T(kg, "KL to BF16", { class: "axis-title", x: G.kx, y: G.ktop - 14 });
      N.kaxis = el("g", null, kg);
      for (const m of KLM) {
        const rg = el("g", { class: "rc-row" }, kg);
        const band = el("rect", { class: "band", x: G.kx - 6, y: -G.kP / 2 + 1, width: G.kx1 - G.kx + 12, height: G.kP - 2, rx: 6 }, rg);
        el("line", { class: "track", x1: G.kx0, x2: G.kx1, y1: 0, y2: 0 }, rg);
        T(rg, m, { class: "klab" + (m === Q ? " q" : ""), x: G.kx, y: 4 });
        const dot = el("g", { "data-m": m, class: "dot" }, rg);
        el("circle", { r: m === Q ? G.r.q - 1 : PTQ.includes(m) ? G.r.ptq : G.r.qat - 0.6, fill: colorOf(m), stroke: "#fff", "stroke-width": 1.2 }, dot);
        const val = T(rg, "", { class: "kval" + (m === Q ? " q" : ""), y: 4 });
        val.__fmt = fKL;
        const hit = el("rect", { x: G.kx - 6, y: -G.kP / 2, width: G.kx1 - G.kx + 12, height: G.kP, fill: "transparent" }, rg);
        hoverTip(hit, root, tip, () => klTip(m), () => hot("kl:" + m), () => hot(null));
        N.kl[m] = { g: rg, band, dot, val };
      }
      apply(seen ? "set" : "start");
    }

    let hotKey = null;
    function hot(k) {
      hotKey = k;
      if (!N) return;
      for (const b in N.rows) N.rows[b].band.classList.toggle("hot", k === b);
      for (const m in N.kl) N.kl[m].band.classList.toggle("hot", k === "kl:" + m);
    }

    function rowTip(b) {
      const { rows } = data();
      const list = DRAW.map((m) => [m, rows[m][b]]).sort((a, c) => c[1] - a[1]);
      return `<div class="tt">${esc(pretty(b))} · ${esc(st.bits)}</div>` + list.map(([m, v]) =>
        `<div class="row${m === Q ? " q" : ""}"><span>${sw(cOf(m), m === TCH ? "dia" : "")}${esc(m)}</span><b>${v.toFixed(1)}</b></div>`).join("");
    }
    function klTip(m) {
      const { rows } = data();
      return `<div class="tt">${esc(st.bits)} · ${esc(MODELS.find((x) => x.value === st.model).label)}</div>` +
        `<div class="row${m === Q ? " q" : ""}"><span>${sw(colorOf(m))}${esc(m)}</span></div>` +
        `<div class="row"><span>KL</span><b>${fKL(rows[m].KL)}</b></div><div class="row"><span>Top-1</span><b>${rows[m]["Top-1"].toFixed(1)}</b></div>`;
    }

    function apply(mode) {
      const { rows, bench } = data();
      const S = mode === "start";
      G.ksx = V.log(klDomain(), [G.kx0, G.kx1]);
      klAxis();
      const nb = bench.length - 1;
      const Pb = (8 * G.P) / nb;
      const x0 = G.sx(0);
      let vis = 0;
      BENCH.forEach((b, iAll) => {
        const n = N.rows[b];
        const on = bench.includes(b);
        const i = on ? bench.indexOf(b) : iAll;
        const y = b === "Avg." ? G.top + 8 * G.P + G.AG + G.P / 2 : on ? G.top + Pb * (i + 0.5) : n.g.__v ? n.g.__v.y : G.top + G.P * (iAll + 0.5);
        go(n.g, { y, o: on ? 1 : 0 }, AP.row, mode === "enter" ? "set" : mode, i * 12, 520);
        n.g.style.pointerEvents = on ? "" : "none";
        if (!on) return;
        // band + hit area follow the row pitch (Llama has fewer rows, spread over the same height)
        const pitch = b === "Avg." ? G.P : Pb;
        n.band.setAttribute("y", f2(-pitch / 2 + 1)); n.band.setAttribute("height", f2(pitch - 2));
        n.hit.setAttribute("y", f2(-pitch / 2)); n.hit.setAttribute("height", f2(pitch));
        const ri = vis++;
        DRAW.forEach((m, j) => {
          const v = rows[m][b];
          const dl = m === Q ? 260 + ri * 55 : ri * 55 + j * 18;
          go(n.dots[m], { x: S ? x0 : G.sx(v), o: S ? 0 : 1 }, AP.x, mode, mode === "enter" ? dl : ri * 14);
        });
        const best = Math.max(...QAT.map((m) => rows[m][b]));
        const qv = rows[Q][b];
        n.conn.setAttribute("fill", qv >= best ? "rgba(209,73,91,.28)" : "rgba(63,66,69,.16)");
        go(n.conn, S ? { a: x0, b: x0, o: 0 } : { a: G.sx(best), b: G.sx(qv), o: 1 }, AP.seg, mode, mode === "enter" ? 420 + ri * 55 : ri * 14);
        go(n.val, { v: S ? 0 : qv, o: S ? 0 : 1 }, numAP, mode, mode === "enter" ? 260 + ri * 55 : ri * 14);
        if (n.delta) {
          // the paper states the Avg. gain only at INT2 (13.3 Qwen, 2.2 Llama): label it there only
          const d = +(qv - best).toFixed(1);
          const showD = st.bits === "INT2";
          n.delta.setAttribute("fill", d > 0 ? ROSE_D : MUTED);
          n.delta.style.visibility = showD ? "" : "hidden";
          go(n.delta, { x: S ? x0 : (G.sx(best) + G.sx(qv)) / 2, v: S ? 0 : d, o: S || !showD ? 0 : 1 }, numAP, mode, mode === "enter" ? 700 + ri * 55 : ri * 14);
        }
      });
      // KL panel: methods sorted by KL (lowest first)
      const order = KLM.slice().sort((a, c) => rows[a].KL - rows[c].KL);
      order.forEach((m, j) => {
        const n = N.kl[m];
        const kv = rows[m].KL, x = G.ksx(kv);
        const left = x > G.kx1 - 44;
        n.val.setAttribute("text-anchor", left ? "end" : "start");
        const r = m === Q ? G.r.q : G.r.qat;
        go(n.g, { y: G.ktop + G.kP * (j + 0.5), o: 1 }, AP.row, mode === "enter" ? "set" : mode, j * 16);
        go(n.dot, { x: S ? G.kx0 : x, o: S ? 0 : 1 }, AP.x, mode, mode === "enter" ? 300 + j * 60 : j * 16);
        go(n.val, { x: S ? G.kx0 : left ? x - r - 5 : x + r + 5, v: S ? 0 : kv, o: S ? 0 : 1 }, numAP, mode, mode === "enter" ? 300 + j * 60 : j * 16);
      });
      if (hotKey) hot(hotKey);
      svg.setAttribute("aria-label", `${MODELS.find((x) => x.value === st.model).label} · ${st.bits} · accuracy (%) and KL to BF16`);
      srTable(sr, `${st.model} · ${st.bits} · accuracy (%) and KL to BF16`, ["method"].concat(bench.map(pretty), ["KL", "Top-1"]),
        DRAW.map((m) => [m].concat(bench.map((b) => rows[m][b].toFixed(1)), [rows[m].KL == null ? "–" : fKL(rows[m].KL), rows[m]["Top-1"] == null ? "–" : rows[m]["Top-1"].toFixed(1)])));
    }
    function update() { tip.hide(); if (N) apply(seen ? "glide" : "start"); }

    root.style.minHeight = "0";
    const api = V.responsive(root, build);
    afterFonts(api);
    tapAway(root, tip, () => hot(null));
    V.onVisible(root, () => { if (seen) return; seen = true; if (N) apply("enter"); }, { threshold: 0.3 });
    finishers.push(() => { seen = true; if (N) apply("set"); });
  }

  /* ================================================================== *
   * B. Table 2 — adaptation: average accuracy bars + reference lines   *
   * ================================================================== */
  function adaptChart(root, R) {
    const A = R.adaptation;
    const ref = {};
    for (const r of A.references) ref[r.method] = r.values;
    const BASE = "Base (no SFT)", FPS = "FP-SFT";
    const GROUPS = [
      { k: "QAT", ms: [Q, "Standard QAT", "LSQ", "Denoising QAT", "BitDistiller"] },
      { k: "full-precision fine-tuning followed by PTQ", ms: ["RTN", "GPTQ", "AWQ"] },
    ];
    const ALL = GROUPS.flatMap((g) => g.ms);
    const BENCH = ["MATH-500", "GSM8K", "AIME'24", "AIME'25", "HMMT'25", "Avg."];
    const st = { bits: "INT2" };
    // keep the paper's decimals (1.60, not 1.6)
    const fPPL = (v) => (v == null ? "–" : v >= 1e5 ? (v / 1e5).toFixed(1) + "×10⁵" : v >= 100 ? v.toFixed(0) : v.toFixed(2));

    root.textContent = "";
    root.classList.add("rc");
    const top = hh("div", { class: "rc-top", "data-label": "" }, root);
    const ctl = hh("div", { class: "controls" }, top);
    V.pills(ctlGroup(ctl, "bits"), ["INT4", "INT3", "INT2"].map((b) => ({ value: b, label: b })), st.bits, (v) => { st.bits = v; update(); }, "bits");
    const plot = hh("div", { class: "rc-plot" }, root);
    const tip = V.tooltip(root);
    const sr = hh("div", { class: "sr-only", "data-label": "" }, root);
    let G = null, N = null, svg = null, seen = RM;

    function rows() { const o = {}; for (const r of A.bits[st.bits]) o[r.method] = r.values; return o; }

    // PPL column width: the widest held-out PPL across all bit widths (fixed, so switching bits does not move the bars)
    const PPLW = Math.max(...Object.values(A.bits).flatMap((rs) => rs.map((r) => textW(fPPL(r.values.PPL), 12, 700))));

    function geom(width) {
      const g = { width, narrow: width < 560 };
      g.labW = g.narrow ? 98 : 134;
      g.x0 = g.labW;
      // right-hand held-out PPL column (the text above the chart claims the lowest PPL at every bit width)
      g.pplX = width - 4;
      g.x1 = g.pplX - Math.ceil(PPLW) - (g.narrow ? 30 : 46);
      g.sx = V.lin([0, 50], [g.x0, g.x1]);
      g.P = g.narrow ? 27 : 30;
      g.bh = g.narrow ? 15 : 18;
      // reference labels: one tier unless they would collide
      const fs = 12;
      const lb = (n, v) => textW(n + "  ", fs) + textW(v.toFixed(1), fs, 700);
      const wB = lb(BASE, ref[BASE]["Avg."]), wF = lb(FPS, ref[FPS]["Avg."]);
      const xB = g.sx(ref[BASE]["Avg."]), xF = g.sx(ref[FPS]["Avg."]);
      const cB = Math.max(g.x0 + wB / 2, Math.min(width - wB / 2, xB));
      const cF = Math.max(g.x0 + wF / 2, Math.min(width - wF / 2, xF));
      g.lab = { B: { c: cB, w: wB, x: xB }, F: { c: cF, w: wF, x: xF }, fs };
      g.tiers = cB + wB / 2 + 10 > cF - wF / 2 ? 2 : 1;
      g.tierY = [12, 30];
      g.top = (g.tiers === 2 ? 40 : 22) + 8;
      // group kickers (12px mono caps): a kicker wider than the chart breaks into two balanced lines
      const kw = (s) => textW(s.toUpperCase(), 12, 600, MONO) + s.length * 12 * 0.1;
      g.kLines = GROUPS.map((gr) => {
        if (kw(gr.k) <= width - 4) return [gr.k];
        const w = gr.k.split(" ");
        let best = null;
        for (let i = 1; i < w.length; i++) {
          const L = [w.slice(0, i).join(" "), w.slice(i).join(" ")];
          const m = Math.max(kw(L[0]), kw(L[1]));
          if (!best || m < best.m) best = { L, m };
        }
        return best ? best.L : [gr.k];
      });
      let y = g.top;
      g.kick = [];
      g.rowY = {};
      GROUPS.forEach((gr, gi) => {
        if (gi) y += 12;
        g.kick.push(y + 12);
        y += 20 + (g.kLines[gi].length - 1) * 16;
        for (const m of gr.ms) { g.rowY[m] = y + g.P / 2; y += g.P; }
      });
      g.axisY = y + 6;
      g.height = g.axisY + 40;
      return g;
    }

    function build(width) {
      G = geom(width);
      const fr = V.frame(plot, width, G.height, { t: 0, r: 0, b: 0, l: 0 });
      svg = fr.svg;
      const g = fr.g;
      svg.classList.add("rc-svg");
      N = { rows: {} };
      const ticks = [0, 10, 20, 30, 40, 50];
      const grid = el("g", { class: "grid" }, g);
      for (const t of ticks) el("line", { x1: G.sx(t), x2: G.sx(t), y1: G.top - 4, y2: G.axisY }, grid);
      V.axisBottom(g, G.sx, G.axisY, { ticks, title: "average accuracy (%)", fmt: (v) => String(v) });

      const rowsG = el("g", null, g);
      for (const m of ALL) {
        const rg = el("g", { class: "rc-row", transform: `translate(0,${G.rowY[m]})` }, rowsG);
        const band = el("rect", { class: "band", x: 4, y: -G.P / 2 + 1, width: G.width - 4, height: G.P - 2, rx: 6 }, rg);
        T(rg, m, { class: "rlab" + (m === Q ? " q" : ""), x: G.labW - 12, y: 4, "text-anchor": "end" });
        const bar = el("rect", { y: -G.bh / 2, height: G.bh, rx: 2.5, fill: colorOf(m), class: "bar" }, rg);
        N.rows[m] = { g: rg, band, bar };
      }

      // reference lines (drawn over the bars, under the labels)
      const refG = el("g", { class: "rc-refs" }, g);
      const lines = [[BASE, G.lab.B, 0], [FPS, G.lab.F, G.tiers === 2 ? 1 : 0]];
      const labG = el("g", null, g);
      for (const [name, L, tier] of lines) {
        const isF = name === FPS;
        const y0 = G.tierY[tier] + 5;
        el("line", { x1: L.x, x2: L.x, y1: y0, y2: G.axisY, stroke: "#fdfdfd", "stroke-width": 4 }, refG);
        el("line", { x1: L.x, x2: L.x, y1: y0, y2: G.axisY, stroke: isF ? GOLD : "#3F4245", "stroke-width": isF ? 1.6 : 1.2, "stroke-dasharray": isF ? null : "4 3" }, refG);
        const t = el("text", { class: "reflab" + (isF ? " f" : ""), x: L.c, y: G.tierY[tier], "text-anchor": "middle", "font-size": G.lab.fs }, labG);
        const a = el("tspan", null, t); a.textContent = name + "  ";
        const b = el("tspan", { "font-weight": 700 }, t); b.textContent = ref[name]["Avg."].toFixed(1);
      }
      GROUPS.forEach((gr, gi) => G.kLines[gi].forEach((s, li) => T(labG, s, { class: "rc-k halo", x: 0, y: G.kick[gi] + li * 16 })));
      T(labG, "PPL", { class: "rc-k", x: G.pplX, y: G.kick[0], "text-anchor": "end" });
      // value labels and hit areas sit above the reference lines
      const valG = el("g", null, g);
      for (const m of ALL) {
        const vg = el("g", { transform: `translate(0,${G.rowY[m]})` }, valG);
        const bg = el("rect", { y: m === Q ? -9.5 : -8.5, height: m === Q ? 19 : 17, rx: 3, fill: "#fdfdfd" }, vg);
        const val = T(vg, "", { class: "bval" + (m === Q ? " q" : ""), y: 4.5 });
        val.__fmt = (v) => (+v).toFixed(1);
        val.__bg = bg;
        val.__bgFont = m === Q ? [14, 700] : [12, 600];
        N.rows[m].val = val;
        N.rows[m].ppl = T(vg, "", { class: "bppl" + (m === Q ? " q" : ""), x: G.pplX, y: 4.5, "text-anchor": "end" });
        const hit = el("rect", { x: 0, y: -G.P / 2, width: G.width, height: G.P, fill: "transparent" }, vg);
        hoverTip(hit, root, tip, () => barTip(m), () => hot(m), () => hot(null));
      }
      N.refs = refG;
      apply(seen ? "set" : "start");
    }

    let hotKey = null;
    function hot(k) { hotKey = k; if (N) for (const m in N.rows) N.rows[m].band.classList.toggle("hot", k === m); }

    function barTip(m) {
      const v = rows()[m], b = ref[BASE], f = ref[FPS];
      const th = `<tr><th></th><th class="${m === Q ? "q" : ""}">${esc(m)}</th><th>${esc(BASE)}</th><th class="g">${esc(FPS)}</th></tr>`;
      const tr = BENCH.concat(["PPL"]).map((k) => {
        const fm = (x) => (k === "PPL" ? fPPL(x) : x.toFixed(1));
        return `<tr${k === "Avg." ? ' class="avg"' : ""}><td>${esc(pretty(k))}</td><td class="${m === Q ? "q" : ""}"><b>${fm(v[k])}</b></td><td>${fm(b[k])}</td><td>${fm(f[k])}</td></tr>`;
      }).join("");
      return `<div class="tt">${esc(A.model)} · ${esc(st.bits)}</div><table class="rc-tt">${th}${tr}</table>`;
    }

    function apply(mode) {
      const R2 = rows();
      const S = mode === "start";
      const pMin = Math.min(...ALL.map((m) => R2[m].PPL));
      ALL.forEach((m, i) => {
        const n = N.rows[m], v = R2[m]["Avg."];
        const dl = mode === "enter" ? (m === Q ? 380 : 0) + i * 70 : i * 18;
        go(n.bar, { a: G.x0, b: S ? G.x0 : G.sx(v) }, AP.seg, mode, dl, 1000);
        go(n.val, { x: S ? G.x0 + 6 : G.sx(v) + 6, v: S ? 0 : v, o: S ? 0 : 1 }, numAP, mode, dl, 1000);
        // lowest (or tied-lowest) PPL in bold; QUASAR's in rose
        n.ppl.textContent = fPPL(R2[m].PPL);
        n.ppl.classList.toggle("lo", R2[m].PPL === pMin);
        go(n.ppl, { o: S ? 0 : 1 }, AP.op, mode, mode === "enter" ? dl + 500 : 0, 500);
      });
      go(N.refs, { o: S ? 0 : 1 }, AP.op, mode, mode === "enter" ? 0 : 0, 500);
      if (hotKey) hot(hotKey);
      svg.setAttribute("aria-label", `${A.model} · ${st.bits} · average accuracy (%) and held-out PPL`);
      srTable(sr, `${A.model} · ${st.bits} · average accuracy (%) and held-out PPL`, ["method", "PPL"].concat(BENCH),
        [BASE, FPS].map((r) => [r, fPPL(ref[r].PPL)].concat(BENCH.map((k) => ref[r][k].toFixed(1))))
          .concat(ALL.map((m) => [m, fPPL(R2[m].PPL)].concat(BENCH.map((k) => R2[m][k].toFixed(1))))));
    }
    function update() { tip.hide(); if (N) apply(seen ? "glide" : "start"); }

    root.style.minHeight = "0";
    const api = V.responsive(root, build);
    afterFonts(api);
    tapAway(root, tip, () => hot(null));
    V.onVisible(root, () => { if (seen) return; seen = true; if (N) apply("enter"); }, { threshold: 0.3 });
    finishers.push(() => { seen = true; if (N) apply("set"); });
  }

  /* ================================================================== *
   * C. Table 3 — KL to BF16 (per block) + average accuracy             *
   * ================================================================== */
  function ckptChart(root, R) {
    const T3 = R.checkpoint_comparison_table3;
    const GG = R.gemma4_e4b_vs_google;
    const isGG = (f) => /^GGUF/.test(f);

    function mkBlock(model, bf, rows) {
      const fm = rows.map((r) => r.format);
      const same = fm.every((f) => f === fm[0]);
      const pre = fm[0].split(" ")[0];
      const fmt = same ? fm[0] : fm.every((f) => f.split(" ")[0] === pre) ? pre : "";
      const sub = (r) => (same ? "" : r.format.split(" ").slice(fmt ? 1 : 0).join(" "));
      // group rows by format variant only when every variant has its own QUASAR row (Muse W4A16 / W4A4)
      const order = [];
      for (const r of rows) if (!order.includes(sub(r))) order.push(sub(r));
      const regroup = order.length > 1 && order.every((v) => rows.some((r) => sub(r) === v && r.method === Q));
      if (regroup) rows = order.flatMap((v) => rows.filter((r) => sub(r) === v));
      const bpws = rows.map((r) => r.values.bpw);
      const bsame = bpws.every((v) => v === bpws[0]);
      const gguf = isGG(fm[0]);
      return {
        model, fmt, gguf, bpw: bsame ? bpws[0] : null, bf16: bf.values["Avg."],
        hi: model === GG.model && !gguf,
        rows: rows.map((r) => ({
          m: r.method, format: r.format, sub: regroup ? sub(r) : "", v: r.values,
          tag: [sub(r), bsame ? "" : r.values.bpw.toFixed(2)].filter(Boolean).join(" · "),
        })),
      };
    }
    const blocks = [];
    for (const b of T3.blocks) {
      const bf = b.rows.find((r) => r.method === "BF16");
      const rest = b.rows.filter((r) => r.method !== "BF16");
      const parts = [rest.filter((r) => !isGG(r.format)), rest.filter((r) => isGG(r.format))].filter((p) => p.length);
      for (const p of parts) blocks.push(mkBlock(b.model, bf, p));
    }
    // ONE log KL scale for every block (GGUF included): equal ratios look equal (arXiv v2: .015 .. .25).
    // BF16 (KL 0) sits at the axis floor, the left edge, where every stem starts.
    const kAll = blocks.flatMap((b) => b.rows.map((r) => r.v.KL));
    const KLO = +(Math.floor(Math.min(...kAll) / 1.15 / 0.005) * 0.005).toFixed(3) || 0.005;
    const KHI = +(Math.ceil((Math.max(...kAll) * 1.2) / 0.05) * 0.05).toFixed(2);
    const KTICKS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5].filter((t) => t > KLO * 1.05 && t < KHI);
    const accAll = blocks.flatMap((b) => b.rows.map((r) => r.v["Avg."]).concat([b.bf16]));
    const ALO = Math.floor((Math.min(...accAll) - 3) / 5) * 5, AHI = Math.ceil((Math.max(...accAll) + 2) / 5) * 5;
    const fTick = (v) => (v === 0 ? "0" : String(+v.toFixed(3)).replace(/^0/, ""));
    // paper-stated KL reductions, drawn as a dashed bridge from the QUASAR row to the comparator's KL:
    // Gemma-4 E4B INT4 vs Google QAT (+ the accuracy gain); Qwen3-8B / Qwen3.5-9B NVFP4 vs Standard QAT (Section 5.2)
    const BRIDGE = {};
    BRIDGE[GG.model] = { vs: "Google QAT", kl: "−" + GG.stated.kl_reduction, acc: "+" + parseFloat(GG.stated.acc_gain).toFixed(1) };
    const NVR = (R.nvfp4 && R.nvfp4.kl_reduction_vs_standard_qat) || {};
    for (const m in NVR) BRIDGE[m] = { vs: "Standard QAT", kl: "−" + Math.round(NVR[m].computed_pct) + "%" };

    root.textContent = "";
    root.classList.add("rc");
    const top = hh("div", { class: "rc-top", "data-label": "" }, root);
    const ctl = hh("div", { class: "controls" }, top);
    const st = { panel: "kl" };
    V.pills(ctl, [{ value: "kl", label: "KL to BF16" }, { value: "acc", label: "average accuracy" }], st.panel, (v) => { st.panel = v; switchPanel(); }, "metric");
    const plot = hh("div", { class: "rc-plot" }, root);
    const tip = V.tooltip(root);
    const sr = hh("div", { class: "sr-only", "data-label": "" }, root);
    let G = null, N = null, svg = null, seen = RM;

    function geom(width) {
      // wide: model meta column on the left; both: KL and accuracy panels side by side (else a pill switch)
      const g = { width, wide: width >= 860, both: width >= 600 };
      top.style.display = g.both ? "none" : "";
      // phones (one panel): the row tag goes on a second line under the method name, so the label column stays narrow
      g.two = !g.both;
      g.P = g.wide ? 24 : 26;
      g.P2 = 36;
      g.BG = g.wide ? 22 : 18;
      g.SG = 6;
      const mfs = 12, tfs = 12;
      g.mfs = mfs; g.tfs = tfs;
      let need = 0;
      for (const b of blocks) for (const r of b.rows) {
        const wm = textW(r.m, mfs, r.m === Q ? 700 : 500), wt = r.tag ? textW(r.tag, tfs, r.m === Q ? 600 : 500) : 0;
        need = Math.max(need, g.two ? Math.max(wm, wt) : wm + (wt ? wt + (g.wide ? 12 : 7) : 0));
      }
      if (g.wide) {
        g.metaX = 14; g.labX = 196; g.labW = Math.ceil(need) + 26;
        g.kx0 = g.labX + g.labW;
        const rest = width - g.kx0 - 60 - 44;
        g.kx1 = g.kx0 + Math.round(rest * 0.55);
        g.ax0 = g.kx1 + 60; g.ax1 = width - 44;
        g.hdr = 0;
        g.top = 50;
      } else {
        g.labX = 8; g.labW = Math.min(Math.ceil(need) + 12, Math.round(width * 0.44));
        g.kx0 = g.labX + g.labW + 4;
        if (g.both) {
          const rest = width - g.kx0 - 48 - 38;
          g.kx1 = g.kx0 + Math.round(rest * 0.55); g.ax0 = g.kx1 + 48; g.ax1 = width - 38;
        } else { g.kx1 = width - 40; g.ax0 = g.kx0; g.ax1 = g.kx1; }
        g.hdr = 30;   // block title row; the BF16 star sits below it
        g.top = g.both ? 50 : 34;
      }
      g.sk = V.log([KLO, KHI], [g.kx0, g.kx1]);
      g.sa = V.lin([ALO, AHI], [g.ax0, g.ax1]);
      let y = g.top;
      let ggHead = false;
      g.B = blocks.map((b, bi) => {
        const o = { b };
        // GGUF blocks: same KL axis, set apart by a gap and one subtle group header
        if (b.gguf && !ggHead) { ggHead = true; o.ghY = y + 8; y += 30; }
        o.y0 = y;
        y += g.hdr;
        o.r0 = y;
        o.P = g.two && b.rows.some((r) => r.tag) ? g.P2 : g.P;
        let prev = null;
        o.ry = b.rows.map((r) => { if (prev !== null && r.sub !== prev) y += g.SG; prev = r.sub; const c = y + o.P / 2; y += o.P; return c; });
        o.y1 = y;
        y += bi < blocks.length - 1 ? g.BG : 0;
        return o;
      });
      g.bottom = y;
      g.height = y + 14;
      return g;
    }

    function build(width) {
      G = geom(width);
      const fr = V.frame(plot, width, G.height, { t: 0, r: 0, b: 0, l: 0 });
      svg = fr.svg;
      const g = fr.g;
      svg.classList.add("rc-svg", "rc-ck");
      N = { rows: [], ann: [] };
      const wide = G.wide;

      // --- KL panel: one log scale for every block; BF16 star at the floor
      const pk = el("g", { class: "rc-panel kl" }, g);
      // no tick label crowding the BF16 star at the axis floor
      const kt = ((G.kx1 - G.kx0) >= 110 ? KTICKS : KTICKS.filter((t) => !/^5/.test(String(t).replace(/^0\.0*/, ""))))
        .filter((t) => G.sk(t) - G.kx0 >= textW(fTick(t), 12) / 2 + 9);
      const kgrid = el("g", { class: "grid" }, pk);
      for (const t of kt) el("line", { x1: G.sk(t), x2: G.sk(t), y1: G.top - 8, y2: G.bottom }, kgrid);
      T(pk, "KL to BF16", { class: "axis-title", x: G.kx0, y: G.top - 32 });
      const kax = el("g", { class: "axis" }, pk);
      for (const t of kt) T(kax, fTick(t), { x: G.sk(t), y: G.top - 14, "text-anchor": "middle" });
      el("path", { d: starPath(5), transform: `translate(${G.kx0},${G.top - 18})`, fill: GOLD, stroke: "#fff", "stroke-width": 0.8 }, kax);
      T(kax, "BF16", { class: "bf", x: G.kx0 - 8, y: G.top - 14, "text-anchor": "end" });

      // --- accuracy panel
      const pa = el("g", { class: "rc-panel acc" }, g);
      const at = V.niceTicks(ALO, AHI, 4).filter((t) => t > ALO);
      const agrid = el("g", { class: "grid" }, pa);
      for (const t of at) el("line", { x1: G.sa(t), x2: G.sa(t), y1: G.top - 8, y2: G.bottom }, agrid);
      T(pa, "average accuracy (%)", { class: "axis-title", x: G.ax0, y: G.top - 32 });
      if (G.wide) {
        const lg = el("g", { transform: `translate(${G.ax1},${G.top - 35})` }, pa);
        const lx = -(textW("BF16", 12, 600, MONO) + 4 * 12 * 0.1 + 8);
        el("line", { x1: lx, x2: lx, y1: -6, y2: 6, stroke: GOLD, "stroke-width": 2 }, lg);
        T(lg, "BF16", { class: "axis-title", x: 0, y: 4, "text-anchor": "end", fill: GOLD_D, style: "fill:" + GOLD_D });
      }
      const aax = el("g", { class: "axis" }, pa);
      for (const t of at) T(aax, String(t), { x: G.sa(t), y: G.top - 14, "text-anchor": "middle" });

      // --- blocks
      const meta = el("g", null, g);
      G.B.forEach((o) => {
        const b = o.b;
        const sk = G.sk;
        const nb = [];
        // GGUF group header (gap + kicker + hairline); the block meta then omits the repeated format
        if (o.ghY != null) {
          const gx = wide ? G.metaX : G.labX;
          const gTxt = [b.fmt, "llama.cpp"].filter(Boolean).join(" · ");
          T(meta, gTxt, { class: "rc-k halo", x: gx, y: o.ghY });
          el("line", { x1: gx + textW(gTxt.toUpperCase(), 12, 600, MONO) + gTxt.length * 12 * 0.1 + 10, x2: G.width - 2, y1: o.ghY - 3.5, y2: o.ghY - 3.5, class: "ghr" }, meta);
        }
        const fmtTxt = [b.gguf ? "" : b.fmt, b.bpw ? b.bpw.toFixed(2) + " bpw" : ""].filter(Boolean).join(" · ");
        if (wide) {
          T(meta, b.model, { class: "bname", x: G.metaX, y: o.y0 + 15 });
          if (fmtTxt) T(meta, fmtTxt, { class: "bfmt", x: G.metaX, y: o.y0 + 34 });
        } else {
          T(meta, b.model, { class: "bname", x: G.labX, y: o.y0 + 17 });
          if (fmtTxt) T(meta, fmtTxt, { class: "bfmt", x: G.labX + textW(b.model, 18, 500, "Newsreader, Georgia, serif") + 10, y: o.y0 + 17 });
        }
        // BF16 references
        const ya = o.r0 - 3, yb = o.y1 + 3;
        el("line", { x1: G.kx0, x2: G.kx0, y1: ya, y2: yb, stroke: GOLD, "stroke-width": 1.3 }, pk);
        el("path", { d: starPath(6), transform: `translate(${G.kx0},${ya - 2})`, fill: GOLD, stroke: "#fff", "stroke-width": 0.8 }, pk);
        const xa = G.sa(b.bf16);
        el("line", { x1: xa, x2: xa, y1: ya, y2: yb, stroke: GOLD, "stroke-width": 1.6 }, pa);
        const bfTxt = (G.wide ? "" : "BF16 ") + b.bf16.toFixed(1);
        const bfEnd = xa + 5 + textW(bfTxt, 12, 600) > G.width - 2;
        T(pa, bfTxt, { class: "bfval", x: bfEnd ? xa - 5 : xa + 5, y: ya + 1, "text-anchor": bfEnd ? "end" : "start" });

        b.rows.forEach((r, i) => {
          const y = o.ry[i];
          const isQ = r.m === Q;
          const row = el("g", { class: "rc-row", transform: `translate(0,${y})` }, g);
          const band = el("rect", { class: "band", x: wide ? G.labX - 8 : 2, y: -o.P / 2 + 1, width: G.width - (wide ? G.labX - 8 : 2) - 2, height: o.P - 2, rx: 6 }, row);
          const two = G.two && r.tag;
          T(row, r.m, { class: "mlab" + (isQ ? " q" : ""), x: G.labX, y: two ? -2.5 : 4, "font-size": G.mfs });
          if (two) T(row, r.tag, { class: "mtag" + (isQ ? " q" : ""), x: G.labX, y: 11, "font-size": G.tfs });
          else if (r.tag) T(row, r.tag, { class: "mtag" + (isQ ? " q" : ""), x: G.kx0 - (wide ? 14 : 8), y: 3.5, "text-anchor": "end", "font-size": G.tfs });
          const rad = isQ ? 6.5 : PTQ_SET.has(r.m) ? 4.6 : 5.4;
          // KL lollipop
          const kgr = el("g", { class: "kl" }, row);
          const track = el("line", { y1: 0, y2: 0, class: "lol" + (isQ ? " q" : "") }, kgr);
          const kd = el("g", { class: "dot" }, kgr);
          el("circle", { r: rad, fill: colorOf(r.m), stroke: "#fff", "stroke-width": isQ ? 1.6 : 1.1 }, kd);
          const kx = sk(r.v.KL);
          const kLeft = kx > G.kx1 - 30;
          const kv = T(kgr, "", { class: "cval" + (isQ ? " q" : ""), y: 4, "text-anchor": kLeft ? "end" : "start" });
          kv.__fmt = V.fmtKL;
          // accuracy dot
          const agr = el("g", { class: "acc" }, row);
          const atrack = el("line", { y1: 0, y2: 0, class: "lol a" }, agr);
          const ad = el("g", { class: "dot" }, agr);
          el("circle", { r: rad, fill: colorOf(r.m), stroke: "#fff", "stroke-width": isQ ? 1.6 : 1.1 }, ad);
          const ax = G.sa(r.v["Avg."]);
          const aw = textW(r.v["Avg."].toFixed(1), 12, isQ ? 700 : 400);
          // left of the dot when it clears the panel edge (one-panel phones: clears this row's own label)
          const aMin = G.both ? G.kx1 + 24 : G.labX + 8 + Math.max(textW(r.m, 12, isQ ? 700 : 500), two ? textW(r.tag, 12, isQ ? 600 : 500) : 0);
          const aLeft = ax < xa && !(b.hi && isQ) && ax - rad - 5 - aw > aMin;
          const av = T(agr, "", { class: "cval" + (isQ ? " q" : ""), y: 4, "text-anchor": aLeft ? "end" : "start" });
          av.__fmt = (v) => (+v).toFixed(1);
          const hit = el("rect", { x: 0, y: -o.P / 2, width: G.width, height: o.P, fill: "transparent" }, row);
          const key = o.y0 + ":" + i;
          hoverTip(hit, root, tip, () => rowTip(b, r), () => hot(key), () => hot(null));
          const n = { key, b, r, band, track, kd, kv, kx, kLeft, rad, atrack, ad, av, ax, aLeft, xa };
          N.rows.push(n); nb.push(n);
        });

        // paper-stated reductions: dashed bridge from QUASAR to the comparator's KL (Gemma INT4: + accuracy gain)
        const an = !b.gguf && BRIDGE[b.model];
        const ci = an ? b.rows.findIndex((r) => r.m === an.vs) : -1, qi = an ? b.rows.findIndex((r) => r.m === Q) : -1;
        if (ci >= 0 && qi >= 0) {
          const y = o.ry[qi], qv = b.rows[qi].v, nq = nb[qi];
          const xc = sk(b.rows[ci].v.KL), xq = sk(qv.KL), R0 = nq.rad;
          const qw = textW(V.fmtKL(qv.KL), 12, 700);
          const k = el("g", { class: "ann", transform: `translate(0,${y})` }, pk);
          const dash = (x1) => { if (xc - x1 > 3) el("line", { x1, x2: xc, y1: 0, y2: 0, stroke: ROSE, "stroke-width": 1.2, "stroke-dasharray": "3 3" }, k); };
          const tick = () => el("line", { x1: xc, x2: xc, y1: -5, y2: 5, stroke: ROSE, "stroke-width": 1.2 }, k);
          const lx = xq + R0 + 5 + qw + 6;
          if (!nq.kLeft && xc - lx > 10) {
            // room after QUASAR's value: bridge from the value to the comparator's KL, then the reduction
            dash(lx); tick(); T(k, an.kl, { class: "annlab", x: xc + 7, y: 4 });
          } else if (nq.kLeft || xq - R0 - 5 - qw >= G.kx0 + 3) {
            // close values (NVFP4 rows): QUASAR's value moves left of its dot; the bridge runs from the dot
            nq.kLeft = true; nq.kv.setAttribute("text-anchor", "end");
            dash(xq + R0 + 2); tick(); T(k, an.kl, { class: "annlab", x: Math.max(xc, xq + R0) + 7, y: 4 });
          } else T(k, an.kl, { class: "annlab", x: lx, y: 4 });   // no room either side: label after the value
          N.ann.push({ n: k, kl: true });
          if (an.acc) {
            const aq = G.sa(qv["Avg."]);
            const ka = el("g", { class: "ann", transform: `translate(0,${y})` }, pa);
            const qvW = textW(qv["Avg."].toFixed(1), 12, 700);
            T(ka, an.acc, { class: "annlab", x: aq + R0 + 5 + qvW + 6, y: 4 });
            N.ann.push({ n: ka, kl: false });
          }
        }
      });
      N.pk = pk; N.pa = pa;
      apply(seen ? "set" : "start");
      setPanels();
    }

    function setPanels() {
      if (!N) return;
      const showK = G.both || st.panel === "kl", showA = G.both || st.panel === "acc";
      N.pk.style.display = showK ? "" : "none";
      N.pa.style.display = showA ? "" : "none";
      for (const r of N.rows) {
        r.kd.parentNode.style.display = showK ? "" : "none";
        r.ad.parentNode.style.display = showA ? "" : "none";
      }
    }
    function switchPanel() {
      tip.hide();
      setPanels();
      if (!N || !seen) return;
      // re-run the entrance for the newly shown panel
      apply("start", st.panel);
      apply("enter", st.panel);
    }

    let hotKey = null;
    function hot(k) { hotKey = k; if (N) for (const r of N.rows) r.band.classList.toggle("hot", r.key === k); }

    function rowTip(b, r) {
      const v = r.v;
      return `<div class="tt">${esc(b.model)} · <span class="fmt">${esc(r.format)}</span></div>` +
        `<div class="row${r.m === Q ? " q" : ""}"><span>${sw(colorOf(r.m))}${esc(r.m)}</span></div>` +
        `<div class="row"><span>bpw</span><b>${v.bpw.toFixed(2)}</b></div>` +
        `<div class="row"><span>KL</span><b>${V.fmtKL(v.KL)}</b></div>` +
        `<div class="row"><span>Top-1</span><b>${v["Top-1"].toFixed(1)}</b></div>` +
        `<div class="row"><span>Avg.</span><b>${v["Avg."].toFixed(1)}</b></div>` +
        `<div class="row"><span>${sw(GOLD)}BF16 Avg.</span><b>${b.bf16.toFixed(1)}</b></div>`;
    }

    // which: undefined = both panels; "kl" | "acc" = only that panel
    function apply(mode, which) {
      const S = mode === "start";
      const doK = which !== "acc", doA = which !== "kl";
      N.rows.forEach((n, i) => {
        const dl = mode === "enter" ? 120 + i * 45 + (n.r.m === Q ? 200 : 0) : 0;
        if (doK) {
          go(n.kd, { x: S ? G.kx0 : n.kx, o: S ? 0 : 1 }, AP.x, mode, dl, 1000);
          go(n.track, { a: G.kx0, b: S ? G.kx0 : n.kx - n.rad }, AP.line, mode, dl, 1000);
          go(n.kv, { x: S ? G.kx0 : n.kLeft ? n.kx - n.rad - 5 : n.kx + n.rad + 5, v: S ? 0 : n.r.v.KL, o: S ? 0 : 1 }, numAP, mode, dl, 1000);
        }
        if (doA) {
          go(n.ad, { x: S ? n.xa : n.ax, o: S ? 0 : 1 }, AP.x, mode, dl, 1000);
          go(n.atrack, { a: n.xa, b: S ? n.xa : n.ax + (n.ax < n.xa ? n.rad : -n.rad) }, AP.line, mode, dl, 1000);
          go(n.av, { x: S ? n.xa : n.aLeft ? n.ax - n.rad - 5 : n.ax + n.rad + 5, v: S ? n.b.bf16 : n.r.v["Avg."], o: S ? 0 : 1 }, numAP, mode, dl, 1000);
        }
      });
      N.ann.forEach((a) => {
        if ((a.kl && !doK) || (!a.kl && !doA)) return;
        go(a.n, { o: S ? 0 : 1 }, AP.op, mode, mode === "enter" ? 120 + N.rows.length * 45 + 300 : 0, 500);
      });
      if (hotKey) hot(hotKey);
      svg.setAttribute("aria-label", "KL to BF16 and average accuracy (%) per checkpoint");
      if (which === undefined) srTable(sr, "KL to BF16 and average accuracy (%) per checkpoint", ["model", "method", "format", "bpw", "KL", "Top-1", "Avg.", "BF16 Avg."],
        blocks.flatMap((b) => b.rows.map((r) => [b.model, r.m, r.format, r.v.bpw.toFixed(2), V.fmtKL(r.v.KL), r.v["Top-1"].toFixed(1), r.v["Avg."].toFixed(1), b.bf16.toFixed(1)])));
    }

    root.style.minHeight = "0";
    const api = V.responsive(root, build);
    afterFonts(api);
    tapAway(root, tip, () => hot(null));
    V.onVisible(root, () => { if (seen) return; seen = true; if (N) apply("enter"); }, { threshold: 0.2 });
    finishers.push(() => { seen = true; if (N) { apply("set"); setPanels(); } });
  }

  /* ================================================================== *
   * D. Table 4 — step-time breakdown                                    *
   * ================================================================== */
  function overheadChart(root, R) {
    const O = R.training_overhead;
    const comps = O.rows.filter((r) => r.standard_qat_s != null && !/^Total|^%/.test(r.component));
    const total = O.rows.find((r) => /^Total/.test(r.component));
    const pct = O.rows.find((r) => /^%/.test(r.component));
    const REC = "Weight reconstruction";
    const BARS = [
      { k: "standard_qat_s", m: "Standard QAT", tot: total.standard_qat_s },
      { k: "quasar_s", m: Q, tot: total.quasar_s },
    ];
    const SHADES = ["#DCD8D0", "#CBC6BD", null, "#B5AFA5", "#E6E2DA", "#A49E94", "#8D887F"];
    const shade = (c, i, bi) => (c.component === REC ? (bi ? ROSE : V.C.standard_qat) : SHADES[i] || "#d5d1c9");

    root.textContent = "";
    const card = hh("div", { class: "viz rc-oh" }, root);
    const head = hh("div", { class: "viz-head", "data-label": "" }, card);
    hh("span", { class: "viz-kicker" }, head, "<b>training step time</b> · INT3 · 8× H100");
    const body = hh("div", { class: "viz-body" }, card);
    const box = hh("div", { class: "chart rc rc-ohbox" }, body);
    const plot = hh("div", { class: "rc-plot" }, box);
    const legend = hh("div", { class: "rc-ohleg", "data-label": "" }, box);
    const tip = V.tooltip(box);
    const sr = hh("div", { class: "sr-only", "data-label": "" }, box);
    srTable(sr, O.setting, ["component", "Standard QAT (s)", "QUASAR (s)"],
      comps.map((c) => [c.component, c.standard_qat_s.toFixed(3), c.quasar_s.toFixed(3)]).concat([[total.component, total.standard_qat_s.toFixed(3), total.quasar_s.toFixed(3)]]));
    let G = null, N = null, seen = RM;

    function build(width) {
      const narrow = width < 600;
      const g = { width, narrow };
      g.labW = narrow ? 0 : 112;
      g.totW = narrow ? 0 : 92;
      g.x0 = g.labW; g.x1 = width - g.totW;
      const tmax = Math.max(total.standard_qat_s, total.quasar_s);
      g.sx = V.lin([0, tmax], [g.x0, g.x1]);
      g.bh = narrow ? 24 : 28;
      g.namesH = narrow ? 0 : 22;
      g.y = narrow ? [22, 22 + 24 + 30] : [g.namesH + 6, g.namesH + 6 + g.bh + 12];
      g.annY = g.y[1] + g.bh + (narrow ? 16 : 18);
      g.height = g.annY + (narrow ? 8 : 10);
      G = g;
      const fr = V.frame(plot, width, g.height, { t: 0, r: 0, b: 0, l: 0 });
      const svg = fr.svg, gg = fr.g;
      svg.classList.add("rc-svg");
      svg.setAttribute("aria-label", "seconds per training step by component · Standard QAT and QUASAR");
      N = { segs: [], labs: [] };
      // component names over the top bar (wide only, where they fit)
      // names over the top bar for the wide components; each may run until the next named one starts
      const names = el("g", { class: "ohnames" }, gg);
      if (!narrow) {
        let cum = 0;
        const segs = comps.map((c) => { const a = g.sx(cum); cum += c.standard_qat_s; return { c, a, w: g.sx(cum) - a }; });
        const named = segs.filter((s) => s.c.component !== REC && s.w >= 48);
        named.forEach((s, k) => {
          const lim = (k + 1 < named.length ? named[k + 1].a : g.x1) - s.a - 4;
          if (textW(s.c.component, 12, 500) + 2 <= lim) T(names, s.c.component, { class: "ohname", x: s.a + 2, y: g.namesH - 3 });
        });
      }
      BARS.forEach((B, bi) => {
        const y = g.y[bi];
        const row = el("g", { transform: `translate(0,${y})` }, gg);
        if (narrow) {
          T(row, B.m, { class: "ohm" + (bi ? " q" : ""), x: 0, y: -7 });
          const tt = T(row, "", { class: "ohtot" + (bi ? " q" : ""), x: width, y: -7, "text-anchor": "end" });
          tt.innerHTML = `${B.tot.toFixed(2)} s` + (bi ? `<tspan class="ohpct" dx="6">+${pct.quasar_s.toFixed(1)}%</tspan>` : "");
        } else {
          T(row, B.m, { class: "ohm" + (bi ? " q" : ""), x: g.labW - 14, y: g.bh / 2 + 4, "text-anchor": "end" });
          const tt = T(row, "", { class: "ohtot" + (bi ? " q" : ""), x: g.x1 + 12, y: g.bh / 2 + 4 });
          tt.innerHTML = `${B.tot.toFixed(2)} s` + (bi ? `<tspan class="ohpct" dx="6">+${pct.quasar_s.toFixed(1)}%</tspan>` : "");
        }
        let c0 = 0;
        comps.forEach((c, i) => {
          const v = c[B.k];
          const a = g.sx(c0), b = g.sx(c0 + v);
          c0 += v;
          const isR = c.component === REC;
          const seg = el("rect", { y: 0, height: g.bh, fill: shade(c, i, bi), class: "ohseg" + (isR ? " r" : "") }, row);
          // seconds always with the paper's three decimals; label only segments wide enough to hold it
          const vs = v.toFixed(3);
          const lab = (b - a) >= textW(vs, 12, isR ? 600 : 500) + 6 ? T(row, vs, { class: "ohv" + (isR ? " r" : ""), x: (a + b) / 2, y: g.bh / 2 + 4, "text-anchor": "middle" }) : null;
          N.segs.push({ seg, a, b, bi, i, lab });
          hoverTip(seg, box, tip, () => segTip(c), () => hot(c.component), () => hot(null));
        });
        el("rect", { x: g.x0, y: 0, width: g.sx(B.tot) - g.x0, height: g.bh, rx: 4, fill: "none", stroke: "rgba(29,31,34,.08)" }, row);
      });
      // reconstruction annotation under the QUASAR bar
      {
        const pre = comps.slice(0, comps.findIndex((c) => c.component === REC));
        const a = g.sx(pre.reduce((s, c) => s + c.quasar_s, 0));
        const rc = comps.find((c) => c.component === REC);
        const b = a + (g.sx(rc.quasar_s) - g.x0);
        const ann = el("g", { class: "ohann" }, gg);
        const yb = g.y[1] + g.bh;
        el("path", { d: `M${a},${yb + 4}V${yb + 8}H${b}V${yb + 4}`, fill: "none", stroke: ROSE, "stroke-width": 1.2 }, ann);
        const t = el("text", { class: "ohannlab", x: narrow ? a : (a + b) / 2, y: g.annY + 4, "text-anchor": narrow ? "start" : "middle" }, ann);
        const s0 = el("tspan", { class: "n" }, t); s0.textContent = REC + "  ";
        const s1 = el("tspan", { class: "g" }, t); s1.textContent = rc.standard_qat_s.toFixed(3);
        const s2 = el("tspan", null, t); s2.textContent = " → ";
        const s3 = el("tspan", { class: "q" }, t); s3.textContent = rc.quasar_s.toFixed(3) + " s";
        N.ann = ann;
      }
      // compact legend for narrow screens
      legend.innerHTML = "";
      legend.style.display = narrow ? "" : "none";
      if (narrow) comps.forEach((c, i) => {
        const it = hh("div", { class: "it" + (c.component === REC ? " r" : "") }, legend);
        hh("i", { class: "sw", style: `background:${c.component === REC ? ROSE : shade(c, i, 0)}` }, it);
        hh("span", { class: "n" }, it, esc(c.component));
        hh("span", { class: "v" }, it, c.standard_qat_s === c.quasar_s ? c.quasar_s.toFixed(3) : `${c.standard_qat_s.toFixed(3)} → ${c.quasar_s.toFixed(3)}`);
      });
      apply(seen ? "set" : "start");
    }
    function segTip(c) {
      return `<div class="tt">${esc(c.component)}</div>` +
        `<div class="row"><span>${sw(V.C.standard_qat)}Standard QAT</span><b>${c.standard_qat_s.toFixed(3)} s</b></div>` +
        `<div class="row q"><span>${sw(ROSE)}QUASAR</span><b>${c.quasar_s.toFixed(3)} s</b></div>`;
    }
    function hot(name) {
      if (!N) return;
      box.classList.toggle("rc-hot", !!name);
      N.segs.forEach((s) => s.seg.classList.toggle("on", !!name && comps[s.i].component === name));
    }
    function apply(mode) {
      const S = mode === "start";
      N.segs.forEach((s) => {
        const dl = mode === "enter" ? s.bi * 220 + s.i * 50 : 0;
        go(s.seg, { a: S ? G.x0 : s.a, b: S ? G.x0 : s.b }, AP.seg, mode, dl, 900);
        if (s.lab) go(s.lab, { o: S ? 0 : 1 }, AP.op, mode, dl + 500, 400);
      });
      go(N.ann, { o: S ? 0 : 1 }, AP.op, mode, mode === "enter" ? 1100 : 0, 500);
    }
    const api = V.responsive(box, build);
    afterFonts(api);
    tapAway(box, tip, () => hot(null));
    V.onVisible(box, () => { if (seen) return; seen = true; if (N) apply("enter"); }, { threshold: 0.4 });
    finishers.push(() => { seen = true; if (N) apply("set"); });
  }

  /* ================================================================== *
   * E. Released checkpoints — cards                                     *
   * ================================================================== */
  // identical to assets/data/checkpoints.json; used only if that file cannot be loaded
  const CK_FALLBACK = { families: [
    { name: "Qwen3.5-4B", base: "Qwen/Qwen3.5-4B", models: [
        { repo: "QUASAR-QAT/Qwen3.5-4B-QUASAR-NVFP4", format: "NVFP4", runtime: "vLLM" },
        { repo: "QUASAR-QAT/Qwen3.5-4B-QUASAR-NVFP4-W4A4", format: "NVFP4 W4A4", runtime: "vLLM" },
        { repo: "QUASAR-QAT/Qwen3.5-4B-QUASAR-Q4_0-GGUF", format: "GGUF Q4_0", runtime: "llama.cpp" }] },
    { name: "Qwen3.8-27B", base: "Qwen/Qwen3.8-27B", models: [
        { repo: "QUASAR-QAT/Qwen3.8-27B-QUASAR-NVFP4", format: "NVFP4", runtime: "vLLM" }] },
    { name: "Gemma-4 E4B", base: "google/gemma-4-E4B-it", models: [
        { repo: "QUASAR-QAT/gemma-4-E4B-it-QUASAR-W4A16-G64", format: "INT4 g64", runtime: "vLLM" },
        { repo: "QUASAR-QAT/gemma-4-E4B-it-QUASAR-Q4_0-GGUF", format: "GGUF Q4_0", runtime: "llama.cpp" }] },
    { name: "Gemma-4 12B", base: "google/gemma-4-12B-it", models: [
        { repo: "QUASAR-QAT/gemma-4-12B-it-QUASAR-W4A16-G64", format: "INT4 g64", runtime: "vLLM" },
        { repo: "QUASAR-QAT/gemma-4-12B-it-QUASAR-Q4_0-GGUF", format: "GGUF Q4_0", runtime: "llama.cpp" }] },
    { name: "Muse-Glimmer-30B", base: "meta-models/Muse-Glimmer-30B", models: [
        { repo: "QUASAR-QAT/Muse-Glimmer-30B-QUASAR-NVFP4", format: "NVFP4", runtime: "vLLM" },
        { repo: "QUASAR-QAT/Muse-Glimmer-30B-QUASAR-NVFP4-W4A4", format: "NVFP4 W4A4", runtime: "vLLM" },
        { repo: "QUASAR-QAT/Muse-Glimmer-30B-QUASAR-Q4_0-GGUF", format: "GGUF Q4_0", runtime: "llama.cpp" }] }
  ] };

  // R: results.json (null = links only, before the data arrives or if it fails); CK: checkpoints.json
  function modelsGrid(root, R, CK) {
    const T11 = R ? R.released_checkpoints_table11 : null;
    const HF = "https://huggingface.co/";
    // checkpoints.json format -> Table 11 QUASAR row format (exact artifact match only)
    const FMAP = { "NVFP4": "NVFP4 W4A16", "NVFP4 W4A4": "NVFP4 W4A4", "INT4 g64": "INT4 g64", "GGUF Q4_0": "GGUF Q4_0" };
    function match(family, fmt) {
      const M = T11 && T11.models[family];
      if (!M) return null;
      const want = FMAP[fmt];
      for (const bk in M.blocks) {
        const rows = M.blocks[bk];
        const q = rows.find((r) => r.method === Q && r.format === want);
        if (q) {
          let bf = null;
          for (const k in M.blocks) bf = bf || M.blocks[k].find((r) => r.method === "BF16");
          // strip: this QUASAR artifact + the other Table 11 rows of the same block (no BF16, no sibling QUASAR rows);
          // those baselines mix public artifacts with the authors' own RTN / GPTQ conversions
          return { q, rows: rows.filter((r) => r === q || (r.method !== "BF16" && r.method !== Q)), bf, gguf: /GGUF/.test(bk + " " + want) };
        }
      }
      return null;
    }
    const hits = new Map();
    for (const f of CK.families) for (const m of f.models) { const h = match(f.name, m.format); if (h) hits.set(m, h); }
    // two log KL scales (1-2-5 bounds): one shared by every NVFP4 / INT4 strip, one by the GGUF strips
    // (GGUF KL is comparable only within its block, so it never shares an axis with the others)
    const g125 = [];
    for (let e = -4; e <= 1; e++) for (const k of [1, 2, 5]) g125.push(+(k * Math.pow(10, e)).toPrecision(3));
    function kscale(gguf) {
      const kv = [];
      hits.forEach((h) => { if (h.gguf === gguf) h.rows.forEach((r) => { if (r.values.KL > 0) kv.push(r.values.KL); }); });
      const lo = kv.length ? g125.filter((x) => x <= Math.min(...kv) / 1.2).pop() : 0.01;
      const hi = kv.length ? g125.find((x) => x >= Math.max(...kv) * 1.1) : 0.5;
      return (v) => Math.max(0, Math.min(1, (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))));
    }
    const LPOS = { std: kscale(false), gguf: kscale(true) };
    const S0 = 22, S1 = 7;   // strip: star at 7px, log range from 22px to (100% - 7px)
    const STAR = `<svg viewBox="-5 -5 10 10" aria-hidden="true"><path d="${starPath(4.6)}"/></svg>`;

    root.textContent = "";
    root.classList.add("rc-models");
    root.setAttribute("data-label", "");
    root.classList.toggle("has-data", hits.size > 0);
    const tip = V.tooltip(root);
    if (hits.size) {
      const lg = hh("div", { class: "mlegend", "aria-hidden": "true" }, root);
      lg.innerHTML = `<span class="it"><span class="star">${STAR}</span>BF16</span><span class="dotsep">·</span>` +
        `<span class="it q"><i class="pt q"></i>QUASAR</span><span class="dotsep">·</span>` +
        `<span class="it"><i class="pt o"></i>baselines</span><span class="dotsep">·</span>` +
        `<span class="it k">KL to BF16 · log scale</span>`;
    }
    const hasData = (f) => f.models.some((m) => hits.has(m));
    // a family whose numbers come from its Hugging Face model card (not the paper): a full-width card after the
    // Table 11 cards, its source labelled in the header
    const hasHF = (f) => !!(f.hf_card && f.hf_card.tables && f.hf_card.tables.length);
    const rank = (f) => (hasHF(f) ? 1 : hits.size && !hasData(f) ? 2 : 0);
    const fams = CK.families.map((f, i) => [f, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
    fams.forEach((f) => {
      const hf = hasHF(f);
      const card = hh("article", { class: "mcard" + (hf ? " hf" : hits.size && !hasData(f) ? " slim" : "") }, root);
      const top = hf ? hh("div", { class: "mtop" }, card) : card;
      const hd = hh("header", { class: "mhead" }, top);
      hh("h3", { class: "mname" }, hd, esc(f.name));
      hh("div", { class: "mbase" }, hd, esc(f.base));
      if (hf) {
        const a = hh("a", { class: "msrc", href: f.hf_card.source, target: "_blank", rel: "noopener", title: f.hf_card.source }, hd);
        hh("span", null, a, "source: " + esc(f.hf_card.source_label));
        a.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5h5.5V8M9.5 2.5 3 9" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>');
      }
      const list = hh("ul", { class: "mlist" }, top);
      for (const m of f.models) {
        const li = hh("li", { class: "mitem" }, list);
        const line = hh("div", { class: "mline" }, li);
        const a = hh("a", { class: "mchip", href: HF + m.repo, target: "_blank", rel: "noopener", title: m.repo,
          "aria-label": `${m.repo} on Hugging Face (opens in new tab)` }, line);
        hh("span", null, a, esc(m.format));
        a.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5h5.5V8M9.5 2.5 3 9" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>');
        hh("span", { class: "mrt" }, line, esc(m.runtime));
        const hit = hits.get(m);
        if (hit) {
          const d = hh("div", { class: "mdata" }, li);
          d.innerHTML = `<span class="k">${hit.gguf ? "KL (GGUF)" : "KL"}</span><b>${V.fmtKL(hit.q.values.KL)}</b><span></span>` +
            `<span class="k">avg.</span><b>${hit.q.values["Avg."].toFixed(1)}</b>` +
            (hit.bf ? `<span class="bf">BF16 ${hit.bf.values["Avg."].toFixed(1)}</span>` : "<span></span>");
          strip(li, hit, f.name, m.format);
        }
      }
      if (hf) hfBody(card, f);
    });

    /* Hugging Face model-card numbers (Qwen3.8-27B): sizes as bars, accuracy as strips on ONE linear scale of
       points below BF16 (BF16 star off-scale at the left, as in the KL strips: closer to the star = better).
       Values print exactly as the card does (strings). The static sr-only table after the grid carries the
       same numbers, so this visual block is aria-hidden. */
    function hfBody(card, f) {
      const H = f.hf_card;
      const num = (s) => parseFloat(s);
      const role = (t, r) => t.rows.find((x) => x.role === r);
      const accCols = (t) => t.columns.map((c, j) => j).filter((j) => !isNaN(num(role(t, "bf16").values[j])) && !/GB$/.test(role(t, "bf16").values[j]));
      // one gap scale for every strip (1-2-5 step ticks)
      let gMax = 0, gMin = 0;
      for (const t of H.tables) for (const j of accCols(t)) {
        const bf = num(role(t, "bf16").values[j]);
        for (const r of t.rows) if (r.role !== "bf16") { gMax = Math.max(gMax, bf - num(r.values[j])); gMin = Math.min(gMin, bf - num(r.values[j])); }
      }
      const step = gMax > 20 ? 10 : gMax > 8 ? 5 : gMax > 4 ? 2 : 1;
      const hi = Math.max(step, Math.ceil(gMax / step) * step), lo = Math.floor(gMin / step) * step;
      const gpos = (g) => (g - lo) / (hi - lo);
      const at = (fr) => `calc(${S0}px + ${(fr * 100).toFixed(3)}% - ${(fr * (S0 + S1)).toFixed(2)}px)`;
      const ticks = [];
      for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);

      const body = hh("div", { class: "hfbody", "aria-hidden": "true" }, card);
      const lg = hh("div", { class: "mlegend" }, body);
      lg.innerHTML = `<span class="it"><span class="star">${STAR}</span>BF16</span><span class="dotsep">·</span>` +
        `<span class="it q"><i class="pt q"></i>QUASAR</span><span class="dotsep">·</span>` +
        `<span class="it"><i class="pt o"></i>baselines</span><span class="dotsep">·</span>` +
        `<span class="it k">accuracy (%) · points below BF16 · linear</span>`;
      // column widths shared by every row of the card, so strips in both columns have the same length
      const SANS = "Inter, system-ui, sans-serif", SERIF = "Newsreader, Georgia, serif";
      const labs = [], vals = [], rvals = [], lnvals = [];
      for (const t of H.tables) {
        accCols(t).forEach((j) => { labs.push(textW(pretty(t.columns[j]), 12, 500, SANS)); vals.push(textW(role(t, "quasar").values[j], 17, 500, SERIF)); rvals.push(textW(role(t, "bf16").values[j], 12, 500, MONO)); });
        t.columns.forEach((c, j) => { if (/GB$/.test(role(t, "bf16").values[j])) t.rows.forEach((r) => { labs.push(textW(r.short, 12, 600, SANS)); vals.push(textW(String(num(r.values[j])), 13, 600, SANS)); }); });
        const li = t.columns.findIndex((c) => /linears/i.test(c));
        if (li >= 0) t.rows.forEach((r) => lnvals.push(textW(r.values[li], 12, 500, MONO)));
      }
      body.style.setProperty("--hf-lw", Math.ceil(Math.max(...labs)) + 2 + "px");
      body.style.setProperty("--hf-vw", Math.ceil(Math.max(...vals)) + 2 + "px");
      body.style.setProperty("--hf-bw", Math.ceil(Math.max(...rvals)) + 2 + "px");
      if (lnvals.length) body.style.setProperty("--hf-lnw", Math.ceil(Math.max(...lnvals)) + 2 + "px");

      H.tables.forEach((t) => {
        const g = hh("div", { class: "hfg" }, body);
        const base = t.rows.filter((r) => r.role === "baseline");
        hh("div", { class: "hfk" }, g, t.key === "public" ? esc(t.label) : esc(base.map((r) => r.short).join(" · ") + " · " + t.label.replace(/ NVFP4$/, "")));
        // sizes (public builds), as numbers only: every build, QUASAR first, BF16 last
        const si = t.columns.findIndex((c, j) => /GB$/.test(role(t, "bf16").values[j]));
        if (si >= 0) {
          const grid = hh("div", { class: "hfrows szg" }, g);
          const li = t.columns.findIndex((c) => /linears/i.test(c));
          const order = [role(t, "quasar")].concat(base, [role(t, "bf16")]);
          hh("span", { class: "hh" }, grid);
          hh("span", { class: "hh v" }, grid, "GB");
          hh("span", { class: "hh" }, grid);
          hh("span", { class: "hh r" }, grid, li >= 0 ? esc(t.columns[li]) : "");
          for (const r of order) {
            const c = r.role === "quasar" ? " q" : r.role === "bf16" ? " g" : "";
            hh("span", { class: "nm" + c }, grid, esc(r.short));
            hh("span", { class: "sz" + c }, grid, esc(String(num(r.values[si]))));
            hh("span", null, grid);
            hh("span", { class: "rv" + c }, grid, li >= 0 ? esc(r.values[li]) : "");
          }
        }
        const cols = accCols(t);
        if (!cols.length) return;
        const grid = hh("div", { class: "hfrows" }, g);
        // accuracy header: QUASAR | gap ticks | BF16
        hh("span", { class: "hh" }, grid);
        hh("span", { class: "hh v q" }, grid, "QUASAR");
        const ax = hh("span", { class: "hfax" }, grid);
        for (const v of ticks) hh("span", { style: `left:${at(gpos(v))}` }, ax, String(v));
        hh("span", { class: "hh r g" }, grid, "BF16");
        for (const j of cols) {
          const b = t.columns[j];
          const bf = role(t, "bf16"), q = role(t, "quasar");
          const bv = num(bf.values[j]);
          hh("span", { class: "nm" }, grid, esc(pretty(b)));
          hh("b", { class: "qv" }, grid, esc(q.values[j]));
          const s = hh("span", { class: "mstrip" }, grid);
          hh("span", { class: "base" }, s);
          for (const v of ticks) if (v !== lo) hh("span", { class: "tk", style: `left:${at(gpos(v))}` }, s);
          hh("span", { class: "star", style: `left:${S1}px` }, s, STAR);
          for (const r of base) hh("span", { class: "pt o", style: `left:${at(gpos(bv - num(r.values[j])))}` }, s);
          hh("span", { class: "pt q", style: `left:${at(gpos(bv - num(q.values[j])))}` }, s);
          hh("span", { class: "rv g" }, grid, esc(bf.values[j]));
          // tooltip: every build on this benchmark, nearest to the pointer highlighted
          const rows = [q].concat(base, [bf]);
          const px = (r) => { const w = s.getBoundingClientRect().width; return r === bf ? S1 : S0 + gpos(bv - num(r.values[j])) * Math.max(1, w - S0 - S1); };
          let cur = null;
          const pick = (e) => { const x = e.clientX - s.getBoundingClientRect().left; return rows.reduce((a, r) => (Math.abs(px(r) - x) < Math.abs(px(a) - x) ? r : a), rows[0]); };
          const html = () => `<div class="tt">${esc(pretty(b))} · <span class="fmt">${esc(H.format)}</span></div>` +
            rows.slice().sort((a, c) => num(c.values[j]) - num(a.values[j])).map((r) =>
              `<div class="row${r === q ? " q" : ""}${r === cur ? " cur" : ""}"><span>${sw(r.role === "quasar" ? ROSE : r.role === "bf16" ? GOLD : V.C.ptq)}${esc(r.short)}</span><b>${esc(r.values[j])}</b></div>`).join("") +
            (t.note && t.note[b] ? `<div class="row"><small>${esc(t.note[b])}</small></div>` : "");
          s.addEventListener("pointermove", (e) => { cur = pick(e); }, true);
          s.addEventListener("pointerup", (e) => { cur = pick(e); }, true);
          hoverTip(s, root, tip, html, null, null);
        }
      });
    }

    // KL strip on a log scale (GGUF strips on their own): the QUASAR artifact in rose, the other Table 11 rows of
    // the same block (public artifacts and the authors' RTN / GPTQ conversions) in grey
    function strip(li, hit, fam, fmt) {
      const lpos = hit.gguf ? LPOS.gguf : LPOS.std;
      const s = hh("div", { class: "mstrip", role: "img",
        "aria-label": `${fam} · ${fmt} · KL to BF16: ` + hit.rows.map((r) => `${r.method} (${r.format}) ${V.fmtKL(r.values.KL)}`).join(", ") }, li);
      const pos = (v) => { const f = lpos(v); return `calc(${S0}px + ${(f * 100).toFixed(3)}% - ${(f * (S0 + S1)).toFixed(2)}px)`; };
      hh("span", { class: "base" }, s);
      hh("span", { class: "star", style: `left:${S1}px` }, s, STAR);
      for (const r of hit.rows) if (r !== hit.q) hh("span", { class: "pt o", style: `left:${pos(r.values.KL)}` }, s);
      hh("span", { class: "pt q", style: `left:${pos(hit.q.values.KL)}` }, s);
      const pick = (e) => {
        const b = s.getBoundingClientRect();
        const x = (e.clientX - b.left - S0) / Math.max(1, b.width - S0 - S1);
        let best = hit.rows[0];
        for (const r of hit.rows) if (Math.abs(lpos(r.values.KL) - x) < Math.abs(lpos(best.values.KL) - x)) best = r;
        return best;
      };
      let cur = null;
      const html = () => `<div class="tt">${esc(fam)}${hit.gguf ? " · GGUF" : ""}</div>` + hit.rows.slice().sort((a, b) => a.values.KL - b.values.KL).map((r) =>
        `<div class="row${r === hit.q ? " q" : ""}${r === cur ? " cur" : ""}"><span>${sw(r.method === Q ? ROSE : V.C.ptq)}${esc(r.method)} <small>${esc(r.format)}</small></span><b>${V.fmtKL(r.values.KL)}</b></div>`).join("");
      // pick the nearest build before hoverTip shows: on mouse move, and on the touch pointerup that opens it
      s.addEventListener("pointermove", (e) => { cur = pick(e); }, true);
      s.addEventListener("pointerup", (e) => { cur = pick(e); }, true);
      hoverTip(s, root, tip, () => html(), null, null);
    }
    tapAway(root, tip, null);
  }

  /* ------------------------------------------------------------------ */
  // a chart whose data cannot be loaded: collapse the reserved height, show a neutral data label
  function unavailable(n) {
    n.style.minHeight = "0";
    n.textContent = "";
    hh("div", { class: "rc-na", "data-label": "" }, n, "— data unavailable —");
  }

  function boot() {
    const CHARTS = [["heal-acc", healAcc], ["adapt-chart", adaptChart], ["ckpt-kl", ckptChart], ["overhead", overheadChart]]
      .map(([id, fn]) => ({ id, fn, n: document.getElementById(id) })).filter((c) => c.n);
    const mg = document.getElementById("models-grid");
    if (!CHARTS.length && !mg) return;
    let RES = null;
    const getR = () => V.json(dataURL("results.json")).then((R) => (RES = R));
    const err = (id) => (e) => console.error("[charts-results] " + id, e);
    const settled = new Set();
    function mount(c) {
      if (settled.has(c.n) || !RES) return;
      settled.add(c.n);
      try { c.fn(c.n, RES); if (printing) finishAll(); } catch (e) { err(c.id)(e); unavailable(c.n); }
    }
    function fail(c) { if (!settled.has(c.n)) { settled.add(c.n); unavailable(c.n); } }
    function load(c) {
      getR().then(() => mount(c), (e) => { err(c.id)(e); fail(c); });
    }
    // charts fetch + draw only once they are within 800px of the viewport
    for (const c of CHARTS) V.onVisible(c.n, () => load(c), { rootMargin: "800px", threshold: 0 });

    // checkpoint cards: the links render promptly; Table 11 data joins when the grid nears the viewport
    let gridCK = null, gridFull = false;
    function drawGrid(R) {
      if (gridFull) return;
      try { modelsGrid(mg, R, gridCK); gridFull = !!R; }
      catch (e) { err("models-grid")(e); gridFull = true; modelsGrid(mg, null, CK_FALLBACK); }
    }
    if (mg) {
      V.json(dataURL("checkpoints.json")).catch((e) => { err("models-grid")(e); return CK_FALLBACK; }).then((CK) => {
        gridCK = CK && CK.families ? CK : CK_FALLBACK;
        const near = () => { const r = mg.getBoundingClientRect(); return r.top < innerHeight + 800 && r.bottom > -800; };
        if (RES) return drawGrid(RES);
        if (!near()) drawGrid(null);
        V.onVisible(mg, () => getR().then(drawGrid, (e) => { err("models-grid")(e); if (!mg.firstChild) drawGrid(null); }), { rootMargin: "800px", threshold: 0 });
      });
    }

    // in-page links (nav): settle the chart + card heights BEFORE the browser computes the scroll target,
    // otherwise content mounting mid-scroll pushes the target down (e.g. "Models" landed ~700px short)
    let navTried = false;
    const settle = () => { CHARTS.forEach(mount); if (mg && gridCK) drawGrid(RES); };
    document.addEventListener("click", (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a || a.getAttribute("href").length < 2 || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!CHARTS.some((c) => !settled.has(c.n)) && !(mg && gridCK && !gridFull)) return;
      if (RES) { settle(); return; }                    // synchronous: the default scroll sees the final layout
      if (navTried) return;                             // data unavailable: navigate as is
      navTried = true;
      e.preventDefault();
      getR().then(settle, () => CHARTS.forEach(fail)).then(() => a.click());
    }, true);

    // print: draw whatever has data and jump every chart to its final state. results.json is prefetched once
    // the page is idle after load, so a print from a fresh load mounts synchronously here; if the fetch is still
    // in flight, load() mounts on arrival and mount() finishes the chart while `printing` is set.
    window.addEventListener("beforeprint", () => {
      printing = true;
      if (RES) { CHARTS.forEach(mount); if (mg && gridCK) drawGrid(RES); }
      else {
        CHARTS.forEach(load);
        if (mg && gridCK) getR().then(drawGrid, () => {});
      }
      finishAll();
    });
    window.addEventListener("afterprint", () => { printing = false; });
    const prefetch = () => getR().catch(() => {});
    const idle = () => (window.requestIdleCallback ? window.requestIdleCallback(prefetch, { timeout: 1500 }) : setTimeout(prefetch, 1500));
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
