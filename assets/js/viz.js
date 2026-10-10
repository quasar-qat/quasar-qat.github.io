/* viz.js — tiny shared SVG chart toolkit for the QUASAR page (no dependencies).
   Exposes window.Viz. Every chart is a pure draw(width) function re-run on resize. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // House colors (figure content is always on a light card).
  const C = {
    quasar: "#D1495B", quasarDark: "#A13040",
    standard_qat: "#3F4245", lsq: "#80B1A8", denoising_qat: "#8E6C9A", bitdistiller: "#C98A2B",
    ptq: "#9AA0A6", rtn: "#C6CACE", gptq: "#686F77", awq: "#979DA4", google: "#4C6A88", imatrix: "#9C8F7A",
    bf16: "#C9A227", steel: "#2E6F95", ink: "#1D1F22", muted: "#6B6F75", faint: "#9A9DA3", rule: "#E2DDD3",
  };
  const METHOD = {
    "QUASAR": { color: C.quasar, key: "quasar" },
    "Standard QAT": { color: C.standard_qat, key: "standard_qat" },
    "LSQ": { color: C.lsq, key: "lsq" },
    "Denoising QAT": { color: C.denoising_qat, key: "denoising_qat" },
    "BitDistiller": { color: C.bitdistiller, key: "bitdistiller" },
    "RTN": { color: C.rtn, key: "rtn" },
    "GPTQ": { color: C.gptq, key: "gptq" },
    "AWQ": { color: C.awq, key: "awq" },
    "Google QAT": { color: C.google, key: "google" },
    "imatrix (PTQ)": { color: C.imatrix, key: "imatrix" },
    "BF16": { color: C.bf16, key: "bf16" },
  };

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, attrs, parent, html) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (html !== undefined) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---- scales ----
  function lin(domain, range) {
    const [d0, d1] = domain, [r0, r1] = range;
    const s = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
    s.invert = (p) => d0 + ((p - r0) / (r1 - r0 || 1)) * (d1 - d0);
    s.domain = domain; s.range = range; s.type = "lin";
    s.ticks = (n = 5) => niceTicks(d0, d1, n);
    return s;
  }
  function log(domain, range) {
    const [d0, d1] = domain.map(Math.log10), [r0, r1] = range;
    const s = (v) => r0 + ((Math.log10(Math.max(v, 1e-300)) - d0) / (d1 - d0 || 1)) * (r1 - r0);
    s.invert = (p) => Math.pow(10, d0 + ((p - r0) / (r1 - r0 || 1)) * (d1 - d0));
    s.domain = domain; s.range = range; s.type = "log";
    s.ticks = () => {
      const out = [];
      for (let e = Math.floor(d0); e <= Math.ceil(d1); e++) for (const m of [1, 2, 5]) {
        const v = m * Math.pow(10, e);
        if (v >= domain[0] * 0.999 && v <= domain[1] * 1.001) out.push(v);
      }
      return out;
    };
    return s;
  }
  function niceTicks(a, b, n) {
    if (a === b) return [a];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const raw = (hi - lo) / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
    return out;
  }
  function extent(arr, f) {
    let lo = Infinity, hi = -Infinity;
    for (const x of arr) { const v = f ? f(x) : x; if (v == null || isNaN(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    return [lo, hi];
  }

  // ---- formatting ----
  function fmt(v, d) {
    if (v == null || isNaN(v)) return "–";
    if (d !== undefined) return (+v).toFixed(d);
    const a = Math.abs(v);
    if (a >= 1000) return (v / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1).replace(/\.0$/, "");
    if (a >= 1) return v.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
    if (a === 0) return "0";
    return String(+v.toPrecision(2));
  }
  const fmtKL = (v) => (v < 1 ? (+v).toFixed(3).replace(/^0/, "") : (+v).toFixed(2));

  // ---- svg frame ----
  // frame(container, width, height, margin) -> {svg, g, W, H} where W,H are the inner plot sizes.
  function frame(container, width, height, m) {
    m = Object.assign({ t: 12, r: 16, b: 34, l: 44 }, m || {});
    container.querySelectorAll(":scope > svg").forEach((s) => s.remove());
    const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img" }, null);
    container.insertBefore(svg, container.firstChild);
    const g = el("g", { transform: `translate(${m.l},${m.t})` }, svg);
    return { svg, g, W: width - m.l - m.r, H: height - m.t - m.b, m };
  }

  // ---- axes ----
  function axisBottom(g, sx, H, o) {
    o = o || {};
    const a = el("g", { class: "axis", transform: `translate(0,${H})` }, g);
    el("line", { x1: sx.range[0], x2: sx.range[1], y1: 0, y2: 0 }, a);
    for (const t of o.ticks || sx.ticks(o.n || 5)) {
      const x = sx(t);
      el("line", { x1: x, x2: x, y1: 0, y2: 4 }, a);
      const tx = el("text", { x, y: 17, "text-anchor": "middle" }, a); tx.textContent = (o.fmt || fmt)(t);
    }
    if (o.title) { const t = el("text", { class: "axis-title", x: (sx.range[0] + sx.range[1]) / 2, y: o.titleY || 31, "text-anchor": "middle" }, a); t.textContent = o.title; }
    return a;
  }
  function axisLeft(g, sy, W, o) {
    o = o || {};
    const a = el("g", { class: "axis" }, g);
    const gr = o.grid !== false ? el("g", { class: "grid" }, g) : null;
    if (gr) g.insertBefore(gr, g.firstChild);
    for (const t of o.ticks || sy.ticks(o.n || 4)) {
      const y = sy(t);
      if (gr) el("line", { x1: 0, x2: W, y1: y, y2: y }, gr);
      const tx = el("text", { x: -8, y: y + 4, "text-anchor": "end" }, a); tx.textContent = (o.fmt || fmt)(t);
    }
    if (o.title) { const t = el("text", { class: "axis-title", x: 0, y: -2, "text-anchor": "start", transform: o.titleRotate ? `rotate(-90)` : null }, a); t.textContent = o.title; if (o.titleRotate) { t.setAttribute("x", -(sy.range[0] + sy.range[1]) / 2); t.setAttribute("y", -34); t.setAttribute("text-anchor", "middle"); } }
    return a;
  }

  // ---- paths ----
  function linePath(pts, sx, sy) {
    let d = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; if (p[1] == null || isNaN(p[1])) continue;
      d += (d ? "L" : "M") + sx(p[0]).toFixed(2) + "," + sy(p[1]).toFixed(2);
    }
    return d;
  }
  // Animate a path drawing itself.
  function drawIn(path, ms, delay) {
    if (reducedMotion || !path.getTotalLength) return;
    const L = path.getTotalLength();
    path.style.strokeDasharray = L + " " + L;
    path.style.strokeDashoffset = L;
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${ms || 1400}ms cubic-bezier(.3,.6,.2,1) ${delay || 0}ms`;
    path.style.strokeDashoffset = 0;
    setTimeout(() => { path.style.strokeDasharray = ""; path.style.transition = ""; }, (ms || 1400) + (delay || 0) + 50);
  }

  // Resolve vertical collisions for end-of-line labels: items [{y, ...}] -> sets .ly
  function dodge(items, gap, lo, hi) {
    const s = items.slice().sort((a, b) => a.y - b.y);
    for (const it of s) it.ly = it.y;
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 1; i < s.length; i++) {
        const d = s[i].ly - s[i - 1].ly;
        if (d < gap) { const push = (gap - d) / 2; s[i - 1].ly -= push; s[i].ly += push; moved = true; }
      }
      if (lo !== undefined) for (const it of s) it.ly = Math.max(lo, Math.min(hi, it.ly));
      if (!moved) break;
    }
    return items;
  }

  // ---- tooltip ----
  function tooltip(container) {
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    const t = h("div", { class: "vtip", role: "status", "aria-live": "polite" }, container);
    return {
      node: t,
      show(x, y, html) {
        t.innerHTML = html; t.classList.add("on");
        const cw = container.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
        let left = x + 14; if (left + tw > cw - 4) left = x - tw - 14; left = Math.max(4, left);
        const ch = container.clientHeight;
        let top = y - th - 10; if (top < 4) top = y + 14;
        if (top + th > ch - 4) top = Math.max(4, Math.min(y - th / 2, ch - th - 4));
        t.style.left = left + "px"; t.style.top = top + "px";
      },
      hide() { t.classList.remove("on"); },
    };
  }

  // ---- pill toggle group ----
  // pills(container, [{value,label}], initial, onChange, ariaLabel) -> {set(v), get()}
  function pills(container, options, initial, onChange, ariaLabel) {
    const wrap = h("div", { class: "pills", role: "radiogroup", "aria-label": ariaLabel || "" }, container);
    let cur = initial;
    const btns = options.map((o) => {
      const b = h("button", { type: "button", role: "radio", "aria-checked": String(o.value === cur), "data-v": o.value }, wrap, o.label);
      b.addEventListener("click", () => api.set(o.value, true));
      b.addEventListener("keydown", (e) => {
        const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
        if (!keys.includes(e.key)) return;
        e.preventDefault();
        const i = options.findIndex((x) => x.value === cur), n = options.length;
        const j = e.key === "Home" ? 0 : e.key === "End" ? n - 1 :
          (i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : n - 1)) % n;
        api.set(options[j].value, true); btns[j].focus();
      });
      return b;
    });
    const api = {
      node: wrap,
      get: () => cur,
      set(v, fire) {
        cur = v;
        btns.forEach((b, i) => { b.setAttribute("aria-checked", String(options[i].value === v)); b.tabIndex = options[i].value === v ? 0 : -1; });
        if (fire && onChange) onChange(v);
      },
    };
    api.set(initial, false);
    return api;
  }

  // ---- lifecycle ----
  function onVisible(node, cb, opts) {
    opts = opts || {};
    if (!("IntersectionObserver" in window)) { cb(); return; }
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { cb(); if (opts.once !== false) io.disconnect(); }
    }, { threshold: opts.threshold == null ? 0.25 : opts.threshold, rootMargin: opts.rootMargin || "0px" });
    io.observe(node);
    return io;
  }
  // responsive(container, draw): calls draw(width) now and on width changes.
  function responsive(container, draw) {
    let last = -1, raf = 0;
    const run = () => { const w = Math.round(container.clientWidth); if (w && w !== last) { last = w; draw(w); } };
    run();
    if ("ResizeObserver" in window) new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); }).observe(container);
    else window.addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); });
    return { redraw() { last = -1; run(); } };
  }
  const cache = {};
  function json(url) { return cache[url] || (cache[url] = fetch(url).then((r) => { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); })); }

  // tween a number 0..1 over ms; cb(t) with easing
  function tween(ms, cb, done) {
    if (reducedMotion) { cb(1); if (done) done(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      cb(1 - Math.pow(1 - t, 3));
      if (t < 1) requestAnimationFrame(step); else if (done) done();
    };
    requestAnimationFrame(step);
  }

  window.Viz = { NS, C, METHOD, el, h, lin, log, niceTicks, extent, fmt, fmtKL, frame, axisBottom, axisLeft, linePath, drawIn, dodge, tooltip, pills, onVisible, responsive, json, tween, reducedMotion };
})();
