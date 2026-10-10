/* ix-realw2.js — interactive appendix Figures 6, 7 and 11 (real Qwen3-4B / Llama-3.1-8B weights).
   Mounts: #ix-fig6  scale search on Qwen3-4B weight groups at INT3 (panels a, b, c)
           #ix-fig7  selected clipping-range factors f* after QAD, INT4 / INT3 / INT2, two models
           #ix-fig11 median reduction vs Standard QAT per projection type, at init (left) and after training (right)
   Data:   assets/data/ix-realw2.json, written by tools/extract_ix_realw2.py from the paper's own figure generators.
   Renders data labels and numbers only. Needs window.Viz (viz.js). */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const DATA = SRC ? new URL("../data/ix-realw2.json", SRC).href : "assets/data/ix-realw2.json";
  const el = V.el, h = V.h, reduce = V.reducedMotion;
  const ROSE = "#D1495B", ROSE_T = "#A13040", INK = "#1D1F22", STEEL = "#2E6F95";
  const GRAY_AREA = "#d7dade", PALE = "#9fc2d8", P90_SW = "#7a9fb6"; // p90 swatch = steel .55 over the max|w| fill
  let UID = 0;

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const p3 = (v) => (+v).toPrecision(3);
  const thousands = (v) => Math.round(v).toLocaleString("en-US");
  function pct(v, d) {
    if (v == null || isNaN(v)) return "–";
    if (v === 0) return "0%";
    const x = v * 100;
    if (d != null) return x.toFixed(d) + "%";
    return (x < 0.1 ? x.toFixed(2) : x.toFixed(1)) + "%";
  }
  function decimals(ticks) {
    for (let d = 0; d <= 4; d++) {
      const f = Math.pow(10, d);
      if (ticks.every((t) => Math.abs(Math.round(t * f) - t * f) < 1e-6)) return d;
    }
    return 4;
  }
  // math symbols in SVG text: italic serif f / s / w / p (never uppercased)
  function mtext(t, parts) {
    for (const p of parts) {
      if (typeof p === "string") { el("tspan", null, t).textContent = p; continue; }
      const s = el("tspan", { class: p.sub ? "rw2-sub" : "rw2-m", dy: p.dy }, t);
      s.textContent = p.m || p.sub;
    }
    return t;
  }
  const M = (s) => '<i class="rw2-mi">' + s + "</i>";
  const FSTAR = M("f") + "*";
  const S0 = M("s") + "<sub>0</sub>";

  function clear(node) { node.querySelectorAll(":scope > svg").forEach((s) => s.remove()); }
  function svgIn(node, w, ht, label) {
    clear(node);
    const svg = el("svg", { width: w, height: ht, viewBox: `0 0 ${w} ${ht}`, role: "img", "aria-label": label });
    node.insertBefore(svg, node.firstChild);
    return svg;
  }
  // Pointer input. Mouse hovers (move) and clicks (tap). Touch / pen: a tap (< 10 px of travel) or a horizontal scrub
  // previews (move) and settles on release (tap); a vertical swipe stays a page scroll, and the pointercancel the
  // browser sends when it takes the gesture over restores the previous state (off).
  function bindPointer(node, o) {
    let t0 = null, scrub = false;
    node.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") { if (o.move) o.move(e); return; }
      t0 = [e.clientX, e.clientY]; scrub = false;
    });
    node.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") { if (o.move) o.move(e); return; }
      if (!t0) return;
      const dx = e.clientX - t0[0], dy = e.clientY - t0[1];
      if (scrub || (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy))) { scrub = true; (o.move || o.tap)(e); }
    });
    node.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") { if (o.tap) o.tap(e); return; }
      if (t0 && (scrub || Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 10)) (o.tap || o.move)(e);
      t0 = null; scrub = false;
    });
    node.addEventListener("pointercancel", () => { t0 = null; scrub = false; o.off(); });
    node.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") o.off(); });
  }
  function outsideTap(node, fn) {
    document.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" && !node.contains(e.target)) fn(); }, { passive: true });
  }
  function localXY(node, e) {
    const b = node.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  }
  // pills: keep one button reachable by Tab when none is checked (custom window in Fig. 6)
  function pillsTab(p) {
    const bs = p.node.querySelectorAll("button");
    if (![...bs].some((b) => b.getAttribute("aria-checked") === "true") && bs[0]) bs[0].tabIndex = 0;
  }
  function tipTable(head, cols, rows) {
    let s = '<div class="tt">' + head + "</div>";
    if (cols) s += '<div class="rw2-tr rw2-th"><span></span>' + cols.map((c) => "<span>" + c + "</span>").join("") + "</div>";
    for (const r of rows) {
      s += '<div class="rw2-tr' + (r.cls ? " " + r.cls : "") + '"><span class="rw2-tn">' +
        (r.color ? '<i class="rw2-tk" style="background:' + r.color + '"></i>' : "") + r.label + "</span>" +
        r.values.map((v, i) => '<b class="' + (r.on != null && r.on !== i ? "off" : "") + '">' + v + "</b>").join("") + "</div>";
    }
    return s;
  }

  // ================================================================ Figure 6 — scale search, INT3
  function fig6(root, D) {
    const F = D.fig6, N = F.n, G0 = F.g0;
    const S = F.s0, P9 = F.p90, P5 = F.p50, FF = F.f;
    const FS = S.map((v, i) => v * FF[i]);
    const HS = F.hist, NB = HS.f.length;
    const binOf = (f) => HS.f.reduce((bi, v, i) => (Math.abs(v - f) < Math.abs(HS.f[bi] - f) ? i : bi), 0);
    const MINW = 12;
    const smax = (a, b) => { let m = 0; for (let i = Math.max(0, Math.floor(a)); i < Math.min(N, Math.ceil(b)); i++) m = Math.max(m, S[i]); return m; };
    let win = [0, N], pin = F.peak - G0, hov = null, hb = null, ycur = smax(0, N) * 1.12, yraf = 0, zraf = 0;
    let revealed = reduce;

    root.textContent = "";
    root.classList.add("rw2", "rw2-f6");
    if (!revealed) root.classList.add("rw2-pre");
    const uid = "rw2f6-" + (++UID);

    // --- legend that doubles as the readout for the current group ---
    const top = h("div", { class: "rw2-top" }, root);
    const read = h("div", { class: "rw2-read", "aria-live": "polite" }, top);
    const R = {};
    function item(key, sw, label) {
      const s = h("span", { class: "rw2-ri rw2-ri-" + key }, read);
      if (sw) s.appendChild(sw);
      h("span", { class: "rw2-rn" }, s, label);
      R[key] = h("b", { class: "rw2-rv" }, s);
      return s;
    }
    const sw = (cls, style) => h("i", { class: "rw2-sw " + cls, style }, null);
    item("g", null, "group");
    item("s0", sw("rw2-sw-s0", ""), "max |" + M("w") + "| (absmax " + S0 + ")");
    item("p90", sw("", "background:" + P90_SW), M("p") + "<sub>90</sub>");
    item("p50", sw("", "background:" + PALE), "median");
    item("fs", sw("rw2-swl", "background:" + ROSE), FSTAR + "·" + S0);
    item("f", null, FSTAR);
    const ctl = h("div", { class: "rw2-ctl" }, top);
    h("span", { class: "rw2-lab", "aria-hidden": "true" }, ctl, "groups");
    const zoom = V.pills(ctl, [{ value: 400, label: "400" }, { value: 100, label: "100" }, { value: 25, label: "25" }], 400,
      (v) => zoomTo(v), "groups shown");

    const grid = h("div", { class: "rw2-f6g" }, root);
    const left = h("div", { class: "rw2-plot rw2-f6l", tabindex: "0", role: "group",
      "aria-label": "(a) and (b), " + F.model + " " + F.module + ", groups " + G0 + "–" + (G0 + N - 1) + "; left and right arrow keys step through groups" }, grid);
    const right = h("div", { class: "rw2-plot rw2-f6r", tabindex: "0", role: "group",
      "aria-label": "(c), selected range factor over " + thousands(F.hist_groups) + " groups; left and right arrow keys step through bins" }, grid);
    const tipR = V.tooltip(right);

    let LY = null, RY = null;

    // --- layout + static parts ---
    function draw(width) {
      const wide = width >= 720;
      root.classList.toggle("rw2-wide", wide);
      const gap = wide ? 28 : 0;
      const lw = wide ? Math.round((width - gap) * 3.3 / 4.3) : width;
      const rw = wide ? width - gap - lw : width;
      drawLeft(lw, wide);
      drawRight(rw, wide ? LY.height : 300, wide);
      renderAll();
      if (revealed) finishIntro();
    }

    function drawLeft(w, wide) {
      const narrow = w < 560;
      const m = { l: narrow ? 38 : 42, r: 6 };
      const hp = narrow ? 100 : 122;
      const yA = 22, yB = yA + hp + 48, yS = yB + hp + 56, hs = narrow ? 30 : 34;
      const height = yS + hs + 24;
      const W = w - m.l - m.r;
      const svg = svgIn(left, w, height, "Per-group max |w|, p90 and median with the searched range f*·s0");
      const g = el("g", { transform: `translate(${m.l},0)` }, svg);
      const defs = el("defs", null, svg);
      const panels = [yA, yB].map((y0, k) => {
        const cp = el("clipPath", { id: uid + "-c" + k }, defs);
        el("rect", { x: 0, y: -2, width: W, height: hp + 2 }, cp);
        const pg = el("g", { transform: `translate(0,${y0})` }, g);
        const pl = el("text", { class: "rw2-pl", x: -m.l + 2, y: -11 }, pg);
        pl.textContent = k ? "(b)" : "(a)";
        if (!k) mtext(el("text", { class: "rw2-at", x: -m.l + 30, y: -11 }, pg), ["|", { m: "w" }, "| within group"]);
        const grid = el("g", { class: "rw2-grid" }, pg);
        const data = el("g", { "clip-path": `url(#${uid}-c${k})` }, pg);
        const grow = el("g", { class: "rw2-grow" + (revealed ? " in" : "") }, data);
        const line = el("g", null, data);
        const axis = el("g", { class: "rw2-axis" }, pg);
        const cur = el("g", { class: "rw2-cur" }, pg);
        return { y0, pg, grid, grow, line, axis, cur };
      });
      // x title under (b)
      el("text", { class: "rw2-at", x: W / 2, y: yB + hp + 36, "text-anchor": "middle" }, g).textContent = "group index";
      // pointer overlay over both panels
      const ov = el("rect", { class: "rw2-ov", x: 0, y: yA - 4, width: W, height: yB + hp - yA + 8, fill: "transparent" }, g);
      // brush strip (overview of all shown groups)
      const bg = el("g", { transform: `translate(0,${yS})` }, g);
      const bwrap = el("g", { class: "rw2-brush", tabindex: "0", role: "slider", "aria-label": "window of groups",
        "aria-valuemin": G0, "aria-valuemax": G0 + N }, bg);
      LY = { w, W, hp, yA, yB, yS, hs, height, m, svg, g, panels, ov, bg, bwrap, narrow };
      buildBrush();
      bindPanels();
    }

    // --- render (a)/(b) for the current window ---
    function sxWin() { return V.lin([G0 + win[0], G0 + win[1]], [0, LY.W]); }
    function renderPanels() {
      if (!LY) return;
      const { W, hp, panels } = LY;
      const sx = sxWin();
      const sy = V.lin([0, ycur], [hp, 0]);
      const i0 = Math.max(0, Math.floor(win[0]) - 1), i1 = Math.min(N - 1, Math.ceil(win[1]));
      const ppg = W / (win[1] - win[0]);
      const pts = (arr) => { let d = ""; for (let i = i0; i <= i1; i++) d += (d ? "L" : "M") + sx(G0 + i).toFixed(2) + "," + sy(arr[i]).toFixed(2); return d; };
      const area = (arr) => "M" + sx(G0 + i0).toFixed(2) + "," + hp + "L" + pts(arr).slice(1) + "L" + sx(G0 + i1).toFixed(2) + "," + hp + "Z";
      const yt = V.niceTicks(0, ycur, LY.narrow ? 2 : 3).filter((t) => t <= ycur);
      const yd = decimals(yt);
      let xt = V.niceTicks(G0 + win[0], G0 + win[1], LY.narrow ? 4 : 8).filter((t) => Number.isInteger(t) && t >= G0 + win[0] - 1e-6 && t <= G0 + win[1] + 1e-6);
      panels.forEach((P, k) => {
        P.grid.textContent = ""; P.axis.textContent = ""; P.grow.textContent = ""; P.line.textContent = "";
        for (const t of yt) {
          el("line", { x1: 0, x2: W, y1: sy(t), y2: sy(t) }, P.grid);
          el("text", { x: -8, y: sy(t) + 4, "text-anchor": "end" }, P.axis).textContent = t === 0 ? "0" : t.toFixed(yd);
        }
        el("line", { x1: 0, x2: W, y1: hp, y2: hp, class: "rw2-base" }, P.axis);
        for (const t of xt) {
          const x = sx(t);
          el("line", { x1: x, x2: x, y1: hp, y2: hp + 4 }, P.axis);
          el("text", { x, y: hp + 17, "text-anchor": "middle" }, P.axis).textContent = String(t);
        }
        el("path", { d: area(S), fill: GRAY_AREA }, P.grow);
        el("path", { d: area(P9), fill: STEEL, "fill-opacity": 0.55 }, P.grow);
        el("path", { d: area(P5), fill: PALE }, P.grow);
        el("path", { d: pts(S), class: "rw2-s0" }, P.grow);
        if (k === 1) {
          const fl = el("path", { d: pts(FS), class: "rw2-fs" }, P.line);
          if (!revealed) fl.style.opacity = 0;
          P.fsPath = fl;
        }
        if (ppg >= 10) {
          const r = ppg >= 22 ? 2.6 : 1.9;
          for (let i = Math.max(0, Math.ceil(win[0])); i < Math.min(N, Math.ceil(win[1])); i++) {
            el("circle", { cx: sx(G0 + i), cy: sy(S[i]), r, class: "rw2-dot", fill: INK }, k ? P.line : P.grow);
            if (k === 1) el("circle", { cx: sx(G0 + i), cy: sy(FS[i]), r, class: "rw2-dot", fill: ROSE }, P.line);
          }
        }
      });
      LY.sx = sx; LY.sy = sy;
    }

    function renderCursor() {
      if (!LY || !LY.sx) return;
      const i = hov != null ? hov : pin;
      const { panels, hp } = LY;
      const sx = LY.sx, sy = LY.sy;
      const inWin = G0 + i >= G0 + win[0] - 0.5 && G0 + i <= G0 + win[1];
      panels.forEach((P, k) => {
        P.cur.textContent = "";
        if (!inWin) return;
        const x = sx(G0 + i);
        el("line", { x1: x, x2: x, y1: -4, y2: hp, class: hov != null ? "rw2-xh" : "rw2-xh pin" }, P.cur);
        // (b): the part of this group's range the search clips, f*·s0 up to s0
        if (k === 1 && FS[i] < S[i]) el("line", { x1: x, x2: x, y1: Math.max(0, sy(S[i])), y2: sy(FS[i]), class: "rw2-clip" }, P.cur);
        const dots = [[P5[i], PALE], [P9[i], "#5f8fae"], [S[i], INK]];
        if (k === 1) dots.push([FS[i], ROSE]);
        for (const [v, c] of dots) el("circle", { cx: x, cy: Math.max(0, sy(v)), r: 3.6, fill: c, class: "rw2-hd" }, P.cur);
      });
      // readout
      R.g.textContent = String(G0 + i);
      R.s0.textContent = p3(S[i]);
      R.p90.textContent = p3(P9[i]);
      R.p50.textContent = p3(P5[i]);
      R.fs.textContent = p3(FS[i]);
      R.f.textContent = FF[i].toFixed(2);
      read.classList.toggle("hov", hov != null);
      // pin marker on the overview strip
      if (LY.pinMark) LY.pinMark.setAttribute("transform", `translate(${LY.bx(G0 + pin)},0)`);
      renderBinMark();
    }

    // --- brush ---
    function buildBrush() {
      const { W, hs, bwrap } = LY;
      const bx = V.lin([G0, G0 + N], [0, W]);
      const by = V.lin([0, smax(0, N) * 1.05], [hs, 0]);
      LY.bx = bx;
      let d = "";
      for (let i = 0; i < N; i++) d += (i ? "L" : "M") + bx(G0 + i).toFixed(1) + "," + by(S[i]).toFixed(1);
      el("path", { d: "M0," + hs + "L" + d.slice(1) + "L" + bx(G0 + N - 1).toFixed(1) + "," + hs + "Z", fill: GRAY_AREA }, bwrap);
      el("path", { d, class: "rw2-bspark" }, bwrap);
      let fd = "";
      for (let i = 0; i < N; i++) fd += (i ? "L" : "M") + bx(G0 + i).toFixed(1) + "," + by(FS[i]).toFixed(1);
      el("path", { d: fd, class: "rw2-bfs" }, bwrap);
      el("line", { x1: 0, x2: W, y1: hs, y2: hs, class: "rw2-base" }, bwrap);
      const ax = el("g", { class: "rw2-axis" }, bwrap);
      for (const t of V.niceTicks(G0, G0 + N, LY.narrow ? 2 : 4)) {
        el("line", { x1: bx(t), x2: bx(t), y1: hs, y2: hs + 4 }, ax);
        el("text", { x: bx(t), y: hs + 17, "text-anchor": t === G0 ? "start" : t === G0 + N ? "end" : "middle" }, ax).textContent = String(t);
      }
      LY.pinMark = el("path", { d: "M0,-1L-4,-7L4,-7Z", class: "rw2-pinmark" }, bwrap);
      LY.dimL = el("rect", { y: -1, height: hs + 2, class: "rw2-dim" }, bwrap);
      LY.dimR = el("rect", { y: -1, height: hs + 2, class: "rw2-dim" }, bwrap);
      LY.win = el("rect", { y: -1, height: hs + 2, rx: 3, class: "rw2-win" }, bwrap);
      LY.hA = el("rect", { y: hs / 2 - 9, width: 7, height: 18, rx: 2.5, class: "rw2-handle" }, bwrap);
      LY.hB = el("rect", { y: hs / 2 - 9, width: 7, height: 18, rx: 2.5, class: "rw2-handle" }, bwrap);
      LY.focusRing = el("rect", { x: -4, y: -5, width: W + 8, height: hs + 10, rx: 6, class: "rw2-ring" }, bwrap);
      LY.bhit = el("rect", { x: -8, y: -8, width: W + 16, height: hs + 16, fill: "transparent", class: "rw2-bhit" }, bwrap);
      bindBrush();
    }
    function renderBrush() {
      if (!LY || !LY.win) return;
      const { bx, W } = LY;
      const xa = bx(G0 + win[0]), xb = bx(G0 + win[1]);
      LY.dimL.setAttribute("x", 0); LY.dimL.setAttribute("width", Math.max(0, xa));
      LY.dimR.setAttribute("x", xb); LY.dimR.setAttribute("width", Math.max(0, W - xb));
      LY.win.setAttribute("x", xa); LY.win.setAttribute("width", Math.max(1, xb - xa));
      LY.hA.setAttribute("x", xa - 3.5); LY.hB.setAttribute("x", xb - 3.5);
      const a = Math.round(G0 + win[0]), b = Math.round(G0 + win[1]);
      LY.bwrap.setAttribute("aria-valuenow", Math.round((a + b) / 2));
      LY.bwrap.setAttribute("aria-valuetext", "groups " + a + " to " + (b - 1));
      const wn = Math.round(win[1] - win[0]);
      zoom.set([400, 100, 25].includes(wn) && Math.abs(win[1] - win[0] - wn) < 1e-6 ? wn : null, false);
      pillsTab(zoom);
    }
    function setWin(a, b, smooth) {
      win = [a, b];
      const target = smax(a, b) * 1.12;
      if (smooth === false || reduce) { ycur = target; cancelAnimationFrame(yraf); yraf = 0; }
      else if (Math.abs(target - ycur) > 1e-9 && !yraf) {
        const step = () => {
          const t = smax(win[0], win[1]) * 1.12;
          ycur += (t - ycur) * 0.22;
          if (Math.abs(t - ycur) < t * 0.004) { ycur = t; yraf = 0; } else yraf = requestAnimationFrame(step);
          renderPanels(); renderCursor();
        };
        yraf = requestAnimationFrame(step);
      }
      renderPanels(); renderBrush(); renderCursor();
    }
    function zoomTo(k) {
      const c = pin + 0.5 >= win[0] && pin + 0.5 <= win[1] ? pin + 0.5 : (win[0] + win[1]) / 2;
      const a1 = clamp(Math.round(c - k / 2), 0, N - k), b1 = a1 + k;
      const a0 = win[0], b0 = win[1];
      cancelAnimationFrame(zraf); cancelAnimationFrame(yraf); yraf = 0;
      if (reduce) { setWin(a1, b1, false); return; }
      const t0 = performance.now(), ms = 520;
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
        // interpolate in log-width so the zoom feels even
        const wv = Math.exp(Math.log(b0 - a0) + (Math.log(b1 - a1) - Math.log(b0 - a0)) * e);
        const cv = (a0 + b0) / 2 + ((a1 + b1) / 2 - (a0 + b0) / 2) * e;
        let a = cv - wv / 2;
        a = clamp(a, 0, N - wv);
        win = [a, a + wv];
        ycur = smax(win[0], win[1]) * 1.12 * (1 - e) + smax(a1, b1) * 1.12 * e;
        renderPanels(); renderBrush(); renderCursor();
        if (t < 1) zraf = requestAnimationFrame(tick); else { zraf = 0; setWin(a1, b1, false); }
      };
      zraf = requestAnimationFrame(tick);
    }
    function bindBrush() {
      const { bhit, bwrap } = LY;
      let st = null;
      const gx = (e) => clamp(LY.bx.invert(localXY(LY.svg, e)[0] - LY.m.l) - G0, 0, N);
      bhit.addEventListener("pointerdown", (e) => {
        cancelAnimationFrame(zraf);
        const p = gx(e), xa = win[0], xb = win[1], tol = (10 * N) / LY.W;
        const mode = Math.abs(p - xa) < tol && Math.abs(p - xa) <= Math.abs(p - xb) ? "a" : Math.abs(p - xb) < tol ? "b" : p > xa && p < xb ? "pan" : "jump";
        st = { x: e.clientX, y: e.clientY, p, w0: win.slice(), mode, mouse: e.pointerType === "mouse", go: e.pointerType === "mouse" };
        if (st.go) {
          try { bhit.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
          if (mode === "jump") { jump(p); st.w0 = win.slice(); st.mode = "pan"; }
          e.preventDefault();
        }
      });
      bhit.addEventListener("pointermove", (e) => {
        if (!st) {
          if (e.pointerType === "mouse") {
            const p = gx(e), tol = (10 * N) / LY.W;
            bhit.style.cursor = Math.abs(p - win[0]) < tol || Math.abs(p - win[1]) < tol ? "ew-resize" : p > win[0] && p < win[1] ? "grab" : "pointer";
          }
          return;
        }
        const dxp = e.clientX - st.x, dyp = e.clientY - st.y;
        if (!st.go) {
          if (Math.abs(dxp) >= 8 && Math.abs(dxp) > Math.abs(dyp)) {
            st.go = true;
            try { bhit.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
            if (st.mode === "jump") { jump(st.p); st.w0 = win.slice(); st.mode = "pan"; }
          } else return;
        }
        const d = (dxp * N) / LY.W;
        let [a, b] = st.w0;
        if (st.mode === "pan") { const wd = b - a; a = clamp(Math.round(a + d), 0, N - wd); b = a + wd; }
        else if (st.mode === "a") a = clamp(Math.round(a + d), 0, b - MINW);
        else if (st.mode === "b") b = clamp(Math.round(b + d), a + MINW, N);
        if (a !== win[0] || b !== win[1]) setWin(a, b);
      });
      bhit.addEventListener("pointerup", (e) => {
        if (st && !st.go && !st.mouse && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 10) jump(st.p);
        st = null;
      });
      bhit.addEventListener("pointercancel", () => {
        if (st && st.go && !st.mouse) setWin(st.w0[0], st.w0[1], false);
        st = null;
      });
      bhit.addEventListener("dblclick", () => zoomTo(N));
      bwrap.addEventListener("keydown", (e) => {
        const wd = win[1] - win[0];
        let a = win[0], b = win[1];
        const stp = Math.max(1, Math.round(wd / 8));
        if (e.key === "ArrowLeft") a -= e.shiftKey ? wd : stp;
        else if (e.key === "ArrowRight") a += e.shiftKey ? wd : stp;
        else if (e.key === "PageUp") a -= wd;
        else if (e.key === "PageDown") a += wd;
        else if (e.key === "Home") a = 0;
        else if (e.key === "End") a = N - wd;
        else if (e.key === "ArrowUp" || e.key === "+" || e.key === "=") { zoomBy(0.5); e.preventDefault(); return; }
        else if (e.key === "ArrowDown" || e.key === "-") { zoomBy(2); e.preventDefault(); return; }
        else return;
        e.preventDefault();
        a = clamp(Math.round(a), 0, N - wd); b = a + wd;
        setWin(a, b);
      });
      bwrap.addEventListener("focus", () => LY.focusRing.classList.add("on"));
      bwrap.addEventListener("blur", () => LY.focusRing.classList.remove("on"));
      function jump(p) {
        const wd = win[1] - win[0];
        const a = clamp(Math.round(p - wd / 2), 0, N - wd);
        setWin(a, a + wd);
      }
      function zoomBy(k) {
        const wd = clamp(Math.round((win[1] - win[0]) * k), MINW, N), c = (win[0] + win[1]) / 2;
        const a = clamp(Math.round(c - wd / 2), 0, N - wd);
        setWin(a, a + wd);
      }
    }

    // --- panel pointer + keys ---
    function bindPanels() {
      const ov = LY.ov;
      const idx = (e) => clamp(Math.round(LY.sx.invert(localXY(LY.svg, e)[0] - LY.m.l) - G0), Math.max(0, Math.ceil(win[0])), Math.min(N - 1, Math.ceil(win[1]) - 1));
      bindPointer(ov, {
        move(e) { hov = idx(e); renderCursor(); },
        tap(e) { pin = idx(e); hov = null; renderCursor(); },
        off() { if (hov != null) { hov = null; renderCursor(); } },
      });
    }
    left.addEventListener("keydown", (e) => {
      if (e.target !== left) return;
      let i = pin;
      if (e.key === "ArrowLeft") i -= e.shiftKey ? 10 : 1;
      else if (e.key === "ArrowRight") i += e.shiftKey ? 10 : 1;
      else if (e.key === "Home") i = Math.ceil(win[0]);
      else if (e.key === "End") i = Math.ceil(win[1]) - 1;
      else return;
      e.preventDefault();
      pin = clamp(i, 0, N - 1); hov = null;
      // the window follows the selected group
      const wd = win[1] - win[0];
      if (pin < win[0]) setWin(pin, pin + wd);
      else if (pin >= win[1]) setWin(pin + 1 - wd, pin + 1);
      else renderCursor();
    });
    outsideTap(left, () => { if (hov != null) { hov = null; renderCursor(); } });

    // --- (c) histogram of f* over every group of the model ---
    function drawRight(w, height, wide) {
      const m = { l: 56, r: 8, t: 80, b: 46 };
      const W = w - m.l - m.r, H = height - m.t - m.b;
      const svg = svgIn(right, w, height, "Distribution of selected range factors over " + thousands(F.hist_groups) + " groups; " + (100 * F.frac_narrower).toFixed(1) + "% below 1");
      const g = el("g", { transform: `translate(${m.l},${m.t})` }, svg);
      const sx = V.lin([0.465, 1.035], [0, W]);
      const ymaxH = 0.31;
      const sy = V.lin([0, ymaxH], [H, 0]);
      el("text", { class: "rw2-pl", x: -m.l + 2, y: -m.t + 12 }, g).textContent = "(c)";
      // the headline number of panel (c)
      const big = el("text", { class: "rw2-big", x: -m.l + 2, y: -m.t + 46 }, g);
      big.textContent = (100 * F.frac_narrower).toFixed(1) + "%";
      const bl = el("text", { class: "rw2-bl", x: -m.l + 2, y: -m.t + 64 }, g);
      mtext(bl, [{ m: "f" }, "* < 1"]);
      const gr = el("g", { class: "rw2-grid" }, g), ax = el("g", { class: "rw2-axis" }, g);
      for (const t of [0, 0.1, 0.2, 0.3]) {
        el("line", { x1: 0, x2: W, y1: sy(t), y2: sy(t) }, gr);
        el("text", { x: -8, y: sy(t) + 4, "text-anchor": "end" }, ax).textContent = t === 0 ? "0" : t.toFixed(1);
      }
      el("line", { x1: 0, x2: W, y1: H, y2: H, class: "rw2-base" }, ax);
      for (const t of [0.5, 0.75, 1.0]) {
        el("line", { x1: sx(t), x2: sx(t), y1: H, y2: H + 4 }, ax);
        el("text", { x: sx(t), y: H + 17, "text-anchor": "middle" }, ax).textContent = t.toFixed(2);
      }
      const xt = el("text", { class: "rw2-at", x: W / 2, y: H + 36, "text-anchor": "middle" }, ax);
      mtext(xt, [{ m: "f" }, "* · all " + (F.hist_groups / 1e6).toFixed(1) + "M groups"]);
      const ytl = el("text", { class: "rw2-at", transform: `translate(${-m.l + 12},${H / 2}) rotate(-90)`, "text-anchor": "middle" }, ax);
      ytl.textContent = "fraction of groups";
      const bw = sx(0.042) - sx(0);
      const bars = el("g", { class: "rw2-bars" + (revealed ? " in" : "") }, g);
      const nodes = HS.f.map((f, i) => {
        const r = el("rect", { x: sx(f) - bw / 2, y: sy(HS.share[i]), width: bw, height: H - sy(HS.share[i]), class: "rw2-hbar", fill: ROSE, stroke: ROSE_T, "stroke-width": 0.8 }, bars);
        r.style.transitionDelay = (reduce ? 0 : 500 + i * 45) + "ms";
        return r;
      });
      const mark = el("g", { class: "rw2-binmark" }, g);
      const hit = el("g", null, g);
      const slot = sx(0.05) - sx(0);
      HS.f.forEach((f, i) => {
        el("rect", { x: sx(f) - slot / 2, y: 0, width: slot, height: H, fill: "transparent", class: "rw2-hhit" }, hit);
      });
      RY = { svg, g, sx, sy, H, W, m, nodes, mark, hit, bw };
      bindRight();
    }
    function renderBinMark() {
      if (!RY) return;
      const i = hov != null ? hov : pin;
      const b = binOf(FF[i]);
      const { mark, sx, sy, bw, nodes } = RY;
      mark.textContent = "";
      nodes.forEach((n, k) => n.classList.toggle("hb", hb === k));
      const x = sx(HS.f[b]), y = sy(HS.share[b]);
      el("rect", { x: x - bw / 2 - 1.5, y: y - 1.5, width: bw + 3, height: RY.H - y + 1.5, class: "rw2-binout" }, mark);
      const t = el("text", { x, y: y - 8, "text-anchor": "middle", class: "rw2-binlab" }, mark);
      t.textContent = "group " + (G0 + i);
      requestAnimationFrame(() => {
        try {
          const L = t.getComputedTextLength();
          const xc = clamp(x, L / 2 - RY.m.l + 4, RY.W - L / 2);
          t.setAttribute("x", xc);
        } catch (_) { /* ignore */ }
      });
    }
    function showBin(i, px, py) {
      hb = i;
      renderBinMark();
      tipR.show(px, py, tipTable(FSTAR + " = " + HS.f[i].toFixed(2), null, [
        { label: "fraction of groups", values: [pct(HS.share[i])] },
        { label: "groups", values: [thousands(HS.count[i])] },
      ]));
    }
    function hideBin() { hb = null; tipR.hide(); renderBinMark(); }
    function bindRight() {
      const hit = RY.hit;
      const at = (e) => {
        const x = localXY(RY.svg, e)[0] - RY.m.l;
        return clamp(Math.round((RY.sx.invert(x) - HS.f[0]) / 0.05), 0, NB - 1);
      };
      bindPointer(hit, {
        move(e) { const [px, py] = localXY(right, e); showBin(at(e), px, py); },
        tap(e) { const [px, py] = localXY(right, e); showBin(at(e), px, py); },
        off: hideBin,
      });
    }
    right.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { hideBin(); return; }
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      let i = hb == null ? binOf(FF[pin]) : hb;
      if (e.key === "ArrowLeft") i--; else if (e.key === "ArrowRight") i++; else if (e.key === "Home") i = 0; else i = NB - 1;
      i = clamp(i, 0, NB - 1);
      const x = RY.m.l + RY.sx(HS.f[i]), y = RY.m.t + RY.sy(HS.share[i]);
      showBin(i, x, y);
    });
    right.addEventListener("blur", hideBin);
    outsideTap(right, hideBin);

    function renderAll() { renderPanels(); renderBrush(); renderCursor(); }

    // --- first view: areas rise, the searched range draws in, the histogram grows ---
    function intro() {
      if (revealed) return;
      revealed = true;
      if (!LY) return;
      LY.panels.forEach((P) => P.grow.classList.add("in"));
      const fl = LY.panels[1].fsPath;
      if (fl) { fl.style.transition = "opacity .2s ease 450ms"; fl.style.opacity = 1; V.drawIn(fl, 1300, 450); }
      if (RY) RY.svg.querySelector(".rw2-bars").classList.add("in");
      setTimeout(() => root.classList.remove("rw2-pre"), 1250);
      setTimeout(() => { const b = RY && RY.svg.querySelector(".rw2-bars"); if (b) b.classList.add("now"); }, 1800);
    }
    function finishIntro() {
      revealed = true;
      root.classList.remove("rw2-pre");
      if (LY) LY.panels.forEach((P) => { P.grow.classList.add("in", "now"); if (P.fsPath) { P.fsPath.style.opacity = 1; P.fsPath.style.strokeDasharray = ""; P.fsPath.style.strokeDashoffset = ""; P.fsPath.style.transition = "none"; } });
      if (RY) { const b = RY.svg.querySelector(".rw2-bars"); b.classList.add("in", "now"); }
    }
    V.responsive(root, draw);
    V.onVisible(root, intro, { threshold: 0.3 });
    return function finish() {
      cancelAnimationFrame(zraf); cancelAnimationFrame(yraf);
      zraf = yraf = 0;
      finishIntro();
      hov = null; hb = null; tipR.hide();
      renderAll();
    };
  }

  // ================================================================ Figure 7 — f* after QAD, three bit widths, two models
  function fig7(root, D) {
    const F = D.fig7, MS = F.models, NB = F.f.length, BITS = F.bits;
    const short = (n) => n.replace(/-(Thinking-2507|Instruct)$/, "");
    let mi = 0, hb = null, revealed = reduce, anim = 0;
    let shown = BITS.map((b) => MS[0].cells[b].share.slice());
    let med = BITS.map((b) => MS[0].cells[b].p50);

    root.textContent = "";
    root.classList.add("rw2", "rw2-f7");
    const ctl = h("div", { class: "rw2-ctl rw2-ctl-row" }, root);
    const pills = V.pills(ctl, MS.map((m, i) => ({ value: i, label: '<span class="rw2-long">' + esc(m.name) + '</span><span class="rw2-short">' + esc(short(m.name)) + "</span>" })),
      0, (v) => setModel(v), "model");
    const plot = h("div", { class: "rw2-plot", tabindex: "0", role: "group",
      "aria-label": "fraction of weight groups per selected range factor at INT4, INT3 and INT2; left and right arrow keys step through factors" }, root);
    const live = h("div", { class: "sr-only", "aria-live": "polite" }, root);
    let L = null;

    function draw(width) {
      root.classList.toggle("rw2-narrow", width < 420);
      const narrow = width < 420;
      const m = { l: 58, r: 8, t: 8, b: 46 };
      // side by side with the taller saliency card (site.css .grid-2 pairs from 861px): taller rows balance the pair
      const paired = window.matchMedia && window.matchMedia("(min-width: 861px)").matches;
      const rowH = paired ? (narrow ? 133 : 147) : narrow ? 80 : 100, gap = 20;
      const height = m.t + 3 * rowH + 2 * gap + m.b;
      const W = width - m.l - m.r;
      const svg = svgIn(plot, width, height, "Selected range factors after QAD, " + MS[mi].name);
      const g = el("g", { transform: `translate(${m.l},${m.t})` }, svg);
      const sx = V.lin([0.25, 1.05], [0, W]);
      const sy = V.lin([0, 0.5], [rowH, 0]);
      const bw = (sx(0.05) - sx(0)) * 0.86, slot = sx(0.05) - sx(0);
      const band = el("rect", { y: -4, height: 3 * rowH + 2 * gap + 4, width: slot, class: "rw2-band" }, g);
      band.style.opacity = 0;
      const rows = BITS.map((b, r) => {
        const y0 = r * (rowH + gap);
        const rg = el("g", { transform: `translate(0,${y0})` }, g);
        const gr = el("g", { class: "rw2-grid" }, rg), ax = el("g", { class: "rw2-axis" }, rg);
        for (const t of [0, 0.2, 0.4]) {
          if (t) el("line", { x1: 0, x2: W, y1: sy(t), y2: sy(t) }, gr);
          el("text", { x: -8, y: sy(t) + 4, "text-anchor": "end" }, ax).textContent = t === 0 ? "0" : t.toFixed(1);
        }
        el("line", { x1: 0, x2: W, y1: rowH, y2: rowH, class: "rw2-base" }, ax);
        const bars = el("g", { class: "rw2-bars" + (revealed ? " in now" : "") }, rg);
        const nodes = F.f.map((f, i) => {
          const v = shown[r][i];
          const n = el("rect", { x: sx(f) - bw / 2, y: sy(v), width: bw, height: rowH - sy(v), fill: ROSE, class: "rw2-hbar" }, bars);
          n.style.transitionDelay = (reduce ? 0 : 150 + r * 320 + i * 18) + "ms";
          return n;
        });
        const ml = el("g", { class: "rw2-med" + (revealed ? " in now" : "") }, rg);
        ml.style.transitionDelay = (reduce ? 0 : 450 + r * 320) + "ms";
        const line = el("line", { y1: -2, y2: rowH, class: "rw2-medl" }, ml);
        const mt = el("text", { y: 11, class: "rw2-medt" }, ml);
        el("text", { x: 4, y: 12, class: "rw2-tag" }, rg).textContent = b;
        const vals = el("g", { class: "rw2-vals" }, rg);
        return { y0, nodes, line, mt, vals, bars, ml };
      });
      // x axis
      const ax = el("g", { class: "rw2-axis", transform: `translate(0,${3 * rowH + 2 * gap})` }, g);
      const ticks = [0.4, 0.6, 0.8, 1.0].map((t) => {
        el("line", { x1: sx(t), x2: sx(t), y1: 0, y2: 4 }, ax);
        const tx = el("text", { x: sx(t), y: 17, "text-anchor": "middle" }, ax);
        tx.textContent = t.toFixed(1);
        return { t, tx };
      });
      // the hovered factor, on the axis
      const xl = el("text", { y: 17, "text-anchor": "middle", class: "rw2-xsel" }, ax);
      xl.style.opacity = 0;
      const xt = el("text", { class: "rw2-at", x: W / 2, y: 36, "text-anchor": "middle" }, ax);
      mtext(xt, ["selected scale factor ", { m: "f" }, "*"]);
      const yt = el("text", { class: "rw2-at", transform: `translate(${-m.l + 12},${(3 * rowH + 2 * gap) / 2}) rotate(-90)`, "text-anchor": "middle" }, g);
      yt.textContent = "fraction of groups";
      const ov = el("rect", { x: 0, y: -4, width: W, height: 3 * rowH + 2 * gap + 8, fill: "transparent", class: "rw2-ov" }, g);
      L = { svg, g, sx, sy, W, rowH, gap, m, rows, band, slot, ov, ticks, xl };
      renderBars(); renderMed(); renderHover();
      bindPointer(ov, {
        move(e) { setHover(binAt(e)); },
        tap(e) { setHover(binAt(e)); },
        off() { setHover(null); },
      });
    }
    function binAt(e) {
      const x = localXY(L.svg, e)[0] - L.m.l;
      return clamp(Math.round((L.sx.invert(x) - F.f[0]) / 0.05), 0, NB - 1);
    }
    function renderBars() {
      L.rows.forEach((R, r) => R.nodes.forEach((n, i) => {
        const v = shown[r][i], y = L.sy(v);
        n.setAttribute("y", y); n.setAttribute("height", Math.max(0, L.rowH - y));
      }));
    }
    function renderMed() {
      L.rows.forEach((R, r) => {
        const p = med[r], x = L.sx(p), lft = p >= 0.75;
        R.line.setAttribute("x1", x); R.line.setAttribute("x2", x);
        R.mt.setAttribute("x", x + (lft ? -5 : 5));
        R.mt.setAttribute("text-anchor", lft ? "end" : "start");
        R.mt.textContent = "p50 = " + p.toFixed(2);
      });
    }
    function renderHover() {
      if (!L) return;
      L.band.style.opacity = hb == null ? 0 : 1;
      if (hb != null) L.band.setAttribute("x", L.sx(F.f[hb]) - L.slot / 2);
      L.rows.forEach((R, r) => {
        R.vals.textContent = "";
        R.mt.style.opacity = hb == null ? 1 : 0;
        if (hb == null) return;
        // the share sits above the tallest bar under its own width (neighbours are often taller than the hovered bar)
        const x = L.sx(F.f[hb]);
        const t = el("text", { x, y: L.rowH - 5, "text-anchor": "middle", class: "rw2-val" }, R.vals);
        t.textContent = pct(MS[mi].cells[BITS[r]].share[hb]);
        const half = t.getComputedTextLength() / 2 + 3;
        let top = L.sy(shown[r][hb]);
        F.f.forEach((f, i) => { if (Math.abs(L.sx(f) - x) < half + L.slot / 2) top = Math.min(top, L.sy(shown[r][i])); });
        t.setAttribute("y", Math.max(10, Math.min(top - 5, L.rowH - 5)));
      });
      const x = hb == null ? 0 : L.sx(F.f[hb]);
      L.xl.style.opacity = hb == null ? 0 : 1;
      if (hb != null) { L.xl.setAttribute("x", x); L.xl.textContent = F.f[hb].toFixed(2); }
      for (const T of L.ticks) T.tx.style.opacity = hb != null && Math.abs(L.sx(T.t) - x) < 30 ? 0 : 1;
    }
    function announce() {
      live.textContent = hb == null ? "" : MS[mi].name + ", f* " + F.f[hb].toFixed(2) + ": " +
        BITS.map((b) => b + " " + pct(MS[mi].cells[b].share[hb])).join(", ");
    }
    function setHover(i) {
      if (i === hb) return;
      hb = i;
      renderHover();
      announce();
    }
    function setModel(v) {
      mi = v;
      L.svg.setAttribute("aria-label", "Selected range factors after QAD, " + MS[mi].name);
      const from = shown.map((r) => r.slice()), to = BITS.map((b) => MS[mi].cells[b].share);
      const m0 = med.slice(), m1 = BITS.map((b) => MS[mi].cells[b].p50);
      cancelAnimationFrame(anim);
      announce();
      if (reduce) { shown = to.map((r) => r.slice()); med = m1; renderBars(); renderMed(); renderHover(); return; }
      const t0 = performance.now(), ms = 420;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
        shown = from.map((r, k) => r.map((v, i) => v + (to[k][i] - v) * e));
        med = m0.map((v, k) => v + (m1[k] - v) * e);
        renderBars(); renderMed(); renderHover();
        if (t < 1) anim = requestAnimationFrame(step); else anim = 0;
      };
      anim = requestAnimationFrame(step);
    }
    plot.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { setHover(null); return; }
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      let i = hb == null ? F.f.indexOf(MS[mi].cells[BITS[1]].p50) : hb;
      if (i < 0) i = 0;
      if (e.key === "ArrowLeft") i--; else if (e.key === "ArrowRight") i++; else if (e.key === "Home") i = 0; else i = NB - 1;
      setHover(clamp(i, 0, NB - 1));
    });
    plot.addEventListener("blur", () => setHover(null));
    outsideTap(plot, () => setHover(null));

    V.responsive(plot, draw);
    function intro() {
      if (revealed || !L) return;
      revealed = true;
      L.rows.forEach((R) => { R.bars.classList.add("in"); R.ml.classList.add("in"); });
      setTimeout(() => { if (L) L.rows.forEach((R) => { R.bars.classList.add("now"); R.ml.classList.add("now"); }); }, 2000);
    }
    V.onVisible(root, intro, { threshold: 0.3 });
    return function finish() {
      revealed = true;
      cancelAnimationFrame(anim); anim = 0;
      shown = BITS.map((b) => MS[mi].cells[b].share.slice());
      med = BITS.map((b) => MS[mi].cells[b].p50);
      if (L) {
        L.rows.forEach((R) => { R.bars.classList.add("in", "now"); R.ml.classList.add("in", "now"); });
        renderBars(); renderMed();
      }
      setHover(null);
      pills.set(mi, false);
    };
  }

  // ================================================================ Figure 11 — per-projection reduction, init (left) / trained (right)
  function fig11(root, D) {
    const F = D.fig11, P = F.proj, BITS = F.bits, C = F.colors, NP = P.length;
    const VAR = [["init", "at initialization"], ["trained", "after training"]];
    let focus = "all", hp = null, revealed = reduce;

    root.textContent = "";
    root.classList.add("rw2", "rw2-f11");
    const ctl = h("div", { class: "rw2-ctl rw2-ctl-row" }, root);
    V.pills(ctl, [{ value: "all", label: "All" }].concat(BITS.map((b) => ({ value: b, label: '<i class="rw2-sw" style="background:' + C[b] + '"></i>' + b }))),
      "all", (v) => { focus = v; render(); }, "bit width");
    const plot = h("div", { class: "rw2-plot", tabindex: "0", role: "group",
      "aria-label": "median reduction in loss-aware reconstruction error relative to Standard QAT per projection type, " + F.model + "; left and right arrow keys step through projections" }, root);
    const live = h("div", { class: "sr-only", "aria-live": "polite" }, root);
    let L = null;

    function draw(width) {
      const stacked = width < 620;
      const m = { l: 64, r: 6, t: 50, b: 30 };
      const gap = stacked ? 0 : 26;
      const ph = stacked ? 196 : 236;
      const pw = stacked ? width - m.l - m.r : (width - m.l - m.r - gap) / 2;
      const height = stacked ? 2 * (m.t + ph + m.b) + 14 : m.t + ph + m.b;
      const svg = svgIn(plot, width, height, "Median reduction vs Standard QAT by projection, at initialization and after training");
      const sy = V.lin([0, 100], [ph, 0]);
      const slot = pw / NP, bw = slot * 0.25;
      const panels = VAR.map(([key, title], j) => {
        const x0 = m.l + (stacked ? 0 : j * (pw + gap)), y0 = stacked ? m.t + j * (m.t + ph + m.b + 14) : m.t;
        const g = el("g", { transform: `translate(${x0},${y0})` }, svg);
        el("text", { class: "rw2-ptitle", x: pw / 2, y: -34, "text-anchor": "middle" }, g).textContent = title;
        const gr = el("g", { class: "rw2-grid" }, g), ax = el("g", { class: "rw2-axis" }, g);
        for (const t of [0, 25, 50, 75, 100]) {
          if (t) el("line", { x1: 0, x2: pw, y1: sy(t), y2: sy(t) }, gr);
          if (j === 0 || stacked) el("text", { x: -8, y: sy(t) + 4, "text-anchor": "end" }, ax).textContent = String(t);
        }
        el("line", { x1: 0, x2: pw, y1: ph, y2: ph, class: "rw2-base" }, ax);
        const xl = P.map((p, i) => {
          const t = el("text", { x: slot * (i + 0.5), y: ph + 18, "text-anchor": "middle", class: "rw2-xl" }, ax);
          t.textContent = p;
          return t;
        });
        if (j === 0 || stacked) {
          const yt = el("text", { class: "rw2-at", transform: `translate(${-m.l + 12},${ph / 2}) rotate(-90)`, "text-anchor": "middle" }, g);
          el("tspan", { x: 0, dy: "-0.1em" }, yt).textContent = "reduction vs";
          el("tspan", { x: 0, dy: "1.25em" }, yt).textContent = "Standard QAT (%)";
        }
        const barsG = el("g", { class: "rw2-bars" + (revealed ? " in now" : "") }, g);
        const bars = P.map((p, i) => BITS.map((b, k) => {
          const v = F[key][b][i], cx = slot * (i + 0.5) + (k - 1) * 0.27 * slot;
          const r = el("rect", { x: cx - bw / 2, y: sy(Math.max(0, v)), width: bw, height: Math.abs(sy(v) - sy(0)), fill: C[b], class: "rw2-vbar" }, barsG);
          r.style.transitionDelay = (reduce ? 0 : 120 + j * 380 + i * 55 + k * 18) + "ms";
          return { r, v, cx, i, k, b };
        }));
        const ghost = el("g", { class: "rw2-ghost" }, g);
        const vals = el("g", { class: "rw2-vals" }, g);
        const vrow = el("g", { class: "rw2-vrow", transform: `translate(0,-13)` }, g);
        const hit = el("g", null, g);
        P.forEach((p, i) => el("rect", { x: slot * i, y: -6, width: slot, height: ph + 26, fill: "transparent", class: "rw2-hit" }, hit));
        return { key, g, x0, y0, bars, ghost, vals, vrow, hit, barsG, xl };
      });
      L = { svg, panels, sy, slot, bw, ph, pw, m, stacked };
      panels.forEach((Pn) => bindPointer(Pn.hit, {
        move(e) { setHover(projAt(Pn, e)); },
        tap(e) { setHover(projAt(Pn, e)); },
        off() { setHover(null); },
      }));
      render();
    }
    function projAt(Pn, e) {
      const x = localXY(L.svg, e)[0] - Pn.x0;
      return clamp(Math.floor(x / L.slot), 0, NP - 1);
    }
    // the selected projection's three values, in a row above each panel (never covers a bar)
    function valueRow(Pn) {
      Pn.vrow.textContent = "";
      if (hp == null) return;
      const items = [];
      const head = el("text", { class: "rw2-vhead", y: 0 }, Pn.vrow);
      head.textContent = P[hp] + "_proj";
      items.push({ n: head, w: head.getComputedTextLength(), gap: 14 });
      BITS.forEach((b) => {
        const sw = el("rect", { y: -9, width: 9, height: 9, rx: 2, fill: C[b] }, Pn.vrow);
        items.push({ n: sw, w: 9, gap: 5, rect: true });
        const t = el("text", { class: "rw2-vnum" + (focus !== "all" && b !== focus ? " off" : ""), y: 0 }, Pn.vrow);
        t.textContent = F[Pn.key][b][hp].toFixed(1) + "%";
        items.push({ n: t, w: t.getComputedTextLength(), gap: 12 });
      });
      const total = items.reduce((a, it, k) => a + it.w + (k < items.length - 1 ? it.gap : 0), 0);
      let x = clamp(L.pw / 2 - total / 2, -L.m.l + 4, L.pw - total);
      for (const it of items) { it.n.setAttribute("x", x); x += it.w + it.gap; }
    }
    function render() {
      if (!L) return;
      const { panels, sy } = L;
      panels.forEach((Pn, j) => {
        Pn.vals.textContent = ""; Pn.ghost.textContent = "";
        Pn.bars.forEach((row) => row.forEach((B) => {
          const off = focus !== "all" && B.b !== focus;
          const dim = hp != null && B.i !== hp;
          B.r.style.opacity = off ? 0.16 : dim ? 0.3 : 1;
        }));
        Pn.xl.forEach((t, i) => t.classList.toggle("on", hp === i));
        // value labels for the focused bit width
        if (focus !== "all") {
          Pn.bars.forEach((row) => {
            const B = row[BITS.indexOf(focus)];
            const t = el("text", { x: B.cx, y: sy(Math.max(0, B.v)) - 5, "text-anchor": "middle", class: "rw2-val" + (hp != null && B.i !== hp ? " dim" : "") }, Pn.vals);
            t.textContent = B.v.toFixed(1);
          });
        }
        // after training: the selected projection's values at initialization, as dashed outlines
        if (j === 1 && hp != null) {
          BITS.forEach((b, k) => {
            if (focus !== "all" && b !== focus) return;
            const v0 = F.init[b][hp], B = Pn.bars[hp][k];
            el("rect", { x: B.cx - L.bw / 2, y: sy(v0), width: L.bw, height: Math.max(0, sy(0) - sy(v0)), class: "rw2-ghostr" }, Pn.ghost);
          });
        }
        valueRow(Pn);
      });
    }
    function setHover(i) {
      if (i === hp) return;
      hp = i;
      render();
      live.textContent = i == null ? "" : P[i] + "_proj: " + BITS.map((b) => b + " " + F.init[b][i].toFixed(1) + "% at initialization, " + F.trained[b][i].toFixed(1) + "% after training").join("; ");
    }
    plot.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { setHover(null); return; }
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      let i = hp == null ? -1 : hp;
      if (e.key === "ArrowLeft") i = i < 0 ? NP - 1 : i - 1; else if (e.key === "ArrowRight") i++; else if (e.key === "Home") i = 0; else i = NP - 1;
      setHover(clamp(i, 0, NP - 1));
    });
    plot.addEventListener("blur", () => setHover(null));
    outsideTap(plot, () => setHover(null));
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => { if (hp != null) render(); });

    V.responsive(plot, draw);
    function intro() {
      if (revealed || !L) return;
      revealed = true;
      L.panels.forEach((Pn) => Pn.barsG.classList.add("in"));
      setTimeout(() => { if (L) L.panels.forEach((Pn) => Pn.barsG.classList.add("now")); }, 1700);
    }
    V.onVisible(root, intro, { threshold: 0.3 });
    return function finish() {
      revealed = true;
      if (L) L.panels.forEach((Pn) => Pn.barsG.classList.add("in", "now"));
      setHover(null);
    };
  }

  // ================================================================ boot
  // Each figure fetches + draws once it comes within 800px of the viewport; printing mounts anything pending,
  // then forces every figure to its final drawn state.
  const pending = [], finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "rw2-fail", "data-label": "" }, node, "— data unavailable —");
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
        .catch((err) => { if (window.console) console.error("[ix-realw2] " + id, err); fail(node); });
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
    mount("ix-fig6", fig6);
    mount("ix-fig7", fig7);
    mount("ix-fig11", fig11);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
