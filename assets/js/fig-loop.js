/* fig-loop.js — Fig. 2 (the training loop) as a native, responsive SVG diagram.
   One diagram, two states: Standard QAT and QUASAR. Only the reconstruction changes, so only
   those parts move: the reconstruction box, the reconstructed weights, the saliency input and one note.
   Mount: <div id="loop-diagram"></div> inside a .viz card. Needs viz.js (window.Viz).
   Dev knobs (data attributes on the mount): data-state="std|q", data-auto="0". */
(function () {
  "use strict";

  // type sizes follow the page scale (--fs-m body, --fs-s small)
  const tok = (name, d) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || d;
  const SERIF = '"Newsreader", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
  const CARD = "#fdfdfd";
  const DWELL = 3500;
  const STATES = [{ value: "std", label: "Standard QAT" }, { value: "q", label: "QUASAR" }];
  const ARIA = {
    std: "Standard QAT training loop: latent weights w → reconstruction w ↦ q ↦ r → reconstructed weights r → matmul (with activations x) → … → loss; backward pass through the STE: ∂L/∂w ≈ ∂L/∂r.",
    q: "QUASAR training loop: latent weights w → loss-aware reconstruction w ↦ q ↦ r (scale search + dequantization fit; saliency h, free, from optimizer) → loss-aware reconstructed weights r → matmul (with activations x) → … → loss; backward pass through the STE: ∂L/∂w ≈ ∂L/∂r.",
  };

  // ---- labels: a line is [[text, italic], ...]; MAP is the math line w ↦ q ↦ r ----
  const MAP = "map";
  const L = {
    latent: [[["latent", 0]], [["weights ", 0], ["w", 1]]],
    recon: [[["loss-aware", 0]], [["reconstruction", 0]], MAP],      // line 0 is QUASAR-only
    recw: [[["loss-aware", 0]], [["reconstructed", 0]], [["weights ", 0], ["r", 1]]],
    matmul: [[["matmul", 0]]],
    loss: [[["loss", 0]]],
    act: [[["activations ", 0], ["x", 1]]],
    sal: [[["saliency ", 0], ["h", 1]]],
  };
  const NOTE_FIT = "scale search + dequantization fit";
  const NOTE_SAL = "(free, from optimizer)";
  const BACK_A = "backward pass through the STE: ";
  const BACK_B = [["∂", 1], ["L", 1], ["/", 0], ["∂", 1], ["w", 1], [" ≈ ", 0], ["∂", 1], ["L", 1], ["/", 0], ["∂", 1], ["r", 1]];

  // ---- text measurement (canvas; redrawn once web fonts land) ----
  const ctx = document.createElement("canvas").getContext("2d");
  function mw(text, F, weight, italic) {
    ctx.font = (italic ? "italic " : "") + (italic ? Math.min(weight, 500) : weight) + " " + F + "px " + SERIF;
    return ctx.measureText(text).width;
  }
  const runsW = (runs, F, wt) => runs.reduce((s, r) => s + mw(r[0], F, wt, r[1]), 0);
  function mapGeom(F) {
    const ww = mw("w", F, 400, 1), wq = mw("q", F, 400, 1), wr = mw("r", F, 400, 1);
    const A = 0.92 * F, s = 0.28 * F;
    return { ww, wq, wr, A, s, total: ww + wq + wr + 2 * A + 4 * s };
  }
  const lineW = (ln, F, wt) => (ln === MAP ? mapGeom(F).total : runsW(ln, F, wt));
  const labelW = (lines, F, wt) => Math.max.apply(null, lines.map((ln) => lineW(ln, F, wt)));

  // ---- svg primitives ----
  let V;
  const el = (t, a, p) => V.el(t, a, p);

  function text(g, x, y, runs, F, attrs) {
    const t = el("text", Object.assign({ x, y, "font-size": F, "text-anchor": "middle" }, attrs || {}), g);
    for (const r of runs) {
      const ts = el("tspan", r[1] ? { "font-style": "italic" } : null, t);
      ts.textContent = r[0];
    }
    return t;
  }
  // TeX-style \mapsto: bar, shaft and curved barbs, drawn as a path so it is crisp and font-independent.
  function mapsto(g, x0, x1, y, F) {
    const b = 0.21 * F, hx = 0.25 * F, hy = 0.2 * F;
    el("path", {
      d: `M${x0},${y - b}V${y + b}M${x0},${y}H${x1}M${x1 - hx},${y - hy}Q${x1 - hx * 0.35},${y - hy * 0.25} ${x1},${y}Q${x1 - hx * 0.35},${y + hy * 0.25} ${x1 - hx},${y + hy}`,
      class: "fl-mapsto", "stroke-width": (0.062 * F).toFixed(2),
    }, g);
  }
  function mapLine(g, cx, y, F) {
    const m = mapGeom(F);
    let x = cx - m.total / 2;
    const ax = y - 0.27 * F;                 // math axis
    const letter = (ch, w) => { const t = el("text", { x, y, "font-size": F, "font-style": "italic" }, g); t.textContent = ch; x += w; };
    letter("w", m.ww); x += m.s; mapsto(g, x, x + m.A, ax, F); x += m.A + m.s;
    letter("q", m.wq); x += m.s; mapsto(g, x, x + m.A, ax, F); x += m.A + m.s;
    letter("r", m.wr);
  }
  function lines(g, cx, cy, list, F, lh) {
    const n = list.length;
    list.forEach((ln, i) => {
      const y = cy + (i - (n - 1) / 2) * lh + 0.32 * F;
      if (ln === MAP) mapLine(g, cx, y, F); else text(g, cx, y, ln, F);
    });
  }
  // label whose first line only exists in the QUASAR state: shared lines slide by half a line.
  function morphLabel(g, cx, cy, list, F, lh) {
    const add = el("g", { class: "fl-add" }, g);
    const keep = el("g", { class: "fl-keep", style: `--dy:${(-lh / 2).toFixed(2)}px` }, g);
    const n = list.length;
    list.forEach((ln, i) => {
      const y = cy + (i - (n - 1) / 2) * lh + 0.32 * F;
      const tgt = i === 0 ? add : keep;
      if (ln === MAP) mapLine(tgt, cx, y, F); else text(tgt, cx, y, ln, F);
    });
  }
  function box(g, b, cls) {
    return el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: cls.includes("fl-op") ? 2.5 : 8, class: "fl-box " + cls }, g);
  }
  function head(g, x, y, dx, dy, cls, size) {
    const s = size || 7, hw = s * 0.46;
    const px = -dy, py = dx;               // perpendicular
    el("path", { d: `M${x},${y}L${x - dx * s + px * hw},${y - dy * s + py * hw}L${x - dx * s - px * hw},${y - dy * s - py * hw}Z`, class: "fl-head " + cls }, g);
  }
  // straight arrow (axis-aligned) from (x1,y1) to (x2,y2), head at the end
  function arrow(g, x1, y1, x2, y2, cls) {
    const L0 = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / L0, dy = (y2 - y1) / L0, s = 7;
    el("line", { x1, y1, x2: x2 - dx * (s - 1), y2: y2 - dy * (s - 1), class: "fl-line " + cls }, g);
    head(g, x2, y2, dx, dy, cls, s);
  }
  function polyArrow(g, pts, cls) {
    const n = pts.length, [xa, ya] = pts[n - 2], [xb, yb] = pts[n - 1];
    const L0 = Math.hypot(xb - xa, yb - ya), dx = (xb - xa) / L0, dy = (yb - ya) / L0, s = 7.5;
    const end = [xb - dx * (s - 1), yb - dy * (s - 1)];
    const d = pts.slice(0, -1).map((p, i) => (i ? "L" : "M") + p[0] + "," + p[1]).join("") + "L" + end[0] + "," + end[1];
    el("path", { d, class: "fl-line " + cls }, g);
    head(g, xb, yb, dx, dy, cls.replace("fl-dash", ""), s);
  }
  function dots(g, x, y, horiz) {
    for (const k of [-1, 0, 1]) el("circle", { cx: horiz ? x + k * 6 : x, cy: horiz ? y : y + k * 6, r: 1.6, class: "fl-dot" }, g);
  }
  // text on a line: knockout rect behind
  function knock(g, x, y, w, h) { el("rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, fill: CARD }, g); }
  // landscape: label centred on the bottom run of the backward path
  function backLabel(g, cx, cy, F) {
    const grp = el("g", { class: "fl-back" }, g);
    knock(grp, cx, cy, runsW([[BACK_A, 0]].concat(BACK_B), F, 400) + 16, F + 8);
    text(grp, cx, cy + 0.32 * F, [[BACK_A, 0]].concat(BACK_B), F);
  }

  // ---- layouts ----
  function boxesFor(F, pX, minW) {
    const w = (lines, wt) => Math.ceil(labelW(lines, F, wt) + 2 * pX);
    return {
      latent: Math.max(w(L.latent, 600), minW),
      recon: Math.max(w(L.recon, 400), minW),
      recw: Math.max(w(L.recw, 600), minW),
      matmul: Math.max(w(L.matmul, 400), minW * 0.6),
      loss: Math.max(w(L.loss, 400), minW * 0.5),
      act: w(L.act, 400),
      sal: w(L.sal, 400),
    };
  }

  // landscape: one row, like the paper
  function wide(W) {
    const F = W >= 820 ? tok("--fs-m", 17) : tok("--fs-s", 13);
    const lh = Math.round(F * 1.22), pY = Math.round(F * 0.75), pX = Math.round(F * 1.0);
    const bw = boxesFor(F, pX, 3.6 * F);
    const order = ["latent", "recon", "recw", "matmul", "loss"];
    let a = 1.7 * F, d = 3.8 * F;
    const m = 2, avail = W - 2 * m;
    let sumB = order.reduce((s, k) => s + bw[k], 0);
    let E = avail - (sumB + 3 * a + d);
    if (E > 0) {
      const grow = ["latent", "recon", "recw"], sumG = grow.reduce((s, k) => s + bw[k], 0);
      const g = Math.min(E * 0.45, sumG * 0.24);
      for (const k of grow) bw[k] = Math.round(bw[k] * (1 + g / sumG));
      sumB = order.reduce((s, k) => s + bw[k], 0);
      E = avail - (sumB + 3 * a + d);
      const da = Math.min(E * 0.18, 3.0 * F - a); a += da; d += Math.min(E - 3 * da, 6.5 * F - d);
      E = avail - (sumB + 3 * a + d);
    } else {
      const k = Math.max(0.6, (avail - sumB) / (3 * a + d)); a *= k; d *= k; E = avail - (sumB + 3 * a + d);
    }
    const x0 = m + Math.max(0, E / 2);
    const h3 = 3 * lh + 2 * pY, h2 = 2 * lh + 2 * pY, h1 = lh + 2 * pY + Math.round(F * 0.45);
    const tH = lh + 2 * Math.round(pY * 0.62), gapTop = Math.round(F * 1.6);
    const cy = 1 + tH + gapTop + h3 / 2;
    const B = {};
    let x = x0;
    const hts = { latent: h2, recon: h3, recw: h3, matmul: h1, loss: h1 };
    order.forEach((k, i) => {
      B[k] = { x: Math.round(x) + 0.5, y: Math.round(cy - hts[k] / 2) + 0.5, w: bw[k], h: hts[k] };
      x += bw[k] + (i < 3 ? a : i === 3 ? d : 0);
    });
    const cx = (b) => b.x + b.w / 2;
    B.sal = { x: Math.round(cx(B.recon) - bw.sal / 2) + 0.5, y: 1.5, w: bw.sal, h: tH };
    B.act = { x: Math.round(cx(B.matmul) - bw.act / 2) + 0.5, y: 1.5, w: bw.act, h: tH };
    const noteY = B.recon.y + h3 + Math.round(F * 1.2);
    const yb = noteY + Math.round(F * 1.3);
    // saliency note: right of the box (as in the paper) unless it would hit the activations box
    const nW = mw(NOTE_SAL, 12, 400, 0);
    const salR = B.sal.x + B.sal.w + 10;
    const salNote = salR + nW <= B.act.x - 12 ? { x: salR, anchor: "start" } : { x: B.sal.x - 10, anchor: "end" };
    return { kind: "wide", W, H: Math.ceil(yb + F * 0.5 + 8), F, lh, B, noteY, yb, salNote, backF: tok("--fs-s", 13) };
  }

  // phones: one column, side inputs from the left, backward path up the left edge
  function tall(W) {
    const F = tok("--fs-s", 13), lh = 18, pY = 9, pX = 11;
    const bw = boxesFor(F, pX, 0);
    const rx = 4.5;
    const sw = Math.max(bw.act, bw.sal);
    const sx0 = 18, gapS = 28;
    let mx0 = sx0 + sw + gapS, mW = Math.min(W - 1 - mx0, 230);
    const used = mx0 + mW, ox = Math.max(0, Math.floor((W - 1 - used) / 2));
    mx0 += ox;
    const mcx = mx0 + mW / 2;
    const h3 = 3 * lh + 2 * pY, h2 = 2 * lh + 2 * pY, h1 = lh + 2 * pY;
    const B = {};
    let y = 1.5;
    const put = (k, w, h) => { B[k] = { x: Math.round(mcx - w / 2) + 0.5, y: Math.round(y) + 0.5, w, h }; y += h; };
    put("latent", mW, h2); y += 26;
    put("recon", mW, h3); const fitGap = 52; y += fitGap;
    put("recw", mW, h3); y += 26;
    const opW = Math.max(bw.matmul, bw.loss, 84);
    put("matmul", opW, h1); y += 48;
    put("loss", opW, h1);
    const yb = y + 22;
    const cy = (b) => b.y + b.h / 2;
    const sideX = sx0 + ox + 0.5;
    B.sal = { x: sideX, y: Math.round(cy(B.recon) - 17) + 0.5, w: sw, h: 34 };
    B.act = { x: sideX, y: Math.round(cy(B.matmul) - 17) + 0.5, w: sw, h: 34 };
    const noteY = B.recon.y + h3 + fitGap / 2;
    const backF = tok("--fs-s", 13);
    const twoLines = runsW([[BACK_A, 0]].concat(BACK_B), backF, 400) > W - 8;
    const backY = yb + 20;     // first baseline of the label, under the bottom run of the path
    return { kind: "tall", W, H: Math.ceil(backY + (twoLines ? Math.round(backF * 1.3) : 0) + 6), F, lh, B, noteY, yb, backY, rx: rx + ox, mcx, backF, twoLines, salNote: { x: sideX, anchor: "start" } };
  }

  // ---- draw ----
  function render(host, W, state) {
    const Lo = W >= 640 ? wide(W) : tall(W);
    host.querySelectorAll(":scope > svg").forEach((s) => s.remove());
    const svg = el("svg", {
      width: W, height: Lo.H, viewBox: `0 0 ${W} ${Lo.H}`, role: "img", "aria-label": ARIA[state],
      class: "fl fl-" + Lo.kind + (state === "q" ? " is-q" : ""), "font-family": SERIF,
    }, null);
    host.appendChild(svg);
    const { B, F, lh } = Lo;
    const cx = (b) => b.x + b.w / 2, cy = (b) => b.y + b.h / 2, R = (b) => b.x + b.w, Bt = (b) => b.y + b.h;
    const gEdges = el("g", { class: "fl-edges" }, svg);
    const gBoxes = el("g", null, svg);

    // boxes
    box(gBoxes, B.latent, "fl-tensor");
    box(gBoxes, B.recon, "fl-op fl-chg");
    box(gBoxes, B.recw, "fl-tensor fl-chg");
    box(gBoxes, B.matmul, "fl-op");
    box(gBoxes, B.loss, "fl-op");
    box(gBoxes, B.act, "fl-ctx");

    // labels
    lines(el("g", { class: "fl-lab fl-w6" }, gBoxes), cx(B.latent), cy(B.latent), L.latent, F, lh);
    morphLabel(el("g", { class: "fl-lab fl-lab-recon" }, gBoxes), cx(B.recon), cy(B.recon), L.recon, F, lh);
    morphLabel(el("g", { class: "fl-lab fl-lab-recw" }, gBoxes), cx(B.recw), cy(B.recw), L.recw, F, lh);
    lines(el("g", { class: "fl-lab" }, gBoxes), cx(B.matmul), cy(B.matmul), L.matmul, F, lh);
    lines(el("g", { class: "fl-lab" }, gBoxes), cx(B.loss), cy(B.loss), L.loss, F, lh);
    lines(el("g", { class: "fl-lab fl-lab-ctx" }, gBoxes), cx(B.act), cy(B.act), L.act, F, lh);

    // QUASAR-only: saliency input + its note, and the reconstruction note
    const gSal = el("g", { class: "fl-sal" }, svg);
    box(gSal, B.sal, "fl-salbox");
    lines(el("g", { class: "fl-lab fl-lab-q" }, gSal), cx(B.sal), cy(B.sal), L.sal, F, lh);
    const gFit = el("g", { class: "fl-fit" }, svg);

    if (Lo.kind === "wide") {
      arrow(gEdges, R(B.latent), cy(B.latent), B.recon.x, cy(B.recon), "fl-fwd");
      arrow(gEdges, R(B.recon), cy(B.recon), B.recw.x, cy(B.recw), "fl-fwd");
      arrow(gEdges, R(B.recw), cy(B.recw), B.matmul.x, cy(B.matmul), "fl-fwd");
      const mid = (R(B.matmul) + B.loss.x) / 2, y = cy(B.matmul);
      el("line", { x1: R(B.matmul), y1: y, x2: mid - 12, y2: y, class: "fl-line fl-fwd" }, gEdges);
      dots(gEdges, mid, y, true);
      arrow(gEdges, mid + 12, y, B.loss.x, y, "fl-fwd");
      arrow(gEdges, cx(B.matmul), Bt(B.act), cx(B.matmul), B.matmul.y, "fl-ctxl");
      arrow(gSal, cx(B.recon), Bt(B.sal), cx(B.recon), B.recon.y, "fl-steel");
      text(gSal, Lo.salNote.x, cy(B.sal) + 4, [[NOTE_SAL, 0]], 12, { "text-anchor": Lo.salNote.anchor, class: "fl-note" });
      text(gFit, cx(B.recon), Lo.noteY, [[NOTE_FIT, 1]], 12, { class: "fl-note" });
      // backward pass: loss ↓, ← along the bottom, ↑ into the latent weights
      polyArrow(gEdges, [[cx(B.loss), Bt(B.loss)], [cx(B.loss), Lo.yb], [cx(B.latent), Lo.yb], [cx(B.latent), Bt(B.latent)]], "fl-steel fl-dash");
      backLabel(gEdges, (cx(B.loss) + cx(B.latent)) / 2, Lo.yb, Lo.backF);
    } else {
      const c = Lo.mcx;
      arrow(gEdges, c, Bt(B.latent), c, B.recon.y, "fl-fwd");
      arrow(gEdges, c, Bt(B.recon), c, B.recw.y, "fl-fwd");
      arrow(gEdges, c, Bt(B.recw), c, B.matmul.y, "fl-fwd");
      const mid = (Bt(B.matmul) + B.loss.y) / 2;
      el("line", { x1: c, y1: Bt(B.matmul), x2: c, y2: mid - 12, class: "fl-line fl-fwd" }, gEdges);
      dots(gEdges, c, mid, false);
      arrow(gEdges, c, mid + 12, c, B.loss.y, "fl-fwd");
      arrow(gEdges, R(B.act), cy(B.act), B.matmul.x, cy(B.act), "fl-ctxl");
      arrow(gSal, R(B.sal), cy(B.sal), B.recon.x, cy(B.sal), "fl-steel");
      text(gSal, B.sal.x, Bt(B.sal) + 16, [[NOTE_SAL, 0]], 12, { "text-anchor": "start", class: "fl-note" });
      // reconstruction note sits on the arrow below the box
      const fw = mw(NOTE_FIT, 12, 400, 1), nx = Math.min(c, W - 1 - (fw + 12) / 2);   // keep it inside the card
      knock(gFit, nx, Lo.noteY, fw + 12, 16);
      text(gFit, nx, Lo.noteY + 4, [[NOTE_FIT, 1]], 12, { class: "fl-note" });
      // backward pass: loss ↓, ← to the left edge, ↑, → into the latent weights
      const x0 = Lo.rx;
      polyArrow(gEdges, [[c, Bt(B.loss)], [c, Lo.yb], [x0, Lo.yb], [x0, cy(B.latent)], [B.latent.x, cy(B.latent)]], "fl-steel fl-dash");
      const gb = el("g", { class: "fl-back" }, gEdges);
      if (Lo.twoLines) {
        text(gb, W / 2, Lo.backY, [[BACK_A.trim(), 0]], Lo.backF);
        text(gb, W / 2, Lo.backY + Math.round(Lo.backF * 1.3), BACK_B, Lo.backF);
      } else text(gb, W / 2, Lo.backY, [[BACK_A, 0]].concat(BACK_B), Lo.backF);
    }
    return svg;
  }

  function init() {
    V = window.Viz;
    const root = document.getElementById("loop-diagram");
    if (!root || !V || root.dataset.ready) return;
    root.dataset.ready = "1";
    root.classList.add("fl-root");
    const reduced = V.reducedMotion;
    let state = root.dataset.state === "q" || root.dataset.state === "std" ? root.dataset.state : reduced ? "q" : "std";
    let auto = !reduced && root.dataset.auto !== "0";
    let visible = false, timer = 0, svg = null;

    const ctl = V.h("div", { class: "fl-ctl" }, root);
    const pills = V.pills(ctl, STATES, state, (v) => { auto = false; clearTimeout(timer); setState(v); }, "Training loop");
    V.h("div", { class: "fl-leg", "data-label": "", "aria-hidden": "true" }, ctl,
      '<span><i class="fl-sw fl-sw-t"></i>tensor</span><span><i class="fl-sw fl-sw-o"></i>operation</span>');
    const host = V.h("div", { class: "fl-svg" }, root);

    function setState(v) {
      state = v;
      pills.set(v, false);
      if (svg) { svg.classList.toggle("is-q", v === "q"); svg.setAttribute("aria-label", ARIA[v]); }
    }
    function schedule() {
      clearTimeout(timer);
      if (auto && visible && !document.hidden) timer = setTimeout(() => { setState(state === "q" ? "std" : "q"); schedule(); }, DWELL);
    }
    const rs = V.responsive(host, (w) => { svg = render(host, w, state); });
    // labels are measured on a canvas: re-measure once the serif faces the diagram uses have loaded
    if (document.fonts && document.fonts.load) {
      Promise.all(["400", "600", "italic 400"].map((f) => document.fonts.load(f + " 18px Newsreader"))).then(() => rs.redraw(), () => {});
      document.fonts.addEventListener && document.fonts.addEventListener("loadingdone", () => rs.redraw());
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => { for (const e of es) { visible = e.isIntersecting; if (visible) schedule(); else clearTimeout(timer); } }, { threshold: 0.35 }).observe(root);
    } else { visible = true; schedule(); }
    document.addEventListener("visibilitychange", () => (document.hidden ? clearTimeout(timer) : schedule()));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
