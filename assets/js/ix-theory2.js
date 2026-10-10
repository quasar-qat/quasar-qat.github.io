/* ix-theory2.js — interactive appendix figures, theory validation (training dynamics).
   Mounts: #ix-fig16 (PL relation), #ix-fig17 (Theorem 1 bound terms), #ix-fig18 (plain SGD, INT2).
   Data:   assets/data/ix-theory2.json, written by tools/extract_ix_theory2.py from the paper's own
           figure generators (arXiv 2608.13966v2 Figs. 16, 17, 18). Every number comes from there.
   Renders data labels only (no prose). Needs window.Viz (viz.js). */
(function () {
  "use strict";
  const V = window.Viz;
  if (!V) return;

  const SRC = document.currentScript ? document.currentScript.src : "";
  const DATA = SRC ? new URL("../data/ix-theory2.json", SRC).href : "assets/data/ix-theory2.json";
  const el = V.el, h = V.h, reduce = V.reducedMotion;
  const ROSE = "#D1495B", ROSE_T = "#A13040", INK = "#1D1F22";
  const COL = { quasar: ROSE, denoising_qat: V.C.denoising_qat, standard_qat: V.C.standard_qat };
  const TXT = { quasar: ROSE_T, denoising_qat: "#6E5279", standard_qat: "#3F4245" };  // text-safe tints
  let UID = 0;

  // ---------------------------------------------------------------- formatting
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const pow10 = (e) => "10" + String(e).split("").map((c) => SUP[c]).join("");
  function sci(v, digits, times) {
    let e = Math.floor(Math.log10(Math.abs(v)) + 1e-9);
    let mm = +(v / Math.pow(10, e)).toPrecision(digits || 3);
    if (mm >= 10) { mm = +(mm / 10).toPrecision(digits || 3); e += 1; }
    return mm === 1 ? pow10(e) : mm + (times ? "×" : "·") + pow10(e);
  }
  const lrText = (lr) => sci(lr, 2, true);
  const thousands = (n) => Math.round(n).toLocaleString("en-US");
  // losses at the paper's precision: 3 decimals below 1, 2 below 10, 1 above
  function loss(v) {
    if (v == null || !isFinite(v)) return "–";
    const a = Math.abs(v);
    return a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
  }
  function sig3(v) {
    if (!isFinite(v)) return "–";
    const d = clamp(2 - Math.floor(Math.log10(Math.abs(v)) + 1e-9), 0, 6);
    return v.toFixed(d);
  }
  const M = (s) => '<i class="t2-m">' + s + "</i>";  // math in HTML (Newsreader italic, never uppercased)
  // SVG text with math runs: parts = [["LOSS GAP "], ["L(r) − L*", 1]]
  function rich(t, parts) {
    t.textContent = "";
    for (const p of parts) { const s = el("tspan", p[1] ? { class: "t2-m" } : null, t); s.textContent = p[0]; }
    return t;
  }
  function tipHTML(head, rows, color) {
    let s = '<div class="tt">' + (color ? '<i class="t2-k" style="background:' + color + '"></i>' : "") + head + "</div>";
    for (const r of rows) {
      if (r.sep) { s += '<div class="t2-sep">' + r.sep + "</div>"; continue; }
      s += '<div class="row t2-row' + (r.q ? " q" : "") + (r.strong ? " s" : "") + '"><span class="t2-n">' +
        (r.color ? '<i class="t2-k" style="background:' + r.color + '"></i>' : "") + r.label + "</span><b>" + esc(r.value) + "</b></div>";
    }
    return s;
  }
  function srTable(node, head, rows) {
    node.innerHTML = "<thead><tr>" + head.map((x) => "<th>" + esc(x) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((x, i) => (i ? "<td>" : '<th scope="row">') + esc(x) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</tbody>";
  }
  function whenFonts(cb) { if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(cb); }
  function kickerName(root) {
    const card = root.closest(".viz"), k = card && card.querySelector(".viz-kicker");
    return k ? k.textContent.split("·")[0].trim() : "";
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

  // Pointer input on a chart overlay. Mouse (and a hovering pen) tracks the pointer. Touch shows values on a
  // tap (< 10 px of travel) or a horizontal scrub; a vertical swipe stays a page scroll, and the pointercancel
  // the browser sends when it takes the gesture over clears the hover state.
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
  function outsideTap(node, fn) {
    document.addEventListener("pointerdown", (e) => { if (!node.contains(e.target)) fn(); }, { passive: true });
  }
  const local = (e, node) => { const r = node.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  // Range slider (role=slider). Mouse drags; touch moves it only on a tap or a horizontal drag, so a vertical
  // swipe that starts on it scrolls the page and leaves the value alone. Keys: arrows, PageUp/PageDown, Home/End.
  function slider(parent, o) {
    const wrap = h("div", { class: "t2-slider", role: "slider", tabindex: "0", "aria-label": o.label,
      "aria-valuemin": o.min, "aria-valuemax": o.max }, parent);
    const track = h("div", { class: "t2-track" }, wrap);
    const fill = h("div", { class: "t2-fill" }, track);
    const thumb = h("div", { class: "t2-thumb" }, track);
    let val = o.value, t0 = null, drag = false;
    const fromX = (cx) => {
      const r = track.getBoundingClientRect();
      return Math.round(o.min + clamp((cx - r.left) / (r.width || 1), 0, 1) * (o.max - o.min));
    };
    const api = {
      node: wrap,
      get: () => val,
      set(v, fire) {
        val = clamp(Math.round(v), o.min, o.max);
        const f = (val - o.min) / (o.max - o.min || 1);
        fill.style.width = (f * 100).toFixed(3) + "%";
        thumb.style.left = (f * 100).toFixed(3) + "%";
        wrap.setAttribute("aria-valuenow", val);
        wrap.setAttribute("aria-valuetext", o.text ? o.text(val) : String(val));
        if (fire && o.onInput) o.onInput(val);
      },
    };
    wrap.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        drag = true; wrap.setPointerCapture(e.pointerId); api.set(fromX(e.clientX), true); e.preventDefault(); wrap.focus();
        return;
      }
      t0 = [e.clientX, e.clientY]; drag = false;
    });
    wrap.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") { if (drag) api.set(fromX(e.clientX), true); return; }
      if (!t0) return;
      const dx = e.clientX - t0[0], dy = e.clientY - t0[1];
      if (!drag && Math.abs(dx) >= 6 && Math.abs(dx) > Math.abs(dy)) { drag = true; try { wrap.setPointerCapture(e.pointerId); } catch (_) { /* gone */ } }
      if (drag) api.set(fromX(e.clientX), true);
    });
    const end = (e) => {
      if (e.pointerType !== "mouse" && t0 && !drag && Math.hypot(e.clientX - t0[0], e.clientY - t0[1]) < 10) api.set(fromX(e.clientX), true);
      t0 = null; drag = false;
    };
    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", () => { t0 = null; drag = false; });
    wrap.addEventListener("keydown", (e) => {
      const s = o.step || 1, big = o.page || s * 10;
      const d = { ArrowRight: s, ArrowUp: s, ArrowLeft: -s, ArrowDown: -s, PageUp: big, PageDown: -big }[e.key];
      if (d !== undefined) { e.preventDefault(); api.set(val + d, true); }
      else if (e.key === "Home") { e.preventDefault(); api.set(o.min, true); }
      else if (e.key === "End") { e.preventDefault(); api.set(o.max, true); }
    });
    api.set(val, false);
    return api;
  }

  const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4L13 8z" fill="currentColor"/></svg>';
  const PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.6" y="2.8" width="3" height="10.4" rx=".8" fill="currentColor"/><rect x="9.4" y="2.8" width="3" height="10.4" rx=".8" fill="currentColor"/></svg>';

  const tickFmt = (v) => {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1) return String(+v.toFixed(2));
    return String(+v.toPrecision(2));
  };

  // ================================================================ Fig. 16 · PL relation
  function fig16(root, D) {
    const F = D.fig16;
    const KEYS = F.order;                        // legend order (QUASAR first)
    const DRAW = KEYS.slice().reverse();         // QUASAR drawn last, on top
    const T0 = F.steps[0], T1 = F.steps[1], WIN = 320;
    const st = { t: reduce ? T1 : T0, vis: {}, hl: null };
    KEYS.forEach((k) => (st.vis[k] = true));
    root.classList.add("t2", "t2-f16");
    const name = kickerName(root);

    // method toggles (they are the legend)
    const ctl = h("div", { class: "t2-ctl" }, root);
    const chipRow = h("div", { class: "t2-chips", role: "group", "aria-label": "methods" }, ctl);
    const chips = {};
    for (const k of KEYS) {
      const b = h("button", { type: "button", class: "t2-chip" + (k === "quasar" ? " q" : ""), "aria-pressed": "true" }, chipRow,
        '<i class="t2-dot" style="background:' + COL[k] + '"></i><span>' + esc(F.arms[k].label) + "</span>");
      b.addEventListener("click", () => toggle(k));
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") highlight(k); });
      b.addEventListener("pointerleave", () => highlight(null));
      b.addEventListener("focus", () => { if (b.matches(":focus-visible")) highlight(k); });
      b.addEventListener("blur", () => highlight(null));
      chips[k] = b;
    }
    const plot = h("div", { class: "t2-plot" }, root);
    const tip = V.tooltip(plot);
    const keyRow = h("div", { class: "t2-legend t2-keyrow", "aria-hidden": "true" }, root,
      '<span class="t2-li"><svg viewBox="0 0 22 10" width="22" height="10"><line x1="1" x2="21" y1="5" y2="5" class="t2-fitkey"/></svg><span class="t2-lm">' +
      M("‖∇L(r)‖² = 2μ̂ (L(r) − L*)") + "</span></span>");
    // step scrubber
    const scr = h("div", { class: "t2-scrub" }, root);
    const playBtn = h("button", { type: "button", class: "t2-play", "aria-label": "Play" }, scr, PLAY);
    h("span", { class: "t2-lab", "aria-hidden": "true" }, scr, "step");
    const sl = slider(scr, { min: T0, max: T1, value: st.t, step: 32, page: 256, label: "training step",
      text: (v) => "steps " + thousands(T0) + " to " + thousands(v), onInput: (v) => { revealed = true; stop(); st.t = v; unhover(); updatePts(); } });
    const read = h("span", { class: "t2-read", "aria-hidden": "true" }, scr);
    const sr = h("table", null, h("div", { class: "sr-only" }, root));
    srTable(sr, ["method", "fitted μ̂", "steps used"], KEYS.map((k) => [F.arms[k].label, F.arms[k].mu.toFixed(2), thousands(F.arms[k].n_steps)]));

    const P = [];
    for (const k of DRAW) for (const p of F.arms[k].pts) P.push({ k, s: p[0], x: p[1], y: p[2], c: -1 });
    let sk = null, playing = false, raf = 0, revealed = reduce;

    function draw(width) {
      const narrow = width < 480;
      const height = Math.round(clamp(width * 0.68, 268, 330));
      const m = { t: 30, r: narrow ? 52 : 60, b: 46, l: 38 };
      const fr = V.frame(plot, width, height, m);
      const { svg, g, W, H } = fr;
      svg.setAttribute("aria-label", (name ? name + ": " : "") + "squared gradient norm against loss gap above the trajectory minimum, log-log, " +
        KEYS.map((k) => F.arms[k].label + " μ̂ " + F.arms[k].mu.toFixed(2)).join(", "));
      const id = "t2p" + ++UID;
      const sx = V.log(F.xlim, [0, W]), sy = V.log(F.ylim, [H, 0]);
      V.axisLeft(g, sy, W, { ticks: F.yticks, fmt: tickFmt });
      V.axisBottom(g, sx, H, { ticks: F.xticks, fmt: tickFmt });
      rich(el("text", { class: "axis-title", x: W / 2, y: H + 37, "text-anchor": "middle" }, g),
        width < 400 ? [["loss gap "], ["L(r) − L*", 1]] : [["loss gap to trajectory minimum "], ["L(r) − L*", 1]]);
      rich(el("text", { class: "axis-title", x: -m.l, y: -17 }, g), [["squared gradient norm "], ["‖∇L(r)‖²", 1]]);
      el("rect", { x: 0, y: 0, width: W, height: H }, el("clipPath", { id: id + "c" }, el("defs", null, svg)));
      // key for the dashed fits (the paper's legend line)
      keyRow.classList.toggle("on", narrow);
      const key = el("g", { class: "t2-key", transform: "translate(8,10)", display: narrow ? "none" : null }, g);
      el("line", { x1: 0, x2: 18, y1: 0, y2: 0, class: "t2-fitkey" }, key);
      rich(el("text", { x: 24, y: 4 }, key), [["‖∇L(r)‖² = 2μ̂ (L(r) − L*)", 1]]);
      const gData = el("g", { "clip-path": `url(#${id}c)` }, g);
      const gArm = {}, fit = {}, fitHit = {};
      for (const k of DRAW) {
        const a = F.arms[k];
        gArm[k] = el("g", { class: "t2-arm", fill: COL[k] }, gData);
        const gx = a.fit_x;
        fit[k] = el("line", { x1: sx(gx[0]), y1: sy(2 * a.mu * gx[0]), x2: sx(gx[1]), y2: sy(2 * a.mu * gx[1]),
          stroke: COL[k], class: "t2-fit" + (k === "quasar" ? " q" : "") }, gData);
        fitHit[k] = [sx(gx[0]), sy(2 * a.mu * gx[0]), sx(gx[1]), sy(2 * a.mu * gx[1])];
      }
      for (const p of P) {
        p.px = sx(p.x); p.py = sy(p.y); p.c = -1;
        p.node = el("circle", { cx: p.px.toFixed(1), cy: p.py.toFixed(1), r: narrow ? 2.1 : 2.4 }, gArm[p.k]);
      }
      for (const k of DRAW) gData.appendChild(fit[k]);  // fits above the points
      // μ̂ at each fit's upper end (baselines dodge each other)
      const gMu = el("g", null, g), mu = {};
      const items = DRAW.map((k) => ({ k, x: fitHit[k][2], y: fitHit[k][3] }));
      V.dodge(items.filter((it) => it.k !== "quasar"), 15, 8, H - 4);
      for (const it of items) {
        const a = F.arms[it.k], ly = it.ly == null ? it.y : it.ly;
        const t = el("text", { x: it.x + 6, y: ly + 4, class: "t2-mu" + (it.k === "quasar" ? " q" : ""), fill: TXT[it.k] }, gMu);
        rich(t, [["μ̂", 1], [" = " + a.mu.toFixed(2)]]);
        mu[it.k] = t;
      }
      const gHov = el("g", { "pointer-events": "none" }, g);
      const ring = el("circle", { r: 5.5, class: "t2-ring", visibility: "hidden" }, gHov);
      const ov = el("rect", { class: "t2-ov pts", x: 0, y: 0, width: W, height: H, fill: "transparent" }, g);
      sk = { W, H, sx, sy, gArm, fit, fitHit, mu, ring, ov, narrow };
      bindOverlay(ov, hover, unhover);
      paint();
    }

    const hlOn = () => (st.hl && st.vis[st.hl] ? st.hl : null);
    function shown(k) { const x = hlOn(); return st.vis[k] && (!x || x === k); }
    function hover(e) {
      if (!sk) return;
      const [px, py] = local(e, sk.ov);
      const lim = e.pointerType === "mouse" ? 14 : 22;
      let best = null, bd = lim * lim;
      for (const p of P) {
        if (p.s > st.t || !shown(p.k)) continue;
        const d = (p.px - px) * (p.px - px) + (p.py - py) * (p.py - py);
        if (d < bd || (d === bd && p.k === "quasar")) { bd = d; best = p; }
      }
      if (best) {
        const a = F.arms[best.k];
        sk.ring.setAttribute("cx", best.px); sk.ring.setAttribute("cy", best.py);
        sk.ring.setAttribute("stroke", COL[best.k]); sk.ring.setAttribute("visibility", "visible");
        tip.show(best.px + sk.ov.getBoundingClientRect().left - plot.getBoundingClientRect().left,
          best.py + sk.ov.getBoundingClientRect().top - plot.getBoundingClientRect().top,
          tipHTML(esc(a.label) + " · step " + thousands(best.s), [
            { label: M("L") + "(" + M("r") + ") − " + M("L") + "*", value: sig3(best.x) },
            { label: "‖∇" + M("L") + "(" + M("r") + ")‖²", value: sig3(best.y) },
          ], COL[best.k]));
        return;
      }
      // near a fitted line?
      for (const k of KEYS) {
        if (!shown(k)) continue;
        const [x1, y1, x2, y2] = sk.fitHit[k];
        const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2, u = clamp(((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / L2, 0, 1);
        const qx = x1 + u * (x2 - x1), qy = y1 + u * (y2 - y1);
        if (Math.hypot(px - qx, py - qy) <= 6) {
          sk.ring.setAttribute("visibility", "hidden");
          const a = F.arms[k], rows = [{ label: M("μ̂"), value: a.mu.toFixed(2), q: k === "quasar" }];
          if (k === "quasar") for (const b of KEYS) if (b !== "quasar") rows.push({ label: "÷ " + esc(F.arms[b].label), value: (a.mu / F.arms[b].mu).toFixed(1) + "×" });
          const o = sk.ov.getBoundingClientRect(), pr = plot.getBoundingClientRect();
          tip.show(qx + o.left - pr.left, qy + o.top - pr.top, tipHTML(esc(a.label) + " · fit", rows, COL[k]));
          return;
        }
      }
      unhover();
    }
    function unhover() { if (sk) sk.ring.setAttribute("visibility", "hidden"); tip.hide(); }
    outsideTap(root, unhover);

    function paint() {
      if (!sk) return;
      const x = hlOn();
      for (const k of KEYS) {
        const on = st.vis[k], dim = !!x && x !== k;
        for (const n of [sk.gArm[k], sk.fit[k], sk.mu[k]]) { n.style.display = on ? "" : "none"; n.classList.toggle("dim", dim); }
        chips[k].setAttribute("aria-pressed", String(on));
        chips[k].classList.toggle("hl", x === k);
      }
      updatePts();
    }
    const CLS = ["t2-p g", "t2-p", "t2-p r"];
    function updatePts() {
      const t = st.t, live = t < T1;
      if (sk) for (const p of P) {
        const c = p.s > t ? 0 : live && p.s > t - WIN ? 2 : 1;
        if (c !== p.c) { p.c = c; p.node.setAttribute("class", CLS[c]); }
      }
      sl.set(t, false);
      read.textContent = thousands(t);
    }
    function highlight(k) { st.hl = k; paint(); if (k) unhover(); }
    function toggle(k) {
      const n = KEYS.filter((x) => st.vis[x]).length;
      if (st.vis[k] && n === 1) KEYS.forEach((x) => (st.vis[x] = true));
      else st.vis[k] = !st.vis[k];
      if (!st.vis[k]) st.hl = null;
      unhover(); paint();
    }
    function setPlay(on) {
      playing = on;
      playBtn.innerHTML = on ? PAUSE : PLAY;
      playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
      playBtn.classList.toggle("on", on);
    }
    function play(ms) {
      if (st.t >= T1) st.t = T0;
      const s0 = st.t, dur = (ms || 4200) * (T1 - s0) / (T1 - T0), a = performance.now();
      setPlay(true);
      cancelAnimationFrame(raf);
      const stepf = (now) => {
        if (!playing) return;
        const u = Math.min(1, (now - a) / Math.max(1, dur));
        st.t = Math.round(s0 + (T1 - s0) * u);
        updatePts();
        if (u < 1) raf = requestAnimationFrame(stepf); else setPlay(false);
      };
      raf = requestAnimationFrame(stepf);
    }
    function stop() { if (playing) { cancelAnimationFrame(raf); setPlay(false); } }
    playBtn.addEventListener("click", () => { if (playing) stop(); else { revealed = true; play(); } });

    const resp = V.responsive(plot, draw);
    whenFonts(() => resp.redraw());
    V.onVisible(root, () => { if (revealed) return; revealed = true; play(3600); }, { threshold: 0.4 });
    return function finish() { revealed = true; stop(); st.t = T1; unhover(); updatePts(); };
  }

  // ================================================================ Fig. 17 · Theorem 1 bound terms
  function fig17(root, D) {
    const B = D.fig17, I = B.inputs, TERMS = B.terms, MEAS = "#3F4245";
    const name = kickerName(root);
    let mode = "abs", hl = null, revealed = reduce, mix = 1, from = "abs";
    root.classList.add("t2", "t2-f17");
    const ctl = h("div", { class: "t2-ctl" }, root);
    const pills = V.pills(ctl, [{ value: "abs", label: "absolute" }, { value: "share", label: "share of bound" }], mode, (v) => setMode(v), "scale");
    const plot = h("div", { class: "t2-plot" }, root);
    const tip = V.tooltip(root);
    const eq = h("div", { class: "t2-eq" }, root);
    const sr = h("table", null, h("div", { class: "sr-only" }, root));
    srTable(sr, ["quantity", "value", "share of bound"], TERMS.map((t) => [t.label, t.value.toFixed(1), Math.round(100 * t.value / B.total) + "%"])
      .concat([["Theorem 1 bound", B.total.toFixed(1), "100%"], ["measured in training", B.measured.toFixed(1), (B.ratio).toFixed(1) + "× below the bound"]]));

    // formulas of Theorem 1(i), one per term (labels only)
    const FORM = {
      init: '<span class="t2-frac"><span>2(' + M("L") + "(" + M("w") + "<sub>0</sub>) − " + M("L") + '*)</span><span>' + M("ηT") + "</span></span>",
      noise: M("Lησ") + "²",
      recon: M("C") + ' <span class="t2-frac"><span>1</span><span>' + M("T") + "</span></span>" + " Σ<sub>" + M("t") + "</sub> " + M("Ŝ") + "<sub>" + M("t") + "</sub>",
    };
    const termEls = {};
    TERMS.forEach((t, i) => {
      if (i) h("span", { class: "t2-op", "aria-hidden": "true" }, eq, "+");
      const b = h("div", { class: "t2-term" + (t.key === "recon" ? " q" : ""), tabindex: "0", "data-k": t.key }, eq);
      h("span", { class: "t2-tn" }, b, '<i class="t2-sw" style="background:' + t.color + '"></i>' + esc(t.label));
      h("span", { class: "t2-tx" }, b, FORM[t.key]);
      termEls[t.key] = h("span", { class: "t2-tv" }, b);
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") focusTerm(t.key, b); });
      b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") clearFocus(); });
      b.addEventListener("focus", () => focusTerm(t.key, b));
      b.addEventListener("blur", clearFocus);
      b.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") focusTerm(t.key, b); });
    });
    outsideTap(root, clearFocus);

    const val = (v, md) => (md === "share" ? (100 * v) / B.total : v);
    // both scales put the bound's end at the same place: switching relabels the bars, it never resizes them
    const DOM = { abs: [0, 150], share: [0, (150 * 100) / B.total] };
    const TICKS = { abs: [0, 50, 100, 150], share: [0, 25, 50, 75, 100] };
    const lab = (v, md) => (md === "share" ? Math.round((100 * v) / B.total) + "%" : v.toFixed(1));
    let sk = null;

    function draw(width) {
      const narrow = width < 440;
      // beside the taller plain-SGD card: thicker bars and a wider row gap first, the rest split above the bars
      // and above the terms (so all of fill.extra is spent)
      const e = fill.extra, dBH = Math.min(10, e * 0.12), dGap = Math.min(24, e * 0.28);
      const rest = Math.max(0, e - 2 * dBH - dGap), above = Math.round(rest * 0.4);
      eq.style.marginTop = e ? (10 + rest - above).toFixed(1) + "px" : "";
      fill.used = e;
      const m = { t: 24 + above, r: 10, b: 46, l: 2 };
      const BH = (narrow ? 30 : 38) + dBH, Y1 = 6, Y2 = Y1 + BH + (narrow ? 54 : 60) + dGap, H = Y2 + BH + 16;
      const fr = V.frame(plot, width, m.t + H + m.b, m);
      const { svg, g, W } = fr;
      svg.setAttribute("aria-label", (name ? name + ": " : "") + "Theorem 1 bound " + B.total.toFixed(1) + " = initialization " +
        TERMS[0].value.toFixed(1) + " + noise " + TERMS[1].value.toFixed(1) + " + reconstruction " + TERMS[2].value.toFixed(1) +
        "; measured in training " + B.measured.toFixed(1) + "; ratio " + B.ratio.toFixed(1));
      const gGrid = el("g", { class: "grid" }, g), gAx = el("g", { class: "axis" }, g);
      el("line", { x1: 0, x2: W, y1: H, y2: H }, gAx);
      const xTitle = el("text", { class: "axis-title", x: W / 2, y: H + 37, "text-anchor": "middle" }, g);
      el("text", { class: "t2-rowlab", x: 0, y: Y1 - 8 }, g).textContent = "Theorem 1 bound";
      el("text", { class: "t2-rowlab", x: 0, y: Y2 - 8 }, g).textContent = "Measured in training";
      const segs = {}, slab = {};
      for (const t of TERMS) {
        segs[t.key] = el("rect", { y: Y1, height: BH, fill: t.color, class: "t2-seg" }, g);
      }
      const meas = el("rect", { y: Y2, height: BH, fill: MEAS, class: "t2-seg" }, g);
      for (const t of TERMS) slab[t.key] = el("text", { class: "t2-slab" + (t.key === "init" ? " dk" : ""), "text-anchor": "middle" }, g);
      const tot = el("text", { class: "t2-tot", y: Y1 + BH / 2 + 5 }, g);
      const mtx = el("text", { class: "t2-tot", y: Y2 + BH / 2 + 5 }, g);
      const br = el("path", { class: "t2-ratio-br" }, g);  // dimension line: measured end to bound end
      const ratio = el("text", { class: "t2-ratio", y: Y1 + BH + 27, "text-anchor": "middle" }, g);
      ratio.textContent = B.ratio.toFixed(1) + "×";
      const ov = el("rect", { class: "t2-ov pts", x: 0, y: Y1 - 20, width: W + m.r, height: Y2 + BH + 4 - (Y1 - 20), fill: "transparent" }, g);
      sk = { W, H, BH, Y1, Y2, gGrid, gAx, xTitle, segs, slab, meas, tot, mtx, ratio, br, ov, narrow };
      bindOverlay(ov, hover, unhoverPlot);
      layout();
    }

    function geom(md) {
      const sx = V.lin(DOM[md], [0, sk.W]);
      const out = { sx, seg: {} };
      let x = 0;
      for (const t of TERMS) { const w = val(t.value, md); out.seg[t.key] = [sx(x), sx(x + w)]; x += w; }
      out.total = sx(x); out.meas = sx(val(B.measured, md));
      return out;
    }
    function layout() {
      if (!sk) return;
      const A = geom(from), Bg = geom(mode), r = mix, L = (a, b) => a + (b - a) * r;
      // axis ticks: outgoing set fades over the first half, incoming over the second
      sk.gGrid.textContent = ""; [...sk.gAx.querySelectorAll(".t2-tick")].forEach((n) => n.remove());
      const tickSet = (md, alpha, sxA) => {
        if (alpha <= 0.001) return;
        for (const v of TICKS[md]) {
          const x = sxA(v);
          if (x > sk.W + 1) continue;
          el("line", { x1: x, x2: x, y1: sk.Y1 - 2, y2: sk.H, opacity: alpha }, sk.gGrid);
          const gt = el("g", { class: "t2-tick", opacity: alpha }, sk.gAx);
          el("line", { x1: x, x2: x, y1: sk.H, y2: sk.H + 4 }, gt);
          el("text", { x, y: sk.H + 17, "text-anchor": "middle" }, gt).textContent = md === "share" ? v + "%" : String(v);
        }
      };
      if (from !== mode && r < 1) {
        // ticks ride with the morphing scale: old ones fade out over the first half, new ones in over the second
        const conv = (v, a, b) => (a === b ? v : a === "abs" ? (v * 100) / B.total : (v * B.total) / 100);
        tickSet(from, clamp(1 - 2 * r, 0, 1), (v) => L(A.sx(v), Bg.sx(conv(v, from, mode))));
        tickSet(mode, clamp(2 * r - 1, 0, 1), (v) => L(A.sx(conv(v, mode, from)), Bg.sx(v)));
      } else tickSet(mode, 1, Bg.sx);
      sk.xTitle.textContent = mode === "share" ? "share of Theorem 1 bound" : "average squared gradient norm";
      for (const t of TERMS) {
        const x0 = L(A.seg[t.key][0], Bg.seg[t.key][0]), x1 = L(A.seg[t.key][1], Bg.seg[t.key][1]);
        const s = sk.segs[t.key];
        s.setAttribute("x", x0); s.setAttribute("width", Math.max(0, x1 - x0 - (t.key === "recon" ? 0 : 1)));
        const lt = sk.slab[t.key];
        lt.textContent = lab(t.value, r < 0.5 ? from : mode);
        const w = lt.getComputedTextLength ? lt.getComputedTextLength() : 24;
        if (w + 3 <= x1 - x0) { lt.setAttribute("x", (x0 + x1) / 2); lt.setAttribute("y", sk.Y1 + sk.BH / 2 + 4); lt.classList.remove("out"); }
        else { lt.setAttribute("x", Math.max(w / 2, (x0 + x1) / 2)); lt.setAttribute("y", sk.Y1 + sk.BH + 15); lt.classList.add("out"); }
      }
      const tx = L(A.total, Bg.total), mx = L(A.meas, Bg.meas);
      sk.tot.setAttribute("x", tx + 7); sk.tot.textContent = r < 0.5 ? lab(B.total, from) : lab(B.total, mode);
      sk.meas.setAttribute("x", 0); sk.meas.setAttribute("width", Math.max(0, mx));
      sk.mtx.setAttribute("x", mx + 7); sk.mtx.textContent = r < 0.5 ? lab(B.measured, from) : lab(B.measured, mode);
      const y0 = sk.Y1 + sk.BH + 12;
      sk.br.setAttribute("d", `M${mx},${y0 - 4}V${y0 + 4}M${mx},${y0}H${tx}M${tx},${y0 - 4}V${y0 + 4}`);
      sk.ratio.setAttribute("x", (mx + tx) / 2);
      for (const t of TERMS) termEls[t.key].textContent = lab(t.value, mode);
      applyHL();
    }
    function setMode(v) {
      if (v === mode) return;
      from = mode; mode = v;
      V.tween(520, (u) => { mix = u; layout(); }, () => { from = mode; mix = 1; layout(); });
    }

    function applyHL() {
      if (!sk) return;
      for (const t of TERMS) {
        const dim = hl && hl !== t.key;
        sk.segs[t.key].classList.toggle("dim", !!dim); sk.slab[t.key].classList.toggle("dim", !!dim);
        eq.querySelector('[data-k="' + t.key + '"]').classList.toggle("on", hl === t.key);
      }
      sk.meas.classList.toggle("dim", !!hl && hl !== "meas");
      sk.mtx.classList.toggle("dim", !!hl && hl !== "meas");
      eq.classList.toggle("hl", !!hl);
    }
    function termTip(k) {
      const t = TERMS.find((x) => x.key === k);
      const share = Math.round((100 * t.value) / B.total) + "%";
      let rows;
      if (k === "init") rows = [
        { label: M("L") + "(" + M("w") + "<sub>0</sub>)", value: I.loss_w0.toFixed(3) },
        { label: M("L") + "*", value: I.loss_star.toFixed(3) },
        { label: M("η"), value: sci(I.eta, 2) },
        { label: M("T"), value: thousands(I.T) },
      ];
      else if (k === "noise") rows = [
        { label: M("L") + " ≈ " + M("λ") + "<sub>max</sub>", value: I.lambda_max.toFixed(1) },
        { label: M("η"), value: sci(I.eta, 2) },
        { label: M("σ") + "²", value: I.sigma2.toFixed(1) },
      ];
      else rows = [
        { label: M("C"), value: sci(I.C, 2) },
        { label: '<span class="t2-frac sm"><span>1</span><span>' + M("T") + "</span></span> Σ<sub>" + M("t") + "</sub> " + M("Ŝ") + "<sub>" + M("t") + "</sub>", value: sci(I.S_bar, 3) },
      ];
      rows.push({ label: "term", value: t.value.toFixed(1), strong: true, q: k === "recon" }, { label: "share of bound", value: share });
      return tipHTML(esc(t.label), rows, t.color);
    }
    function measTip() {
      return tipHTML("measured in training", [
        { label: "steps", value: thousands(I.T) },
        { label: "avg. ‖∇" + M("L") + "‖²", value: B.measured.toFixed(1), strong: true },
        { label: "Theorem 1 bound", value: B.total.toFixed(1) },
        { label: "bound ÷ measured", value: B.ratio.toFixed(1) + "×" },
      ], MEAS);
    }
    function hover(e) {
      if (!sk) return;
      const [px, py] = local(e, sk.ov), y = py + sk.Y1 - 20;
      const Bg = geom(mode);
      let k = null, cx = px;
      if (y >= sk.Y1 - 4 && y <= sk.Y1 + sk.BH + 4) {
        for (const t of TERMS) { const [a, b] = Bg.seg[t.key]; if (px >= a && px <= b + 1) { k = t.key; cx = (a + b) / 2; } }
      } else if (y >= sk.Y2 - 4 && y <= sk.Y2 + sk.BH + 4 && px <= Bg.meas + 48) { k = "meas"; cx = Math.min(px, Bg.meas); }
      if (!k) { unhoverPlot(); return; }
      hl = k; applyHL();
      const o = sk.ov.getBoundingClientRect(), rr = root.getBoundingClientRect();
      const top = (k === "meas" ? sk.Y2 : sk.Y1) - (sk.Y1 - 20);
      tip.show(cx + o.left - rr.left, top + o.top - rr.top, k === "meas" ? measTip() : termTip(k));
    }
    function unhoverPlot() { hl = null; applyHL(); tip.hide(); }
    function focusTerm(k, node) {
      hl = k; applyHL();
      const r = node.getBoundingClientRect(), rr = root.getBoundingClientRect();
      tip.show(r.left - rr.left + r.width / 2, r.top - rr.top, termTip(k));
    }
    function clearFocus() { hl = null; applyHL(); tip.hide(); }

    const fill = pairFill(root, "ix-fig18", () => resp.redraw(), 160);
    const resp = V.responsive(plot, draw);
    whenFonts(() => resp.redraw());
    // first view: the bound builds term by term, then the measurement
    function intro() {
      if (revealed || !sk) return;
      revealed = true;
      const nodes = [sk.segs.init, sk.segs.noise, sk.segs.recon, sk.meas];
      nodes.forEach((n, i) => { n.style.transformBox = "fill-box"; n.style.transformOrigin = "left center"; n.style.transform = "scaleX(0)";
        n.getBoundingClientRect(); n.style.transition = `transform 520ms cubic-bezier(.3,.7,.2,1) ${i * 260}ms`; n.style.transform = "scaleX(1)"; });
      const labs = [sk.slab.init, sk.slab.noise, sk.slab.recon, sk.tot, sk.mtx, sk.ratio];
      labs.forEach((n) => { n.style.opacity = 0; });
      setTimeout(() => labs.forEach((n, i) => { n.style.transition = `opacity 360ms ease ${i < 3 ? i * 160 : 520 + (i - 3) * 200}ms`; n.style.opacity = ""; }), 520);
    }
    V.onVisible(root, intro, { threshold: 0.45 });
    return function finish() {
      revealed = true;
      if (!sk) return;
      for (const n of [sk.segs.init, sk.segs.noise, sk.segs.recon, sk.meas]) { n.style.transition = "none"; n.style.transform = ""; }
      for (const n of [sk.slab.init, sk.slab.noise, sk.slab.recon, sk.tot, sk.mtx, sk.ratio]) { n.style.transition = "none"; n.style.opacity = ""; }
      clearFocus();
    };
  }

  // ================================================================ Fig. 18 · plain SGD at INT2
  function fig18(root, D) {
    const G = D.fig18, ORDER = G.order;            // Standard QAT first, QUASAR on top
    const name = kickerName(root);
    const SCOL = { quasar: ROSE, standard_qat: V.C.standard_qat };
    let lr = G.lrs.includes("0.001") ? "0.001" : G.lrs[0], hl = null, revealed = reduce;
    let cur = cellArrays(lr);
    root.classList.add("t2", "t2-f18");
    const ctl = h("div", { class: "t2-ctl" }, root);
    const grp = h("div", { class: "t2-cg" }, ctl);
    h("span", { class: "t2-lab", "aria-hidden": "true" }, grp, '<span class="t2-long">learning rate </span>' + M("η"));
    V.pills(grp, G.lrs.map((k) => ({ value: k, label: lrText(G.cells[k].lr) })), lr, (v) => setLR(v), "learning rate");
    const leg = h("div", { class: "t2-legend" }, root);
    const legItems = {};
    for (const k of ORDER.slice().reverse()) {
      const it = h("span", { class: "t2-li" + (k === "quasar" ? " q" : ""), "data-k": k }, leg,
        '<svg viewBox="0 0 22 10" width="22" height="10" aria-hidden="true"><line x1="1" x2="21" y1="5" y2="5" stroke="' + SCOL[k] + '" stroke-width="' + (k === "quasar" ? 2.6 : 1.6) + '" stroke-linecap="round"/><circle cx="11" cy="5" r="2.6" fill="' + SCOL[k] + '"/></svg>' + esc(G.labels[k]));
      it.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { hl = k; applyHL(); } });
      it.addEventListener("pointerleave", () => { hl = null; applyHL(); });
      legItems[k] = it;
    }
    const plot = h("div", { class: "t2-plot", tabindex: "0" }, root);
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-label", (name ? name + " chart" : "Chart") + ", use left and right arrow keys to step through held-out evaluations");
    const tip = V.tooltip(plot);
    const sr = h("table", null, h("div", { class: "sr-only" }, root));
    srTable(sr, ["learning rate", "method", "final train loss", "final held-out loss"],
      G.lrs.flatMap((k) => ORDER.map((a) => [lrText(G.cells[k].lr), G.labels[a], loss(G.cells[k][a].train.at(-1)), loss(G.cells[k][a].eval.at(-1)[1])])));

    function cellArrays(k) {
      const c = G.cells[k];
      const o = { x: c.train_x };
      for (const a of ORDER) { o[a] = { train: c[a].train.slice(), eval: c[a].eval.map((p) => p[1]) }; }
      o.ex = c[ORDER[0]].eval.map((p) => p[0]);
      return o;
    }
    let sk = null, kbIdx = -1;

    function draw(width) {
      const narrow = width < 400;
      const PH = narrow ? 116 : 126, GAP = 46;
      const m = { t: 26, r: 50, b: 44, l: 36 };
      const H = PH * 2 + GAP;
      const fr = V.frame(plot, width, m.t + H + m.b, m);
      const { svg, g, W } = fr;
      svg.setAttribute("aria-label", (name ? name + ": " : "") + "training loss (top) and held-out loss (bottom) over 1,024 steps, Standard QAT and QUASAR, plain SGD at INT2");
      const id = "t2s" + ++UID;
      const defs = el("defs", null, svg);
      const sx = V.lin([0, 1024], [0, W]);
      const panels = [
        { key: "train", y0: 0, sy: V.lin(G.train_ylim, [PH, 0]), ticks: narrow ? [0, 5, 10] : [0, 2, 4, 6, 8, 10], title: "train loss" },
        { key: "eval", y0: PH + GAP, sy: V.lin(G.eval_ylim, [PH, 0]), ticks: [0, 2, 4, 6], title: "held-out loss" },
      ];
      for (const p of panels) {
        const pg = el("g", { transform: `translate(0,${p.y0})` }, g);
        p.g = pg;
        V.axisLeft(pg, p.sy, W, { ticks: p.ticks, fmt: String });
        el("text", { class: "axis-title", x: -m.l, y: -12 }, pg).textContent = p.title;
        if (p.key === "eval") V.axisBottom(pg, sx, PH, { ticks: [0, 256, 512, 768, 1024], fmt: (v) => thousands(v), title: "training step", titleY: 35 });
        else { const a = el("g", { class: "axis" }, pg); el("line", { x1: 0, x2: W, y1: PH, y2: PH }, a); for (const t of [0, 256, 512, 768, 1024]) el("line", { x1: sx(t), x2: sx(t), y1: PH, y2: PH + 4 }, a); }
        el("rect", { x: 0, y: -1, width: W, height: PH + 2 }, el("clipPath", { id: id + p.key }, defs));
        p.gd = el("g", { "clip-path": `url(#${id}${p.key})` }, pg);
        p.lines = {}; p.dots = {};
        for (const a of ORDER) {
          p.lines[a] = el("path", { fill: "none", stroke: SCOL[a], class: "t2-line" + (a === "quasar" ? " q" : ""), "stroke-linejoin": "round", "stroke-linecap": "round" }, p.gd);
          if (p.key === "eval") p.dots[a] = el("g", { fill: SCOL[a], class: "t2-mk" + (a === "quasar" ? " q" : "") }, p.gd);
        }
        p.gLab = el("g", null, pg);
        p.labs = {};
        for (const a of ORDER) p.labs[a] = el("text", { class: "t2-end" + (a === "quasar" ? " q" : ""), fill: a === "quasar" ? ROSE_T : "#3F4245", x: W + 7 }, p.gLab);
        p.gHov = el("g", { "pointer-events": "none", visibility: "hidden" }, pg);
        p.xh = el("line", { class: "t2-xh", y1: 0, y2: PH }, p.gHov);
        p.hd = {};
        for (const a of ORDER) p.hd[a] = el("circle", { r: a === "quasar" ? 4 : 3.4, fill: SCOL[a], class: "t2-hd" }, p.gHov);
      }
      const ov = el("rect", { class: "t2-ov", x: 0, y: -10, width: W, height: H + 10, fill: "transparent" }, g);
      sk = { W, PH, GAP, sx, panels, ov, narrow };
      bindOverlay(ov, hover, unhover);
      paint(cur);
      applyHL();
    }
    function paint(c) {
      if (!sk) return;
      const [pt, pe] = sk.panels;
      for (const a of ORDER) {
        pt.lines[a].setAttribute("d", V.linePath(c.x.map((x, i) => [x, c[a].train[i]]), sk.sx, pt.sy));
        pe.lines[a].setAttribute("d", V.linePath(c.ex.map((x, i) => [x, c[a].eval[i]]), sk.sx, pe.sy));
        const dg = pe.dots[a];
        while (dg.childNodes.length < c.ex.length) el("circle", { r: sk.narrow ? 2.4 : 2.7 }, dg);
        c.ex.forEach((x, i) => { const n = dg.childNodes[i]; n.setAttribute("cx", sk.sx(x).toFixed(1)); n.setAttribute("cy", pe.sy(c[a].eval[i]).toFixed(1)); });
      }
      // final values at the right edge
      for (const p of sk.panels) {
        const items = ORDER.map((a) => { const v = p.key === "train" ? c[a].train.at(-1) : c[a].eval.at(-1); return { a, v, y: p.sy(v) }; });
        V.dodge(items, 14, 4, sk.PH);
        for (const it of items) { const t = p.labs[it.a]; t.setAttribute("y", it.ly + 4); t.textContent = it.v.toFixed(2); }
      }
    }
    function setLR(v) {
      if (v === lr) return;
      const A = cur, Bc = cellArrays(v);
      lr = v;
      unhover();
      V.tween(560, (u) => {
        const mixd = { x: Bc.x, ex: Bc.ex };
        for (const a of ORDER) mixd[a] = { train: Bc[a].train.map((y, i) => A[a].train[i] + (y - A[a].train[i]) * u), eval: Bc[a].eval.map((y, i) => A[a].eval[i] + (y - A[a].eval[i]) * u) };
        paint(mixd);
      }, () => { cur = Bc; paint(cur); });
    }
    function applyHL() {
      if (!sk) return;
      for (const p of sk.panels) for (const a of ORDER) {
        const dim = !!hl && hl !== a;
        p.lines[a].classList.toggle("dim", dim); if (p.dots[a]) p.dots[a].classList.toggle("dim", dim); p.labs[a].classList.toggle("dim", dim);
      }
      for (const a of ORDER) legItems[a].classList.toggle("hl", hl === a);
    }
    const nearest = (arr, v) => { let bi = 0; for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[bi] - v)) bi = i; return bi; };
    function show(which, step) {
      const c = cur, [pt, pe] = sk.panels;
      const it = nearest(c.x, step), ie = nearest(c.ex, step);
      const xs = { train: c.x[it], eval: c.ex[ie] };
      for (const p of sk.panels) {
        const x = sk.sx(xs[p.key]);
        p.gHov.setAttribute("visibility", "visible");
        p.xh.setAttribute("x1", x); p.xh.setAttribute("x2", x);
        p.xh.classList.toggle("faint", p.key !== which);
        for (const a of ORDER) {
          const v = p.key === "train" ? c[a].train[it] : c[a].eval[ie];
          const n = p.hd[a];
          n.setAttribute("cx", x); n.setAttribute("cy", clamp(p.sy(v), -2, sk.PH + 2));
          n.setAttribute("visibility", p.sy(v) < -1 ? "hidden" : "inherit");
        }
      }
      const p = which === "train" ? pt : pe;
      const rows = ORDER.slice().reverse().map((a) => ({ label: esc(G.labels[a]), color: SCOL[a], q: a === "quasar",
        value: loss(which === "train" ? c[a].train[it] : c[a].eval[ie]) }));
      const head = (which === "train" ? "train · steps " + thousands(it ? c.x[it - 1] + 1 : 1) + "–" + thousands(c.x[it])
        : "held-out · step " + thousands(c.ex[ie])) + " · " + M("η") + " " + lrText(G.cells[lr].lr);
      const ys = ORDER.map((a) => p.sy(which === "train" ? c[a].train[it] : c[a].eval[ie]));
      const yTop = clamp(Math.min(...ys), 0, sk.PH);
      const o = sk.ov.getBoundingClientRect(), pr = plot.getBoundingClientRect();
      tip.show(sk.sx(xs[which]) + o.left - pr.left, p.y0 + yTop + 10 + o.top - pr.top, tipHTML(head, rows));
    }
    function hover(e) {
      if (!sk) return;
      const [px, py] = local(e, sk.ov), y = py - 10;
      const which = y < sk.PH + sk.GAP / 2 ? "train" : "eval";
      kbIdx = -1;
      show(which, clamp(sk.sx.invert(px), 0, 1024));
    }
    function unhover() { if (!sk) return; for (const p of sk.panels) p.gHov.setAttribute("visibility", "hidden"); tip.hide(); }
    outsideTap(root, unhover);
    plot.addEventListener("keydown", (e) => {
      if (!sk) return;
      const n = cur.ex.length;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        kbIdx = kbIdx < 0 ? (e.key === "ArrowRight" ? 0 : n - 1) : clamp(kbIdx + (e.key === "ArrowRight" ? 1 : -1), 0, n - 1);
        show("eval", cur.ex[kbIdx]);
      } else if (e.key === "Escape") { kbIdx = -1; unhover(); }
    });
    plot.addEventListener("blur", () => { kbIdx = -1; unhover(); });

    const resp = V.responsive(plot, draw);
    whenFonts(() => resp.redraw());
    function intro() {
      if (revealed || !sk) return;
      revealed = true;
      sk.panels.forEach((p, pi) => ORDER.forEach((a, ai) => V.drawIn(p.lines[a], 1100, pi * 160 + ai * 260)));
      const fades = sk.panels.flatMap((p) => [p.gLab].concat(p.dots.quasar ? [p.dots.quasar, p.dots.standard_qat] : []));
      fades.forEach((n) => { n.style.opacity = 0; n.getBoundingClientRect(); n.style.transition = "opacity 420ms ease 900ms"; n.style.opacity = ""; });
    }
    V.onVisible(root, intro, { threshold: 0.35 });
    return function finish() {
      revealed = true;
      if (!sk) return;
      for (const p of sk.panels) for (const a of ORDER) { const l = p.lines[a]; l.style.transition = "none"; l.style.strokeDasharray = ""; l.style.strokeDashoffset = ""; }
      for (const n of root.querySelectorAll(".t2-mk, .t2-plot g")) { n.style.transition = "none"; n.style.opacity = ""; }
      unhover();
    };
  }

  // ================================================================ boot
  // Each figure fetches + draws once it comes within 800px of the viewport. Printing first mounts anything
  // still pending, then forces every figure to its final drawn state.
  const pending = [], finals = [];
  let printing = false;
  function fail(node) {
    node.textContent = "";
    node.style.minHeight = "0";
    h("div", { class: "t2-fail", "data-label": "" }, node, "— data unavailable —");
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
        .catch((err) => { if (window.console) console.error("[ix-theory2] " + id, err); fail(node); });
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
    mount("ix-fig16", fig16);
    mount("ix-fig17", fig17);
    mount("ix-fig18", fig18);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
