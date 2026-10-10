/* ix-judge.js — interactive Figures 27-29 (Appendix E.3: INT2 LLM judge, response stability, responses).
   Mounts: #ix-fig27 (judge win / tie / loss, Table 7 net preference), #ix-fig28 (word-repetition ratio),
           #ix-fig29 (beginning of each method's response to one held-out prompt).
   Data:   assets/data/ix-judge.json (tools/extract_ix_judge.py, read back from the paper's own figure code).
   Renders data labels only (no prose). Needs window.Viz (viz.js). */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const DATA = SRC ? new URL("../data/ix-judge.json", SRC).href : "assets/data/ix-judge.json";
  const el = V.el, h = V.h;
  const reduce = V.reducedMotion;
  const ROSE = "#D1495B", ROSE_T = "#A13040", GOLD = "#C9A227", GOLD_T = "#7D6310";
  const INK = "#1d1f22", INK2 = "#44484f", MUTED = "#6b6f75";
  const WIN = ROSE, TIE = "#D9D6CF", LOSS = "#6B6F75";
  const COLOR = {
    "QUASAR": ROSE, "Standard QAT": "#3F4245", "LSQ": "#80B1A8", "Denoising QAT": "#8E6C9A", "BitDistiller": "#C98A2B",
    "RTN": "#C6CACE", "GPTQ": "#686F77", "AWQ": "#979DA4", "FP16": GOLD,
  };
  const SANS = '"Inter", ui-sans-serif, system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const signed = (v, d) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
  const pct1 = (v) => v.toFixed(1) + "%";
  const ctx2d = document.createElement("canvas").getContext("2d");
  function tw(s, w, fam, upper) {
    ctx2d.font = (w || 500) + " 12px " + (fam || SANS);
    const t = upper ? String(s).toUpperCase() : String(s);
    return ctx2d.measureText(t).width + (upper ? t.length * 0.96 : 0);
  }
  function T(parent, text, attrs) { const n = el("text", attrs, parent); n.textContent = text; return n; }
  function anim(ms, step, done) {
    let alive = true;
    if (reduce || !ms) { step(1); if (done) done(); return { stop() {} }; }
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const f = (now) => {
      if (!alive) return;
      const t = Math.min(1, (now - t0) / ms);
      step(ease(t));
      if (t < 1) requestAnimationFrame(f); else if (done) done();
    };
    requestAnimationFrame(f);
    return { stop() { alive = false; } };
  }
  // Paired cards share one height (CSS subgrid). Beside a taller chart, this one grows by `extra` px so both
  // charts end at the same depth; its draw records what it spent in `used`. Heights are compared net of what
  // each side spent (so two filling partners never chase each other); stacked on one column, extra stays 0.
  const FILLS = new WeakMap();
  function pairFill(root, partnerId, redraw, max) {
    const st = { extra: 0, used: 0 }, partner = document.getElementById(partnerId);
    FILLS.set(root, st);
    const fig = root.closest("figure"), pfig = partner && partner.closest("figure");
    if (!fig || !pfig || !("ResizeObserver" in window)) return st;
    let raf = 0;
    const check = () => {
      raf = 0;
      const a = fig.getBoundingClientRect(), b = pfig.getBoundingClientRect();
      let want = 0;
      if (Math.abs(a.left - b.left) > 4) {   // side by side (tops can differ only by the reveal transform)
        const ps = FILLS.get(partner);
        const own = root.getBoundingClientRect().bottom - a.top - st.used;
        const other = partner.getBoundingClientRect().bottom - b.top - (ps ? ps.used : 0);
        want = clamp(Math.round(other - own), 0, max);
      }
      if (Math.abs(want - st.extra) >= 2) { st.extra = want; redraw(); }
    };
    const ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(check); });
    ro.observe(root); ro.observe(partner);
    return st;
  }
  function whenFonts(cb) { if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(cb); }
  function srTable(node, head, rows) {
    node.innerHTML = "<thead><tr>" + head.map((x) => "<th>" + esc(x) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((x, i) => (i ? "<td>" : '<th scope="row">') + esc(x) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody>";
  }
  function outsideTap(node, fn) {
    document.addEventListener("pointerdown", (e) => { if (!node.contains(e.target)) fn(); }, { passive: true });
  }
  // Pointer input on a plot: mouse tracks; touch shows values only on a tap (< 10 px travel); the pointercancel the
  // browser sends when a vertical swipe becomes a page scroll clears the highlight + tooltip.
  function bindPointer(node, move, off) {
    let t0 = null;
    node.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") move(e); else t0 = [e.clientX, e.clientY]; });
    node.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || (e.pointerType === "pen" && !t0)) move(e); });
    node.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse" && t0 && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 10) move(e, true);
      t0 = null;
    });
    node.addEventListener("pointercancel", () => { t0 = null; off(); });
    node.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") off(); });
  }
  function legendRow(parent, items) {
    const row = h("div", { class: "ixj-legend", "aria-hidden": "true" }, parent);
    for (const it of items) {
      const li = h("span", { class: "ixj-li" + (it.q ? " q" : "") }, row);
      h("i", { class: "ixj-k" + (it.dash ? " dash" : ""), style: it.dash ? "border-color:" + it.color : "background:" + it.color }, li);
      h("span", null, li, esc(it.label));
    }
    return row;
  }
  // contrast-aware label color for text drawn on a bar
  function onBar(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return (1.05) / (L + 0.05) >= (L + 0.05) / 0.06 ? "#fff" : INK;
  }

  // ================================================================ Figure 27 — pairwise judge preference
  function fig27(root, D) {
    const F = D.fig27;
    const byId = {};
    for (const m of F.models) byId[m.id] = m;
    const st = { model: F.models[0].id, sort: "method", hi: null };
    root.classList.add("ixj", "ixj27");
    const ctl = h("div", { class: "controls ixj-controls" }, root);
    const SHORT = { qwen: "Qwen3-4B", llama: "Llama-3.1-8B" };
    V.pills(h("div", { class: "ixj-ctl" }, ctl),
      F.models.map((m) => ({ value: m.id, label: '<span class="lg">' + esc(m.label) + '</span><span class="sm">' + esc(SHORT[m.id] || m.label) + "</span>" })), st.model,
      (v) => { st.model = v; go(520); }, "model");
    const c2 = h("div", { class: "ixj-ctl" }, ctl);
    h("span", { class: "lab", "data-label": "" }, c2, "order");
    V.pills(c2, [{ value: "method", label: "method" }, { value: "net", label: "net preference" }], st.sort,
      (v) => { st.sort = v; go(460); }, "row order");
    legendRow(root, [{ label: "QUASAR preferred", color: WIN, q: true }, { label: "tie", color: TIE }, { label: "baseline preferred", color: LOSS }]);
    const plot = h("div", { class: "ixj-plot", tabindex: "0", role: "group", "aria-label": "LLM judge chart" }, root);
    const tip = V.tooltip(plot);
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    const methods = F.models[0].rows.map((r) => r.m);
    let disp = null, N = null, L = null, A = null, revealed = false;

    function target() {
      const M = byId[st.model], comp = M.rows.filter((r) => r.type !== "ref");
      const ord = st.sort === "net" ? comp.slice().sort((a, b) => b.net - a.net || b.win - a.win || comp.indexOf(a) - comp.indexOf(b)) : comp;
      const out = {};
      ord.forEach((r, i) => { out[r.m] = { win: r.win, tie: r.tie, loss: r.loss, net: r.net, ci0: r.ci[0], ci1: r.ci[1], slot: i }; });
      M.rows.filter((r) => r.type === "ref").forEach((r) => { out[r.m] = { win: r.win, tie: r.tie, loss: r.loss, net: r.net, ci0: r.ci[0], ci1: r.ci[1], slot: comp.length + 0.6 }; });
      return out;
    }
    function rowOf(m) { return byId[st.model].rows.find((r) => r.m === m); }
    function updateSR() {
      const M = byId[st.model];
      srTable(sr, ["QUASAR vs", "QUASAR preferred", "tie", "baseline preferred", "net preference"],
        M.rows.map((r) => [r.m, pct1(r.win), pct1(r.tie), pct1(r.loss), signed(r.net, 2) + " [" + signed(r.ci[0], 2) + ", " + signed(r.ci[1], 2) + "]"]));
      if (N) N.svg.setAttribute("aria-label", "LLM judge, " + M.label);
    }

    function draw(width) {
      const W = width;
      const narrow = W < 400;
      root.classList.toggle("narrow", W < 390);
      const labW = Math.max(...methods.map((m) => tw(m, 500))) + 12;
      const netW = Math.max(tw("NET", 600, MONO, true), tw("+0.32", 500)) + 2;
      const ciW = narrow ? 48 : 84, ciX = W - netW - (narrow ? 8 : 10) - ciW;  // 95% CI strip over [-1, 1], left of the net value
      const barL = labW, barR = ciX - (narrow ? 10 : 14);
      const rowH = narrow ? 25 : 27, barH = narrow ? 16 : 17, top = 24;
      const nComp = methods.length - 1;
      const rowsBottom = top + (nComp + 0.6) * rowH + rowH;
      const H = Math.round(rowsBottom + 46);
      const x0 = (barL + barR) / 2, s = (barR - barL) / 200;
      const fci = (v) => ciX + ((clamp(v, -1, 1) + 1) / 2) * ciW;
      L = { W, H, labW, barL, barR, x0, s, rowH, barH, top, rowsBottom, narrow, fci };
      const { svg, g } = V.frame(plot, W, H, { t: 0, r: 0, b: 0, l: 0 });
      svg.setAttribute("aria-label", "LLM judge, " + byId[st.model].label);
      // grid + axis
      const ga = el("g", { class: "axis" }, g);
      const ticks = narrow && barR - barL < 200 ? [-100, 0, 100] : [-100, -50, 0, 50, 100];
      for (const t of ticks) {
        const x = x0 + t * s;
        if (t) el("line", { x1: x, x2: x, y1: top - 4, y2: rowsBottom, class: "ixj-grid" }, g);
        el("line", { x1: x, x2: x, y1: rowsBottom, y2: rowsBottom + 4 }, ga);
        T(ga, String(Math.abs(t)), { x, y: rowsBottom + 17, "text-anchor": "middle" });
      }
      el("line", { x1: barL, x2: barR, y1: rowsBottom, y2: rowsBottom }, ga);
      const title = "share of judged pairs (%)";
      const tx = clamp(x0, tw(title, 500, MONO, true) / 2, W - tw(title, 500, MONO, true) / 2);
      T(ga, title, { class: "axis-title", x: tx, y: rowsBottom + 37, "text-anchor": "middle" });
      T(g, "net", { class: "ixj-colh", x: W, y: top - 9, "text-anchor": "end" });
      T(g, narrow ? "CI" : "95% CI", { class: "ixj-colh", x: ciX + ciW / 2, y: top - 9, "text-anchor": "middle" });
      // FP16 separator
      const sepY = top + (nComp + 0.3) * rowH;
      el("line", { x1: 0, x2: W, y1: sepY, y2: sepY, class: "ixj-sep" }, g);
      const gHover = el("g", null, g);
      const band = el("rect", { x: -6, width: W + 12, height: rowH, rx: 6, class: "ixj-band", opacity: 0 }, gHover);
      const gRows = el("g", null, g);
      const rows = {};
      for (const m of methods) {
        const gr = el("g", { class: "ixj-row" }, gRows);
        const isRef = m === "FP16";
        const lab = T(gr, m, { x: labW - 12, y: rowH / 2 + 4, "text-anchor": "end", class: "ixj-lab" + (isRef ? " ref" : "") });
        const cy = (rowH - barH) / 2;
        const rl = el("rect", { y: cy, height: barH, fill: LOSS, class: "ixj-seg" }, gr);
        const rt = el("rect", { y: cy, height: barH, fill: TIE, class: "ixj-seg" }, gr);
        const rw = el("rect", { y: cy, height: barH, fill: WIN, class: "ixj-seg" }, gr);
        const tWin = T(gr, "", { y: rowH / 2 + 4, class: "ixj-val win" });
        const tLoss = T(gr, "", { y: rowH / 2 + 4, class: "ixj-val loss" });
        const tNet = T(gr, "", { x: W, y: rowH / 2 + 4, "text-anchor": "end", class: "ixj-net" });
        const fz = fci(0);
        el("line", { x1: fz, x2: fz, y1: cy - 1, y2: cy + barH + 1, class: "ixj-ciz" }, gr);
        const ciL = el("line", { y1: rowH / 2, y2: rowH / 2, stroke: INK2, "stroke-width": 2, "stroke-linecap": "round" }, gr);
        const ciD = el("circle", { cy: rowH / 2, r: 2.6, stroke: "#fdfdfd", "stroke-width": 1 }, gr);
        rows[m] = { gr, lab, rl, rt, rw, tWin, tLoss, tNet, ciL, ciD };
      }
      // zero line on top of the bars
      el("line", { x1: x0, x2: x0, y1: top - 4, y2: rowsBottom, class: "ixj-zero" }, g);
      N = { svg, rows, band };
      if (!disp) {
        const t = target();
        disp = {};
        for (const m of methods) disp[m] = Object.assign({}, t[m], revealed ? {} : { win: 0, tie: 0, loss: 0, net: 0, ci0: 0, ci1: 0 });
      }
      frame();
      paintHi();
    }
    function yOf(slot) { return L.top + slot * L.rowH; }
    function frame() {
      if (!N) return;
      const { x0, s } = L;
      for (const m of methods) {
        const d = disp[m], R = N.rows[m];
        R.gr.setAttribute("transform", "translate(0," + yOf(d.slot).toFixed(2) + ")");
        const th = d.tie / 2;
        const set = (r, a, b) => {
          const w = Math.max(0, (b - a) * s);
          r.setAttribute("x", (x0 + a * s).toFixed(2)); r.setAttribute("width", w.toFixed(2));
          r.style.display = w < 0.05 ? "none" : "";
        };
        set(R.rl, -th - d.loss, -th); set(R.rt, -th, th); set(R.rw, th, th + d.win);
        const wpx = d.win * s, lpx = d.loss * s, wEnd = x0 + (th + d.win) * s, lStart = x0 - (th + d.loss) * s;
        const wTxt = String(Math.round(d.win)), lTxt = String(Math.round(d.loss));
        const pad = L.narrow ? 3.5 : 5;
        if (d.win < 0.5) R.tWin.textContent = "";
        else if (wpx >= tw(wTxt, 700) + 2 * pad) {
          R.tWin.textContent = wTxt; R.tWin.setAttribute("x", (wEnd - pad).toFixed(2)); R.tWin.setAttribute("text-anchor", "end"); R.tWin.classList.add("in");
        } else {
          R.tWin.textContent = wTxt; R.tWin.setAttribute("x", (wEnd + 4).toFixed(2)); R.tWin.setAttribute("text-anchor", "start"); R.tWin.classList.remove("in");
        }
        if (d.loss >= 0.5 && lpx >= tw(lTxt, 500) + 2 * pad) {
          R.tLoss.textContent = lTxt; R.tLoss.setAttribute("x", (lStart + pad).toFixed(2)); R.tLoss.setAttribute("text-anchor", "start");
        } else R.tLoss.textContent = "";
        R.tNet.textContent = revealed || d.net ? signed(Math.round(d.net * 100) / 100, 2) : "";
        const showCI = revealed || d.net;
        R.ciL.style.display = R.ciD.style.display = showCI ? "" : "none";
        if (showCI) {
          R.ciL.setAttribute("x1", L.fci(d.ci0).toFixed(2)); R.ciL.setAttribute("x2", L.fci(d.ci1).toFixed(2));
          R.ciD.setAttribute("cx", L.fci(d.net).toFixed(2));
          R.ciD.setAttribute("fill", rowOf(m).net > 0 ? WIN : LOSS);
        }
      }
    }
    function go(ms) {
      const t = target();
      if (!revealed) { for (const m of methods) disp[m].slot = t[m].slot; frame(); updateSR(); return; }
      if (A) A.stop();
      const from = {};
      for (const m of methods) from[m] = Object.assign({}, disp[m]);
      // rows that change place dip in opacity while they slide past each other
      const moving = methods.filter((m) => Math.abs(from[m].slot - t[m].slot) > 0.01);
      A = anim(ms, (k) => {
        for (const m of methods) for (const key of ["win", "tie", "loss", "net", "ci0", "ci1", "slot"]) disp[m][key] = lerp(from[m][key], t[m][key], k);
        frame();
        if (N) for (const m of moving) N.rows[m].gr.style.opacity = k >= 1 ? "" : String(1 - 0.6 * Math.sin(Math.PI * k));
      }, () => { A = null; if (N) for (const m of moving) N.rows[m].gr.style.opacity = ""; });
      updateSR();
      if (st.hi) showTip(st.hi);
    }
    function reveal(ms) {
      if (revealed) return;
      revealed = true;
      const t = target();
      if (A) A.stop();
      const from = {};
      for (const m of methods) from[m] = Object.assign({}, disp[m]);
      A = anim(ms, (k) => {
        for (const m of methods) for (const key of ["win", "tie", "loss", "net", "ci0", "ci1"]) disp[m][key] = lerp(from[m][key], t[m][key], k);
        frame();
      }, () => { A = null; });
    }
    function paintHi() {
      if (!N) return;
      for (const m of methods) {
        const on = !st.hi || st.hi === m;
        N.rows[m].gr.classList.toggle("dim", !on);
        N.rows[m].lab.classList.toggle("on", st.hi === m);
      }
      if (st.hi) {
        N.band.setAttribute("y", yOf(target()[st.hi].slot).toFixed(2));
        N.band.setAttribute("opacity", 1);
      } else N.band.setAttribute("opacity", 0);
    }
    function tipHTML(m) {
      const r = rowOf(m), M = byId[st.model];
      const opp = m === "FP16" ? "FP16" : m;
      const line = (c, lab, v, n, q) => '<span class="ixj-tn' + (q ? " q" : "") + '"><i class="ixj-k" style="background:' + c + '"></i>' + esc(lab) +
        "</span><b>" + v + '</b><span class="ixj-tc">' + n + "</span>";
      return '<div class="tt">QUASAR vs ' + esc(opp) + "</div>" +
        '<div class="ixj-tm">' + esc(M.label) + "</div>" +
        '<div class="ixj-tg"><span></span><span class="ixj-th">share</span><span class="ixj-th">of ' + F.verdicts + "</span>" +
        line(WIN, "QUASAR preferred", pct1(r.win), r.n[0], true) +
        line(TIE, "tie", pct1(r.tie), r.n[1]) +
        line(LOSS, opp + " preferred", pct1(r.loss), r.n[2]) + "</div>" +
        '<div class="ixj-tnet"><span>net preference</span><b>' + signed(r.net, 2) + '</b><span class="ixj-tc">[' + signed(r.ci[0], 2) + ", " + signed(r.ci[1], 2) + "]</span></div>";
    }
    function showTip(m, px, py) {
      if (!N) return;
      const d = target()[m];
      const y = yOf(d.slot) + L.rowH / 2;
      const x = px != null ? px : clamp(L.x0 + (d.tie / 2 + d.win) * L.s, L.barL, L.barR);
      tip.show(x, py != null ? py : y, tipHTML(m));
    }
    function hit(e) {
      const b = N.svg.getBoundingClientRect();
      const y = e.clientY - b.top, t = target();
      for (const m of methods) { const y0 = yOf(t[m].slot); if (y >= y0 && y < y0 + L.rowH) return m; }
      return null;
    }
    function set(m, e) {
      st.hi = m;
      paintHi();
      if (!m) { tip.hide(); return; }
      if (e) { const b = plot.getBoundingClientRect(); showTip(m, e.clientX - b.left, e.clientY - b.top); }
      else showTip(m);
    }
    bindPointer(plot, (e) => { const m = hit(e); if (m !== st.hi || m) set(m, e); }, () => set(null));
    outsideTap(plot, () => { if (st.hi) set(null); });
    plot.addEventListener("keydown", (e) => {
      const t = target(), ord = methods.slice().sort((a, b) => t[a].slot - t[b].slot);
      let i = ord.indexOf(st.hi);
      if (e.key === "ArrowDown" || e.key === "ArrowRight") i = Math.min(ord.length - 1, i + 1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") i = i < 0 ? 0 : Math.max(0, i - 1);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = ord.length - 1;
      else if (e.key === "Escape") { set(null); return; }
      else return;
      e.preventDefault();
      set(ord[i]);
    });
    plot.addEventListener("blur", () => set(null));
    const R = V.responsive(plot, draw);
    whenFonts(() => R.redraw());
    updateSR();
    V.onVisible(plot, () => reveal(900), { threshold: 0.35 });
    return function finish() { if (A) A.stop(); A = null; revealed = true; const t = target(); for (const m of methods) Object.assign(disp[m], t[m]); frame(); };
  }

  // ================================================================ Figure 28 — word-repetition ratio
  function fig28(root, D) {
    const F = D.fig28;
    const methods = F.models[0].rows.map((r) => r.m);
    const st = { hi: null };
    root.classList.add("ixj", "ixj28");
    const plot = h("div", { class: "ixj-plot", tabindex: "0", role: "group", "aria-label": "response stability chart" }, root);
    const tip = V.tooltip(plot);
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    srTable(sr, ["method"].concat(...F.models.map((m) => [m.label + " word-repetition ratio", m.label + " " + m.done_label])),
      methods.map((m) => [m].concat(...F.models.map((M) => { const r = M.rows.find((x) => x.m === m); return [r.ratio.toFixed(3), r.done + "/" + F.n]; })))
        .concat([["FP16"].concat(...F.models.map((M) => [M.ref.ratio.toFixed(3), "–"]))]));
    let N = null, L = null, revealed = false, A = null, k = 0;

    function draw(width) {
      const W = width;
      const wide = W >= 400;
      const labW = Math.max(...methods.map((m) => tw(m, m === "QUASAR" ? 700 : 500))) + 12;
      const cntW = tw("128/128", 600) + 2;
      // beside the taller judge card: taller rows (and bars) take the extra height; the rest goes above the rows
      const e = wide ? fill.extra : 0, dRow = Math.min(14, e / methods.length);
      const rowH = 30 + dRow, barH = 17 + Math.min(5, dRow * 0.4), head = 54 + (e - dRow * methods.length), axisH = 44, gapV = 26;
      fill.used = e;
      const panels = [];
      if (wide) {
        const gap = 22, pw = (W - labW - gap) / 2;
        F.models.forEach((M, i) => panels.push({ M, x: labW + i * (pw + gap), w: pw, y: 0, labels: i === 0 }));
      } else {
        const pw = W - labW;
        F.models.forEach((M, i) => panels.push({ M, x: labW, w: pw, y: i * (head + methods.length * rowH + axisH + gapV), labels: true }));
      }
      const pH = head + methods.length * rowH + axisH;
      const H = wide ? pH : 2 * pH + gapV;
      const { svg, g } = V.frame(plot, W, H, { t: 0, r: 0, b: 0, l: 0 });
      svg.setAttribute("aria-label", "Word-repetition ratio, INT2");
      const bands = [], rowsN = {}, refs = [];
      for (const m of methods) rowsN[m] = [];
      for (const P of panels) {
        const bx = P.x, bw = P.w - cntW - 8, y0 = P.y + head;
        const sx = (v) => bx + v * bw;
        P.bx = bx; P.bw = bw; P.y0 = y0;
        // header: model name, FP16 tag, terminated-count column title
        T(g, P.M.label, { x: wide ? bx : 0, y: P.y + 12, class: "ixj-ptitle" });
        // terminated-count column title on two lines (keeps it clear of the FP16 tag)
        const sp = P.M.done_label.indexOf(" ");
        T(g, P.M.done_label.slice(0, sp), { x: P.x + P.w, y: P.y + 30, "text-anchor": "end", class: "ixj-colh2" });
        T(g, P.M.done_label.slice(sp + 1), { x: P.x + P.w, y: P.y + 45, "text-anchor": "end", class: "ixj-colh2" });
        // axis
        const ga = el("g", { class: "axis" }, g);
        const yb = y0 + methods.length * rowH + 4;
        for (const t of [0, 0.5, 1]) {
          const x = sx(t);
          if (t) el("line", { x1: x, x2: x, y1: y0 - 2, y2: yb, class: "ixj-grid" }, g);
          el("line", { x1: x, x2: x, y1: yb, y2: yb + 4 }, ga);
          T(ga, t === 0.5 ? "0.5" : String(t), { x, y: yb + 17, "text-anchor": "middle" });
        }
        el("line", { x1: bx, x2: bx + bw, y1: yb, y2: yb }, ga);
        if (!wide) T(ga, "word-repetition ratio", { class: "axis-title", x: bx + bw / 2, y: yb + 37, "text-anchor": "middle" });
        P.yb = yb;
        // rows
        const band = el("rect", { x: wide ? -6 : -6, y: 0, width: 0, height: rowH, rx: 6, class: "ixj-band", opacity: 0 }, g);
        bands.push({ band, P });
        methods.forEach((m, i) => {
          const r = P.M.rows.find((x) => x.m === m);
          const gr = el("g", { class: "ixj-row", transform: "translate(0," + (y0 + i * rowH) + ")" }, g);
          if (P.labels) T(gr, m, { x: (wide ? 0 : 0) + labW - 12, y: rowH / 2 + 4, "text-anchor": "end", class: "ixj-lab" + (m === "QUASAR" ? " q" : "") });
          const c = COLOR[m];
          const bar = el("rect", { x: bx, y: (rowH - barH) / 2, height: barH, width: 0, rx: 2, fill: c, class: "ixj-bar" }, gr);
          const val = T(gr, r.ratio.toFixed(2), { y: rowH / 2 + 4, class: "ixj-v" + (m === "QUASAR" ? " q" : "") });
          const ext = r.done === 0 || r.done === F.n;
          T(gr, r.done + "/" + F.n, { x: P.x + P.w, y: rowH / 2 + 4, "text-anchor": "end", class: "ixj-cnt" + (ext ? " x" : "") + (r.done === 0 ? " z" : "") });
          rowsN[m].push({ gr, bar, val, r, P, c });
        });
        // full-precision reference
        const fx = sx(P.M.ref.ratio);
        el("line", { x1: fx, x2: fx, y1: y0 - 4, y2: yb, stroke: "#fdfdfd", "stroke-width": 3.5 }, g);  // halo: keeps the line visible on a bar end
        const ln = el("line", { x1: fx, x2: fx, y1: y0 - 4, y2: yb, class: "ixj-ref" }, g);
        T(g, "FP16", { x: fx, y: P.y + 45, "text-anchor": "middle", class: "ixj-reft" });
        refs.push(ln);
      }
      if (wide) {
        const P0 = panels[0], P1 = panels[1];
        T(g, "word-repetition ratio", { class: "axis-title ixj-at", x: (P0.bx + P1.bx + P1.bw) / 2, y: P0.yb + 37, "text-anchor": "middle" });
      }
      // separator between stacked panels
      if (!wide) el("line", { x1: 0, x2: W, y1: pH + gapV / 2, y2: pH + gapV / 2, class: "ixj-sep" }, g);
      N = { svg, rowsN, bands, refs, panels, wide, rowH, labW, W };
      L = { rowH };
      frame(revealed ? 1 : k);
      paintHi();
    }
    function frame(kk) {
      k = kk;
      if (!N) return;
      for (const m of methods) for (const R of N.rowsN[m]) {
        const { bx, bw } = R.P;
        const idx = methods.indexOf(m);
        const kk2 = clamp(kk * 1.35 - idx * 0.05, 0, 1);
        const w = R.r.ratio * bw * kk2;
        R.bar.setAttribute("width", w.toFixed(2));
        const lw = tw(R.val.textContent, m === "QUASAR" ? 700 : 500);
        if (R.r.ratio * bw + 4 + lw <= bw) {
          R.val.setAttribute("x", (bx + w + 4).toFixed(2)); R.val.setAttribute("text-anchor", "start"); R.val.style.fill = "";
        } else {
          R.val.setAttribute("x", (bx + w - 5).toFixed(2)); R.val.setAttribute("text-anchor", "end"); R.val.style.fill = onBar(R.c);
        }
        R.val.style.opacity = kk2 > 0.85 ? 1 : 0;
      }
      for (const ln of N.refs) ln.style.opacity = clamp(kk * 2 - 1, 0, 1);
    }
    function paintHi() {
      if (!N) return;
      for (const m of methods) for (const R of N.rowsN[m]) R.gr.classList.toggle("dim", !!st.hi && st.hi !== m);
      for (const b of N.bands) {
        if (!st.hi) { b.band.setAttribute("opacity", 0); continue; }
        const i = methods.indexOf(st.hi);
        const x0 = N.wide ? (b.P === N.panels[0] ? -6 : b.P.x - 8) : -6;
        const x1 = N.wide ? (b.P === N.panels[0] ? b.P.x + b.P.w + 6 : N.W + 6) : N.W + 6;
        b.band.setAttribute("x", x0); b.band.setAttribute("width", x1 - x0);
        b.band.setAttribute("y", b.P.y0 + i * N.rowH);
        b.band.setAttribute("opacity", 1);
      }
    }
    function tipHTML(m) {
      let s = '<div class="tt"><i class="ixj-k" style="background:' + COLOR[m] + '"></i>' + esc(m) + "</div>";
      for (const M of F.models) {
        const r = M.rows.find((x) => x.m === m);
        s += '<div class="ixj-tm">' + esc(M.label) + "</div>" +
          '<div class="row' + (m === "QUASAR" ? " q" : "") + '"><span class="ixj-tn">repetition ratio</span><b>' + r.ratio.toFixed(3) + "</b></div>" +
          '<div class="row"><span class="ixj-tn ixj-fp"><i class="ixj-k dash" style="border-color:' + GOLD + '"></i>FP16</span><span class="ixj-tc">' + M.ref.ratio.toFixed(3) + "</span></div>" +
          '<div class="row"><span class="ixj-tn">' + esc(M.done_label) + "</span><b>" + r.done + " / " + F.n + "</b></div>";
      }
      return s;
    }
    function hit(e) {
      const b = N.svg.getBoundingClientRect();
      const y = e.clientY - b.top;
      for (const P of N.panels) {
        const i = Math.floor((y - P.y0) / N.rowH);
        if (i >= 0 && i < methods.length && y >= P.y0) return methods[i];
      }
      return null;
    }
    function set(m, e) {
      st.hi = m;
      paintHi();
      if (!m) { tip.hide(); return; }
      const b = plot.getBoundingClientRect();
      if (e) tip.show(e.clientX - b.left, e.clientY - b.top, tipHTML(m));
      else {
        const R = N.rowsN[m][N.wide ? 1 : 0], P = R.P;
        tip.show(P.bx + R.r.ratio * P.bw, P.y0 + methods.indexOf(m) * N.rowH + N.rowH / 2, tipHTML(m));
      }
    }
    bindPointer(plot, (e) => { const m = hit(e); if (m !== st.hi || m) set(m, e); }, () => set(null));
    outsideTap(plot, () => { if (st.hi) set(null); });
    plot.addEventListener("keydown", (e) => {
      let i = methods.indexOf(st.hi);
      if (e.key === "ArrowDown" || e.key === "ArrowRight") i = Math.min(methods.length - 1, i + 1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") i = i < 0 ? 0 : Math.max(0, i - 1);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = methods.length - 1;
      else if (e.key === "Escape") { set(null); return; }
      else return;
      e.preventDefault();
      set(methods[i]);
    });
    plot.addEventListener("blur", () => set(null));
    const fill = pairFill(root, "ix-fig27", () => R.redraw(), 160);
    const R = V.responsive(plot, draw);
    whenFonts(() => R.redraw());
    V.onVisible(plot, () => {
      if (revealed) return;
      A = anim(1100, (t) => frame(t), () => { revealed = true; A = null; });
    }, { threshold: 0.35 });
    return function finish() { if (A) A.stop(); A = null; revealed = true; frame(1); };
  }

  // ================================================================ Figure 29 — responses
  function fig29(root, D) {
    const F = D.fig29;
    const st = { bits: "INT2", rep: false };
    root.classList.add("ixj", "ixj29");
    root.setAttribute("data-label", "");
    const ctl = h("div", { class: "controls ixj-controls" }, root);
    V.pills(h("div", { class: "ixj-ctl" }, ctl), Object.keys(F.bits).map((b) => ({ value: b, label: b })), st.bits,
      (v) => { st.bits = v; render(); }, "bit width");
    const tg = h("button", { type: "button", class: "ixj-toggle", "aria-pressed": "false" }, h("div", { class: "ixj-ctl" }, ctl));
    h("i", { class: "ixj-tk", "aria-hidden": "true" }, tg);
    h("span", null, tg, "repeated words");
    tg.addEventListener("click", () => {
      st.rep = !st.rep;
      tg.setAttribute("aria-pressed", String(st.rep));
      body.classList.toggle("rep", st.rep);
    });
    const pr = h("div", { class: "ixj-prompt" }, root);
    h("span", { class: "ixj-pk" }, pr, "prompt");
    h("q", { class: "ixj-pq" }, pr, esc(F.prompt));
    const body = h("div", { class: "ixj-body" }, root);
    const refRow = row(F.reference, "ref");
    body.appendChild(refRow.node);
    const grp = h("div", { class: "ixj-grp" }, body);
    grp.textContent = st.bits;
    const rows = F.bits[st.bits].map((r) => { const R = row(r, r.m === "QUASAR" ? "q" : ""); body.appendChild(R.node); return R; });
    const all = [refRow].concat(rows);

    // whitespace tokens, as in the word-repetition ratio: a token is a repeat if the same token occurred earlier
    function tokens(text) {
      const seen = new Set(), out = [];
      let t = text, tail = "";
      const m = t.match(/\s*\u2026$/);
      if (m) { tail = "\u2026"; t = t.slice(0, m.index); }
      for (const part of t.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { out.push({ s: " " }); continue; }
        out.push({ w: part, rep: seen.has(part) });
        seen.add(part);
      }
      return { out, tail };
    }
    function row(r, cls) {
      const node = h("div", { class: "ixj-r" + (cls ? " " + cls : "") });
      const nm = h("div", { class: "ixj-n" }, node);
      const sw = h("i", { class: "ixj-sw", style: "background:" + COLOR[r.m] }, nm);
      const nmT = h("span", null, nm, esc(r.m));
      const tx = h("div", { class: "ixj-t" }, node);
      const R = { node, nmT, tx, sw, shown: false };
      fill(R, r, false);
      tx.classList.add("pre");   // hidden until the row first scrolls into view
      return R;
    }
    function fill(R, r, stream) {
      R.nmT.textContent = r.m;
      R.sw.style.background = COLOR[r.m];
      R.node.classList.toggle("q", r.m === "QUASAR");
      const { out, tail } = tokens(r.text);
      const nW = out.filter((x) => x.w).length;
      const step = stream ? Math.min(16, 520 / Math.max(1, nW)) : 0;
      let html = "", i = 0;
      for (const x of out) {
        if (x.s) { html += " "; continue; }
        html += '<span class="w' + (x.rep ? " rp" : "") + '"' + (stream ? ' style="transition-delay:' + Math.round(i * step) + 'ms"' : "") + ">" + esc(x.w) + "</span>";
        i++;
      }
      if (tail) html += "\u2009<span class=\"ell\">" + tail + "</span>";
      R.tx.innerHTML = html;
      if (stream) {
        R.tx.classList.add("pre");
        R.tx.getBoundingClientRect();
        requestAnimationFrame(() => requestAnimationFrame(() => R.tx.classList.remove("pre")));
      } else R.tx.classList.remove("pre");
    }
    const dataOf = (R) => (R === refRow ? F.reference : F.bits[st.bits][rows.indexOf(R)]);
    // each response streams in, word by word, the first time its row comes into view
    function showRow(R) {
      if (R.shown) return;
      R.shown = true;
      fill(R, dataOf(R), !reduce);
    }
    function render() {
      grp.textContent = st.bits;
      for (const R of rows) { R.shown = true; fill(R, dataOf(R), !reduce); }
    }
    for (const R of all) V.onVisible(R.node, () => showRow(R), { threshold: 0.6 });
    return function finish() {
      for (const R of all) {
        R.shown = true;
        R.tx.classList.remove("pre");
        R.tx.querySelectorAll(".w").forEach((w) => { w.style.transitionDelay = "0ms"; });
      }
    };
  }

  // ================================================================ boot
  const pending = [], finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "ixj-fail", "data-label": "" }, node, "— data unavailable —");
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
          const fin = fn(node, d);
          node.style.minHeight = "0";
          if (fin) { finals.push(fin); if (printing) fin(); }
        })
        .catch((err) => { if (window.console) console.error("[ix-judge] " + id, err); fail(node); });
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
    mount("ix-fig27", fig27);
    mount("ix-fig28", fig28);
    mount("ix-fig29", fig29);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
