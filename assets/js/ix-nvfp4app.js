/* ix-nvfp4app.js — NVFP4 appendix figures for the QUASAR page.
   Mounts: #ix-fig35 (Fig. 35, long horizon), #ix-tab10 (Table 10).
   Data:   assets/data/ix-nvfp4app.json (tools/extract_ix_nvfp4app.py: the paper generators' own plotted arrays).
   Renders data labels only (method / model / benchmark names, axis titles, units, numbers). Needs window.Viz. */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const DATA = SRC ? new URL("../data/ix-nvfp4app.json", SRC).href : "assets/data/ix-nvfp4app.json";
  const el = V.el, h = V.h, reduce = V.reducedMotion;
  const COL = { quasar: "#D1495B", standard_qat: "#3F4245", rtn: "#C6CACE", gptq: "#686F77", bf16: "#C9A227" };
  const SHAPE = { bf16: "circle", rtn: "tri", gptq: "square", standard_qat: "diamond", quasar: "circle" };
  const DIM = 0.16, DIM_REF = 0.42;  // a highlighted method dims the others; the BF16 reference stays legible
  const dimOf = (n, k) => (!k || n.getAttribute("data-k") === k ? 1 : n.getAttribute("data-k") === "bf16" ? DIM_REF : DIM);
  let UID = 0;

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const p1 = (v) => (+v).toFixed(1);
  const mctx = document.createElement("canvas").getContext("2d");
  function textW(s, px, wt) {
    mctx.font = `${wt || 500} ${px || 12}px Inter, ui-sans-serif, system-ui, sans-serif`;
    return mctx.measureText(s).width;
  }
  function T(parent, s, attrs) { const t = el("text", attrs, parent); t.textContent = s; return t; }
  function whenFonts(cb) { if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(cb); }
  const nt = (s) => '<span class="nv-nt">' + esc(s) + "</span>";

  function marker(g, shape, x, y, r, fill, cls) {
    let n;
    if (shape === "square") n = el("rect", { x: x - r * 0.86, y: y - r * 0.86, width: r * 1.72, height: r * 1.72, rx: 0.8 }, g);
    else if (shape === "diamond") { const a = r * 1.2; n = el("path", { d: `M${x},${y - a}L${x + a},${y}L${x},${y + a}L${x - a},${y}Z` }, g); }
    else if (shape === "tri") { const a = r * 1.25; n = el("path", { d: `M${x - a},${y - a * 0.7}L${x + a},${y - a * 0.7}L${x},${y + a * 0.95}Z`, "stroke-linejoin": "round" }, g); }
    else n = el("circle", { cx: x, cy: y, r }, g);
    n.setAttribute("fill", fill);
    if (cls) n.setAttribute("class", cls);
    return n;
  }

  // tooltip markup: values lead (bold), series keyed by a short stroke
  function tipHTML(head, rows, hot) {
    let s = '<div class="tt">' + head + "</div>";
    for (const r of rows) {
      const cls = "row nv-row" + (r.key === "quasar" ? " q" : "") + (hot && r.key === hot ? " hot" : "");
      s += '<div class="' + cls + '"><span class="nv-n"><i class="nv-k' + (r.ref ? " ref" : "") + '" style="background:' + r.color + '"></i>' +
        esc(r.label) + "</span><b>" + esc(r.value) + "</b></div>";
    }
    return s;
  }

  function srTable(node, caption, head, rows) {
    node.innerHTML = "<caption>" + esc(caption) + "</caption><thead><tr>" + head.map((x) => "<th>" + esc(x) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((x, i) => (i ? "<td>" : '<th scope="row">') + esc(x) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody>";
  }

  // Pointer input on a chart overlay. Mouse (and a hovering pen) tracks the pointer. Touch shows values on a tap
  // (< 10 px of travel) or a horizontal scrub; a vertical swipe stays a page scroll, and the pointercancel the
  // browser sends when it takes the gesture over clears the state.
  function bindOverlay(ov, move, off, scrubbable) {
    let t0 = null, scrub = false;
    ov.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") { move(e); return; }
      t0 = [e.clientX, e.clientY]; scrub = false;
    });
    ov.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") { move(e); return; }
      if (!t0) { if (e.pointerType === "pen") move(e); return; }
      if (!scrubbable) return;
      const dx = e.clientX - t0[0], dy = e.clientY - t0[1];
      if (scrub || (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy))) { scrub = true; move(e); }
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

  // method highlight: hover (transient) over lock (click on a key); subscribers get the effective key
  function makeBus() {
    const subs = [];
    let hover = null, lock = null;
    const emit = () => { const k = hover || lock; subs.forEach((f) => f(k, lock)); };
    return {
      on(f) { subs.push(f); },
      hover(k) { if (hover === k) return; hover = k; emit(); },
      toggle(k) { lock = lock === k ? null : k; hover = null; emit(); },
      get: () => hover || lock,
    };
  }
  // key row: one button per method; hover / focus previews the highlight, click pins it
  function legend(parent, items, bus) {
    const row = h("div", { class: "nv-legend", role: "group", "aria-label": "methods" }, parent);
    const btns = items.map((it) => {
      const b = h("button", { type: "button", class: "nv-li" + (it.key === "quasar" ? " q" : ""), "aria-pressed": "false", "data-k": it.key }, row);
      const s = el("svg", { viewBox: "0 0 22 12", width: 22, height: 12, "aria-hidden": "true", focusable: "false" }, b);
      const c = COL[it.key];
      if (it.kind === "bar") el("rect", { x: 5, y: 1.5, width: 12, height: 9, rx: 1.5, fill: c }, s);
      else if (it.kind === "ref") { el("line", { x1: 11, x2: 11, y1: 0, y2: 12, stroke: c, "stroke-width": 2 }, s); }
      else {  // "mark": line + marker
        el("line", { x1: 1, x2: 21, y1: 6, y2: 6, stroke: c, "stroke-width": it.key === "quasar" ? 2.6 : 1.8, "stroke-linecap": "round", "stroke-dasharray": it.key === "bf16" ? "4 2.5" : null }, s);
        marker(s, SHAPE[it.key], 11, 6, it.key === "quasar" ? 3.2 : 2.7, c);
      }
      h("span", null, b, esc(it.label));
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") bus.hover(it.key); });
      b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") bus.hover(null); });
      b.addEventListener("focus", () => { if (b.matches(":focus-visible")) bus.hover(it.key); });
      b.addEventListener("blur", () => bus.hover(null));
      b.addEventListener("click", () => bus.toggle(it.key));
      return b;
    });
    bus.on((k, lock) => btns.forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.k === lock));
      b.classList.toggle("dim", !!k && b.dataset.k !== k);
    }));
    return row;
  }
  function plotAria(plot, root) {
    const card = root.closest(".viz"), kick = card && card.querySelector(".viz-kicker");
    const name = kick ? kick.textContent.split("·")[0].trim() : "";
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-label", (name ? name + " chart" : "Chart") + " (arrow keys)");  // < 6 words: not prose
  }
  function axisY(g, sy, w, ticks, fmt) {
    const gg = el("g", { class: "nv-grid" }, g), ga = el("g", { class: "nv-axis" }, g);
    for (const t of ticks) {
      const y = sy(t);
      el("line", { x1: 0, x2: w, y1: y, y2: y }, gg);
      T(ga, fmt(t), { x: -7, y: y + 4, "text-anchor": "end" });
    }
    return gg;
  }

  // ================================================================ Fig. 35 / Table 10 share one method highlight
  const LH = makeBus();

  // ================================================================ Fig. 35 — long horizon (Qwen3.5-9B)
  function fig35(root, D) {
    const F = D.fig35, A = F.a, B = F.b, bus = LH;
    const ORDER = ["rtn", "gptq", "standard_qat", "bf16", "quasar"];  // paint order (paper z-order)
    const KEYS = F.methods.map((m) => m.key);                       // BF16, RTN, GPTQ, Standard QAT, QUASAR
    const lab = {};
    F.methods.forEach((m) => (lab[m.key] = m.label));
    const ser = (P, k) => P.series.find((s) => s.key === k);
    root.classList.add("nv", "nv35");
    const top = h("div", { class: "nv-top" }, root);
    legend(top, F.methods.map((m) => ({ key: m.key, label: m.label, kind: "mark" })), bus);
    const plot = h("div", { class: "nv-plot", tabindex: "0" }, root);
    plotAria(plot, root);
    const sr = h("div", { class: "sr-only", "data-label": "" }, root);
    const t1 = h("table", null, sr), t2 = h("table", null, sr);
    srTable(t1, A.title + " · " + F.model + " · " + A.ytitle, ["method"].concat(A.bins), KEYS.map((k) => [lab[k]].concat(ser(A, k).values.map(p1))));
    srTable(t2, B.title + " · " + F.model + " · " + B.ytitle, ["method"].concat(B.tasks), KEYS.map((k) => [lab[k]].concat(ser(B, k).display.map(p1))));
    const tip = V.tooltip(plot);
    tip.node.style.top = tip.node.style.left = "0px";  // parked inside the plot while hidden (no overflow below the card)
    let S = null, revealed = false, cur = null;

    function build(width) {
      const side = width >= 760, padL = 40, padR = 6, headH = 46;
      const ph = side ? 190 : clamp(Math.round(width * 0.46), 168, 200);
      let pa, pb, height;
      const xa = (w) => A.bins.map((b) => textW(b, 12, 400)).reduce((m, v) => Math.max(m, v), 0) + 6 > w / A.bins.length;
      const xb = (w) => B.tasks.map((b) => textW(b, 12, 400)).reduce((m, v) => Math.max(m, v), 0) + 8 > w / B.tasks.length;
      const labH = (rot, labels) => (rot ? Math.ceil(Math.max(...labels.map((s) => textW(s))) * 0.6 + 20) : 22);
      if (side) {
        const gap = 34, wa = Math.round((width - gap) * 0.535);
        pa = { x: padL, y: headH, w: wa - padL, h: ph };
        pb = { x: wa + gap + padL, y: headH, w: width - (wa + gap + padL) - padR, h: ph };
        pa.rot = xa(pa.w); pb.rot = xb(pb.w);
        const lh = Math.max(labH(pa.rot, A.bins) + 18, labH(pb.rot, B.tasks));
        height = headH + ph + lh + 4;
      } else {
        pa = { x: padL, y: headH, w: width - padL - padR, h: ph };
        pa.rot = xa(pa.w);
        const ya = pa.y + ph + labH(pa.rot, A.bins) + 18 + 26;
        const phb = width >= 400 ? ph + 60 : ph;  // fills the card next to Table 10
        pb = { x: padL, y: ya + headH, w: width - padL - padR, h: phb };
        pb.rot = xb(pb.w);
        height = pb.y + phb + labH(pb.rot, B.tasks) + 4;
      }
      const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img",
        "aria-label": "long horizon: MRCR and termination" });
      plot.querySelectorAll(":scope > svg").forEach((s) => s.remove());
      plot.insertBefore(svg, plot.firstChild);
      const id = "nv" + ++UID;
      const defs = el("defs", null, svg);
      S = { svg, pa, pb, side, bars: [] };

      // ---- (a) MRCR by context length
      const ga = el("g", { transform: `translate(${pa.x},${pa.y})` }, svg);
      T(ga, A.title, { x: -padL, y: -30, class: "nv-pt" });
      T(ga, A.ytitle, { x: -padL, y: -12, class: "nv-at" });
      pa.sx = V.lin([-0.42, A.bins.length - 0.58], [0, pa.w]);
      pa.sy = V.lin(A.ylim, [pa.h, 0]);
      axisY(ga, pa.sy, pa.w, A.yticks, (t) => String(t));
      const axa = el("g", { class: "nv-axis", transform: `translate(0,${pa.h})` }, ga);
      el("line", { x1: 0, x2: pa.w, y1: 0, y2: 0 }, axa);
      A.bins.forEach((b, i) => {
        const x = pa.sx(i);
        el("line", { x1: x, x2: x, y1: 0, y2: 4 }, axa);
        if (pa.rot) T(axa, b, { x: x + 4, y: 14, "text-anchor": "end", transform: `rotate(-35 ${x + 4} 14)` });
        else T(axa, b, { x, y: 17, "text-anchor": "middle" });
      });
      T(axa, "context length (tokens)", { x: pa.w / 2, y: (pa.rot ? labH(true, A.bins) : 22) + 14, class: "nv-at", "text-anchor": "middle" });
      const ca = el("clipPath", { id: id + "a" }, defs);
      S.clipA = el("rect", { x: -8, y: -10, width: revealed ? pa.w + 16 : 0, height: pa.h + 20 }, ca);
      const glines = el("g", { "clip-path": `url(#${id}a)` }, ga);
      for (const k of ORDER) {
        const s = ser(A, k), q = k === "quasar", bf = k === "bf16";
        const g = el("g", { class: "nv-ser", "data-k": k }, glines);
        const pts = s.values.map((v, i) => [i, v]);
        el("path", { d: V.linePath(pts, pa.sx, pa.sy), fill: "none", stroke: COL[k], "stroke-width": q ? 2.6 : bf ? 1.7 : 1.6,
          "stroke-dasharray": bf ? "5 4" : null, "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
        const mg = el("g", { class: "nv-mk" }, g);
        pts.forEach((p, i) => {
          const n = marker(mg, SHAPE[k], pa.sx(p[0]), pa.sy(p[1]), q ? 3.6 : 2.9, COL[k], "nv-pop");
          n.setAttribute("stroke", "#fdfdfd"); n.setAttribute("stroke-width", 1.1);
          n.style.transitionDelay = (reduce ? 0 : 140 + i * 190) + "ms";
        });
      }
      pa.gH = el("g", { "pointer-events": "none" }, ga);
      const ova = el("rect", { x: 0, y: -6, width: pa.w, height: pa.h + 12, fill: "transparent", class: "nv-ov" }, ga);
      bindOverlay(ova, (e) => {
        const r = ova.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top - 6;
        const i = clamp(Math.round(pa.sx.invert(px)), 0, A.bins.length - 1);
        let best = null, bd = 16;
        for (const k of KEYS) { const d = Math.abs(pa.sy(ser(A, k).values[i]) - py); if (d < bd) { bd = d; best = k; } }
        showA(i, best, [pa.x + px, pa.y + py]);
      }, unhover, true);

      // ---- (b) terminating share per long-generation benchmark
      const gb = el("g", { transform: `translate(${pb.x},${pb.y})` }, svg);
      T(gb, B.title, { x: -padL, y: -30, class: "nv-pt" });
      T(gb, B.ytitle, { x: -padL, y: -12, class: "nv-at" });
      pb.sy = V.lin(B.ylim, [pb.h, 0]);
      axisY(gb, pb.sy, pb.w, B.yticks, (t) => String(t));
      const gw = pb.w / B.tasks.length, bw = (gw * 0.8) / KEYS.length;
      pb.gw = gw; pb.bw = bw;
      const cp = el("clipPath", { id: id + "b" }, defs);
      el("rect", { x: -2, y: -2, width: pb.w + 4, height: pb.h + 2 }, cp);
      pb.gB = el("g", { "pointer-events": "none" }, gb);
      const gbars = el("g", { "clip-path": `url(#${id}b)` }, gb);
      KEYS.forEach((k, i) => {
        const g = el("g", { class: "nv-ser", "data-k": k }, gbars);
        ser(B, k).values.forEach((v, j) => {
          const x = j * gw + gw / 2 + (i - (KEYS.length - 1) / 2) * bw - (bw * 0.9) / 2, y = pb.sy(v);
          const n = el("rect", { x, y, width: bw * 0.9, height: Math.max(0, pb.h - y), fill: COL[k], class: "nv-vbar", rx: Math.min(1.5, bw * 0.15) }, g);
          n.style.transitionDelay = (reduce ? 0 : 150 + i * 90 + j * 40) + "ms";
          S.bars.push(n);
        });
      });
      const axb = el("g", { class: "nv-axis", transform: `translate(0,${pb.h})` }, gb);
      el("line", { x1: 0, x2: pb.w, y1: 0, y2: 0 }, axb);
      B.tasks.forEach((t, j) => {
        const x = j * gw + gw / 2;
        if (pb.rot) T(axb, t, { x: x + 4, y: 14, "text-anchor": "end", transform: `rotate(-35 ${x + 4} 14)` });
        else T(axb, t, { x, y: 17, "text-anchor": "middle" });
      });
      pb.gH = el("g", { "pointer-events": "none" }, gb);
      const ovb = el("rect", { x: 0, y: -6, width: pb.w, height: pb.h + 6, fill: "transparent", class: "nv-ov" }, gb);
      bindOverlay(ovb, (e) => {
        const r = ovb.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top - 6;
        const j = clamp(Math.floor(px / gw), 0, B.tasks.length - 1);
        const i = Math.round((px - (j * gw + gw / 2)) / bw + (KEYS.length - 1) / 2);
        const k = i >= 0 && i < KEYS.length && Math.abs(px - (j * gw + gw / 2)) <= gw * 0.42 ? KEYS[i] : null;
        showB(j, k, [pb.x + px, pb.y + py]);
      }, unhover, false);
      paintHot(bus.get());
      if (revealed) svg.classList.add("nv-in");
      if (cur) (cur.p === "a" ? showA : showB)(cur.i, cur.k, null);
    }

    function paintHot(k) {
      if (!S) return;
      S.svg.querySelectorAll(".nv-ser").forEach((n) => { n.style.opacity = dimOf(n, k); });
    }
    bus.on((k) => { paintHot(k); if (cur) (cur.p === "a" ? showA : showB)(cur.i, cur.k, cur.pos, true); });

    function showA(i, k, pos, quiet) {
      if (!S || !revealed) return;
      const p = S.pa, x = p.sx(i);
      cur = { p: "a", i, k, pos };
      S.pb.gB.textContent = "";
      p.gH.textContent = "";
      el("line", { x1: x, x2: x, y1: 0, y2: p.h, class: "nv-xh" }, p.gH);
      const hot = quiet ? bus.get() : k;
      for (const key of KEYS) {
        const v = ser(A, key).values[i];
        const n = marker(p.gH, SHAPE[key], x, p.sy(v), key === "quasar" ? 4.6 : 3.8, COL[key], "nv-hd");
        if (hot && key !== hot) n.style.opacity = key === "bf16" ? DIM_REF : DIM;
      }
      if (!quiet) bus.hover(k);
      const rows = KEYS.map((key) => ({ key, label: lab[key], color: COL[key], v: ser(A, key).values[i], value: p1(ser(A, key).values[i]), ref: key === "bf16" }))
        .sort((a, b) => b.v - a.v);
      const qy = p.y + p.sy(ser(A, "quasar").values[i]);
      const at = pos || [p.x + x, qy];
      tip.show(at[0], at[1], tipHTML("context " + nt(A.bins[i]) + " · " + nt("MRCR ×100"), rows, bus.get()));
    }
    function showB(j, k, pos, quiet) {
      if (!S || !revealed) return;
      const p = S.pb;
      cur = { p: "b", i: j, k, pos };
      S.pa.gH.textContent = "";
      p.gB.textContent = "";
      el("rect", { x: j * p.gw + p.gw * 0.06, y: -4, width: p.gw * 0.88, height: p.h + 4, rx: 4, class: "nv-band" }, p.gB);
      if (!quiet) bus.hover(k);
      const rows = KEYS.map((key) => ({ key, label: lab[key], color: COL[key], v: ser(B, key).values[j], value: p1(ser(B, key).display[j]) + "%", ref: key === "bf16" }))
        .sort((a, b) => b.v - a.v);
      const at = pos || [p.x + j * p.gw + p.gw / 2, p.y + p.sy(ser(B, "quasar").values[j])];
      tip.show(at[0], at[1], tipHTML(nt(B.tasks[j]) + " · terminating", rows, bus.get()));
    }
    function unhover() {
      cur = null;
      if (S) { S.pa.gH.textContent = ""; S.pb.gB.textContent = ""; }
      tip.hide();
      bus.hover(null);
    }
    // keyboard: left/right steps through the context bins, then the benchmarks
    const STOPS = A.bins.map((_, i) => ["a", i]).concat(B.tasks.map((_, j) => ["b", j]));
    plot.addEventListener("keydown", (e) => {
      if (!S) return;
      let s = cur ? STOPS.findIndex((x) => x[0] === cur.p && x[1] === cur.i) : -1;
      if (e.key === "ArrowRight") s = Math.min(STOPS.length - 1, s + 1);
      else if (e.key === "ArrowLeft") s = s < 0 ? 0 : Math.max(0, s - 1);
      else if (e.key === "Home") s = 0;
      else if (e.key === "End") s = STOPS.length - 1;
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault();
      const [pp, i] = STOPS[s];
      (pp === "a" ? showA : showB)(i, null, null, true);
    });
    plot.addEventListener("focus", () => { if (plot.matches(":focus-visible")) showA(0, null, null, true); });
    plot.addEventListener("blur", unhover);
    outsideTap(plot, unhover);

    let rvTok = 0;
    function reveal() {
      if (!S) return;
      S.svg.classList.add("nv-in");
      const my = ++rvTok, k = S;
      V.tween(1250, (t) => { if (my === rvTok && S === k) k.clipA.setAttribute("width", Math.max(0, t) * (k.pa.w + 16)); });
    }
    function finish() {
      revealed = true; ++rvTok;
      if (!S) return;
      plot.classList.add("nv-now");
      S.clipA.setAttribute("width", S.pa.w + 16);
      S.svg.classList.add("nv-in");
    }
    V.responsive(plot, build);
    whenFonts(() => { const w = Math.round(plot.clientWidth); if (w) build(w); });
    V.onVisible(root, () => { if (revealed) return; revealed = true; reveal(); }, { threshold: 0.3 });
    return finish;
  }

  // ================================================================ Table 10 — non-termination rate
  function tab10(root, D) {
    const T10 = D.tab10, bus = LH;
    const KEYS = ["rtn", "gptq", "standard_qat", "quasar"];  // bars, in table order; BF16 is the reference line
    const SHORT = { "MATH-500": "MATH-500", "LiveCodeBench v6": "LCB v6", "OJBench (C++)": "OJBench C++", "OJBench (Python)": "OJBench Py" };
    const lab = { bf16: "BF16" };
    T10.models[0].rows.forEach((r) => (lab[r.key] = r.label));
    root.classList.add("nv", "nv10");
    const top = h("div", { class: "nv-top" }, root);
    legend(top, ["bf16"].concat(KEYS).map((k) => ({ key: k, label: lab[k], kind: k === "bf16" ? "ref" : "bar" })), bus);
    const plot = h("div", { class: "nv-plot", tabindex: "0" }, root);
    plotAria(plot, root);
    const sr = h("table", null, h("div", { class: "sr-only", "data-label": "" }, root));
    srTable(sr, "non-termination (%)", ["model · method"].concat(T10.columns),
      [].concat(...T10.models.map((m) => m.rows.map((r) => [m.name + " · " + r.label].concat(r.values.map(p1))))));
    const tip = V.tooltip(plot);
    tip.node.style.top = tip.node.style.left = "0px";  // parked inside the plot while hidden (no overflow below the card)
    let S = null, revealed = false, cur = null;
    const rowOf = (m, k) => m.rows.find((r) => r.key === k);

    function build(width) {
      const short = width < 420;
      const name = (c) => (short ? SHORT[c] || c : c);
      const gut = Math.ceil(Math.max(...T10.columns.map((c) => textW(name(c), 12, 500)), textW("BF16 00.0", 12, 500))) + 14;
      const x0 = gut, x1 = width - 34;
      const sx = V.lin([0, 100], [x0, x1]);
      const pitch = 13, bh = 9, gh = KEYS.length * pitch - (pitch - bh), ggap = 14, mhead = 30;
      let y = 44;
      const blocks = T10.models.map((m) => {
        const b = { m, y, groups: [] };
        y += mhead;
        T10.columns.forEach((c, j) => { b.groups.push({ j, c, y }); y += gh + ggap; });
        y += 8;
        return b;
      });
      const height = y - 8 - ggap + 6;
      const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img",
        "aria-label": "non-termination rates" });
      plot.querySelectorAll(":scope > svg").forEach((s) => s.remove());
      plot.insertBefore(svg, plot.firstChild);
      S = { svg, sx, blocks, rows: [], x0, x1, gh, pitch, bh, width };
      T(svg, "non-termination (%)", { x: x0, y: 12, class: "nv-at" });
      const ga = el("g", { class: "nv-axis" }, svg), gg = el("g", { class: "nv-grid" }, svg);
      S.gH = el("g", { "pointer-events": "none" }, svg);
      for (const t of [0, 25, 50, 75, 100]) {
        const x = sx(t);
        T(ga, String(t), { x, y: 32, "text-anchor": "middle" });
        el("line", { x1: x, x2: x, y1: 40, y2: height - 2, class: t === 0 ? "zero" : null }, gg);
      }
      blocks.forEach((b, bi) => {
        T(svg, b.m.name, { x: 0, y: b.y + 18, class: "nv-mh" });
        b.groups.forEach((G) => {
          const gy = G.y, bf = rowOf(b.m, "bf16").values[G.j];
          T(svg, name(G.c), { x: 0, y: gy + 13, class: "nv-gl" });
          const bt = T(svg, "", { x: 0, y: gy + 29, class: "nv-bfl" });
          el("tspan", { class: "nv-bfk" }, bt).textContent = "BF16 ";
          el("tspan", null, bt).textContent = p1(bf);
          const gBar = el("g", null, svg), gRef = el("g", { class: "nv-ser", "data-k": "bf16" }, svg), gVal = el("g", null, svg);
          KEYS.forEach((k, i) => {
            const r = rowOf(b.m, k), v = r.values[G.j], by = gy + i * pitch;
            const n = el("rect", { x: x0, y: by, width: Math.max(1.5, sx(v) - x0), height: bh, rx: 1.5, fill: COL[k], class: "nv-hbar" },
              el("g", { class: "nv-ser", "data-k": k }, gBar));
            n.style.transitionDelay = (reduce ? 0 : 120 + bi * 260 + G.j * 70 + i * 35) + "ms";
            const best = r.best.indexOf(G.c) >= 0;
            let lx = Math.max(sx(v), x0 + 1.5) + 5;
            const bx = sx(bf);
            if (bx > lx - 8 && bx < lx + 2) lx = bx + 5;  // keep the label clear of the BF16 tick
            T(el("g", { class: "nv-ser", "data-k": k }, gVal), p1(v),
              { x: lx, y: by + bh / 2 + 4, class: "nv-val nv-fade" + (k === "quasar" ? " q" : "") + (best ? " b" : "") });
          });
          el("line", { x1: sx(bf), x2: sx(bf), y1: gy - 4, y2: gy + gh + 4, class: "nv-bf nv-fade" }, gRef);
          const ov = el("rect", { x: 0, y: gy - ggap / 2, width, height: gh + ggap, fill: "transparent", class: "nv-ov rows" }, svg);
          const at = (e) => { const r = ov.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top - ggap / 2]; };
          const idx = S.rows.length;
          S.rows.push({ b, G, bi });
          bindOverlay(ov, (e) => {
            const [px, py] = at(e);
            const i = Math.floor((py + (pitch - bh) / 2) / pitch);
            const k = px >= x0 - 4 && i >= 0 && i < KEYS.length ? KEYS[i] : null;
            show(idx, k, [px, gy + py]);
          }, unhover, false);
        });
      });
      paintHot(bus.get());
      if (revealed) svg.classList.add("nv-in");
      if (cur) show(cur.i, cur.k, null, true);
    }
    function paintHot(k) {
      if (!S) return;
      S.svg.querySelectorAll(".nv-ser").forEach((n) => { n.style.opacity = dimOf(n, k); });
    }
    bus.on((k) => { paintHot(k); if (cur) show(cur.i, cur.k, cur.pos, true); });
    function show(i, k, pos, quiet) {
      if (!S || !revealed) return;
      const { b, G } = S.rows[i];
      cur = { i, k, pos };
      S.gH.textContent = "";
      el("rect", { x: 0, y: G.y - 6, width: S.width, height: S.gh + 12, rx: 4, class: "nv-band" }, S.gH);
      if (!quiet) bus.hover(k);
      const rows = ["bf16"].concat(KEYS).map((key) => { const v = rowOf(b.m, key).values[G.j]; return { key, label: lab[key], color: COL[key], v, value: p1(v) + "%", ref: key === "bf16" }; })
        .sort((a, c) => a.v - c.v || (a.key === "bf16" ? -1 : c.key === "bf16" ? 1 : 0));
      const qy = G.y + 3 * S.pitch + S.bh / 2;
      const at = pos || [Math.min(S.x1, S.sx(rowOf(b.m, "quasar").values[G.j]) + 30), qy];
      tip.show(at[0], at[1], tipHTML(nt(b.m.name) + " · " + nt(G.c), rows, bus.get()));
    }
    function unhover() { cur = null; if (S) S.gH.textContent = ""; tip.hide(); bus.hover(null); }
    plot.addEventListener("keydown", (e) => {
      if (!S) return;
      const n = S.rows.length;
      let i = cur ? cur.i : -1;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") i = Math.min(n - 1, i + 1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") i = i < 0 ? 0 : Math.max(0, i - 1);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault();
      show(i, null, null, true);
    });
    plot.addEventListener("focus", () => { if (plot.matches(":focus-visible")) show(0, null, null, true); });
    plot.addEventListener("blur", unhover);
    outsideTap(plot, unhover);
    function finish() { revealed = true; plot.classList.add("nv-now"); if (S) S.svg.classList.add("nv-in"); }
    V.responsive(plot, build);
    whenFonts(() => { const w = Math.round(plot.clientWidth); if (w) build(w); });
    V.onVisible(root, () => { if (revealed) return; revealed = true; if (S) S.svg.classList.add("nv-in"); }, { threshold: 0.3 });
    return finish;
  }

  // ================================================================ boot
  // Each chart fetches + draws once it comes within 800px of the viewport. Printing first mounts anything
  // still pending, then forces every chart to its final drawn state.
  const pending = [], finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "nv-fail", "data-label": "" }, node, "— data unavailable —");
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
          if (fin) { finals.push(fin); if (printing) fin(); }
        })
        .catch((err) => { if (window.console) console.error("[ix-nvfp4app] " + id, err); fail(node); });
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
    mount("ix-fig35", fig35);
    mount("ix-tab10", tab10);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
