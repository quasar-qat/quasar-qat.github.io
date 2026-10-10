/* charts-curves.js — line charts and theory scatters for the QUASAR page.
   Mounts: #healing-curves (Fig. 3), #lr-chart (Fig. 25), #theory-init (Fig. 13), #theory-dose (Fig. 12).
   Data:   assets/data/{healing_curves,results,theory}.json — every number comes from there.
   Renders labels and numbers only (no prose). Needs window.Viz (viz.js). */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const dataURL = (f) => (SRC ? new URL("../data/" + f, SRC).href : "assets/data/" + f);
  const el = V.el, h = V.h;
  const NARROW = 560;
  const ROSE = "#D1495B", ROSE_T = "#A13040", INK2 = "#44484f";  // ROSE_T: QUASAR text below ~18px (contrast)
  const reduce = V.reducedMotion;
  let UID = 0;

  // ---------------------------------------------------------------- formatting
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const pow10 = (e) => "10" + String(e).split("").map((c) => SUP[c]).join("");
  function sci(v, sig) {
    let e = Math.floor(Math.log10(v) + 1e-9);
    let m = +(v / Math.pow(10, e)).toPrecision(sig);
    if (m >= 10) { m = +(m / 10).toPrecision(sig); e += 1; }
    return m === 1 ? pow10(e) : m + "·" + pow10(e);
  }
  // KL at the paper's precision: 3 decimals below 1 (e.g. 0.112), 2 above (divergent cells only)
  function kl(v) {
    if (v == null || !isFinite(v)) return "–";
    return v >= 1 ? v.toFixed(2) : v.toFixed(3);
  }
  function decimals(ticks) {
    for (let d = 0; d <= 4; d++) {
      const f = Math.pow(10, d);
      if (ticks.every((t) => Math.abs(Math.round(t * f) - t * f) < 1e-6)) return d;
    }
    return 4;
  }
  const niceOr = (ticks, lim) => (ticks && ticks.length > 1 && decimals(ticks) <= 3 ? ticks.slice() : V.niceTicks(lim[0], lim[1], 4));
  const stepTick = (v) => (v === 0 ? "0" : v % 1024 === 0 ? v / 1024 + "k" : String(v));
  const thousands = (v) => Math.round(v).toLocaleString("en-US");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const setAttr = (n, k, v) => (v == null || v === "" ? n.removeAttribute(k) : n.setAttribute(k, v));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // tooltip markup: values lead (bold), series keyed by a short stroke
  function tipHTML(head, rows, headColor) {
    let s = '<div class="tt">' + (headColor ? '<i class="cc-k" style="background:' + headColor + '"></i>' : "") + head + "</div>";
    for (const r of rows) {
      s += '<div class="row cc-row' + (r.q ? " q" : "") + '"><span class="cc-n">' +
        (r.color ? '<i class="cc-k" style="background:' + r.color + '"></i>' : "") +
        (r.html ? r.label : esc(r.label)) + "</span><b>" + esc(r.value) + "</b></div>";
    }
    return s;
  }

  function marker(g, shape, x, y, r, fill, extra) {
    let n;
    if (shape === "square") n = el("rect", { x: x - r * 0.88, y: y - r * 0.88, width: r * 1.76, height: r * 1.76, rx: 1.4 }, g);
    else if (shape === "triangle") {
      const a = r * 1.32;
      n = el("path", { d: `M${x},${y - a}L${x + a * 0.92},${y + a * 0.6}L${x - a * 0.92},${y + a * 0.6}Z`, "stroke-linejoin": "round" }, g);
    } else if (shape === "star") {
      const R = r * 1.7, ri = R * 0.46;
      let d = "";
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? ri : R, a = -Math.PI / 2 + (i * Math.PI) / 5;
        d += (i ? "L" : "M") + (x + rr * Math.cos(a)).toFixed(2) + "," + (y + rr * Math.sin(a)).toFixed(2);
      }
      n = el("path", { d: d + "Z", "stroke-linejoin": "round" }, g);
    } else n = el("circle", { cx: x, cy: y, r }, g);
    n.setAttribute("fill", fill);
    if (extra) for (const k in extra) n.setAttribute(k, extra[k]);
    return n;
  }

  // compact inline key row (used at narrow widths, and for scatter charts)
  function legendRow(parent, items, cls) {
    const row = h("div", { class: "cc-legend" + (cls ? " " + cls : ""), "aria-hidden": "true" }, parent);
    for (const it of items) {
      const li = h("span", { class: "cc-li" + (it.q ? " q" : "") }, row);
      const s = el("svg", { viewBox: "0 0 18 10", width: 18, height: 10 }, li);
      if (it.shape) marker(s, it.shape, 9, 5, 3.6, it.color);
      else el("line", { x1: 2, x2: 16, y1: 5, y2: 5, stroke: it.color, "stroke-width": it.q ? 3 : 2, "stroke-linecap": "round", "stroke-dasharray": it.dash || null }, s);
      h("span", null, li, esc(it.label));
    }
    return row;
  }

  function srTable(node, head, rows) {
    node.innerHTML = "<thead><tr>" + head.map((x) => "<th>" + esc(x) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((x, i) => (i ? "<td>" : '<th scope="row">') + esc(x) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody>";
  }

  // close a touch tooltip when tapping elsewhere
  function outsideTap(node, fn) {
    document.addEventListener("pointerdown", (e) => { if (!node.contains(e.target)) fn(); }, { passive: true });
  }
  // Pointer input on a chart overlay. Mouse (and a hovering pen) tracks the pointer. Touch shows values only
  // on a tap (< 10 px of travel) or a horizontal scrub; a vertical swipe stays a page scroll, and the
  // pointercancel the browser sends when it takes the gesture over clears the crosshair + tooltip.
  function bindOverlay(ov, move, off) {
    let t0 = null, scrub = false;
    ov.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") { move(e); return; }
      t0 = [e.clientX, e.clientY]; scrub = false;
    });
    ov.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") { move(e); return; }
      if (!t0) { if (e.pointerType === "pen") move(e); return; }
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
  function fadeIn(nodes, ms, delay) {
    for (const n of nodes) {
      if (!n) continue;
      n.style.transition = reduce ? "none" : `opacity ${ms || 420}ms ease ${delay || 0}ms`;
      n.style.opacity = 1;
    }
  }
  function hideNow(nodes) { for (const n of nodes) if (n) { n.style.transition = "none"; n.style.opacity = 0; } }
  function showNow(nodes) { for (const n of nodes) if (n) { n.style.transition = "none"; n.style.opacity = 1; } }
  function whenFonts(cb) { if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(cb); }
  // focusable plot = labelled group; the name comes from the card's kicker (e.g. "healing with QAD")
  function plotAria(plot, root, what) {
    const card = root.closest(".viz"), kick = card && card.querySelector(".viz-kicker");
    const name = kick ? kick.textContent.split("·")[0].trim() : "";
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-label", (name ? name + " chart" : "Chart") + ", use left and right arrow keys to step through " + what);
  }

  // ================================================================ curve explorer
  // cfg: initial, controls[], xlim, xticks, xtitle, labelRoom, inset, height(w,narrow), legendItems, refLabel, view(state)
  function curveChart(root, cfg) {
    const st = Object.assign({}, cfg.initial);
    root.classList.add("cc");
    if (cfg.controls && cfg.controls.length) {
      const row = h("div", { class: "controls cc-controls" }, root);
      for (const c of cfg.controls) {
        const grp = h("div", { class: "cc-ctl" }, row);
        h("span", { class: "lab", "aria-hidden": "true" }, grp, esc(c.label));
        V.pills(grp, c.options, st[c.key], (v) => { st[c.key] = v; update(); }, c.label);
      }
    }
    const plot = h("div", { class: "cc-plot", tabindex: "0" }, root);
    plotAria(plot, root, "training steps");
    // key for the reference line, shown only when its in-plot label has no room
    const refKey = cfg.refLabel ? legendRow(root, [{ label: cfg.refLabel, color: "#7d8187", dash: "4 3" }], "cc-refkey") : null;
    const leg = cfg.legendItems ? legendRow(root, cfg.legendItems, "cc-narrow-only") : null;
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    const tip = V.tooltip(plot);
    let sk = null, shown = null, revealed = false, tok = 0, swTok = 0, hi = null, fading = false, disp = null;

    function build(width) {
      const narrow = width < NARROW;
      const height = cfg.height(width, narrow);
      const m = { t: 30, r: narrow ? 10 : cfg.labelRoom, b: 42, l: 44 };
      const fr = V.frame(plot, width, height, m);
      const { svg, g, W, H } = fr;
      if (shown) svg.setAttribute("aria-label", shown.aria || shown.ytitle);  // frame() makes a fresh role=img svg
      const id = "cc" + ++UID;
      const defs = el("defs", null, svg);
      const cp = el("clipPath", { id: id + "c" }, defs);
      el("rect", { x: 0, y: -1, width: W, height: H + 2 }, cp);
      const reveal = (k) => el("rect", { x: -20, y: -60, width: W + 40, height: H + 120 }, el("clipPath", { id: id + k }, defs));
      const sx = V.lin(cfg.xlim, [0, W]);
      const gGrid = el("g", { class: "grid" }, g);
      const gYt = el("g", { class: "axis" }, g);
      const yTitle = el("text", { class: "axis-title", x: -m.l, y: -17 }, g);
      V.axisBottom(g, sx, H, { ticks: cfg.xticks, fmt: stepTick, title: cfg.xtitle, titleY: 34 });
      const gFade = el("g", null, g);
      const gRef = el("g", null, gFade);
      const gData = el("g", { "clip-path": `url(#${id}c)` }, gFade);
      const gB = el("g", { "clip-path": `url(#${id}b)` }, gData);
      const gQ = el("g", { "clip-path": `url(#${id}q)` }, gData);
      const gZoom = el("g", null, gFade);
      const gLab = el("g", null, gFade);
      const gHov = el("g", { "pointer-events": "none" }, g);
      const ov = el("rect", { class: "cc-overlay", x: 0, y: 0, width: W, height: H, fill: "transparent" }, g);
      sk = { svg, W, H, m, sx, narrow, rB: reveal("b"), rQ: reveal("q"), gGrid, gYt, yTitle, gFade, gRef, gB, gQ, gZoom, gLab, gHov, ov, paths: {}, dots: {}, inset: null };
      if (cfg.inset) {
        const I = { x0: Math.round(W * (narrow ? 0.2 : 0.3)), x1: W - 3, y0: 3, y1: Math.round(H * 0.43), paths: {} };
        const ic = el("clipPath", { id: id + "i" }, defs);
        el("rect", { x: I.x0, y: I.y0, width: I.x1 - I.x0, height: I.y1 - I.y0 }, ic);
        I.zr = el("rect", { class: "cc-zr" }, gZoom);
        I.c1 = el("line", { class: "cc-zc" }, gZoom);
        I.c2 = el("line", { class: "cc-zc" }, gZoom);
        el("rect", { class: "cc-ibg", x: I.x0, y: I.y0, width: I.x1 - I.x0, height: I.y1 - I.y0 }, gZoom);
        I.g = el("g", { "clip-path": `url(#${id}i)` }, gZoom);
        el("rect", { class: "cc-ib", x: I.x0, y: I.y0, width: I.x1 - I.x0, height: I.y1 - I.y0, rx: 2 }, gZoom);
        I.lab = el("text", { class: "cc-ilab", x: I.x0 + 6, y: I.y0 + 12 }, gZoom);
        sk.inset = I;
      }
      if (leg) leg.classList.toggle("on", narrow);
      bindHover(sk);
      if (shown) paint(shown);
      if (!revealed) hideForReveal(); else showAll();
    }

    function paint(v) {
      const k = sk;
      if (!k) return;
      disp = v;
      const { W, H, sx } = k;
      const sy = V.lin(v.ylim, [H, 0]);
      // y axis (grid + ticks). During a morph the tick sets are sequenced, never overlapped:
      // old ticks fade out over the first half, new ones fade in over the second; ticks in both stay put.
      k.gGrid.textContent = ""; k.gYt.textContent = "";
      const tickSet = (list) => { const d = decimals(list); return list.map((t) => [t, t.toFixed(d)]); };
      const ticks = (items, a) => {
        if (a <= 0.001) return;
        for (const [t, s] of items) {
          const y = sy(t);
          if (y < -0.5 || y > H + 0.5) continue;
          el("line", { x1: 0, x2: W, y1: y, y2: y, opacity: a < 1 ? a.toFixed(3) : null }, k.gGrid);
          el("text", { x: -8, y: y + 4, "text-anchor": "end", opacity: a < 1 ? a.toFixed(3) : null }, k.gYt).textContent = s;
        }
      };
      if (v.mix && v.mix.from.join() !== v.mix.to.join()) {
        const A = tickSet(v.mix.from), B = tickSet(v.mix.to), r = v.mix.r;
        const inA = new Set(A.map((x) => x[1])), inB = new Set(B.map((x) => x[1]));
        ticks(A.filter((x) => inB.has(x[1])), 1);
        ticks(A.filter((x) => !inB.has(x[1])), clamp(1 - 2 * r, 0, 1));
        ticks(B.filter((x) => !inA.has(x[1])), clamp(2 * r - 1, 0, 1));
      } else ticks(tickSet(v.yticks), 1);
      k.yTitle.textContent = v.ytitle;
      // lines (+ faint measured points)
      for (const ln of v.lines) {
        let p = k.paths[ln.key];
        if (!p) {
          const grp = ln.q ? k.gQ : k.gB;
          k.dots[ln.key] = el("g", { fill: ln.color, class: "cc-dots" }, grp);
          p = k.paths[ln.key] = el("path", { fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round", class: "cc-line" }, grp);
        }
        p.setAttribute("d", V.linePath(ln.pts, sx, sy));
        p.setAttribute("stroke", ln.color);
        p.setAttribute("stroke-width", k.narrow ? +(ln.width * 0.88).toFixed(2) : ln.width);
        setAttr(p, "stroke-dasharray", ln.dash);
        p.setAttribute("stroke-opacity", ln.opacity == null ? 1 : ln.opacity);
        const dg = k.dots[ln.key], dp = (v.dots && v.dots[ln.key]) || [];
        while (dg.childNodes.length > dp.length) dg.lastChild.remove();
        while (dg.childNodes.length < dp.length) el("circle", { r: k.narrow ? 1.5 : 1.8 }, dg);
        dp.forEach((pt, i) => { const c = dg.childNodes[i]; c.setAttribute("cx", sx(pt[0]).toFixed(1)); c.setAttribute("cy", sy(pt[1]).toFixed(1)); });
      }
      // zoom inset (final 1,024 steps, paper limits)
      const I = k.inset;
      if (I) {
        if (v.zoom) {
          k.gZoom.style.display = "";
          const z = v.zoom, x0 = sx(z.xlim[0]), x1 = sx(z.xlim[1]);
          const y0 = clamp(sy(z.ylim[1]), 0, H), y1 = clamp(sy(z.ylim[0]), 0, H);
          Object.entries({ x: x0, y: y0, width: x1 - x0, height: Math.max(0, y1 - y0) }).forEach(([a, b]) => I.zr.setAttribute(a, b));
          Object.entries({ x1: x0, y1: y0, x2: I.x0, y2: I.y1 }).forEach(([a, b]) => I.c1.setAttribute(a, b));
          Object.entries({ x1: x1, y1: y0, x2: I.x1, y2: I.y1 }).forEach(([a, b]) => I.c2.setAttribute(a, b));
          I.sx = V.lin(z.xlim, [I.x0 + 1, I.x1 - 1]);
          I.sy = V.lin(z.ylim, [I.y1 - 1, I.y0 + 1]);
          for (const ln of v.lines) {
            let p = I.paths[ln.key];
            if (!p) p = I.paths[ln.key] = el("path", { fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round", class: "cc-line" }, I.g);
            const pts = ln.pts.filter((q) => q[0] >= z.xlim[0] - 25 && q[0] <= z.xlim[1] + 25);
            p.setAttribute("d", V.linePath(pts, I.sx, I.sy));
            p.setAttribute("stroke", ln.color);
            p.setAttribute("stroke-width", ln.iw || (ln.q ? 1.7 : 1));
            setAttr(p, "stroke-dasharray", ln.dash);
            p.setAttribute("stroke-opacity", ln.opacity == null ? 1 : ln.opacity);
          }
          I.lab.textContent = z.label || "";
        } else k.gZoom.style.display = "none";
      }
      // reference: dashed line at the best baseline's final value, labelled only (no number, no marker).
      // The label sits below the line where no curve is: left of where QUASAR first reaches the line,
      // or at the right end when QUASAR's final value leaves room; otherwise the key row under the plot names it.
      k.gRef.textContent = "";
      let placed = false;
      if (v.ref) {
        const y = sy(v.ref.y), cx = sx(v.ref.cx);
        el("line", { x1: 0, x2: W, y1: y, y2: y, class: "cc-refl" }, k.gRef);
        const t = el("text", { x: 4, y: y + 14, class: "cc-reft" }, k.gRef);
        t.textContent = v.ref.label;
        const w = t.getComputedTextLength();
        const roomR = (v.ref.qEnd != null ? sy(v.ref.qEnd) : H) - y >= 22;
        if (w && w <= cx - 16) placed = true;
        else if (w && roomR && w <= W - cx - 30) { placed = true; t.setAttribute("x", W - 3); t.setAttribute("text-anchor", "end"); }
        if (!placed) t.remove();
      }
      if (refKey && !v.mix) refKey.classList.toggle("on", !!v.ref && !placed);
      // direct end labels (desktop); dodged, keyed by a short stroke in the series color
      k.gLab.textContent = "";
      if (!k.narrow) {
        const n = v.labelAvg || 1;
        const items = v.lines.map((ln) => {
          const tail = ln.pts.slice(-n), yv = tail.reduce((a, q) => a + q[1], 0) / tail.length;
          return { ln, y: clamp(sy(yv), 0, H) };
        });
        V.dodge(items, 15, -6, H + 12);
        for (const it of items) {
          const grp = el("g", { class: "cc-lab" }, k.gLab);
          // noisy series (train) get a plain key stroke; smooth ones a short leader back to the line end
          const d = n > 1 || Math.abs(it.ly - it.y) < 1.5 ? `M${W + 5},${it.ly.toFixed(1)}L${W + 14},${it.ly.toFixed(1)}`
            : `M${W + 2},${it.y.toFixed(1)}L${W + 6},${it.ly.toFixed(1)}L${W + 14},${it.ly.toFixed(1)}`;
          el("path", { d, stroke: it.ln.color, "stroke-width": it.ln.q ? 2.6 : 1.7, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, grp);
          el("text", { x: W + 18, y: it.ly + 4, class: "end-label" + (it.ln.q ? " q" : ""), fill: it.ln.q ? ROSE_T : INK2 }, grp).textContent = it.ln.label;
        }
      }
    }

    // ---- hover / keyboard ----
    function bindHover(k) {
      const at = (e) => { const r = k.ov.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      bindOverlay(k.ov, (e) => { const [x, y] = at(e); hover(idxAt(x), y); }, unhover);
    }
    function idxAt(px) {
      const xs = shown.lines[0].pts, xv = sk.sx.invert(px);
      let best = 0;
      for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i][0] - xv) < Math.abs(xs[best][0] - xv)) best = i;
      return best;
    }
    function hover(i, py) {
      const k = sk, v = shown;
      if (!k || !v || !revealed) return;
      hi = i;
      const sy = V.lin(v.ylim, [k.H, 0]);
      const xv = v.lines[0].pts[i][0], x = k.sx(xv);
      k.gHov.textContent = "";
      el("line", { x1: x, x2: x, y1: 0, y2: k.H, class: "cc-xh" }, k.gHov);
      const rows = [];
      let qy = k.H / 2;
      for (const ln of v.lines) {
        const p = ln.pts[i];
        if (!p) continue;
        const y = sy(p[1]);
        if (ln.q) qy = y;
        if (y >= -1 && y <= k.H + 1) el("circle", { cx: x, cy: y, r: ln.q ? 4.4 : 3.3, fill: ln.color, class: "cc-hd" }, k.gHov);
        rows.push({ label: ln.label, color: ln.color, value: kl(p[1]), v: p[1], q: ln.q });
      }
      const I = k.inset;
      if (I && v.zoom && xv >= v.zoom.xlim[0] && xv <= v.zoom.xlim[1]) {
        const ix = I.sx(xv);
        el("line", { x1: ix, x2: ix, y1: I.y0, y2: I.y1, class: "cc-xh" }, k.gHov);
        for (const ln of v.lines) {
          const p = ln.pts[i], y = I.sy(p[1]);
          if (y >= I.y0 && y <= I.y1) el("circle", { cx: ix, cy: y, r: ln.q ? 3.4 : 2.6, fill: ln.color, class: "cc-hd" }, k.gHov);
        }
      }
      rows.sort((a, b) => a.v - b.v);
      const ty = py != null ? py : clamp(qy, 12, k.H);
      tip.show(k.m.l + x, k.m.t + ty, tipHTML("step " + thousands(xv), rows));
    }
    function unhover() { hi = null; if (sk) sk.gHov.textContent = ""; tip.hide(); }
    plot.addEventListener("keydown", (e) => {
      if (!shown) return;
      const n = shown.lines[0].pts.length, big = e.shiftKey ? 10 : 1;
      let i = hi == null ? n - 1 : hi;
      if (e.key === "ArrowRight") i = Math.min(n - 1, i + big);
      else if (e.key === "ArrowLeft") i = Math.max(0, i - big);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault();
      hover(i);
    });
    plot.addEventListener("focus", () => { if (shown && plot.matches(":focus-visible")) hover(hi == null ? shown.lines[0].pts.length - 1 : hi); });
    plot.addEventListener("blur", unhover);
    outsideTap(plot, unhover);

    // ---- reveal + transitions ----
    function extras() { return sk ? [sk.gZoom, sk.gLab, sk.gRef] : []; }
    function hideForReveal() { if (!sk) return; sk.rB.setAttribute("width", 0); sk.rQ.setAttribute("width", 0); hideNow(extras()); }
    function showAll() { if (!sk) return; sk.rB.setAttribute("width", sk.W + 40); sk.rQ.setAttribute("width", sk.W + 40); fadeIn(extras(), 1); }
    function sweep(ms) {
      const k = sk;
      if (!k) return;
      if (reduce) { showAll(); return; }
      const my = ++swTok, full = k.W + 40;
      k.rB.setAttribute("width", 0); k.rQ.setAttribute("width", 0);
      V.tween(ms, (t) => { if (my === swTok) k.rB.setAttribute("width", Math.max(0, t) * full); });
      setTimeout(() => {
        V.tween(ms * 0.92, (t) => { if (my === swTok) k.rQ.setAttribute("width", Math.max(0, t) * full); }, () => { if (my === swTok) fadeIn(extras(), 450); });
      }, 170);
    }
    function compatible(a, b) {
      return a.kind === b.kind && a.lines.length === b.lines.length && !a.dots === !b.dots &&
        a.lines.every((l, i) => l.key === b.lines[i].key && l.pts.length === b.lines[i].pts.length);
    }
    function lerpView(a, b, t) {
      const L = (x, y) => x + (y - x) * t;
      const r = 1 - Math.cbrt(1 - t);  // un-eased progress (V.tween eases cubic-out); paces the tick hand-off
      const dots = a.dots && b.dots ? {} : b.dots;
      if (a.dots && b.dots) for (const key in b.dots) dots[key] = b.dots[key].map((p, j) => [p[0], L(a.dots[key][j][1], p[1])]);
      return Object.assign({}, b, {
        ylim: [L(a.ylim[0], b.ylim[0]), L(a.ylim[1], b.ylim[1])],
        mix: { from: a.yticks, to: b.yticks, t, r },
        lines: b.lines.map((ln, i) => Object.assign({}, ln, { pts: ln.pts.map((p, j) => [p[0], L(a.lines[i].pts[j][1], p[1])]) })),
        dots,
        zoom: a.zoom && b.zoom ? Object.assign({}, b.zoom, { ylim: [L(a.zoom.ylim[0], b.zoom.ylim[0]), L(a.zoom.ylim[1], b.zoom.ylim[1])] }) : b.zoom,
        ref: null,
      });
    }
    function describe(v) {
      srTable(sr, ["method", v.ytitle + " · step " + thousands(v.lines[0].pts[v.lines[0].pts.length - 1][0])],
        v.lines.slice().reverse().map((ln) => [ln.label, kl(ln.pts[ln.pts.length - 1][1])]));
      if (sk) sk.svg.setAttribute("aria-label", v.aria || v.ytitle);
    }
    function update() {
      const next = cfg.view(st);
      describe(next);
      const my = ++tok;
      unhover();
      if (!sk || !shown || !revealed || reduce) { shown = next; paint(next); return; }
      if (!fading && compatible(shown, next)) {
        const from = disp && compatible(disp, next) ? disp : shown;  // morph from what is on screen
        shown = next;
        hideNow([sk.gRef]);
        V.tween(560, (t) => { if (my === tok) paint(lerpView(from, next, clamp(t, 0, 1))); }, () => {
          if (my !== tok) return;
          paint(next);
          fadeIn([sk.gRef], 380);
        });
      } else {
        shown = next;
        fading = true;  // a switch during the fade-out fades too (the faded frame was never painted)
        const g0 = sk.gFade;
        g0.style.transition = "opacity .18s ease"; g0.style.opacity = 0;
        setTimeout(() => {
          if (my !== tok || !sk) return;
          fading = false;
          paint(next);
          hideForReveal();
          sk.gFade.style.transition = "none"; sk.gFade.style.opacity = 1;
          sweep(760);
        }, 190);
      }
    }

    // jump straight to the final drawn state (print): cancel sweeps/morphs/fades, everything visible
    function finish() {
      ++tok; ++swTok; fading = false; revealed = true;
      unhover();
      if (!sk || !shown) return;
      showNow([sk.gFade]);
      paint(shown);
      sk.rB.setAttribute("width", sk.W + 40); sk.rQ.setAttribute("width", sk.W + 40);
      showNow(extras());
    }

    shown = cfg.view(st);
    describe(shown);
    const R = V.responsive(plot, build);
    whenFonts(() => { if (!revealed) R.redraw(); else if (shown) paint(shown); });  // re-measure the reference label
    V.onVisible(root, () => { if (revealed) return; revealed = true; sweep(1300); }, { threshold: 0.3 });
    return finish;
  }

  // ================================================================ A) healing explorer (Fig. 3)
  function healingChart(root, d) {
    const meta = {};
    d.methods.forEach((m) => (meta[m.key] = m));
    const order = ["standard_qat", "lsq", "denoising_qat", "bitdistiller", "quasar"].filter((k) => meta[k]);
    const keyOrder = ["quasar", "standard_qat", "lsq", "denoising_qat", "bitdistiller"].filter((k) => meta[k]);
    const short = { "Qwen3-4B-Thinking-2507": "Qwen3-4B-Thinking", "Llama-3.1-8B-Instruct": "Llama-3.1-8B" };
    const REF = "best baseline, final";
    return curveChart(root, {
      refLabel: REF,
      initial: { model: d.models[0], bits: d.bits.includes("INT2") ? "INT2" : d.bits[0], loss: "eval" },
      controls: [
        { key: "model", label: "model", options: d.models.map((m) => ({ value: m, label: short[m] || m })) },
        { key: "bits", label: "bits", options: d.bits.map((b) => ({ value: b, label: b })) },
        { key: "loss", label: "loss", options: [{ value: "train", label: "Train" }, { value: "eval", label: "Held-out" }] },
      ],
      xlim: [0, 4224], xticks: [1024, 2048, 3072, 4096], xtitle: "training step",
      labelRoom: 116, inset: true,
      height: (w, narrow) => (narrow ? 300 : w < 820 ? 360 : 400),
      legendItems: keyOrder.map((k) => ({ label: meta[k].label, color: meta[k].color, q: k === "quasar" })),
      view(st) {
        const ser = d.series[st.model][st.bits], ax = d.axes[st.model][st.bits];
        const ev = st.loss === "eval", P = ax[st.loss];
        const lines = order.map((k) => {
          const q = k === "quasar";
          return { key: k, label: meta[k].label, color: meta[k].color, q, width: ev ? (q ? 2.6 : 1.6) : (q ? 1.8 : 1.05), iw: q ? 1.8 : 1.05, opacity: ev || q ? 1 : 0.82, pts: ser[k][st.loss] };
        });
        const v = {
          kind: st.loss, ylim: P.ylim, yticks: niceOr(P.yticks, P.ylim), ytitle: ev ? "held-out KL" : "training KL",
          lines, labelAvg: ev ? 1 : 12, aria: `${ev ? "held-out KL" : "training KL"} by training step · ${st.model} · ${st.bits}`,
        };
        if (ev) {
          v.dots = {};
          order.forEach((k) => (v.dots[k] = ser[k].eval_raw));
          let best = null;
          for (const k of order) if (k !== "quasar") { const s = ser[k].eval, f = s[s.length - 1][1]; if (!best || f < best.y) best = { key: k, y: f }; }
          const c = best && ser.quasar.eval.find((p) => p[1] <= best.y);
          // cx (first step QUASAR reaches the line) only steers label placement; it is not drawn
          if (c) v.ref = { y: best.y, cx: c[0], qEnd: ser.quasar.eval[ser.quasar.eval.length - 1][1], label: REF };
        } else {
          v.zoom = { xlim: ax.zoom.xlim, ylim: ax.zoom.ylim, label: ax.zoom.xlim.map(thousands).join("–") };
        }
        return v;
      },
    });
  }

  // ================================================================ B) learning-rate sweep (Fig. 25)
  function lrChart(root, R) {
    const L = R.lr_sweep;
    const methods = L.methods_in_v2_figure.slice();
    const order = methods.filter((m) => m !== "QUASAR").concat(methods.includes("QUASAR") ? ["QUASAR"] : []);
    const lrs = L.learning_rates.slice().sort((a, b) => a - b);
    const val = {};
    for (const c of L.cells) if (c.in_v2_figure && methods.includes(c.method)) (val[c.method] = val[c.method] || {})[c.lr] = c.eval_kl;
    const series = order.map((m) => ({ label: m, color: (V.METHOD[m] || {}).color || "#888", q: m === "QUASAR", pts: lrs.map((lr) => [lr, val[m][lr]]) }));
    root.classList.add("cc");
    const plot = h("div", { class: "cc-plot", tabindex: "0" }, root);
    plotAria(plot, root, "learning rates");
    const leg = legendRow(root, ["QUASAR"].concat(order.filter((m) => m !== "QUASAR")).map((m) => ({ label: m, color: V.METHOD[m].color, q: m === "QUASAR" })), "cc-narrow-only");
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    srTable(sr, ["method"].concat(lrs.map((x) => "learning rate " + sci(x, 1))), series.slice().reverse().map((s) => [s.label].concat(s.pts.map((p) => kl(p[1])))));
    const tip = V.tooltip(plot);
    let sk = null, revealed = false, hi = null, rvTok = 0;
    const all = [];
    series.forEach((s) => s.pts.forEach((p) => all.push(p[1])));
    const ydom = [Math.min(...all) / 1.17, Math.max(...all) * 1.17];

    function draw(width) {
      const narrow = width < 400;
      const height = narrow ? 280 : 300;
      const m = { t: 30, r: narrow ? 12 : 100, b: 44, l: 44 };
      const fr = V.frame(plot, width, height, m);
      const { svg, g, W, H } = fr;
      svg.setAttribute("aria-label", "final held-out KL by learning rate · INT2");
      const id = "cc" + ++UID;
      const defs = el("defs", null, svg);
      const rv = el("rect", { x: -20, y: -60, width: W + 40, height: H + 120 }, el("clipPath", { id: id + "r" }, defs));
      const sx = V.log([lrs[0] / 1.3, lrs[lrs.length - 1] * 1.3], [0, W]);
      const sy = V.log(ydom, [H, 0]);
      V.axisLeft(g, sy, W, { ticks: [0.15, 0.3, 0.6, 1.2].filter((t) => t >= ydom[0] && t <= ydom[1]), fmt: (t) => String(t) });
      el("text", { class: "axis-title", x: -m.l, y: -17 }, g).textContent = "final held-out KL";
      V.axisBottom(g, sx, H, { ticks: lrs, fmt: (t) => sci(t, 1), title: "learning rate", titleY: 35 });
      const gD = el("g", { "clip-path": `url(#${id}r)` }, g);
      const gX = el("g", null, g);
      for (const s of series) {
        el("path", { d: V.linePath(s.pts, sx, sy), fill: "none", stroke: s.color, "stroke-width": s.q ? 2.6 : 1.6, "stroke-linejoin": "round", "stroke-linecap": "round" }, gD);
        for (const p of s.pts) el("circle", { cx: sx(p[0]), cy: sy(p[1]), r: s.q ? 3.9 : 2.9, fill: s.color, stroke: "#fdfdfd", "stroke-width": 1.4 }, gD);
      }
      // values beyond 1 (the high-rate / low-rate failures) get a data label
      for (const s of series) for (let i = 0; i < s.pts.length; i++) {
        const p = s.pts[i];
        if (s.q || p[1] < 1) continue;
        const last = i === s.pts.length - 1;
        el("text", { x: sx(p[0]) + (last ? -8 : 8), y: sy(p[1]) + 4, "text-anchor": last ? "end" : "start", class: "cc-val" }, gX).textContent = kl(p[1]);
      }
      if (!narrow) {
        const items = series.map((s) => ({ s, y: sy(s.pts[s.pts.length - 1][1]) }));
        V.dodge(items, 15, -6, H + 10);
        for (const it of items) {
          el("path", { d: `M${W + 2},${it.y.toFixed(1)}L${W + 6},${it.ly.toFixed(1)}L${W + 14},${it.ly.toFixed(1)}`, stroke: it.s.color, "stroke-width": it.s.q ? 2.6 : 1.7, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, gX);
          el("text", { x: W + 18, y: it.ly + 4, class: "end-label" + (it.s.q ? " q" : ""), fill: it.s.q ? ROSE_T : INK2 }, gX).textContent = it.s.label;
        }
      }
      const gH = el("g", { "pointer-events": "none" }, g);
      const ov = el("rect", { class: "cc-overlay", x: 0, y: 0, width: W, height: H, fill: "transparent" }, g);
      sk = { W, H, m, sx, sy, gH, rv, gX };
      leg.classList.toggle("on", narrow);
      const at = (e) => { const r = ov.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const move = (e) => { const [x, y] = at(e); let b = 0; lrs.forEach((lr, i) => { if (Math.abs(sx(lr) - x) < Math.abs(sx(lrs[b]) - x)) b = i; }); hover(b, y); };
      bindOverlay(ov, move, unhover);
      if (!revealed) { rv.setAttribute("width", 0); hideNow([gX]); }
    }
    function hover(i, py) {
      if (!sk || !revealed) return;
      hi = i;
      const k = sk, lr = lrs[i], x = k.sx(lr);
      k.gH.textContent = "";
      el("line", { x1: x, x2: x, y1: 0, y2: k.H, class: "cc-xh" }, k.gH);
      const rows = [];
      let qy = k.H / 2;
      for (const s of series) {
        const v = s.pts[i][1], y = k.sy(v);
        if (s.q) qy = y;
        el("circle", { cx: x, cy: y, r: s.q ? 5 : 4, fill: s.color, class: "cc-hd" }, k.gH);
        rows.push({ label: s.label, color: s.color, value: kl(v), v, q: s.q });
      }
      rows.sort((a, b) => a.v - b.v);
      tip.show(k.m.l + x, k.m.t + (py != null ? py : qy), tipHTML("learning rate " + sci(lr, 1), rows));
    }
    function unhover() { hi = null; if (sk) sk.gH.textContent = ""; tip.hide(); }
    plot.addEventListener("keydown", (e) => {
      let i = hi == null ? lrs.length - 1 : hi;
      if (e.key === "ArrowRight") i = Math.min(lrs.length - 1, i + 1);
      else if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault(); hover(i);
    });
    plot.addEventListener("blur", unhover);
    outsideTap(plot, unhover);
    V.responsive(plot, draw);
    V.onVisible(root, () => {
      if (revealed) return;
      revealed = true;
      const k = sk;
      if (!k) return;
      if (reduce) { k.rv.setAttribute("width", k.W + 40); fadeIn([k.gX], 1); return; }
      const my = ++rvTok;
      V.tween(1200, (t) => { if (my === rvTok) k.rv.setAttribute("width", Math.max(0, t) * (k.W + 40)); }, () => { if (my === rvTok) fadeIn([k.gX], 450); });
    }, { threshold: 0.3 });
    return function finish() {
      revealed = true; ++rvTok;
      unhover();
      if (!sk) return;
      sk.rv.setAttribute("width", sk.W + 40);
      showNow([sk.gX]);
    };
  }

  // ================================================================ C) theory scatters (#theory-init, #theory-dose)
  function scatterBase(root, opts) {
    root.classList.add("cc");
    const plot = h("div", { class: "cc-plot", tabindex: "0" }, root);
    plotAria(plot, root, "points");
    if (opts.legend) legendRow(root, opts.legend, "cc-key");
    const sr = h("table", { class: "sr-only", "data-label": "" }, root);
    srTable(sr, opts.srHead, opts.srRows);
    const tip = V.tooltip(plot);
    let sk = null, revealed = false, hi = -1;

    function draw(width) {
      const narrow = width < 420;
      // side by side with a taller partner card (site.css .grid-2 pairs from 861px): own height so the pair balances
      const paired = window.matchMedia && window.matchMedia("(min-width: 861px)").matches && opts.pairH;
      const height = paired ? opts.pairH[narrow ? 1 : 0] : narrow ? 272 : 300;
      const m = { t: 30, r: 14, b: 46, l: 44 };
      const fr = V.frame(plot, width, height, m);
      const { svg, g, W, H } = fr;
      svg.setAttribute("aria-label", opts.aria);
      const sx = V.log(opts.xdom, [0, W]), sy = V.log(opts.ydom, [H, 0]);
      V.axisLeft(g, sy, W, { ticks: opts.yticks, fmt: (t) => String(t) });
      el("text", { class: "axis-title", x: -m.l, y: -17 }, g).textContent = opts.ytitle;
      const ax = V.axisBottom(g, sx, H, { ticks: opts.xticks, fmt: (t) => sci(t, 1) });
      const xt = el("text", { class: "axis-title", x: W / 2, y: 36, "text-anchor": "middle" }, ax);
      xt.textContent = narrow ? opts.xtitleShort : opts.xtitle;
      if (opts.xsub) el("tspan", { dy: 3.5 }, xt).textContent = opts.xsub;
      // fit line
      const f = opts.fit, fy = (x) => Math.pow(10, f.intercept + f.slope * Math.log10(x));
      const fit = el("path", { d: `M${sx(f.x_range[0]).toFixed(1)},${sy(fy(f.x_range[0])).toFixed(1)}L${sx(f.x_range[1]).toFixed(1)},${sy(fy(f.x_range[1])).toFixed(1)}`, class: "cc-fit", stroke: opts.fitColor }, g);
      const ann = el("text", { x: 6, y: 13, class: "cc-ann" }, g);
      opts.annotate(ann);
      const gL = el("g", null, g), gP = el("g", null, g);  // label halos sit under the markers
      const nodes = opts.points.map((p, i) => {
        const x = sx(p.x), y = sy(p.y);
        const n = marker(gP, p.shape, x, y, p.r || 5.2, p.color, { stroke: "#fdfdfd", "stroke-width": 1.5, class: "cc-pt" });
        n.style.transitionDelay = (reduce ? 0 : 120 + i * 70) + "ms";
        return { p, x, y, n };
      });
      opts.labels(gL, nodes, { W, H, narrow, sx, sy });
      const gH = el("g", { "pointer-events": "none" }, g);
      const ov = el("rect", { class: "cc-overlay pts", x: -8, y: -8, width: W + 16, height: H + 16, fill: "transparent" }, g);
      sk = { W, H, m, nodes, gH, fit, gL, gP };
      const at = (e) => { const r = ov.getBoundingClientRect(); return [e.clientX - r.left - 8, e.clientY - r.top - 8]; };
      const move = (e) => {
        const [x, y] = at(e);
        let b = -1, bd = 30 * 30;
        nodes.forEach((n, i) => { const dd = (n.x - x) ** 2 + (n.y - y) ** 2; if (dd < bd) { bd = dd; b = i; } });
        if (b < 0) unhover(); else hover(b);
      };
      bindOverlay(ov, move, unhover);
      if (revealed) { gP.classList.add("in"); }
      else { fit.style.opacity = 0; hideNow([gL, ann]); }
      sk.ann = ann;
    }
    function hover(i) {
      if (!sk || !revealed) return;
      hi = i;
      const n = sk.nodes[i];
      sk.gH.textContent = "";
      el("circle", { cx: n.x, cy: n.y, r: 10, class: "cc-ring", stroke: n.p.color }, sk.gH);
      tip.show(sk.m.l + n.x, sk.m.t + n.y, opts.tip(n.p));
    }
    function unhover() { hi = -1; if (sk) sk.gH.textContent = ""; tip.hide(); }
    plot.addEventListener("keydown", (e) => {
      if (!sk) return;
      const order = sk.nodes.map((n, i) => i).sort((a, b) => sk.nodes[a].x - sk.nodes[b].x);
      let j = order.indexOf(hi);
      if (e.key === "ArrowRight") j = Math.min(order.length - 1, j + 1);
      else if (e.key === "ArrowLeft") j = j < 0 ? 0 : Math.max(0, j - 1);
      else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault(); hover(order[j]);
    });
    plot.addEventListener("blur", unhover);
    outsideTap(plot, unhover);
    V.responsive(plot, draw);
    V.onVisible(root, () => {
      if (revealed || !sk) return;
      revealed = true;
      sk.fit.style.opacity = 1;
      V.drawIn(sk.fit, 1000, 0);
      sk.gP.classList.add("in");
      fadeIn([sk.gL, sk.ann], 500, reduce ? 0 : 700);
    }, { threshold: 0.3 });
    return function finish() {
      revealed = true;
      unhover();
      if (!sk) return;
      const f = sk.fit;
      f.style.transition = "none"; f.style.strokeDasharray = ""; f.style.strokeDashoffset = ""; f.style.opacity = 1;
      for (const n of sk.nodes) { n.n.style.transition = "none"; n.n.style.transitionDelay = "0ms"; }
      sk.gP.classList.add("in");
      showNow([sk.gL, sk.ann]);
    };
  }

  function theoryInit(root, T) {
    const D = T.init_predictor;
    const col = { quasar: ROSE, denoising_qat: V.C.denoising_qat, standard_qat: V.C.standard_qat };
    const shape = { INT4: "circle", INT3: "triangle", INT2: "square" };
    const pts = D.points.slice().sort((a, b) => (a.key === "quasar") - (b.key === "quasar"))
      .map((p) => ({ x: p.S0, y: p.kl, shape: shape[p.bits], color: col[p.key], label: p.method, bits: p.bits, q: p.key === "quasar" }));
    const xs = pts.map((p) => p.x);
    return scatterBase(root, {
      aria: "KL to BF16 by init-time reconstruction error · Qwen3-4B-Thinking-2507",
      pairH: [367, 344],
      xdom: [Math.min(...xs, D.fit.x_range[0]) / 1.12, Math.max(...xs, D.fit.x_range[1]) * 1.25], ydom: D.axes.ylim,
      xticks: D.axes.xticks, yticks: D.axes.yticks,
      ytitle: "KL to BF16", xtitle: "init-time reconstruction error Ŝ₀", xtitleShort: "reconstruction error Ŝ₀",
      fit: D.fit, fitColor: "#8f9297",
      points: pts,
      annotate(t) { t.textContent = "R² = " + D.fit.display.r2; },
      labels(g, nodes) {
        for (const b of ["INT4", "INT3", "INT2"]) {
          const c = nodes.filter((n) => n.p.bits === b);
          if (!c.length) continue;
          const x = c.reduce((a, n) => a + n.x, 0) / c.length, top = Math.min(...c.map((n) => n.y));
          el("text", { x, y: top - 14, "text-anchor": "middle", class: "cc-clab" }, g).textContent = b;
        }
      },
      legend: ["quasar", "denoising_qat", "standard_qat"].map((k) => ({ label: D.points.find((p) => p.key === k).method, color: col[k], q: k === "quasar", shape: "circle" })),
      srHead: ["method", "bits", "init-time reconstruction error", "KL to BF16"],
      srRows: D.points.map((p) => [p.method, p.bits, sci(p.S0, 3), kl(p.kl)]),
      tip: (p) => tipHTML(esc(p.label) + " · " + p.bits, [{ label: '<span class="cc-f">Ŝ</span><sub>0</sub>', html: true, value: sci(p.x, 3) }, { label: "KL to BF16", value: kl(p.y) }], p.color),
    });
  }

  function theoryDose(root, T) {
    const D = T.dose_trained;
    // label offsets [dx, dy, anchor]: the star's label goes left of it, f ≥ 0.5's up-right, clear of the star
    // (narrow plots: the star's label sits straight above it and f ≥ 0.5's below-right of its own dot, so neither
    // runs into the y-axis ticks, the x axis or the f ≥ 0.7 label)
    const off = { full: [-9, 4, "end"], floor50: [7, -9, "start"], floor70: [8, 16, "start"], floor85: [8, 16, "start"], minmax: [-11, 4, "end"] };
    const offNarrow = { full: [0, -11, "middle"], floor50: [8, 13, "start"] };
    const pts = D.points.slice().sort((a, b) => a.unrestricted - b.unrestricted)
      .map((p) => ({ x: p.ST, y: p.kl, shape: p.unrestricted ? "star" : "circle", r: p.unrestricted ? 5.4 : 5, color: ROSE, label: p.label, rung: p.rung, unrestricted: p.unrestricted }));
    const fLabel = (t, label) => {
      el("tspan", { class: "cc-f" }, t).textContent = label.slice(0, 1);
      el("tspan", null, t).textContent = label.slice(1);
    };
    return scatterBase(root, {
      aria: "final held-out KL by end-of-training reconstruction error · QUASAR INT2",
      pairH: [392, 370],
      xdom: D.axes.xlim, ydom: D.axes.ylim, xticks: D.axes.xticks, yticks: D.axes.yticks,
      ytitle: "final held-out KL", xtitle: "end-of-training reconstruction error Ŝ", xtitleShort: "reconstruction error Ŝ", xsub: "T",
      fit: D.fit, fitColor: ROSE,
      points: pts,
      annotate(t) { t.textContent = "slope " + D.fit.display.slope + " · R² = " + D.fit.display.r2; },
      labels(g, nodes, opt) {
        for (const n of nodes) {
          const o = (opt && opt.narrow && offNarrow[n.p.rung]) || off[n.p.rung] || [8, 16, "start"];
          const t = el("text", { x: n.x + o[0], y: n.y + o[1], "text-anchor": o[2], class: "cc-plab" }, g);
          fLabel(t, n.p.label);
          // an end-anchored label that would run into the y-axis ticks drops below its point instead (centred on it when there is room)
          const len = t.getComputedTextLength();
          // (above it instead when below would sit on the x axis)
          if (o[2] === "end" && n.x + o[0] - len < 2) {
            const mid = n.x - len / 2 >= 2, below = n.y + 19 <= opt.H - 8;
            t.setAttribute("x", mid ? n.x : n.x - 4); t.setAttribute("y", below ? n.y + 19 : n.y - 11); t.setAttribute("text-anchor", mid ? "middle" : "start");
          }
        }
      },
      legend: [{ label: "unrestricted search", color: ROSE, shape: "star" }, { label: "restricted candidate grid", color: ROSE, shape: "circle" }],
      srHead: ["scale-search factor", "end-of-training reconstruction error", "final held-out KL"],
      srRows: D.points.map((p) => [p.label, sci(p.ST, 3), kl(p.kl)]),
      tip: (p) => tipHTML('<span class="cc-f">f</span>' + esc(p.label.slice(1)) + (p.unrestricted ? " · ★" : ""),
        [{ label: '<span class="cc-f">Ŝ</span><sub>T</sub>', html: true, value: sci(p.x, 3) }, { label: "held-out KL", value: kl(p.y) }], ROSE),
    });
  }

  // ================================================================ boot
  // Each chart fetches + draws only once it comes within 800px of the viewport.
  // Printing first mounts anything still pending, then forces every chart to its final drawn state.
  const pending = [], finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "cc-fail", "data-label": "" }, node, "— data unavailable —");
  }
  function mount(id, files, fn) {
    const node = document.getElementById(id);
    if (!node) return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      Promise.all(files.map((f) => V.json(dataURL(f))))
        .then((ds) => {
          const r = fn(node, ...ds), fin = typeof r === "function" ? r : r && r.finish;
          if (fin) { finals.push(fin); if (printing) fin(); }
        })
        .catch((err) => { if (window.console) console.error("[charts-curves] " + id, err); fail(node); });
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
  // Prefetch every data file once the page is idle after load: with the fetch promises already settled,
  // a later beforeprint mounts each pending chart within that event's microtask checkpoint (before print layout).
  function prefetch() {
    const go = () => ["theory.json", "healing_curves.json", "results.json"].forEach((f) => V.json(dataURL(f)).catch(() => {}));
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 1500);
  }
  if (document.readyState === "complete") prefetch();
  else window.addEventListener("load", prefetch, { once: true });
  function boot() {
    mount("healing-curves", ["healing_curves.json"], healingChart);
    mount("lr-chart", ["results.json"], lrChart);
    mount("theory-init", ["theory.json"], theoryInit);
    mount("theory-dose", ["theory.json"], theoryDose);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
