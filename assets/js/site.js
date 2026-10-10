/* site.js — page behaviours: sticky bar, reveal-on-scroll, count-ups, video autoplay-in-view, copy buttons. */
(function () {
  "use strict";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // Top bar hairline once scrolled.
  const bar = $(".topbar");
  const onScroll = () => bar && bar.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // Section links scroll sideways on narrow screens: fade the edge that hides links.
  const nav = $(".topnav");
  if (nav) {
    const edges = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      nav.classList.toggle("fade-l", max > 1 && nav.scrollLeft > 1);
      nav.classList.toggle("fade-r", max > 1 && nav.scrollLeft < max - 1);
    };
    nav.addEventListener("scroll", edges, { passive: true });
    window.addEventListener("resize", edges);
    edges();
    if (document.fonts) document.fonts.ready.then(edges);
  }

  // Reveal on scroll.
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    $$(".reveal").forEach((n) => io.observe(n));
  } else $$(".reveal").forEach((n) => n.classList.add("in"));

  // Count-up numbers in the stat strip.
  function countUp(node) {
    const target = parseFloat(node.dataset.count), pre = node.dataset.prefix || "", suf = node.dataset.suffix || "";
    const dec = (node.dataset.count.split(".")[1] || "").length;
    if (reduce) return;
    const t0 = performance.now(), ms = 1100;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      node.textContent = pre + (target * e).toFixed(dec) + suf;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const counters = $$("[data-count]");
  if (counters.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { countUp(e.target); io.unobserve(e.target); }
    }, { threshold: 0.6 });
    counters.forEach((n) => io.observe(n));
  }

  // Videos: play only while visible; lazy-load sources; reduced motion => poster + play button.
  const PLAY = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';
  function hydrate(v) {
    let changed = false;
    v.querySelectorAll("source[data-src]").forEach((s) => { s.src = s.dataset.src; s.removeAttribute("data-src"); changed = true; });
    if (changed) v.load();
  }
  function setupVideo(v) {
    const card = v.closest(".viz");
    v.removeAttribute("autoplay");
    let userPaused = reduce;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "vplay";
    const sync = () => {
      const playing = !v.paused;
      btn.innerHTML = playing ? PAUSE : PLAY;
      btn.setAttribute("aria-label", playing ? "Pause animation" : "Play animation");
      if (card) card.classList.toggle("paused", !playing);
    };
    btn.addEventListener("click", () => {
      hydrate(v);
      if (v.paused) { userPaused = false; v.play().catch(() => {}); } else { userPaused = true; v.pause(); }
    });
    v.addEventListener("play", sync); v.addEventListener("pause", sync);
    if (card) card.appendChild(btn);
    sync();
    if (!("IntersectionObserver" in window)) { hydrate(v); if (!userPaused) v.play().catch(() => {}); return; }
    v.addEventListener("click", () => btn.click());
    new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (e.isIntersecting) { if (!userPaused) { hydrate(v); v.play().catch(() => {}); } }
        else if (!v.paused) v.pause();
      }
    }, { threshold: v.id === "hero-video" ? 0 : 0.2 }).observe(v);
  }
  $$("video").forEach(setupVideo);

  // Browsers pick a <source media> only at load: re-pick (and swap the poster) when the
  // viewport crosses the phone breakpoint, keeping the play/pause state.
  const narrow = window.matchMedia("(max-width: 600px)");
  const repick = () => $$("video").forEach((v) => {
    if (!v.querySelector("source[media]")) return;
    const wasPlaying = !v.paused;
    if (v.dataset.poster) v.poster = narrow.matches ? v.dataset.posterTall : v.dataset.poster;
    if (v.networkState === HTMLMediaElement.NETWORK_EMPTY && v.preload === "none" && !wasPlaying) return;
    v.load();
    if (wasPlaying) v.play().catch(() => {});
  });
  if (narrow.addEventListener) narrow.addEventListener("change", repick);

  // Copy buttons (announced through one polite live region).
  const live = document.createElement("div");
  live.className = "sr-only"; live.setAttribute("aria-live", "polite");
  document.body.appendChild(live);
  $$("[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      const src = $(b.dataset.copy); if (!src) return;
      const text = src.innerText.replace(/ /g, " ").trim();
      try { await navigator.clipboard.writeText(text); }
      catch (_) {
        const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove();
      }
      const label = b.dataset.label0 || (b.dataset.label0 = b.textContent);
      b.textContent = "Copied"; b.classList.add("done");
      if (live) live.textContent = "Copied";
      clearTimeout(b._t);
      b._t = setTimeout(() => { b.textContent = label; b.classList.remove("done"); if (live) live.textContent = ""; }, 1600);
    });
  });

  // In-page links: charts below the fold draw lazily and can grow while a smooth scroll is under way,
  // so re-align on the target once layout has settled.
  // Any user scroll input cancels a pending re-align.
  let navTok = 0;
  ["wheel", "touchstart", "keydown"].forEach((t) => window.addEventListener(t, () => navTok++, { passive: true, capture: true }));
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const t = document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)));
    if (!t) return;
    const my = ++navTok;
    let tries = 0;
    const settle = () => {
      if (my !== navTok) return;
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const off = t.getBoundingClientRect().top - pad;
      if (Math.abs(off) > 6 && tries++ < 4) { window.scrollBy({ top: off, behavior: "auto" }); setTimeout(settle, 350); }
    };
    setTimeout(settle, reduce ? 120 : 750);
  });

  // Figures that carry a complete static data table ([data-static-sr], built by tools/seo/build_static_tables.py)
  // keep it as their screen-reader table: the partial tables the charts write for their current view are hidden.
  const hideDup = (n) => {
    if (n.nodeType !== 1 || n.closest("[data-static-sr]")) return;
    const fig = n.closest("figure");
    if (!fig || !fig.querySelector("[data-static-sr]:not([data-static-sr='partial'])")) return;  // "partial": the chart's own table stays readable
    (n.matches(".sr-only") ? [n] : $$(".sr-only", n)).forEach((x) => { if (!x.closest("[data-static-sr]")) x.setAttribute("aria-hidden", "true"); });
  };
  if ("MutationObserver" in window && document.querySelector("[data-static-sr]")) {
    new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach(hideDup); })
      .observe(document.body, { childList: true, subtree: true });
  }

  // Charts mount lazily, so each mount reserves its drawn height until it has drawn: the desktop height is its
  // inline min-height and the phone height its data-mhp. Once a mount has been quiet for a moment after drawing,
  // the reservation is dropped so it never leaves a gap at other widths.
  const phone = window.matchMedia("(max-width: 600px)").matches;
  $$("[data-mhp]").forEach((n) => {
    if (phone) n.style.minHeight = n.dataset.mhp + "px";
    if (!("MutationObserver" in window)) return;
    let t = 0;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => { if (n.firstElementChild) { n.style.minHeight = "0"; mo.disconnect(); } }, 400);
    });
    mo.observe(n, { childList: true, subtree: true });
  });

  // Printing: show everything that is normally revealed on scroll.
  window.addEventListener("beforeprint", () => $$(".reveal").forEach((n) => n.classList.add("in")));
})();
