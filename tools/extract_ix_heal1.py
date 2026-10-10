"""Extract the plotted data of the paper's healing summary figures into one JSON file.

  Figure 19  heal_matrix_kl.pdf          held-out KL by method x bit width, per model
  Figure 20  heal_matrix_capability.pdf  8-task average accuracy by method x bit width

Runs the paper's own generator (fig_matrix.py) IN MEMORY with its save calls intercepted (nothing
is written to the source checkout), takes every number from the same loader it uses (paperdata.py:
fidelity() / capability() / the 'avg8d' average), then asserts that each value equals what the
generator actually drew on its axes. Values are also checked against Table 6 as printed in
assets/data/results.json (KL to 3 decimals, average to 1 decimal).

Input (not distributed with this site; numpy + matplotlib required):
  --figure-src DIR / QUASAR_FIGURE_SRC   checkout of the paper's figure code and plot data
                                         (the directory that holds figs/paper_final/)
  --check-dir DIR / IX_HEAL1_CHECK_DIR   optional: also write matplotlib check plots drawn from
                                         the written JSON (check_fig19.png, check_fig20.png)

  QUASAR_FIGURE_SRC=... python3 tools/extract_ix_heal1.py [--out DIR] [--check-dir DIR]
Writes assets/data/ix-heal1.json in this site repo (or --out DIR).
"""
import argparse
import contextlib
import io
import json
import math
import os
import runpy
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # never drop __pycache__ into the source checkout
SITE = Path(__file__).resolve().parents[1]
_ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
_ap.add_argument("--figure-src", help="paper figure checkout (default $QUASAR_FIGURE_SRC)")
_ap.add_argument("--out", default=str(SITE / "assets" / "data"), help="output directory")
_ap.add_argument("--check-dir", default=os.environ.get("IX_HEAL1_CHECK_DIR"),
                 help="write matplotlib check plots (from the JSON) here (default $IX_HEAL1_CHECK_DIR)")
ARGS = _ap.parse_args()
_src = ARGS.figure_src or os.environ.get("QUASAR_FIGURE_SRC")
if not _src:
    sys.exit("extract_ix_heal1.py: set --figure-src or $QUASAR_FIGURE_SRC "
             "(checkout holding the paper's figs/paper_final/ generators)")
PF = Path(_src).expanduser() / "figs" / "paper_final"
for need in ("style.py", "paperdata.py", "fig_matrix.py"):
    if not (PF / need).is_file():
        sys.exit(f"extract_ix_heal1.py: {PF} has no {need}; --figure-src / $QUASAR_FIGURE_SRC must point "
                 "at the checkout that holds figs/paper_final/")
OUT = Path(ARGS.out).resolve()
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))
sys.path.insert(0, str(PF))

import numpy as np  # noqa: E402
import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import style as S  # noqa: E402  (paper house style; applies the mplstyle)
plt.rcParams["text.usetex"] = False  # layout only; no data depends on the TeX renderer
CAPTURED = {}
S.save = lambda fig, name: CAPTURED.__setitem__(name, fig)
with contextlib.redirect_stdout(io.StringIO()):
    import paperdata as P  # noqa: E402  (validates against the locked manifest values on import)

SOURCE = "arXiv 2608.13966v2"
GENERATOR = "tools/extract_ix_heal1.py"
KEY = {"ours": "quasar", "ste": "standard_qat", "lsq": "lsq", "gdm": "denoising_qat",
       "bitdistiller": "bitdistiller", "rtn": "rtn", "gptq": "gptq", "awq": "awq"}
MODELS = [("qwen", "Qwen3-4B-Thinking-2507", "Qwen3-4B"), ("llama", "Llama-3.1-8B-Instruct", "Llama-3.1-8B")]
BITS = [2, 3, 4]


def r5(v):
    return float(f"{float(v):.5g}")


def run(script):
    """Execute one paper generator in memory; return its namespace (figures land in CAPTURED)."""
    sys.argv = [script]
    with contextlib.redirect_stdout(io.StringIO()):
        return runpy.run_path(str(PF / script), run_name="ix_heal1_in_memory")


def drawn_points(ax):
    """(x, y) pairs of every marker the generator drew on an axes (Line2D + scatter collections)."""
    pts = []
    for ln in ax.lines:
        if ln.get_marker() in (None, "None", "", " "):
            continue
        pts += list(zip(np.asarray(ln.get_xdata(), float), np.asarray(ln.get_ydata(), float)))
    for col in ax.collections:
        pts += [tuple(map(float, o)) for o in col.get_offsets()]
    return pts


def has_point(pts, x, y, rel=1e-9):
    return any(math.isclose(px, x, rel_tol=rel, abs_tol=1e-12) and math.isclose(py, y, rel_tol=rel, abs_tol=1e-12)
               for px, py in pts)


# ------------------------------------------------------------------ run the generator
ns_matrix = run("fig_matrix.py")         # -> heal_matrix_capability, heal_matrix_kl (+ ppl, unused)
for need in ("heal_matrix_kl", "heal_matrix_capability"):
    assert need in CAPTURED, f"generator did not produce {need}"

FMT_BASE, DODGE, MK = ns_matrix["FMT_BASE"], ns_matrix["DODGE"], ns_matrix["MK"]
ARMS_MATRIX = FMT_BASE + ["ours"]                       # Figures 19-20 (format class, fig_matrix.py)
assert set(ARMS_MATRIX) == set(KEY), ARMS_MATRIX

# ------------------------------------------------------------------ numbers, from the generator's loader
cells, fp = {}, {}
for mk, _, _ in MODELS:
    fid, cap = P.fidelity(mk), P.capability(mk)
    cells[mk] = {}
    for arm in ARMS_MATRIX:
        cells[mk][arm] = {"kl": [fid[f"{arm}_w{b}"]["fwd_kl"] for b in BITS],
                          "acc": [cap[f"{arm}_w{b}"]["avg8d"] for b in BITS]}
    fp[mk] = {"acc": cap["fp16"]["avg8d"]}

# ------------------------------------------------------------------ fidelity: equal to what the generator drew
X = ns_matrix["X"]
for name, metric, with_fp in (("heal_matrix_kl", "kl", False), ("heal_matrix_capability", "acc", True)):
    axes = CAPTURED[name].axes[:2]
    for ax, (mk, _, _) in zip(axes, MODELS):
        pts = drawn_points(ax)
        n = 0
        for arm in ARMS_MATRIX:
            for i, b in enumerate(BITS):
                x = X[i] + DODGE[arm]
                assert has_point(pts, x, cells[mk][arm][metric][i]), (name, mk, arm, b)
                n += 1
        if with_fp:
            for i in range(3):
                assert has_point(pts, X[i], fp[mk]["acc"]), (name, mk, "fp16")
        # every drawn marker is accounted for (QUASAR's dashed connector carries no markers)
        expect = len(ARMS_MATRIX) * 3 + (3 if with_fp else 0)
        assert len(pts) == expect, (name, mk, len(pts), expect)

# ------------------------------------------------------------------ cross-check with Table 6 as printed
res = SITE / "assets" / "data" / "results.json"
if res.is_file():
    T6 = json.loads(res.read_text())["healing"]["standard_tasks"]["models"]
    TMETH = {"ours": "QUASAR", "ste": "Standard QAT", "lsq": "LSQ", "gdm": "Denoising QAT",
             "bitdistiller": "BitDistiller", "rtn": "RTN", "gptq": "GPTQ", "awq": "AWQ"}
    for mk, mname, _ in MODELS:
        t = T6[mname]
        assert abs(fp[mk]["acc"] * 100 - t["full_precision"][0]["values"]["Avg."]) < 0.051
        for i, b in enumerate(BITS):
            rows = {r["method"]: r["values"] for r in t[f"INT{b}"]}
            for arm in ARMS_MATRIX:
                v = rows[TMETH[arm]]
                assert abs(cells[mk][arm]["kl"][i] - v["KL"]) < 0.00051, (mk, arm, b, cells[mk][arm]["kl"][i], v["KL"])
                assert abs(cells[mk][arm]["acc"][i] * 100 - v["Avg."]) < 0.051, (mk, arm, b)
    print("Table 6 cross-check: OK (48 KL + 48 Avg. + 2 FP16 Avg.)")
else:
    print(f"Table 6 cross-check skipped ({res} missing)")

# ------------------------------------------------------------------ JSON
LABEL = {KEY[a]: S.LABEL[a] for a in KEY}
FAMILY = {KEY[a]: ("PTQ" if a in P.FORMAT_PTQ else "QAT") for a in KEY}
SHAPE = {"s": "square", "D": "diamond", "p": "pentagon", "^": "tri-up", "v": "tri-down",
         "<": "tri-left", ">": "tri-right", "*": "star", "o": "circle"}
out = {
    "source": SOURCE,
    "generator": GENERATOR,
    "figures": {
        "19": "Figure 19 (held-out KL vs bit width), Table 6 KL column",
        "20": "Figure 20 (average accuracy over the eight Table 6 benchmarks vs bit width)",
    },
    "processing": {
        "kl": "held-out forward KL to the full-precision model (Table 6 KL column, unrounded)",
        "acc": "mean of the eight Table 6 benchmark accuracies, in percent (Table 6 Avg., unrounded)",
        "dodge": "Figures 19-20 x offset in bit-width units (PTQ left, QAT right, QUASAR centred), as in the paper",
    },
    "bits": BITS,
    "models": [{"key": k, "name": n, "short": s} for k, n, s in MODELS],
    "methods": [{"key": KEY[a], "name": LABEL[KEY[a]], "family": FAMILY[KEY[a]], "shape": SHAPE[MK[a]],
                 "dodge": DODGE[a]} for a in ARMS_MATRIX],
    "order": {"matrix": [KEY[a] for a in ARMS_MATRIX]},
    "fp": {mk: {"acc": round(fp[mk]["acc"] * 100, 3)} for mk, _, _ in MODELS},
    "cells": {mk: {KEY[a]: {"kl": [r5(v) for v in cells[mk][a]["kl"]],
                            "acc": [round(v * 100, 3) for v in cells[mk][a]["acc"]]} for a in ARMS_MATRIX}
              for mk, _, _ in MODELS},
}
OUT.mkdir(parents=True, exist_ok=True)
dst = OUT / "ix-heal1.json"
dst.write_text(json.dumps(out, separators=(",", ":")) + "\n")
print(f"wrote {dst} ({dst.stat().st_size / 1024:.1f} KB)")
for f in CAPTURED.values():
    plt.close(f)


# ------------------------------------------------------------------ check plots, drawn from the written JSON only
def check_plots(path, outdir):
    D = json.loads(Path(path).read_text())
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    plt.rcdefaults()
    MKR = {"square": "s", "diamond": "D", "pentagon": "p", "tri-up": "^", "tri-down": "v", "tri-left": "<",
           "tri-right": ">", "star": "*", "circle": "o"}
    COL = {"quasar": "#D1495B", "standard_qat": "#3F4245", "lsq": "#80B1A8", "denoising_qat": "#8E6C9A",
           "bitdistiller": "#C98A2B", "rtn": "#B4B8BD", "gptq": "#7F868E", "awq": "#A7ADB3"}
    meth = {m["key"]: m for m in D["methods"]}
    models = D["models"]

    def matrix(metric, fname, title):
        fig, axes = plt.subplots(1, 2, figsize=(6.8, 2.55), sharey=True)
        for ax, mo in zip(axes, models):
            c = D["cells"][mo["key"]]
            for k in D["order"]["matrix"]:
                m = meth[k]
                xs = [i + m["dodge"] for i in range(3)]
                ys = [v / (100 if metric == "acc" else 1) for v in c[k][metric]]
                if k == "quasar":
                    ax.plot(range(3), ys, ls="--", color=COL[k], lw=1.6)
                ax.plot(xs, ys, ls="none", marker=MKR[m["shape"]], color=COL[k], ms=9 if k == "quasar" else 6,
                        mec="white", mew=0.5)
            if metric == "acc":
                ax.plot(range(3), [D["fp"][mo["key"]]["acc"] / 100] * 3, "o", color="#808080", ms=6, mec="white")
            ax.set_xticks(range(3), ["INT2", "INT3", "INT4"])
            ax.set_xlim(-0.45, 2.45)
            ax.set_title(mo["name"], fontsize=10)
            if metric == "kl":
                ax.set_yscale("log")
        if metric == "kl":
            axes[0].set_ylim(16, 0.0085)
            axes[0].set_yticks([0.01, 0.03, 0.1, 0.3, 1, 3, 10], ["0.01", "0.03", "0.1", "0.3", "1", "3", "10"])
            axes[0].minorticks_off(); axes[1].minorticks_off()
        axes[0].set_ylabel(title)
        fig.suptitle("check (from ix-heal1.json): " + fname, fontsize=8)
        fig.tight_layout()
        fig.savefig(outdir / f"check_{fname}.png", dpi=150)
        plt.close(fig)

    matrix("kl", "fig19", "Held-out KL")
    matrix("acc", "fig20", "Average accuracy (8 tasks)")
    print(f"check plots -> {outdir}")


if ARGS.check_dir:
    check_plots(dst, ARGS.check_dir)
