/* ix-heal1.js — interactive appendix figures, healing summary family.
   Mounts: #ix-fig19 (held-out KL by method × bit width), #ix-fig20 (average accuracy vs bit width).
   Data:   assets/data/ix-heal1.json, written by tools/extract_ix_heal1.py from the paper's own figure code
           (Figures 19, 20; the numbers of Table 6, unrounded).
   Renders labels and numbers only (no prose). Needs window.Viz (viz.js). */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const FILE = "ix-heal1.json";
  const DATA = SRC ? new URL("../data/" + FILE, SRC).href : "assets/data/" + FILE;
  const el = V.el, h = V.h, reduce = V.reducedMotion;

  const COLOR = {
    quasar: "#D1495B", standard_qat: "#3F4245", lsq: "#80B1A8", denoising_qat: "#8E6C9A",
    bitdistiller: "#C98A2B", rtn: "#C6CACE", gptq: "#686F77", awq: "#979DA4",
  };
  const FPC = "#808080";                 // full-precision models: gray circles (caption of Fig. 20)
  const CARD = "#FDFDFD";
  const NARROW = 400;                    // below this the paired panels stack
  let UID = 0;

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const byKey = (arr) => { const o = {}; for (const x of arr) o[x.key] = x; return o; };
  const f2 = (v) => (+v).toFixed(2);
  const kl3 = (v) => (+v).toFixed(3);           // Table 6 precision
  const acc1 = (v) => (+v).toFixed(1);          // Table 6 precision
  const klTick = (v) => (v >= 1 ? String(v) : String(+v.toPrecision(1)));
  const txt = (parent, s, attrs) => { const t = el("text", attrs, parent); t.textContent = s; return t; };

  // marker outlines (paper marker set: s D p ^ v < > * o)
  function shapeD(s, x, y, r) {
    const poly = (n, R, a0) => {
      let d = "";
      for (let i = 0; i < n; i++) { const a = a0 + (i * 2 * Math.PI) / n; d += (i ? "L" : "M") + f2(x + R * Math.cos(a)) + "," + f2(y + R * Math.sin(a)); }
      return d + "Z";
    };
    switch (s) {
      case "square": { const a = r * 0.86; return `M${f2(x - a)},${f2(y - a)}H${f2(x + a)}V${f2(y + a)}H${f2(x - a)}Z`; }
      case "diamond": return poly(4, r * 1.2, -Math.PI / 2);
      case "pentagon": return poly(5, r * 1.1, -Math.PI / 2);
      case "tri-up": return poly(3, r * 1.28, -Math.PI / 2);
      case "tri-down": return poly(3, r * 1.28, Math.PI / 2);
      case "tri-left": return poly(3, r * 1.28, Math.PI);
      case "tri-right": return poly(3, r * 1.28, 0);
      case "star": {
        let d = "";
        const R = r * 1.5, ri = R * 0.44;
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 ? ri : R, a = -Math.PI / 2 + (i * Math.PI) / 5;
          d += (i ? "L" : "M") + f2(x + rr * Math.cos(a)) + "," + f2(y + rr * Math.sin(a));
        }
        return d + "Z";
      }
      default: return `M${f2(x - r)},${f2(y)}a${r},${r} 0 1,0 ${f2(2 * r)},0a${r},${r} 0 1,0 ${f2(-2 * r)},0Z`;
    }
  }
  // marker: color fill + thin card-colored edge
  function marker(g, shape, x, y, r, color, cls) {
    return el("path", { d: shapeD(shape, x, y, r), class: cls || null, "stroke-linejoin": "round", fill: color, stroke: CARD, "stroke-width": 0.8 }, g);
  }
  function glyph(shape, color) {
    const r = shape === "star" ? 4.2 : 3.9;
    return `<svg class="h1-g" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${shapeD(shape, 8, 8, r)}" fill="${color}" stroke-linejoin="round"/></svg>`;
  }
  function tipHTML(head, rows) {
    let s = '<div class="tt">' + head + "</div>";
    for (const r of rows) {
      s += '<div class="row h1-tr' + (r.q ? " q" : "") + (r.cur ? " cur" : "") + '"><span class="h1-tn">' + (r.glyph || "") +
        esc(r.label) + "</span><b>" + esc(r.value) + "</b></div>";
    }
    return s;
  }
  function srTable(node, head, rows) {
    node.innerHTML = "<thead><tr>" + head.map((x) => "<th>" + esc(x) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((x, i) => (i ? "<td>" : '<th scope="row">') + esc(x) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody>";
  }
  // Mouse tracks the pointer and a click (< 6 px of travel) acts; touch and pen act on a tap (< 10 px of travel).
  // A vertical swipe that starts on a chart stays a page scroll: the browser's pointercancel only clears the hover.
  function bindPointer(node, move, off, act) {
    let t0 = null, m0 = null;
    node.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") { m0 = [e.clientX, e.clientY]; move(e); return; }
      t0 = [e.clientX, e.clientY];
    });
    node.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || (e.pointerType === "pen" && !t0)) move(e); });
    node.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") {
        if (m0 && act && Math.hypot(e.clientX - m0[0], e.clientY - m0[1]) < 6) act(e, false);
        m0 = null; return;
      }
      if (t0 && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 10) { move(e); if (act) act(e, true); }
      t0 = null;
    });
    node.addEventListener("pointercancel", () => { t0 = null; off(); });
    node.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") off(); });
  }
  function outsideTap(node, fn) {
    document.addEventListener("pointerdown", (e) => { if (!node.contains(e.target)) fn(); }, { passive: true });
  }
  // panel titles are measured (full model name or its short form): redraw once web fonts arrive
  function afterFonts(resp) {
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => resp.redraw());
  }
  // place a shown tooltip beside a band [xl, xr] (right of it when it fits, else left), centred on yc
  function beside(tip, box, xl, xr, yc) {
    const t = tip.node, cw = box.clientWidth, ch = box.clientHeight, tw = t.offsetWidth, th = t.offsetHeight;
    let left = xr + 10;
    if (left + tw > cw - 2) left = xl - 10 - tw;
    if (left < 2) left = clamp(xr + 10, 2, Math.max(2, cw - tw - 2));
    t.style.left = left + "px";
    t.style.top = clamp(yc - th / 2, 2, Math.max(2, ch - th - 2)) + "px";
  }
  function local(svg, e) { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function kicker(root) {
    const card = root.closest(".viz"), k = card && card.querySelector(".viz-kicker");
    return k ? k.textContent.split("·")[0].trim() : "";
  }
  // pop markers in (staggered), then drop the delays so later dimming is immediate
  function popIn(nodes, delay) {
    if (reduce) { for (const n of nodes) n.classList.remove("h1-pre"); return; }
    let max = 0;
    nodes.forEach((n, i) => { const d = delay(n, i); max = Math.max(max, d); n.style.transitionDelay = d + "ms"; });
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const n of nodes) n.classList.remove("h1-pre"); }));
    setTimeout(() => { for (const n of nodes) n.style.transitionDelay = ""; }, max + 700);
  }
  function settle(nodes) { for (const n of nodes) { n.style.transition = "none"; n.style.transitionDelay = ""; n.classList.remove("h1-pre"); } }

  // method key row: buttons preview a method on hover / keyboard focus and pin it on click
  function legend(parent, items, on) {
    const row = h("div", { class: "h1-legend", role: "group", "aria-label": "Methods", "data-label": "" }, parent);
    const btns = {};
    for (const it of items) {
      if (!it.key) { h("span", { class: "h1-key" }, row, it.glyph + "<span>" + esc(it.label) + "</span>"); continue; }
      const b = h("button", { type: "button", class: "h1-lb" + (it.key === "quasar" ? " q" : ""), "aria-pressed": "false" }, row,
        it.glyph + "<span>" + esc(it.label) + "</span>");
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") on.preview(it.key); });
      b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") on.preview(null); });
      b.addEventListener("focus", () => { if (b.matches(":focus-visible")) on.preview(it.key); });
      b.addEventListener("blur", () => on.preview(null));
      b.addEventListener("click", () => on.toggle(it.key));
      btns[it.key] = b;
    }
    return { row, set(pin) { for (const k in btns) btns[k].setAttribute("aria-pressed", String(k === pin)); } };
  }
  function methodItems(D, order) {
    const M = byKey(D.methods);
    const keys = order.includes("quasar") ? ["quasar"].concat(order.filter((k) => k !== "quasar")) : order;
    return keys.map((k) => ({ key: k, label: M[k].name, glyph: glyph(M[k].shape, COLOR[k]) }));
  }

  // ================================================================ Fig. 19 — held-out KL matrix
  function fig19(root, D) {
    const order = D.order.matrix, M = byKey(D.methods), models = D.models, bits = D.bits;
    const name = kicker(root) || "held-out KL";
    root.classList.add("h1");
    const plot = h("div", { class: "h1-plot h1-hm", tabindex: "0", role: "group", "aria-label": name + " cells" }, root);
    const sr = h("table", null, h("div", { class: "sr-only" }, root));
    srTable(sr, ["method"].concat(...models.map((mo) => bits.map((b) => mo.short + " INT" + b))),
      order.map((k) => [M[k].name].concat(...models.map((mo) => D.cells[mo.key][k].kl.map(kl3)))));
    const tip = V.tooltip(plot);
    // log color scale over held-out KL: light = low KL, dark = high KL (warm neutral ramp)
    const LO = Math.log10(0.01), HI = Math.log10(12);
    const tOf = (v) => clamp((Math.log10(v) - LO) / (HI - LO), 0, 1);
    const STOPS = [[0, [247, 244, 237]], [0.25, [226, 221, 211]], [0.5, [186, 180, 170]], [0.75, [121, 118, 114]], [1, [44, 46, 50]]];
    function ramp(t) {
      let i = 1;
      while (i < STOPS.length - 1 && STOPS[i][0] < t) i++;
      const [t0, a] = STOPS[i - 1], [t1, b] = STOPS[i], u = (t - t0) / (t1 - t0 || 1);
      return "rgb(" + a.map((c, j) => Math.round(c + (b[j] - c) * u)).join(",") + ")";
    }
    let sk = null, sel = null, cur = null, revealed = false;
    const rank = (mk, k, bi) => 1 + order.filter((o) => D.cells[mk][o].kl[bi] < D.cells[mk][k].kl[bi]).length;

    function draw(width) {
      const narrow = width < NARROW;
      const labelW = 116, rowH = narrow ? 27 : 30, gapP = 14, headH = 46, gapG = 7;
      const ys = [];
      let y = 0;
      order.forEach((k, i) => {
        if (i && (M[k].family !== M[order[i - 1]].family || k === "quasar")) y += gapG;
        ys.push(y); y += rowH;
      });
      const bodyH = y;
      const pw = narrow ? width - labelW : (width - labelW - gapP) / 2, cw = pw / 3;
      const panels = models.map((mo, pi) => ({ mo, pi, x: narrow ? labelW : labelW + pi * (pw + gapP), y: narrow ? pi * (headH + bodyH + 22) : 0 }));
      const legY = (narrow ? 2 * (headH + bodyH) + 22 : headH + bodyH) + 26;
      const height = legY + 40;
      const fr = V.frame(plot, width, height, { t: 0, r: 0, b: 0, l: 0 });
      const { svg, g } = fr;
      svg.setAttribute("aria-label", name);
      svg.classList.add("h1-svg");
      plot.querySelectorAll(".h1-rows").forEach((n) => n.remove());
      const rowsLayer = h("div", { class: "h1-rows" }, plot);
      const id = "h1g" + ++UID;
      const cells = [], rowBtns = [];
      for (const p of panels) {
        const t = txt(g, p.mo.name, { x: p.x + pw / 2, y: p.y + 14, class: "h1-ptitle", "text-anchor": "middle" });
        if (t.getComputedTextLength() > (narrow ? pw - 4 : pw + gapP + 10)) t.textContent = p.mo.short;
        bits.forEach((b, bi) => txt(g, "INT" + b, { x: p.x + (bi + 0.5) * cw, y: p.y + 36, class: "h1-clab", "text-anchor": "middle" }));
        const gb = el("g", null, g);
        order.forEach((k, r) => {
          const ry = p.y + headH + ys[r];
          bits.forEach((b, bi) => {
            const v = D.cells[p.mo.key][k].kl[bi], tt = tOf(v);
            const cg = el("g", { class: "h1-cell" + (revealed ? "" : " h1-pre") + (k === "quasar" ? " q" : "") }, gb);
            el("rect", { x: p.x + bi * cw + 1.5, y: ry + 1.5, width: cw - 3, height: rowH - 3, rx: 3, fill: ramp(tt) }, cg);
            txt(cg, kl3(v), { x: p.x + (bi + 0.5) * cw, y: ry + rowH / 2 + 4, "text-anchor": "middle", class: "h1-cv" + (tt > 0.70 ? " inv" : "") + (k === "quasar" ? " q" : "") });
            cells.push({ node: cg, pi: p.pi, r, bi, k, x: p.x + bi * cw, y: ry, v, delay: bi * 110 + r * 34 + p.pi * 70 });
          });
          // QUASAR row outline
          if (k === "quasar") el("rect", { x: p.x + 0.5, y: ry + 0.5, width: pw - 1, height: rowH - 1, rx: 4, class: "h1-qrow" }, gb);
        });
        // row label buttons (HTML, over the label column)
        if (p.pi === 0 || narrow) {
          order.forEach((k, r) => {
            const b = h("button", { type: "button", class: "h1-rowbtn" + (k === "quasar" ? " q" : ""), "aria-pressed": String(sel === k), "data-k": k }, rowsLayer,
              glyph(M[k].shape, COLOR[k]) + "<span>" + esc(M[k].name) + "</span>");
            b.style.cssText = `top:${p.y + headH + ys[r] + 1}px;height:${rowH - 2}px;width:${labelW - 4}px`;
            b.addEventListener("click", () => select(sel === k ? null : k));
            b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && !sel) previewRow(k); });
            b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") previewRow(null); });
            rowBtns.push(b);
          });
        }
      }
      const gSel = el("g", { "pointer-events": "none" }, g);
      const gHov = el("g", { "pointer-events": "none" }, g);
      // color key: log scale, ticks at decades
      const barX = labelW, barW = Math.min(narrow ? width - labelW - 12 : 2 * pw + gapP, 300);
      txt(g, "Held-out KL", { x: 0, y: legY + 9, class: "axis-title h1-at" });
      const defs = el("defs", null, svg);
      const lg = el("linearGradient", { id: id + "k", x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
      for (let i = 0; i <= 20; i++) el("stop", { offset: i / 20, "stop-color": ramp(i / 20) }, lg);
      el("rect", { x: barX, y: legY, width: barW, height: 10, rx: 2, fill: `url(#${id}k)` }, g);
      const kx = (v) => barX + tOf(v) * barW;
      const ka = el("g", { class: "axis" }, g);
      for (const v of [0.01, 0.1, 1, 10]) {
        el("line", { x1: kx(v), x2: kx(v), y1: legY + 10, y2: legY + 14 }, ka);
        txt(ka, klTick(v), { x: kx(v), y: legY + 27, "text-anchor": "middle" });
      }
      const gKey = el("g", { "pointer-events": "none" }, g);
      sk = { svg, g, panels, cells, rowBtns, gSel, gHov, gKey, kx, legY, pw, cw, rowH, headH, ys, narrow, labelW };
      bindPointer(svg, (e) => { const c = cellAt(e); if (c) hover(c); else unhover(); }, unhover, (e, touch) => {
        const c = cellAt(e);
        if (!c) return;
        if (touch) select(c.k);
        else select(sel === c.k ? null : c.k);
      });
      paintSel();
      if (cur) hover(cellOf(cur.r, cur.c));
    }
    function cellAt(e) {
      if (!sk) return null;
      const [x, y] = local(sk.svg, e);
      for (const p of sk.panels) {
        if (x < p.x || x > p.x + sk.pw) continue;
        const bi = Math.floor((x - p.x) / sk.cw);
        const yy = y - p.y - sk.headH;
        for (let r = 0; r < sk.ys.length; r++) if (yy >= sk.ys[r] && yy < sk.ys[r] + sk.rowH) return cellOf(r, p.pi * 3 + clamp(bi, 0, 2));
      }
      return null;
    }
    function cellOf(r, c) { return sk.cells.find((q) => q.r === r && q.pi === Math.floor(c / 3) && q.bi === c % 3); }
    function hover(c) {
      if (!sk || !c || !revealed) return;
      cur = { r: c.r, c: c.pi * 3 + c.bi };
      const k = c.k, mo = models[c.pi], b = bits[c.bi];
      sk.gHov.textContent = "";
      el("rect", { x: c.x + 1, y: c.y + 1, width: sk.cw - 2, height: sk.rowH - 2, rx: 3.5, class: "h1-hcell" }, sk.gHov);
      const twin = sk.cells.find((q) => q.r === c.r && q.bi === c.bi && q.pi !== c.pi);
      if (twin) el("rect", { x: twin.x + 1.5, y: twin.y + 1.5, width: sk.cw - 3, height: sk.rowH - 3, rx: 3, class: "h1-tcell" }, sk.gHov);
      // pointers on the color key: this cell (ink) and QUASAR in the same column (rose)
      sk.gKey.textContent = "";
      const ptr = (v, cls) => { const x = sk.kx(v); el("path", { d: `M${f2(x - 5)},${sk.legY - 7}L${f2(x + 5)},${sk.legY - 7}L${f2(x)},${sk.legY - 1}Z`, class: cls }, sk.gKey); };
      const qv = D.cells[mo.key].quasar.kl[c.bi];
      if (k !== "quasar") ptr(qv, "h1-kp q");
      ptr(c.v, "h1-kp" + (k === "quasar" ? " q" : ""));
      const rows = [{ glyph: glyph(M[k].shape, COLOR[k]), label: M[k].name, value: kl3(c.v), q: k === "quasar" }];
      if (k !== "quasar") rows.push({ glyph: glyph("star", COLOR.quasar), label: "QUASAR", value: kl3(qv), q: true });
      rows.push({ label: "rank", value: rank(mo.key, k, c.bi) + " / " + order.length });
      tip.show(c.x + sk.cw / 2, c.y, tipHTML(esc(mo.short) + " · INT" + b + " · held-out KL", rows));
    }
    function unhover() { cur = null; if (sk) { sk.gHov.textContent = ""; sk.gKey.textContent = ""; } tip.hide(); }
    function previewRow(k) { if (!sk) return; paintSel(k); }
    function select(k) { sel = k; paintSel(); }
    function paintSel(preview) {
      if (!sk) return;
      const k = sel || preview || null;
      sk.svg.classList.toggle("h1-dim", !!k);
      for (const c of sk.cells) c.node.classList.toggle("on", c.k === k);
      for (const b of sk.rowBtns) {
        b.setAttribute("aria-pressed", String(b.dataset.k === sel));
        b.classList.toggle("off", !!k && b.dataset.k !== k);
      }
      sk.gSel.textContent = "";
      if (k) {
        const r = order.indexOf(k);
        for (const p of sk.panels) el("rect", { x: p.x + 0.5, y: p.y + sk.headH + sk.ys[r] + 0.5, width: sk.pw - 1, height: sk.rowH - 1, rx: 4, class: "h1-srow" + (k === "quasar" ? " q" : "") }, sk.gSel);
      }
    }
    plot.addEventListener("keydown", (e) => {
      if (!sk || e.target !== plot) return;   // the row buttons handle their own keys
      const n = order.length;
      let r = cur ? cur.r : -1, c = cur ? cur.c : 0;
      if (e.key === "ArrowDown") r = Math.min(n - 1, r + 1);
      else if (e.key === "ArrowUp") r = r < 0 ? n - 1 : Math.max(0, r - 1);
      else if (e.key === "ArrowRight") { if (r < 0) r = n - 1; c = Math.min(5, c + 1); }
      else if (e.key === "ArrowLeft") { if (r < 0) r = n - 1; c = Math.max(0, c - 1); }
      else if ((e.key === "Enter" || e.key === " ") && cur) { e.preventDefault(); const k = order[cur.r]; select(sel === k ? null : k); return; }
      else if (e.key === "Escape") { unhover(); select(null); return; }
      else return;
      e.preventDefault();
      hover(cellOf(r, c));
    });
    plot.addEventListener("focusout", (e) => { if (!plot.contains(e.relatedTarget)) unhover(); });
    outsideTap(root, unhover);
    const resp = V.responsive(plot, draw);
    afterFonts(resp);
    V.onVisible(root, () => {
      if (revealed || !sk) return;
      revealed = true;
      popIn(sk.cells.map((c) => c.node), (n, i) => sk.cells[i].delay);
    }, { threshold: 0.3 });
    return function finish() { revealed = true; unhover(); if (sk) settle(sk.cells.map((c) => c.node)); };
  }

  // ================================================================ Fig. 20 — average accuracy vs bit width
  function fig20(root, D) {
    const order = D.order.matrix, M = byKey(D.methods), models = D.models, bits = D.bits;
    const name = kicker(root) || "accuracy vs bit width";
    root.classList.add("h1");
    const plot = h("div", { class: "h1-plot", tabindex: "0", role: "group", "aria-label": name + " points" }, root);
    const st = { pin: null, pre: null, hk: null };
    const leg = legend(root, [{ glyph: glyph("circle", FPC), label: "FP16" }].concat(methodItems(D, order)), {
      preview(k) { st.pre = k; applyFocus(); },
      toggle(k) { st.pin = st.pin === k ? null : k; leg.set(st.pin); applyFocus(); },
    });
    const sr = h("table", null, h("div", { class: "sr-only" }, root));
    srTable(sr, ["model", "method"].concat(bits.map((b) => "INT" + b)),
      [].concat(...models.map((mo) => [[mo.short, "FP16"].concat(bits.map(() => acc1(D.fp[mo.key].acc)))]
        .concat(order.map((k) => [mo.short, M[k].name].concat(D.cells[mo.key][k].acc.map(acc1)))))));
    const tip = V.tooltip(plot);
    // shared y range: data extent padded by 6% (paper)
    const all = [];
    for (const mo of models) { all.push(D.fp[mo.key].acc); for (const k of order) all.push(...D.cells[mo.key][k].acc); }
    const lo = Math.min(...all), hi = Math.max(...all), pad = 0.06 * (hi - lo);
    const ydom = [lo - pad, hi + pad];
    let sk = null, revealed = false, hov = null;

    function draw(width) {
      const narrow = width < NARROW;
      const m = { t: 46, r: 8, b: 46, l: 40 };
      const W = width - m.l - m.r, gap = 18, vgap = 70;
      const pw = narrow ? W : (W - gap) / 2, ph = narrow ? 188 : 236;
      const H = narrow ? 2 * ph + vgap : ph;
      const fr = V.frame(plot, width, m.t + H + m.b, m);
      const { svg, g } = fr;
      svg.setAttribute("aria-label", name);
      svg.classList.add("h1-svg");
      const sy = V.lin(ydom, [ph, 0]);
      const cx = (i, d) => ((i + (d || 0) + 0.45) / 2.9) * pw;
      const yt = [30, 40, 50, 60, 70].filter((t) => t >= ydom[0] && t <= ydom[1]);
      const panels = [], pops = [];
      models.forEach((mo, pi) => {
        const ox = narrow ? 0 : pi * (pw + gap), oy = narrow ? pi * (ph + vgap) : 0;
        const pg = el("g", { transform: `translate(${ox},${oy})` }, g);
        const grid = el("g", { class: "grid" }, pg), ax = el("g", { class: "axis" }, pg);
        for (const t of yt) {
          el("line", { x1: 0, x2: pw, y1: sy(t), y2: sy(t) }, grid);
          if (pi === 0 || narrow) txt(ax, String(t), { x: -8, y: sy(t) + 4, "text-anchor": "end" });
        }
        el("line", { x1: 0, x2: pw, y1: ph, y2: ph }, ax);
        bits.forEach((b, i) => { el("line", { x1: cx(i), x2: cx(i), y1: ph, y2: ph + 4 }, ax); txt(ax, "INT" + b, { x: cx(i), y: ph + 17, "text-anchor": "middle" }); });
        const t = txt(pg, mo.name, { x: pw / 2, y: -10, class: "h1-ptitle", "text-anchor": "middle" });
        if (t.getComputedTextLength() > pw) t.textContent = mo.short;
        const band = el("rect", { class: "h1-band", x: 0, y: 0, width: 0, height: ph, rx: 4 }, pg);
        pg.insertBefore(band, grid.nextSibling);
        const gConn = el("g", { "pointer-events": "none" }, pg);
        const groups = {}, pts = [];
        // full precision (same reference value at each bit width)
        const gfp = el("g", { class: "h1-m fp" }, pg);
        groups.fp = gfp;
        bits.forEach((b, i) => {
          const x = cx(i), y = sy(D.fp[mo.key].acc);
          const n = marker(gfp, "circle", x, y, 4.3, FPC, "h1-pt" + (revealed ? "" : " h1-pre"));
          pops.push({ n, d: 60 + i * 150 });
          pts.push({ k: "fp", i, x, y, v: D.fp[mo.key].acc });
        });
        const ordered = order.filter((k) => k !== "quasar").concat(["quasar"]);
        ordered.forEach((k, mi) => {
          const gm = el("g", { class: "h1-m", "data-k": k }, pg);
          groups[k] = gm;
          const vals = D.cells[mo.key][k].acc;
          if (k === "quasar") {
            const line = el("path", { d: vals.map((v, i) => (i ? "L" : "M") + f2(cx(i)) + "," + f2(sy(v))).join(""), class: "h1-qline", fill: "none" }, gm);
            if (!revealed) line.style.opacity = 0;
            panels.qlines = (panels.qlines || []).concat(line);
          }
          vals.forEach((v, i) => {
            const d = k === "quasar" ? 0 : M[k].dodge;
            const x = cx(i, d), y = sy(v);
            const n = marker(gm, M[k].shape, x, y, k === "quasar" ? 5.6 : 4, COLOR[k], "h1-pt" + (revealed ? "" : " h1-pre"));
            pops.push({ n, d: 140 + i * 150 + mi * 28 });
            pts.push({ k, i, x, y, v, dodge: d });
          });
        });
        const gHov = el("g", { "pointer-events": "none" }, pg);
        panels.push({ mo, pi, ox, oy, pg, band, gConn, groups, pts, gHov });
      });
      txt(g, "Average accuracy (%)", { x: -m.l, y: -30, class: "axis-title" });
      txt(g, "Weight bits (group size 128)", { x: W / 2, y: H + 38, class: "axis-title", "text-anchor": "middle" });
      sk = { svg, m, W, H, pw, ph, gap, vgap, narrow, panels, sy, cx, pops };
      bindPointer(svg, (e) => onMove(e), unhover, (e, touch) => {
        if (touch || !hov || hov.k === "fp") return;
        st.pin = st.pin === hov.k ? null : hov.k; leg.set(st.pin); applyFocus();
      });
      applyFocus();
      if (hov) showHover(hov.pi, hov.i, hov.k);
    }
    function onMove(e) {
      if (!sk || !revealed) return;
      const [px, py] = local(sk.svg, e);
      const x = px - sk.m.l, y = py - sk.m.t;
      const pi = sk.narrow ? (y < sk.ph + sk.vgap / 2 ? 0 : 1) : (x < sk.pw + sk.gap / 2 ? 0 : 1);
      const p = sk.panels[pi], lx = x - p.ox, ly = y - p.oy;
      if (lx < -14 || lx > sk.pw + 10 || ly < -16 || ly > sk.ph + 22) { unhover(); return; }
      const i = clamp(Math.round((lx / sk.pw) * 2.9 - 0.45), 0, 2);
      let best = null, bd = Infinity;
      for (const q of p.pts) if (q.i === i) { const d = Math.abs(q.y - ly) + 0.3 * Math.abs(q.x - lx); if (d < bd) { bd = d; best = q; } }
      showHover(pi, i, best.k);
    }
    function showHover(pi, i, k) {
      const p = sk.panels[pi], mo = p.mo;
      hov = { pi, i, k };
      for (const q of sk.panels) { q.band.setAttribute("width", 0); q.gHov.textContent = ""; }
      p.band.setAttribute("x", sk.cx(i, -0.33)); p.band.setAttribute("width", sk.cx(i, 0.33) - sk.cx(i, -0.33));
      const pt = p.pts.find((q) => q.i === i && q.k === k);
      el("circle", { cx: pt.x, cy: pt.y, r: k === "quasar" ? 10 : 8.5, class: "h1-ring", stroke: k === "fp" ? FPC : COLOR[k] }, p.gHov);
      st.hk = k === "fp" ? null : k;
      applyFocus();
      const col = p.pts.filter((q) => q.i === i).sort((a, b) => b.v - a.v);
      const rows = col.map((q) => ({
        glyph: q.k === "fp" ? glyph("circle", FPC) : glyph(M[q.k].shape, COLOR[q.k]),
        label: q.k === "fp" ? "FP16" : M[q.k].name, value: acc1(q.v), q: q.k === "quasar", cur: q.k === k,
      }));
      tip.show(sk.m.l + p.ox + sk.cx(i), sk.m.t + p.oy + pt.y, tipHTML(esc(mo.short) + " · INT" + bits[i], rows));
      beside(tip, plot, sk.m.l + p.ox + sk.cx(i, -0.33), sk.m.l + p.ox + sk.cx(i, 0.33), sk.m.t + p.oy + pt.y);
    }
    function unhover() {
      hov = null; st.hk = null;
      if (sk) for (const q of sk.panels) { q.band.setAttribute("width", 0); q.gHov.textContent = ""; }
      tip.hide(); applyFocus();
    }
    function applyFocus() {
      if (!sk) return;
      const f = st.pre || st.hk || st.pin;
      sk.svg.classList.toggle("h1-dim", !!f);
      for (const p of sk.panels) {
        for (const k in p.groups) p.groups[k].classList.toggle("on", k === f);
        p.gConn.textContent = "";
        if (f && f !== "quasar") {
          const pts = p.pts.filter((q) => q.k === f).sort((a, b) => a.i - b.i);
          el("path", { d: pts.map((q, j) => (j ? "L" : "M") + f2(q.x) + "," + f2(q.y)).join(""), class: "h1-conn", stroke: COLOR[f] }, p.gConn);
        }
      }
    }
    plot.addEventListener("keydown", (e) => {
      if (!sk) return;
      const cols = [];
      sk.panels.forEach((p, pi) => [0, 1, 2].forEach((i) => cols.push([pi, i])));
      let j = hov ? cols.findIndex((c) => c[0] === hov.pi && c[1] === hov.i) : -1;
      const cmp = (q) => q.v;
      if (e.key === "ArrowRight") j = Math.min(cols.length - 1, j + 1);
      else if (e.key === "ArrowLeft") j = j < 0 ? 0 : Math.max(0, j - 1);
      else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && hov) {
        const col = sk.panels[hov.pi].pts.filter((q) => q.i === hov.i).sort((a, b) => cmp(b) - cmp(a));
        let r = col.findIndex((q) => q.k === hov.k);
        r = clamp(r + (e.key === "ArrowDown" ? 1 : -1), 0, col.length - 1);
        e.preventDefault(); showHover(hov.pi, hov.i, col[r].k); return;
      } else if (e.key === "Escape") { unhover(); return; }
      else return;
      e.preventDefault();
      const [pi, i] = cols[j];
      showHover(pi, i, hov && hov.k ? hov.k : "quasar");
    });
    plot.addEventListener("focusout", (e) => { if (!plot.contains(e.relatedTarget)) unhover(); });
    outsideTap(root, unhover);
    const resp = V.responsive(plot, draw);
    afterFonts(resp);
    V.onVisible(root, () => {
      if (revealed || !sk) return;
      revealed = true;
      popIn(sk.pops.map((p) => p.n), (n, i) => sk.pops[i].d);
      for (const l of sk.panels.qlines || []) { l.style.transition = reduce ? "none" : "opacity .6s ease .55s"; l.style.opacity = ""; }
    }, { threshold: 0.3 });
    return function finish() {
      revealed = true; unhover();
      if (!sk) return;
      settle(sk.pops.map((p) => p.n));
      for (const l of sk.panels.qlines || []) { l.style.transition = "none"; l.style.strokeDasharray = ""; l.style.strokeDashoffset = ""; l.style.opacity = ""; }
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
    h("div", { class: "h1-fail", "data-label": "" }, node, "— data unavailable —");
  }
  function mount(id, fn) {
    const node = document.getElementById(id);
    if (!node) return;
    node.setAttribute("data-label", "");
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      V.json(DATA)
        .then((d) => {
          const fin = fn(node, d);
          if (fin) { finals.push(fin); if (printing) fin(); }
        })
        .catch((err) => { if (window.console) console.error("[ix-heal1] " + id, err); fail(node); });
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
    mount("ix-fig19", fig19);
    mount("ix-fig20", fig20);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
