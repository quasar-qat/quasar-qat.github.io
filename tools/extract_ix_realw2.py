"""Extract the plotted data of three method-appendix figures (real weights) into JSON.

Runs the paper's own figure generators IN MEMORY (every save call is intercepted,
nothing is written to the source checkout), takes the arrays they plot, and checks
them against the artists they drew, so the page uses the same runs and processing
as the arXiv v2 figures:

  Figure 6   range_decomp.pdf          figma_exports/plot_range_decomp.py
             Qwen3-4B layer-8 down_proj, groups 4000-4399 (group 128, INT3):
             per-group max|w| (absmax s0), p90, median and the searched f; plus the
             model-wide histogram of f over all 28.4M groups.
  Figure 7   final/heal_ss_hist.pdf    figs/paper_final/fig_ss_hist.py
             final-step distribution of f* for the six QUASAR healing cells.
  Figure 11  final/sref_permodule_qwen.pdf   figs/paper_final/fig_permodule.py qwen
             median per-projection reduction vs Standard QAT, at init and trained.

Input (not distributed with this site; numpy + matplotlib required):
  --figure-src DIR / QUASAR_FIGURE_SRC   checkout of the paper's figure code and plot
                                         data (holds figs/paper_final/, figma_exports/, runs/)
Optional:
  --check DIR          also write matplotlib check plots re-drawn from the JSON
  --paper-png DIR / QUASAR_PAPER_PNG     PNG renders of the v2 figures (range_decomp.png,
                                         heal_ss_hist.png, sref_permodule_qwen.png); with
                                         --check each check plot is placed beside the paper's

  QUASAR_FIGURE_SRC=... python3 tools/extract_ix_realw2.py [--check DIR]
Writes assets/data/ix-realw2.json in this site repo (or --out FILE).
"""
import argparse
import json
import os
import re
import runpy
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # never drop __pycache__ into the source checkout
SITE = Path(__file__).resolve().parents[1]
_ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
_ap.add_argument("--figure-src", help="paper figure checkout (default $QUASAR_FIGURE_SRC)")
_ap.add_argument("--out", default=str(SITE / "assets" / "data" / "ix-realw2.json"), help="output JSON file")
_ap.add_argument("--check", help="directory for matplotlib check plots drawn from the written JSON")
_ap.add_argument("--paper-png", help="directory with PNG renders of the v2 figures (default $QUASAR_PAPER_PNG)")
ARGS = _ap.parse_args()
_src = ARGS.figure_src or os.environ.get("QUASAR_FIGURE_SRC")
if not _src:
    sys.exit("extract_ix_realw2.py: set --figure-src or $QUASAR_FIGURE_SRC "
             "(checkout holding figs/paper_final/, figma_exports/ and runs/)")
LAQ = Path(_src).expanduser().resolve()
PF = LAQ / "figs" / "paper_final"
RD = LAQ / "figma_exports" / "plot_range_decomp.py"
PROBE = LAQ / "runs" / "probe_recon_dist"
for need in (PF / "style.py", PF / "fig_ss_hist.py", PF / "fig_permodule.py", RD,
             PROBE / "wstats_groups.npz", PROBE / "fisher_figdata.npz", PROBE / "qwen3_w3_v3.json"):
    if not need.is_file():
        sys.exit(f"extract_ix_realw2.py: missing {need.relative_to(LAQ) if LAQ in need.parents else need} "
                 "under --figure-src / $QUASAR_FIGURE_SRC")
OUT = Path(ARGS.out).resolve()
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))
sys.path.insert(0, str(PF))

import numpy as np  # noqa: E402
import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.figure  # noqa: E402

# ---- intercept every save: the generators run in memory only ----
_real_savefig = matplotlib.figure.Figure.savefig
matplotlib.figure.Figure.savefig = lambda self, *a, **k: None
import style as S  # noqa: E402  (paper house style)
CAPTURED = {}
S.save = lambda fig, name: CAPTURED.__setitem__(name, fig)


def sig(v, n=5):
    return float(f"{float(v):.{n}g}")


def close(a, b, tol=1e-6):
    a, b = np.asarray(a, float), np.asarray(b, float)
    return a.shape == b.shape and np.allclose(a, b, rtol=tol, atol=tol)


def bars(ax):
    """(x-center, height) of every bar patch an axes drew, in draw order."""
    out = []
    for p in ax.patches:
        if isinstance(p, matplotlib.patches.Rectangle):
            out.append((p.get_x() + p.get_width() / 2, p.get_height()))
    return out


# ================================================================ Figure 6
def fig6():
    src = RD.read_text()
    # the generator hard-codes its data root and output folder; rebind the root to --figure-src
    src, n = re.subn(r"^ROOT = .*$", f"ROOT = {str(PROBE)!r}", src, count=1, flags=re.M)
    assert n == 1, "plot_range_decomp.py: ROOT line not found"
    ns = {"__name__": "__range_decomp__", "__file__": str(RD)}
    exec(compile(src, str(RD), "exec"), ns)
    fig = ns["fig"]
    axs = ns["axs"]
    x, mx, p90, p50, alpha = ns["x"], ns["mx"], ns["p90"], ns["p50"], ns["alpha"]
    ah, n_all, sh = ns["ah"], ns["n_all"], ns["sh_frac"]
    assert alpha is not None, "fisher_figdata.npz lacks the layer's alpha"
    # --- cross-check against what was drawn ---
    for ax in axs[:2]:
        ln = ax.lines[0]
        assert close(ln.get_xdata(), x) and close(ln.get_ydata(), mx), "absmax line differs"
        tops = []
        for coll in ax.collections[:3]:
            # fill_between(x, 0, y): the polygon's upper edge is the max vertex height at each x
            # (vertex order differs across matplotlib versions)
            v = coll.get_paths()[0].vertices
            top = {}
            for vx, vy in v:
                top[vx] = max(top.get(vx, -np.inf), vy)
            tops.append(np.array([top[float(xi)] for xi in x]))
        assert close(tops[0], mx) and close(tops[1], p90) and close(tops[2], p50), "fill_between areas differ"
    red = axs[1].lines[1]
    assert close(red.get_ydata(), alpha * mx), "searched f*s0 line differs"
    hb = bars(axs[2])
    fs = sorted(ah)
    assert close([b[0] for b in hb], fs) and close([b[1] for b in hb], [ah[f] / n_all for f in fs]), "histogram differs"
    plt.close(fig)
    layer = ns["LAYER"]
    f = np.round(alpha.astype(np.float64) / 0.05) * 0.05      # float16 storage of the 0.05 search grid
    assert np.max(np.abs(f - alpha)) < 1e-3
    return {
        "source": "arXiv 2608.13966v2, Figure 6 (plot_range_decomp.py)",
        "model": "Qwen3-4B",
        "module": layer.replace("model.layers.", "layer ").replace(".mlp.", " · ").replace(".self_attn.", " · "),
        "bits": 3, "group_size": 128,
        "g0": int(x[0]), "n": int(len(x)),
        "s0": [sig(v, 5) for v in mx],
        "p90": [sig(v, 5) for v in p90],
        "p50": [sig(v, 5) for v in p50],
        "f": [round(float(v), 2) for v in f],
        "peak": int(x[int(np.argmax(mx[:200]))]),     # the group the paper's arrow points at
        "hist": {"f": [round(v, 2) for v in fs], "count": [int(ah[v]) for v in fs],
                 "share": [sig(ah[v] / n_all, 5) for v in fs]},
        "hist_groups": int(n_all),
        "frac_narrower": sig(sh, 6),
    }


# ================================================================ Figure 7
def fig7():
    CAPTURED.clear()
    ns = runpy.run_path(str(PF / "fig_ss_hist.py"), run_name="__ss_hist__")
    fig = CAPTURED["heal_ss_hist"]
    ss, axes = ns["ss"], ns["axes"]
    models = []
    for r, model in enumerate(ns["ROWS"]):
        cells = {}
        for c, bit in enumerate(ns["COLS"]):
            d = ss[(model, bit)]
            keys = sorted(d["ss_hist"], key=float)
            xs = [float(k) for k in keys]
            ys = [float(d["ss_hist"][k]) for k in keys]
            drawn = bars(axes[r][c])
            assert close([b[0] for b in drawn], xs) and close([b[1] for b in drawn], ys), f"{model} W{bit} bars differ"
            vl = [ln for ln in axes[r][c].lines if len(set(ln.get_xdata())) == 1]
            assert vl and abs(vl[0].get_xdata()[0] - d["ss_factor_p50"]) < 1e-9, "median line differs"
            cells[f"INT{bit}"] = {"share": [round(v, 4) for v in ys], "p50": round(float(d["ss_factor_p50"]), 2)}
        models.append({"key": model, "name": S.MODEL_NAME[model], "cells": cells})
    grid = [round(float(k), 2) for k in sorted(ss[("qwen", 4)]["ss_hist"], key=float)]
    plt.close(fig)
    return {"source": "arXiv 2608.13966v2, Figure 7 (fig_ss_hist.py)", "f": grid,
            "bits": [f"INT{b}" for b in ns["COLS"]], "models": models}


# ================================================================ Figure 11
def fig11():
    CAPTURED.clear()
    argv = sys.argv
    sys.argv = [str(PF / "fig_permodule.py"), "qwen"]
    try:
        ns = runpy.run_path(str(PF / "fig_permodule.py"), run_name="__permodule__")
    finally:
        sys.argv = argv
    fig = CAPTURED["sref_permodule_qwen"]
    axs, PROJS = ns["axs"], ns["PROJS"]
    out = {}
    for j, variant in enumerate(("init", "mat")):
        red = ns["reductions"](variant, "qwen")
        drawn = bars(axs[0, j])
        want = [red[b].get(p, np.nan) for b in (4, 3, 2) for p in PROJS]
        assert close([b[1] for b in drawn], want), f"{variant} bars differ"
        out["init" if variant == "init" else "trained"] = {f"INT{b}": [round(red[b][p], 2) for p in PROJS] for b in (4, 3, 2)}
    plt.close(fig)
    return {"source": "arXiv 2608.13966v2, Figure 11 (fig_permodule.py)", "model": S.MODEL_NAME["qwen"],
            "proj": PROJS, "bits": ["INT4", "INT3", "INT2"],
            "colors": {f"INT{b}": c for b, c in ns["BITC"].items()}, **out}


DATA = {"fig6": fig6(), "fig7": fig7(), "fig11": fig11()}
matplotlib.figure.Figure.savefig = _real_savefig
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(DATA, separators=(",", ":")) + "\n")
print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")


# ================================================================ check plots (from the JSON only)
def check(outdir, pngdir):
    matplotlib.rcdefaults()
    plt.rcParams.update({"font.size": 8, "axes.spines.top": False, "axes.spines.right": False})
    D = json.loads(OUT.read_text())
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    def beside(name, draw, size, paper):
        ours = plt.figure(figsize=size)
        draw(ours)
        p = outdir / f"{name}_ours.png"
        _real_savefig(ours, p, dpi=150, facecolor="white")
        plt.close(ours)
        pp = Path(pngdir) / paper if pngdir else None
        if pp and pp.is_file():
            a, b = plt.imread(pp), plt.imread(p)
            h = max(a.shape[0] / a.shape[1], b.shape[0] / b.shape[1])
            f = plt.figure(figsize=(16, 8 * h + 0.5))
            for i, (im, t) in enumerate(((a, "arXiv v2 " + paper), (b, "re-drawn from ix-realw2.json"))):
                ax = f.add_axes([i * 0.5, 0, 0.5, 0.94]); ax.imshow(im); ax.axis("off"); ax.set_title(t, fontsize=10)
            q = outdir / f"{name}_side_by_side.png"
            _real_savefig(f, q, dpi=110, facecolor="white")
            plt.close(f)
            print("check:", q)
        else:
            print("check:", p)

    def d6(fig):
        F = D["fig6"]
        x = np.arange(F["g0"], F["g0"] + F["n"])
        s0, p90, p50, f = (np.array(F[k]) for k in ("s0", "p90", "p50", "f"))
        gs = fig.add_gridspec(2, 2, width_ratios=[3.3, 1.0], wspace=0.22, hspace=0.52)
        a, b, c = fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[1, 0]), fig.add_subplot(gs[:, 1])
        for ax in (a, b):
            ax.fill_between(x, 0, s0, color="#d7dade", lw=0); ax.plot(x, s0, color="#20242a", lw=0.7)
            ax.fill_between(x, 0, p90, color="#2E6F95", alpha=0.55, lw=0); ax.fill_between(x, 0, p50, color="#9fc2d8", lw=0)
            ax.set_xlim(x[0], x[-1] + 1); ax.set_ylim(0, s0.max() * 1.12)
        b.plot(x, f * s0, color="#e60000", lw=0.7)
        a.set_title("(a)"); b.set_title("(b)")
        h = F["hist"]
        c.bar(h["f"], h["share"], width=0.042, color="#D1495B", edgecolor="#a13040", lw=0.8)
        c.set_title(f"(c) {100 * F['frac_narrower']:.1f}% narrower"); c.set_xticks([0.5, 0.75, 1.0])

    def d7(fig):
        F = D["fig7"]
        axs = fig.subplots(2, 3, sharex=True, sharey=True)
        for r, m in enumerate(F["models"]):
            for c, b in enumerate(F["bits"]):
                cell = m["cells"][b]
                axs[r][c].bar(F["f"], cell["share"], width=0.043, color="#D1495B", edgecolor="white", lw=0.4)
                axs[r][c].axvline(cell["p50"], color="#3F4245", ls=(0, (3, 2)), lw=0.9)
                axs[r][c].set_title(f"{b}  p50={cell['p50']:.2f}", fontsize=7)
        axs[0][0].set_xlim(0.25, 1.05); axs[0][0].set_ylim(0, 0.47)

    def d11(fig):
        F = D["fig11"]
        axs = fig.subplots(1, 2, sharey=True)
        xx = np.arange(len(F["proj"]))
        for ax, key in zip(axs, ("init", "trained")):
            for k, b in enumerate(F["bits"]):
                ax.bar(xx + (k - 1) * 0.27, F[key][b], width=0.25, color=F["colors"][b], label=b)
            ax.set_xticks(xx); ax.set_xticklabels(F["proj"]); ax.set_title(key)
        axs[1].legend(frameon=False, ncol=3, loc="upper left")
        axs[0].set_ylim(0, 117)

    beside("fig6", d6, (8.7, 4.1), "range_decomp.png")
    beside("fig7", d7, (6.8, 3.4), "heal_ss_hist.png")
    beside("fig11", d11, (7.0, 1.85), "sref_permodule_qwen.png")


if ARGS.check:
    check(ARGS.check, ARGS.paper_png or os.environ.get("QUASAR_PAPER_PNG"))
