#!/usr/bin/env python3
"""Build assets/data/ix-theory2.json for the interactive appendix Figs. 16, 17 and 18.

Runs each paper figure generator IN MEMORY (save calls intercepted; nothing is
written to the source checkout), takes the numbers from the generator's own
namespace, and asserts they equal what the generator plotted:

  Fig. 16  pl_diag.pdf            fig_pl_diag.py         per-step (L(r) - L*, ||grad L(r)||^2) of
                                                         the three INT2 Qwen3-4B-Thinking runs, the
                                                         generator's 400 density-thinned points per
                                                         arm (+ the step of each point, recomputed
                                                         with the identical thinning), mu-hat, the
                                                         slope-1 fit segments
  Fig. 17  bound_decomp.pdf       fig_bound_decomp.py    Theorem 1(i) terms + measured average
                                                         squared gradient norm, and the scalars the
                                                         terms are evaluated from
  Fig. 18  sgd_theory_ladder.pdf  fig_sgd_ladder.py      plain-SGD INT2 Standard QAT vs QUASAR at
                                                         three learning rates: 10-step-mean train
                                                         loss + held-out loss

Input (not distributed with this site; numpy + matplotlib required):
  --figure-src DIR / QUASAR_FIGURE_SRC   checkout of the paper's figure code and plot data
                                         (the directory that holds figs/paper_final/)

  QUASAR_FIGURE_SRC=... python3 tools/extract_ix_theory2.py [--out FILE]
  ... --check DIR [--paper-png DIR]      also render a matplotlib check plot from the written
                                         JSON next to each paper figure PNG (<name>.png in
                                         --paper-png / $QUASAR_PAPER_PNG) into DIR
"""
import argparse
import json
import os
import runpy
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # never drop __pycache__ into the source checkout
SITE = Path(__file__).resolve().parents[1]
_ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
_ap.add_argument("--figure-src", help="paper figure checkout (default $QUASAR_FIGURE_SRC)")
_ap.add_argument("--out", default=str(SITE / "assets" / "data" / "ix-theory2.json"), help="output JSON")
_ap.add_argument("--check", help="directory for check plots rendered from the written JSON")
_ap.add_argument("--paper-png", help="directory with PNG renders of the paper figures (default $QUASAR_PAPER_PNG)")
ARGS = _ap.parse_args()
_src = ARGS.figure_src or os.environ.get("QUASAR_FIGURE_SRC")
if not _src:
    sys.exit("extract_ix_theory2.py: set --figure-src or $QUASAR_FIGURE_SRC "
             "(checkout holding the paper's figs/paper_final/ generators and their plot data)")
SRC = Path(_src).expanduser()
PF = SRC / "figs" / "paper_final"
for need in ("style.py", "fig_pl_diag.py", "fig_bound_decomp.py", "fig_sgd_ladder.py"):
    if not (PF / need).is_file():
        sys.exit(f"extract_ix_theory2.py: {PF / need} not found; --figure-src / $QUASAR_FIGURE_SRC must point "
                 "at the checkout that holds figs/paper_final/")
OUT = Path(ARGS.out).resolve()
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))
sys.path.insert(0, str(PF))

import numpy as np  # noqa: E402
import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.figure  # noqa: E402

# The generators switch on usetex via the house style; nothing is rendered here, so skip LaTeX.
_style_use = plt.style.use


def _style_no_tex(*a, **k):
    _style_use(*a, **k)
    plt.rcParams["text.usetex"] = False


plt.style.use = _style_no_tex
import style as S  # noqa: E402  (paper house style: applies the mplstyle on import)
plt.rcParams["text.usetex"] = False

CAPTURED = {}
S.save = lambda fig, name: CAPTURED.__setitem__(name, fig)
_SAVEFIG = matplotlib.figure.Figure.savefig  # restored for the check plots only
matplotlib.figure.Figure.savefig = lambda self, path, *a, **k: CAPTURED.__setitem__(Path(str(path)).stem, self)

SOURCE = "arXiv 2608.13966v2"


def sig(v, n=5):
    return float(f"{float(v):.{n}g}")


def run(gen):
    CAPTURED.clear()
    sys.argv = [gen]
    ns = runpy.run_path(str(PF / gen), run_name="ix_theory2_in_memory")
    return ns, dict(CAPTURED)


# ------------------------------------------------------------------ Fig. 16 (pl_diag)
def fig16():
    ns, figs = run("fig_pl_diag.py")
    fig = figs["fig_pl_diag"]
    ax = fig.axes[0]
    series, CELL, ARMS = ns["series"], ns["CELL"], ns["ARMS"]
    WARMUP, GAP_FLOOR, N_SHOW = ns["WARMUP"], ns["GAP_FLOOR"], ns["N_SHOW"]
    keymap = {"ours": "quasar", "gdm": "denoising_qat", "ste": "standard_qat"}
    assert len(ax.collections) == len(ARMS) and len(ax.lines) == len(ARMS)
    arms = {}
    for i, arm in enumerate(ARMS):
        # --- verbatim analysis of fig_pl_diag.py, carrying each record's step along ---
        recs = [r for r in series[CELL[arm]] if r["step"] > WARMUP]
        loss = np.array([r["loss"] for r in recs])
        gnorm = np.array([r["grad_norm"] for r in recs])
        steps = np.array([r["step"] for r in recs])
        lstar = loss.min()
        keep = (loss - lstar) > GAP_FLOOR
        x, y, st = (loss - lstar)[keep], gnorm[keep] ** 2, steps[keep]
        mu = np.median(y / x) / 2.0
        xlo, xhi = np.percentile(x, [0.5, 99.5])
        ylo, yhi = np.percentile(y, [0.5, 99.5])
        m = (x >= xlo) & (x <= xhi) & (y >= ylo) & (y <= yhi)
        xc, yc, sc = x[m], y[m], st[m]
        order = np.argsort(xc)
        show = order[np.linspace(0, len(order) - 1, N_SHOW).round().astype(int)]
        gx = np.array([xc.min(), xc.max()])
        # --- must equal what the generator computed and drew ---
        assert abs(mu - ns["mu"][arm]) < 1e-12
        off = ax.collections[i].get_offsets()
        assert np.allclose(off[:, 0], xc[show]) and np.allclose(off[:, 1], yc[show]), arm
        line = ax.lines[i]
        assert np.allclose(line.get_xdata(), gx) and np.allclose(line.get_ydata(), 2.0 * mu * gx), arm
        pts = sorted(zip(sc[show].tolist(), xc[show].tolist(), yc[show].tolist()))
        arms[keymap[arm]] = {
            "label": S.LABEL[arm],
            "mu": round(float(mu), 4),
            "n_steps": int(keep.sum()),
            "fit_x": [sig(v) for v in gx],
            # [step, L(r) - L*, ||grad L(r)||^2], sorted by step
            "pts": [[int(s), sig(a, 4), sig(b, 4)] for s, a, b in pts],
        }
    plt.close(fig)
    xt = [0.05, 0.1, 0.2, 0.4]
    yt = [0.1, 0.2, 0.4, 0.8]
    assert np.allclose(ax.get_xticks(), xt) and np.allclose(ax.get_yticks(), yt)
    return {
        "figure": "Fig. 16 (pl_diag)",
        "model": "Qwen3-4B-Thinking-2507", "bits": "INT2",
        "processing": (f"steps <= {WARMUP} dropped; L* = min loss over the kept steps; points with L - L* > {GAP_FLOOR}; "
                       "mu-hat = median(||grad||^2 / (L - L*)) / 2 over all kept steps; drawn points = central 99% per "
                       f"axis, then {N_SHOW} even quantiles of the loss gap per method (as in the paper figure)"),
        "steps": [WARMUP + 1, max(r["step"] for r in series[CELL["ours"]])],
        "xlim": [sig(v) for v in ax.get_xlim()], "ylim": [sig(v) for v in ax.get_ylim()],
        "xticks": xt, "yticks": yt,
        "order": ["quasar", "denoising_qat", "standard_qat"],
        "arms": arms,
    }


# ------------------------------------------------------------------ Fig. 17 (bound_decomp)
def fig17():
    ns, figs = run("fig_bound_decomp.py")
    fig = figs["fig_bound_decomp"]
    d = ns["d"]
    thm, inp, rl = d["theorem1"], d["inputs"], d["realized"]
    init, noise, recon, total, realized = ns["init"], ns["noise"], ns["recon"], ns["total"], ns["realized"]
    eta, T = inp["eta_peak"], inp["T"]
    # Theorem 1(i) right-hand side, term by term, from the stored scalars
    assert abs(2 * (rl["loss_w0"] - rl["l_star_proxy_min_loss"]) / (eta * T) - init) < 1e-6
    assert abs(inp["lambda_max"] * eta * inp["sigma2_hat"] - noise) < 1e-6
    assert abs(inp["C"] * inp["S_bar"] - recon) < 1e-6
    ax = fig.axes[0]
    widths = sorted(round(p.get_width(), 6) for p in ax.patches if p.get_width() > 0)
    assert widths == sorted(round(v, 6) for v in (init, noise, recon, realized))
    plt.close(fig)
    return {
        "figure": "Fig. 17 (bound_decomp)",
        "model": "Qwen3-4B-Thinking-2507", "bits": "INT2", "optimizer": "SGD", "lr": eta, "steps": T,
        "terms": [
            {"key": "init", "label": "initialization", "value": round(init, 4), "color": "#C5C8CB"},
            {"key": "noise", "label": "noise", "value": round(noise, 4), "color": "#4682A8"},
            {"key": "recon", "label": "reconstruction", "value": round(recon, 4), "color": "#D1495B"},
        ],
        "total": round(total, 4),
        "measured": round(realized, 4),
        "ratio": round(total / realized, 4),
        "inputs": {
            "loss_w0": round(rl["loss_w0"], 4), "loss_star": round(rl["l_star_proxy_min_loss"], 4),
            "eta": eta, "T": T, "lambda_max": inp["lambda_max"], "sigma2": inp["sigma2_hat"],
            "C": inp["C"], "S_bar": inp["S_bar"], "M": inp["M"],
        },
        "xlim": [0, 185], "xticks": [0, 50, 100, 150],
    }


# ------------------------------------------------------------------ Fig. 18 (sgd_theory_ladder)
def fig18():
    ns, figs = run("fig_sgd_ladder.py")
    fig = figs["sgd_theory_ladder"]
    LRS, ARMS, series, tsm = ns["LRS"], ns["ARMS"], ns["series"], ns["ten_step_means"]
    keymap = {"laware": "quasar", "ste": "standard_qat"}
    axes = np.array(fig.axes).reshape(2, len(LRS))
    out = {}
    for j, lr in enumerate(LRS):
        cell = {}
        for k, arm in enumerate(ARMS):
            xs, ys = tsm(series(arm, lr, "train"))
            ev = series(arm, lr, "eval")
            lt, le = axes[0][j].lines[k], axes[1][j].lines[k]
            assert np.allclose(lt.get_xdata(), xs) and np.allclose(lt.get_ydata(), ys)
            assert np.allclose(le.get_xdata(), [s for s, _ in ev]) and np.allclose(le.get_ydata(), [v for _, v in ev])
            cell[keymap[arm]] = {"train_x": xs, "train": [sig(v, 4) for v in ys],
                                 "eval": [[s, sig(v, 4)] for s, v in ev]}
        # all arms share the same train grid -> store it once
        assert cell["quasar"]["train_x"] == cell["standard_qat"]["train_x"]
        tx = cell["quasar"]["train_x"]
        for c in cell.values():
            del c["train_x"]
        out[f"{lr:g}"] = {"lr": lr, "train_x": tx, **cell}
    yl_t, yl_e = axes[0][0].get_ylim(), axes[1][0].get_ylim()
    plt.close(fig)
    return {
        "figure": "Fig. 18 (sgd_theory_ladder)",
        "model": "Qwen3-4B-Thinking-2507", "bits": "INT2", "optimizer": "SGD (constant learning rate)",
        "processing": "train = mean of consecutive 10-step chunks (x = last step of the chunk); held-out = logged eval loss",
        "order": ["standard_qat", "quasar"],
        "labels": {"quasar": "QUASAR", "standard_qat": "Standard QAT"},
        "lrs": [f"{lr:g}" for lr in LRS],
        "train_ylim": list(yl_t), "eval_ylim": list(yl_e),
        "cells": out,
    }


def write():
    data = {
        "source": SOURCE,
        "generator": "tools/extract_ix_theory2.py",
        "fig16": fig16(),
        "fig17": fig17(),
        "fig18": fig18(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
    return data


# ------------------------------------------------------------------ check plots (from the JSON only)
def check(outdir, pngdir):
    import matplotlib.image as mpimg
    plt.style.use("default")
    plt.rcParams.update({"font.size": 8, "axes.spines.top": False, "axes.spines.right": False})
    D = json.loads(OUT.read_text())
    outdir = Path(outdir); outdir.mkdir(parents=True, exist_ok=True)
    COL = {"quasar": "#D1495B", "denoising_qat": "#8E6C9A", "standard_qat": "#3F4245"}

    def side(name, paper, draw, size):
        fig = plt.figure(figsize=size, dpi=150)
        gs = fig.add_gridspec(1, 2, width_ratios=[1, 1], wspace=0.08)
        a0 = fig.add_subplot(gs[0]); a0.axis("off"); fig.text(0.29, 1.0, "paper (arXiv v2)", fontsize=8, ha="center", va="bottom")
        p = Path(pngdir) / f"{paper}.png" if pngdir else None
        if p and p.is_file():
            a0.imshow(mpimg.imread(str(p)))
        else:
            a0.text(0.5, 0.5, "paper PNG not given", ha="center")
        sub = gs[1].subgridspec(*draw[0])
        axes = [fig.add_subplot(sub[i]) for i in range(draw[0][0] * draw[0][1])]
        draw[1](axes)
        fig.text(0.75, 1.0, "from ix-theory2.json", fontsize=8, ha="center", va="bottom")
        _SAVEFIG(fig, outdir / f"check_{name}.png", bbox_inches="tight")
        plt.close(fig)
        print("check", outdir / f"check_{name}.png")

    F = D["fig16"]

    def d16(axs):
        ax = axs[0]
        for k in ["standard_qat", "denoising_qat", "quasar"]:
            a = F["arms"][k]
            ax.scatter([p[1] for p in a["pts"]], [p[2] for p in a["pts"]], s=4, color=COL[k], alpha=.35, lw=0)
            gx = np.array(a["fit_x"]); ax.plot(gx, 2 * a["mu"] * gx, "--", color=COL[k], lw=1.1,
                                               label=f"{a['label']} mu={a['mu']:.2f}")
        ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlim(F["xlim"]); ax.set_ylim(F["ylim"])
        ax.set_xticks(F["xticks"]); ax.set_xticklabels([f"{v:g}" for v in F["xticks"]])
        ax.set_yticks(F["yticks"]); ax.set_yticklabels([f"{v:g}" for v in F["yticks"]])
        ax.minorticks_off(); ax.legend(fontsize=6, frameon=False, loc="upper left")
    side("fig16", "pl_diag", ((1, 1), d16), (9, 3.2))

    B = D["fig17"]

    def d17(axs):
        ax = axs[0]; left = 0
        for t in B["terms"]:
            ax.barh(1, t["value"], left=left, height=.55, color=t["color"]); ax.text(left + t["value"] / 2, 1, f"{t['value']:.1f}", ha="center", va="center", fontsize=6)
            left += t["value"]
        ax.text(B["total"] + 3, 1, f"{B['total']:.1f}", va="center", fontsize=7)
        ax.barh(0, B["measured"], height=.55, color="#3F4245"); ax.text(B["measured"] + 3, 0, f"{B['measured']:.1f}", va="center", fontsize=7)
        ax.text(B["measured"] + 3, .5, f"{B['ratio']:.1f}x", va="center", fontsize=6, color=".45")
        ax.set_xlim(B["xlim"]); ax.set_xticks(B["xticks"]); ax.set_yticks([1, 0]); ax.set_yticklabels(["Theorem 1 bound", "Measured in training"])
    side("fig17", "bound_decomp", ((1, 1), d17), (9, 2.2))

    G = D["fig18"]

    def d18(axs):
        for j, lr in enumerate(G["lrs"]):
            c = G["cells"][lr]
            for k in G["order"]:
                col = COL[k] if k == "quasar" else "#20242a"
                axs[j].plot(c["train_x"], c[k]["train"], color=col, lw=.9 if k == "quasar" else .4)
                axs[3 + j].plot([p[0] for p in c[k]["eval"]], [p[1] for p in c[k]["eval"]], color=col, marker="o", ms=2, lw=.9 if k == "quasar" else .4)
            axs[j].set_ylim(G["train_ylim"]); axs[3 + j].set_ylim(G["eval_ylim"]); axs[j].set_title(f"lr {lr}", fontsize=7)
            for a in (axs[j], axs[3 + j]):
                a.set_xlim(0, 1024); a.set_xticks([0, 512, 1024])
    side("fig18", "sgd_theory_ladder", ((2, 3), d18), (11, 3.4))


if __name__ == "__main__":
    write()
    if ARGS.check:
        check(ARGS.check, ARGS.paper_png or os.environ.get("QUASAR_PAPER_PNG"))
